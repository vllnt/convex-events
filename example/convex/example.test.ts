import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { register } from "../../src/test";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  register(t);
  return t;
}

/** Real delay so successive `record` calls get distinct `Date.now()` stamps. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 2));
}

/** Record `n` events for `subject`, draining scheduled work between writes. */
async function seed(
  t: ReturnType<typeof setup>,
  subject: string,
  n: number,
  type = "t",
): Promise<void> {
  for (let i = 0; i < n; i++) {
    await t.mutation(api.example.record, { subjectRef: subject, type });
  }
}

describe("events — record / list", () => {
  test("record then list round-trips, newest-first (happy path)", async () => {
    const t = setup();
    const id1 = await t.mutation(api.example.record, {
      subjectRef: "subj_1",
      type: "created",
      actorRef: "user_1",
      metadata: { note: "first" },
    });
    expect(typeof id1).toBe("string");
    await tick();
    const id2 = await t.mutation(api.example.record, {
      subjectRef: "subj_1",
      type: "updated",
    });
    expect(typeof id2).toBe("string");

    const items = await t.query(api.example.list, { subjectRef: "subj_1" });
    expect(items).toHaveLength(2);
    expect(items[0]._id).toBe(id2);
    expect(items[0].type).toBe("updated");
    expect(items[0].actorRef).toBeUndefined();
    expect(items[1]._id).toBe(id1);
    expect(items[1].actorRef).toBe("user_1");
    expect(items[1].metadata).toEqual({ note: "first" });
  });

  test("omitted metadata round-trips as absent — shape stays honest (edge)", async () => {
    const t = setup();
    await t.mutation(api.example.record, { subjectRef: "s", type: "t" });
    const [item] = await t.query(api.example.list, { subjectRef: "s" });
    // recorded without metadata → field absent (undefined), never a fake Meta shape
    expect(item.metadata).toBeUndefined();
    expect("metadata" in item).toBe(false);
  });

  test("list / count for an unknown subject are empty (edge: empty)", async () => {
    const t = setup();
    expect(await t.query(api.example.list, { subjectRef: "ghost" })).toEqual([]);
    expect(await t.query(api.example.count, { subjectRef: "ghost" })).toEqual({
      count: 0,
      isExact: true,
    });
  });

  test("list honors the limit argument", async () => {
    const t = setup();
    await seed(t, "s", 3);
    const items = await t.query(api.example.list, { subjectRef: "s", limit: 2 });
    expect(items).toHaveLength(2);
  });

  test("type filter narrows list + count to one verb", async () => {
    const t = setup();
    await t.mutation(api.example.record, { subjectRef: "s", type: "login" });
    await t.mutation(api.example.record, { subjectRef: "s", type: "login" });
    await t.mutation(api.example.record, { subjectRef: "s", type: "logout" });

    expect(await t.query(api.example.count, { subjectRef: "s" })).toEqual({
      count: 3,
      isExact: true,
    });
    expect(
      await t.query(api.example.count, { subjectRef: "s", type: "login" }),
    ).toEqual({ count: 2, isExact: true });

    const logins = await t.query(api.example.list, {
      subjectRef: "s",
      type: "login",
    });
    expect(logins).toHaveLength(2);
    expect(logins.every((e) => e.type === "login")).toBe(true);
  });

  test("since filter excludes older events (both indexes)", async () => {
    const t = setup();
    await t.mutation(api.example.record, { subjectRef: "s", type: "a" });
    await tick();
    await t.mutation(api.example.record, { subjectRef: "s", type: "a" });
    const all = await t.query(api.example.list, { subjectRef: "s" });
    expect(all).toHaveLength(2);
    const cutoff = all[0].createdAt;

    const recent = await t.query(api.example.list, {
      subjectRef: "s",
      since: cutoff,
    });
    expect(recent).toHaveLength(1);
    expect(recent[0].createdAt).toBeGreaterThanOrEqual(cutoff);

    const recentTyped = await t.query(api.example.list, {
      subjectRef: "s",
      type: "a",
      since: cutoff,
    });
    expect(recentTyped).toHaveLength(1);
  });

  test("scopes by subject — events of one subject do not leak into another", async () => {
    const t = setup();
    await t.mutation(api.example.record, { subjectRef: "a", type: "x" });
    await t.mutation(api.example.record, { subjectRef: "b", type: "x" });
    expect(await t.query(api.example.count, { subjectRef: "a" })).toEqual({
      count: 1,
      isExact: true,
    });
    const aItems = await t.query(api.example.list, { subjectRef: "a" });
    expect(aItems.every((e) => e.subjectRef === "a")).toBe(true);
  });
});

describe("events — paginate (cursor)", () => {
  test("pages a feed across ≥2 pages via continueCursor until isDone", async () => {
    const t = setup();
    await seed(t, "s", 5);

    const first = await t.query(api.example.paginate, {
      subjectRef: "s",
      paginationOpts: { cursor: null, numItems: 2 },
    });
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);

    const second = await t.query(api.example.paginate, {
      subjectRef: "s",
      paginationOpts: { cursor: first.continueCursor, numItems: 2 },
    });
    expect(second.page).toHaveLength(2);
    expect(second.isDone).toBe(false);

    const third = await t.query(api.example.paginate, {
      subjectRef: "s",
      paginationOpts: { cursor: second.continueCursor, numItems: 2 },
    });
    expect(third.page).toHaveLength(1);
    expect(third.isDone).toBe(true);

    // five distinct ids paged past the per-call numItems of 2
    const ids = [...first.page, ...second.page, ...third.page].map((e) => e._id);
    expect(new Set(ids).size).toBe(5);
  });

  test("paginate honors the type + since filters (typed index path)", async () => {
    const t = setup();
    await t.mutation(api.example.record, { subjectRef: "s", type: "a" });
    await tick();
    await t.mutation(api.example.record, { subjectRef: "s", type: "a" });
    await t.mutation(api.example.record, { subjectRef: "s", type: "b" });
    const all = await t.query(api.example.list, { subjectRef: "s", type: "a" });
    const cutoff = all[0].createdAt;

    const typed = await t.query(api.example.paginate, {
      subjectRef: "s",
      type: "a",
      since: cutoff,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(typed.page).toHaveLength(1);
    expect(typed.page[0].type).toBe("a");
    expect(typed.isDone).toBe(true);
  });

  test("paginate untyped with `since` excludes older events (untyped+since branch)", async () => {
    const t = setup();
    await t.mutation(api.example.record, { subjectRef: "s", type: "a" });
    await tick();
    await t.mutation(api.example.record, { subjectRef: "s", type: "b" });
    const all = await t.query(api.example.list, { subjectRef: "s" });
    const cutoff = all[0].createdAt;

    const recent = await t.query(api.example.paginate, {
      subjectRef: "s",
      since: cutoff,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(recent.page).toHaveLength(1);
    expect(recent.page[0].createdAt).toBeGreaterThanOrEqual(cutoff);
    expect(recent.isDone).toBe(true);
  });

  test("paginate typed with no `since` returns every event of the type (typed no-since branch)", async () => {
    const t = setup();
    await t.mutation(api.example.record, { subjectRef: "s", type: "a" });
    await t.mutation(api.example.record, { subjectRef: "s", type: "a" });
    await t.mutation(api.example.record, { subjectRef: "s", type: "b" });

    const typed = await t.query(api.example.paginate, {
      subjectRef: "s",
      type: "a",
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(typed.page).toHaveLength(2);
    expect(typed.page.every((e) => e.type === "a")).toBe(true);
    expect(typed.isDone).toBe(true);
  });
});

describe("events — count (bounded)", () => {
  test("count caps at maxCount and reports isExact:false past the bound", async () => {
    const t = setup();
    await seed(t, "s", 3);
    // exact when under the bound
    expect(
      await t.query(api.example.count, { subjectRef: "s", maxCount: 5 }),
    ).toEqual({ count: 3, isExact: true });
    // capped when the feed exceeds the bound
    expect(
      await t.query(api.example.count, { subjectRef: "s", maxCount: 2 }),
    ).toEqual({ count: 2, isExact: false });
  });

  test("count filters by type (by_subject_type path)", async () => {
    const t = setup();
    await seed(t, "s", 2);
    await t.mutation(api.example.record, { subjectRef: "s", type: "login" });
    expect(
      await t.query(api.example.count, { subjectRef: "s", type: "login", maxCount: 10 }),
    ).toEqual({ count: 1, isExact: true });
    // capped + typed exercises the by_subject_type branch under the bound too
    expect(
      await t.query(api.example.count, { subjectRef: "s", type: "login", maxCount: 0 }),
    ).toEqual({ count: 0, isExact: false });
  });

  test("capped client default maxCount bounds an unbounded count", async () => {
    const t = setup();
    await seed(t, "s", 3);
    // cappedEvents.defaultMaxCount = 2 → capped, isExact false
    expect(await t.query(api.example.countCapped, { subjectRef: "s" })).toEqual({
      count: 2,
      isExact: false,
    });
  });

  test("component count falls back to its own DEFAULT_MAX_COUNT with no maxCount", async () => {
    const t = setup();
    await seed(t, "s", 3);
    // countRaw calls the component query directly with no maxCount → exact under the default bound
    expect(await t.query(api.example.countRaw, { subjectRef: "s" })).toEqual({
      count: 3,
      isExact: true,
    });
  });
});

describe("events — purge (batched)", () => {
  test("purge-all deletes every event for the subject and returns the count", async () => {
    const t = setup();
    await seed(t, "s", 2);
    const deleted = await t.mutation(api.example.purge, { subjectRef: "s" });
    expect(deleted).toBe(2);
    expect(await t.query(api.example.count, { subjectRef: "s" })).toEqual({
      count: 0,
      isExact: true,
    });
  });

  test("purge-before deletes only events older than the cutoff", async () => {
    const t = setup();
    await t.mutation(api.example.record, { subjectRef: "s", type: "t" });
    await tick();
    await t.mutation(api.example.record, { subjectRef: "s", type: "t" });
    const all = await t.query(api.example.list, { subjectRef: "s" });
    const cutoff = all[0].createdAt;

    const deleted = await t.mutation(api.example.purge, {
      subjectRef: "s",
      before: cutoff,
    });
    expect(deleted).toBe(1);
    expect(await t.query(api.example.count, { subjectRef: "s" })).toEqual({
      count: 1,
      isExact: true,
    });
  });

  test("purge of an empty subject is a no-op returning 0 (edge)", async () => {
    const t = setup();
    expect(await t.mutation(api.example.purge, { subjectRef: "ghost" })).toBe(0);
  });

  test("batched purge drains a feed larger than one batch via self-reschedule", async () => {
    // Fake timers from the top so the self-rescheduled batches are tracked and
    // advanced by `finishAllScheduledFunctions`.
    vi.useFakeTimers();
    try {
      const t = setup();
      await seed(t, "s", 5);
      // batch=2 → first call deletes 2, reschedules follow-up batches until short
      const firstBatch = await t.mutation(api.example.purge, {
        subjectRef: "s",
        batch: 2,
      });
      expect(firstBatch).toBe(2);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.query(api.example.count, { subjectRef: "s" })).toEqual({
        count: 0,
        isExact: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("events — retention (configure + pruneExpired cron)", () => {
  test("pruneExpired is a no-op until retention is configured", async () => {
    const t = setup();
    await seed(t, "s", 2);
    // not configured → no-op
    expect(await t.mutation(api.example.pruneExpired, {})).toBe(0);
    expect(await t.query(api.example.count, { subjectRef: "s" })).toEqual({
      count: 2,
      isExact: true,
    });
  });

  test("configured retention prunes events older than the window (batched)", async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      await seed(t, "s", 5); // stamped at the frozen fake-clock "now"
      // advance the clock so the seeded events fall outside the retention window
      vi.advanceTimersByTime(1000);
      await t.mutation(api.example.configure, { retentionMs: 500 });
      // cutoff = now(+1000) - 500 = now+500; all 5 events (at now+0) are older
      const firstBatch = await t.mutation(api.example.pruneExpired, { batch: 2 });
      expect(firstBatch).toBe(2);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.query(api.example.count, { subjectRef: "s" })).toEqual({
        count: 0,
        isExact: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("retention keeps events inside the window, and configure can be re-set/cleared", async () => {
    const t = setup();
    await t.mutation(api.example.record, { subjectRef: "s", type: "t" });
    // huge window → nothing is old enough to prune
    await t.mutation(api.example.configure, { retentionMs: 1_000_000_000 });
    expect(await t.mutation(api.example.pruneExpired, {})).toBe(0);
    expect(await t.query(api.example.count, { subjectRef: "s" })).toEqual({
      count: 1,
      isExact: true,
    });
    // clearing retention (undefined) → patch path + back to no-op
    await t.mutation(api.example.configure, {});
    expect(await t.mutation(api.example.pruneExpired, {})).toBe(0);
  });
});

describe("events — client guards (boundary rejection)", () => {
  test("guarded record accepts an allowed type and trims metadata (happy)", async () => {
    const t = setup();
    const id = await t.mutation(api.example.recordGuarded, {
      subjectRef: "s",
      type: "created",
      metadata: { note: "  hi  " },
    });
    expect(typeof id).toBe("string");
    const [item] = await t.query(api.example.list, { subjectRef: "s" });
    expect(item.metadata).toEqual({ note: "hi" }); // validator trimmed
  });

  test("guarded record without metadata skips the validator (happy)", async () => {
    const t = setup();
    const id = await t.mutation(api.example.recordGuarded, {
      subjectRef: "s",
      type: "updated",
    });
    expect(typeof id).toBe("string");
  });

  test("rejects a type outside allowedTypes", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.recordGuarded, { subjectRef: "s", type: "deleted" }),
    ).rejects.toThrow(/not in the allowed set/);
  });

  test("length-guarded client rejects a type past maxTypeLength (standalone guard)", async () => {
    const t = setup();
    // lengthGuardedEvents has NO allow-list, maxTypeLength 8 → the length guard fires
    await expect(
      t.mutation(api.example.recordLengthGuarded, {
        subjectRef: "s",
        type: "way-too-long-type",
      }),
    ).rejects.toThrow(/maxTypeLength/);
  });

  test("length-guarded client accepts a type within maxTypeLength (happy)", async () => {
    const t = setup();
    const id = await t.mutation(api.example.recordLengthGuarded, {
      subjectRef: "s",
      type: "short",
    });
    expect(typeof id).toBe("string");
  });

  test("rejects metadata larger than maxMetadataBytes", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.recordGuarded, {
        subjectRef: "s",
        type: "created",
        metadata: { note: "x".repeat(200) },
      }),
    ).rejects.toThrow(/maxMetadataBytes/);
  });

  test("host metadata validator rejects an invalid payload", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.recordGuarded, {
        subjectRef: "s",
        type: "created",
        metadata: { note: "   " },
      }),
    ).rejects.toThrow(/note must not be blank/);
  });
});

describe("events — client default-limit option", () => {
  test("a client built with { defaultLimit: 1 } caps an unbounded list", async () => {
    const t = setup();
    await seed(t, "s", 2);
    expect(await t.query(api.example.list, { subjectRef: "s" })).toHaveLength(2);
    expect(
      await t.query(api.example.listCapped, { subjectRef: "s" }),
    ).toHaveLength(1);
  });
});
