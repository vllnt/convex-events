import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { jsonValue } from "./validators";

/** Default number of rows deleted per `purge` / prune batch before rescheduling. */
const DEFAULT_PURGE_BATCH = 256;
const MAX_PURGE_BATCH = 500;
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

function validateBatch(batch: number): void {
  if (!Number.isFinite(batch) || !Number.isInteger(batch) || batch < 1 || batch > MAX_PURGE_BATCH) {
    throw new ConvexError({
      code: "INVALID_BATCH",
      message: `batch must be an integer between 1 and ${MAX_PURGE_BATCH}`,
    });
  }
}

export const record = mutation({
  args: {
    subjectRef: v.string(),
    type: v.string(),
    actorRef: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    metadata: v.optional(jsonValue),
  },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    if (
      args.idempotencyKey !== undefined &&
      (args.idempotencyKey.length === 0 ||
        args.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH)
    ) {
      throw new ConvexError({
        code: "INVALID_IDEMPOTENCY_KEY",
        message: `idempotencyKey must be between 1 and ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
      });
    }
    if (args.idempotencyKey !== undefined) {
      const existing = await ctx.db
        .query("events")
        .withIndex("by_subject_idempotency", (q) =>
          q.eq("subjectRef", args.subjectRef).eq("idempotencyKey", args.idempotencyKey),
        )
        .unique();
      if (existing !== null) return existing._id;
    }
    return await ctx.db.insert("events", {
      subjectRef: args.subjectRef,
      type: args.type,
      actorRef: args.actorRef,
      idempotencyKey: args.idempotencyKey,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
  },
});

/**
 * Delete a batch of a subject's events, oldest-first, rescheduling itself until
 * fewer than `batch` rows remain. Idempotent and at-least-once safe: a redelivery
 * simply deletes the next (or zero) batch. Returns the count deleted this batch.
 */
export const purge = mutation({
  args: {
    subjectRef: v.string(),
    before: v.optional(v.number()),
    batch: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const before = args.before;
    const batch = args.batch ?? DEFAULT_PURGE_BATCH;
    validateBatch(batch);
    if (before !== undefined && !Number.isFinite(before)) {
      throw new ConvexError({ code: "INVALID_BEFORE", message: "before must be finite" });
    }
    const rows = await ctx.db
      .query("events")
      .withIndex("by_subject", (q) => {
        const scoped = q.eq("subjectRef", args.subjectRef);
        return before === undefined ? scoped : scoped.lt("createdAt", before);
      })
      .take(batch);
    for (const row of rows) {
      await ctx.db.delete("events", row._id);
    }
    if (rows.length === batch) {
      await ctx.scheduler.runAfter(0, api.mutations.purge, {
        subjectRef: args.subjectRef,
        before,
        batch,
      });
    }
    return rows.length;
  },
});

/** Set (or clear) the singleton retention window the daily cron prunes against. */
export const configure = mutation({
  args: { retentionMs: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.retentionMs !== undefined && !(args.retentionMs >= 0 && Number.isFinite(args.retentionMs))) {
      throw new ConvexError({
        code: "INVALID_RETENTION",
        message: "retentionMs must be a non-negative finite number",
      });
    }
    const existing = await ctx.db.query("config").first();
    if (existing === null) {
      await ctx.db.insert("config", { retentionMs: args.retentionMs });
    } else {
      await ctx.db.patch("config", existing._id, { retentionMs: args.retentionMs });
    }
    return null;
  },
});

/**
 * Prune a batch of events older than the configured retention window across all
 * subjects, rescheduling until short. The component's daily cron calls this; the
 * host may also trigger a manual sweep. No config (or no `retentionMs`) ⇒ no-op.
 * Idempotent and at-least-once safe: a redelivery prunes the next/zero batch.
 */
export const pruneExpired = mutation({
  args: { batch: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const cfg = await ctx.db.query("config").first();
    const retentionMs = cfg?.retentionMs;
    if (retentionMs === undefined) {
      return 0;
    }
    const batch = args.batch ?? DEFAULT_PURGE_BATCH;
    validateBatch(batch);
    const cutoff = Date.now() - retentionMs;
    const rows = await ctx.db
      .query("events")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .take(batch);
    for (const row of rows) {
      await ctx.db.delete("events", row._id);
    }
    if (rows.length === batch) {
      await ctx.scheduler.runAfter(0, api.mutations.pruneExpired, { batch });
    }
    return rows.length;
  },
});
