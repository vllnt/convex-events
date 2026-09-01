import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { eventDoc, eventPage, countResult } from "./validators";

/** Default scan bound for a capped `count` before it reports `isExact: false`. */
const DEFAULT_MAX_COUNT = 1000;
const MAX_READ_LIMIT = 1000;

function toPublicEvent(event: Doc<"events">): Omit<Doc<"events">, "idempotencyKey"> {
  const { idempotencyKey: _idempotencyKey, ...publicEvent } = event;
  return publicEvent;
}

function validateReadLimit(value: number, name: string, allowZero = false): void {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < minimum || value > MAX_READ_LIMIT) {
    throw new ConvexError({
      code: "INVALID_LIMIT",
      message: `${name} must be an integer between ${minimum} and ${MAX_READ_LIMIT}`,
    });
  }
}

export const list = query({
  args: {
    subjectRef: v.string(),
    type: v.optional(v.string()),
    since: v.optional(v.number()),
    limit: v.number(),
  },
  returns: v.array(eventDoc),
  handler: async (ctx, args) => {
    validateReadLimit(args.limit, "limit");
    const since = args.since;
    const type = args.type;
    if (type === undefined) {
      const rows = await ctx.db
        .query("events")
        .withIndex("by_subject", (q) => {
          const scoped = q.eq("subjectRef", args.subjectRef);
          return since === undefined ? scoped : scoped.gte("createdAt", since);
        })
        .order("desc")
        .take(args.limit);
      return rows.map(toPublicEvent);
    }
    const rows = await ctx.db
      .query("events")
      .withIndex("by_subject_type", (q) => {
        const scoped = q.eq("subjectRef", args.subjectRef).eq("type", type);
        return since === undefined ? scoped : scoped.gte("createdAt", since);
      })
      .order("desc")
      .take(args.limit);
    return rows.map(toPublicEvent);
  },
});

/**
 * Cursor-paginated feed, newest-first, honoring the same `type` / `since`
 * filters as `list`. Returns Convex's `{ page, isDone, continueCursor }` so a
 * host can page past any single-call `limit`.
 */
export const listPaginated = query({
  args: {
    subjectRef: v.string(),
    type: v.optional(v.string()),
    since: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: eventPage,
  handler: async (ctx, args) => {
    validateReadLimit(args.paginationOpts.numItems, "paginationOpts.numItems");
    const since = args.since;
    const type = args.type;
    if (type === undefined) {
      const result = await ctx.db
        .query("events")
        .withIndex("by_subject", (q) => {
          const scoped = q.eq("subjectRef", args.subjectRef);
          return since === undefined ? scoped : scoped.gte("createdAt", since);
        })
        .order("desc")
        .paginate(args.paginationOpts);
      return { ...result, page: result.page.map(toPublicEvent) };
    }
    const result = await ctx.db
      .query("events")
      .withIndex("by_subject_type", (q) => {
        const scoped = q.eq("subjectRef", args.subjectRef).eq("type", type);
        return since === undefined ? scoped : scoped.gte("createdAt", since);
      })
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(toPublicEvent) };
  },
});

/**
 * Bounded count for `subjectRef` (optionally one `type`). Scans at most
 * `maxCount + 1` rows: if more exist, returns `{ count: maxCount, isExact: false }`
 * rather than loading the whole feed.
 */
export const count = query({
  args: {
    subjectRef: v.string(),
    type: v.optional(v.string()),
    maxCount: v.optional(v.number()),
  },
  returns: countResult,
  handler: async (ctx, args) => {
    const type = args.type;
    const maxCount = args.maxCount ?? DEFAULT_MAX_COUNT;
    validateReadLimit(maxCount, "maxCount", true);
    const rows =
      type === undefined
        ? await ctx.db
            .query("events")
            .withIndex("by_subject", (q) => q.eq("subjectRef", args.subjectRef))
            .take(maxCount + 1)
        : await ctx.db
            .query("events")
            .withIndex("by_subject_type", (q) =>
              q.eq("subjectRef", args.subjectRef).eq("type", type),
            )
            .take(maxCount + 1);
    return rows.length > maxCount
      ? { count: maxCount, isExact: false }
      : { count: rows.length, isExact: true };
  },
});
