import { v } from "convex/values";
import { paginationResultValidator } from "convex/server";

/**
 * Opaque host-owned event payload. The component never inspects it.
 * Prefer a host-supplied validator / typed generic on the client class;
 * `jsonValue` is the documented last resort for genuinely arbitrary data.
 */
export const jsonValue = v.any();

/** Shape of a stored event row, as returned by the read queries. */
export const eventDoc = v.object({
  _id: v.id("events"),
  _creationTime: v.number(),
  subjectRef: v.string(),
  type: v.string(),
  actorRef: v.optional(v.string()),
  metadata: v.optional(jsonValue),
  createdAt: v.number(),
});

/** One page of events, as returned by the paginated read (Convex's pagination shape). */
export const eventPage = paginationResultValidator(eventDoc);

/**
 * A capped count. `isExact` is `false` when the feed has more events than the
 * scan bound, so `count` is the bound rather than the true total.
 */
export const countResult = v.object({
  count: v.number(),
  isExact: v.boolean(),
});
