import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { jsonValue } from "./validators";

/**
 * Sandboxed tables — the activity ledger's own concern. `subjectRef` and
 * `actorRef` are opaque host-owned references (never assume their shape).
 * Events are append-only; ordering is by the host-stamped `createdAt`.
 */
export default defineSchema({
  events: defineTable({
    subjectRef: v.string(),
    type: v.string(),
    actorRef: v.optional(v.string()),
    metadata: v.optional(jsonValue),
    createdAt: v.number(),
  })
    .index("by_subject", ["subjectRef", "createdAt"])
    .index("by_subject_type", ["subjectRef", "type", "createdAt"])
    .index("by_createdAt", ["createdAt"]),
  /**
   * Singleton retention config, written by the host via `configure`. The daily
   * cron reads it to prune events older than `retentionMs`; absent ⇒ no-op.
   */
  config: defineTable({
    retentionMs: v.optional(v.number()),
  }),
});
