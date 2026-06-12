import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { eventDoc, eventPage, countResult } from "./validators";

/** Default scan bound for a capped `count` before it reports `isExact: false`. */
const DEFAULT_MAX_COUNT = 1000;

export const list = query({
  args: {
    subjectRef: v.string(),
    type: v.optional(v.string()),
    since: v.optional(v.number()),
    limit: v.number(),
  },
  returns: v.array(eventDoc),
  handler: async (ctx, args) => {
    const since = args.since;
    const type = args.type;
    if (type === undefined) {
      return await ctx.db
        .query("events")
        .withIndex("by_subject", (q) => {
          const scoped = q.eq("subjectRef", args.subjectRef);
          return since === undefined ? scoped : scoped.gte("createdAt", since);
        })
        .order("desc")
        .take(args.limit);
    }
    return await ctx.db
      .query("events")
      .withIndex("by_subject_type", (q) => {
        const scoped = q.eq("subjectRef", args.subjectRef).eq("type", type);
        return since === undefined ? scoped : scoped.gte("createdAt", since);
      })
      .order("desc")
      .take(args.limit);
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
    const since = args.since;
    const type = args.type;
    if (type === undefined) {
      return await ctx.db
        .query("events")
        .withIndex("by_subject", (q) => {
          const scoped = q.eq("subjectRef", args.subjectRef);
          return since === undefined ? scoped : scoped.gte("createdAt", since);
        })
        .order("desc")
        .paginate(args.paginationOpts);
    }
    return await ctx.db
      .query("events")
      .withIndex("by_subject_type", (q) => {
        const scoped = q.eq("subjectRef", args.subjectRef).eq("type", type);
        return since === undefined ? scoped : scoped.gte("createdAt", since);
      })
      .order("desc")
      .paginate(args.paginationOpts);
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
