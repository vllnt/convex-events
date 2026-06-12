import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { Events } from "../../src/client";
import {
  jsonValue,
  eventDoc,
  eventPage,
  countResult,
} from "../../src/component/validators";

/**
 * Host-app wrappers. The host owns auth: resolve identity here, then pass an
 * opaque `subjectRef` (and optional `actorRef` / typed `metadata`) into the
 * events client. Here the host types its metadata as `{ note?: string }`.
 */
interface Meta {
  note?: string;
}

const events = new Events<Meta>(components.events);

/** A second client with a non-default page size — exercises the default-limit branch. */
const cappedEvents = new Events<Meta>(components.events, {
  defaultLimit: 1,
  defaultMaxCount: 2,
});

/**
 * A guarded client — exercises every client-boundary guard: a `type` allow-list,
 * a `type` length cap, a `metadata` byte cap, and a host metadata validator that
 * trims `note` (transform) and rejects an empty one.
 */
const guardedEvents = new Events<Meta>(components.events, {
  allowedTypes: ["created", "updated"],
  maxTypeLength: 12,
  maxMetadataBytes: 64,
  metadataValidator: (m) => {
    if (m.note !== undefined) {
      const note = m.note.trim();
      if (note.length === 0) {
        throw new Error("note must not be blank");
      }
      return { note };
    }
    return m;
  },
});

export const record = mutation({
  args: {
    subjectRef: v.string(),
    type: v.string(),
    actorRef: v.optional(v.string()),
    metadata: v.optional(jsonValue),
  },
  returns: v.string(),
  handler: (ctx, a) =>
    events.record(ctx, a.subjectRef, a.type, {
      actorRef: a.actorRef,
      metadata: a.metadata,
    }),
});

export const list = query({
  args: {
    subjectRef: v.string(),
    type: v.optional(v.string()),
    since: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(eventDoc),
  handler: (ctx, a) =>
    events.list(ctx, a.subjectRef, {
      type: a.type,
      since: a.since,
      limit: a.limit,
    }),
});

export const paginate = query({
  args: {
    subjectRef: v.string(),
    type: v.optional(v.string()),
    since: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: eventPage,
  handler: (ctx, a) =>
    events.paginate(ctx, a.subjectRef, a.paginationOpts, {
      type: a.type,
      since: a.since,
    }),
});

export const count = query({
  args: {
    subjectRef: v.string(),
    type: v.optional(v.string()),
    maxCount: v.optional(v.number()),
  },
  returns: countResult,
  handler: (ctx, a) =>
    events.count(ctx, a.subjectRef, { type: a.type, maxCount: a.maxCount }),
});

export const purge = mutation({
  args: {
    subjectRef: v.string(),
    before: v.optional(v.number()),
    batch: v.optional(v.number()),
  },
  returns: v.number(),
  handler: (ctx, a) =>
    events.purge(ctx, a.subjectRef, { before: a.before, batch: a.batch }),
});

export const configure = mutation({
  args: { retentionMs: v.optional(v.number()) },
  returns: v.null(),
  handler: (ctx, a) => events.configure(ctx, a.retentionMs),
});

export const pruneExpired = mutation({
  args: { batch: v.optional(v.number()) },
  returns: v.number(),
  handler: (ctx, a) => events.pruneExpired(ctx, { batch: a.batch }),
});

/** Capped-page-size variant — `list` with no `limit` uses the client's `defaultLimit: 1`. */
export const listCapped = query({
  args: { subjectRef: v.string() },
  returns: v.array(eventDoc),
  handler: (ctx, a) => cappedEvents.list(ctx, a.subjectRef),
});

/** Capped count variant — `count` with no `maxCount` uses the client's `defaultMaxCount: 2`. */
export const countCapped = query({
  args: { subjectRef: v.string() },
  returns: countResult,
  handler: (ctx, a) => cappedEvents.count(ctx, a.subjectRef),
});

/** Guarded record — routes through the guarded client so the boundary guards fire. */
export const recordGuarded = mutation({
  args: {
    subjectRef: v.string(),
    type: v.string(),
    metadata: v.optional(jsonValue),
  },
  returns: v.string(),
  handler: (ctx, a) =>
    guardedEvents.record(ctx, a.subjectRef, a.type, { metadata: a.metadata }),
});

/**
 * A length-guarded client with NO type allow-list — so a too-long `type` trips
 * the `maxTypeLength` guard directly rather than the allow-list.
 */
const lengthGuardedEvents = new Events<Meta>(components.events, {
  maxTypeLength: 8,
});

/** Length-guarded record — exercises the standalone `maxTypeLength` branch. */
export const recordLengthGuarded = mutation({
  args: { subjectRef: v.string(), type: v.string() },
  returns: v.string(),
  handler: (ctx, a) => lengthGuardedEvents.record(ctx, a.subjectRef, a.type),
});

/**
 * Calls the component `count` query directly with no `maxCount` — exercising the
 * component's own `DEFAULT_MAX_COUNT` fallback (the client always supplies one).
 */
export const countRaw = query({
  args: { subjectRef: v.string() },
  returns: countResult,
  handler: (ctx, a) =>
    ctx.runQuery(components.events.queries.count, { subjectRef: a.subjectRef }),
});
