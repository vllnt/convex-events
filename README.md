# @vllnt/convex-events

Convex component for an append-only activity feed and event log: record, list,
paginate, count and purge events per subject, with optional retention.

## For coding agents

Docs for the installed version are in `node_modules/@vllnt/convex-events/`:
`docs/API.md`, `llms.txt`, `CHANGELOG.md` and the TypeScript `src/`. Read them
before writing code against this package.

## When to use

- Use it when you need a newest-first history of what happened to one subject (a
  user, document, order or project).
- Use it when events must be appended, never edited, and read back by type, time
  or cursor page.
- Use it when retries must not write the same event twice (`idempotencyKey`).
- Do not use it when each recipient needs an inbox with read/unread state: use
  [`@vllnt/convex-notifications`](https://oss.vllnt.com/packages/convex-notifications).
- Do not use it when you need aggregate metrics such as funnels, retention or
  uniques: use
  [`@vllnt/convex-analytics`](https://oss.vllnt.com/packages/convex-analytics).

## Install

```bash
pnpm add @vllnt/convex-events convex
```

## Quick start

```ts
// convex/convex.config.ts
import events from "@vllnt/convex-events/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(events);
export default app;
```

```ts
// convex/activity.ts
import { Events } from "@vllnt/convex-events";
import { ConvexError, v } from "convex/values";

import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";

const events = new Events<{ taskId: string }>(components.events);

export const completeTask = mutation({
  args: { taskId: v.string() },
  returns: v.string(),
  handler: async (ctx, { taskId }) => {
    const user = await ctx.auth.getUserIdentity();
    if (user === null) throw new ConvexError("not signed in");
    return events.record(ctx, user.tokenIdentifier, "task.completed", {
      metadata: { taskId },
    });
  },
});

export const myActivity = query({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.auth.getUserIdentity();
    if (user === null) throw new ConvexError("not signed in");
    return events.list(ctx, user.tokenIdentifier, { limit: 20 });
  },
});
```

Run `npx convex dev` once to generate `components.events`. The component never
reads auth: the host derives `subjectRef` (here the user's `tokenIdentifier`)
and decides who may record or read a feed.

## API

Full reference: [docs/API.md](docs/API.md).

| Export                                                                     | Import from                                 | What it does                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| [`Events`](docs/API.md#events)                                             | `@vllnt/convex-events`                      | Host client: `new Events<TMeta>(components.events, options?)`        |
| [`record(ctx, subjectRef, type, opts?)`](docs/API.md#record)               | `Events` method, mutation                   | Append an event; returns its id (or the retained id for a retry key) |
| [`list(ctx, subjectRef, opts?)`](docs/API.md#list)                         | `Events` method, query                      | Up to `limit` events, newest-first, filtered by `type` / `since`     |
| [`paginate(ctx, subjectRef, paginationOpts, opts?)`](docs/API.md#paginate) | `Events` method, query                      | One cursor page of events, newest-first                              |
| [`count(ctx, subjectRef, opts?)`](docs/API.md#count)                       | `Events` method, query                      | Bounded count: `{ count, isExact }`                                  |
| [`purge(ctx, subjectRef, opts?)`](docs/API.md#purge)                       | `Events` method, mutation                   | Delete a subject's events in self-rescheduling batches               |
| [`configure(ctx, retentionMs?)`](docs/API.md#configure)                    | `Events` method, mutation                   | Set or clear the retention window the daily cron prunes against      |
| [`pruneExpired(ctx, opts?)`](docs/API.md#pruneexpired)                     | `Events` method, mutation                   | Run the retention sweep now                                          |
| [`EventsComponent`](docs/API.md#eventscomponent)                           | `@vllnt/convex-events` (type)               | Type of `components.events` the client accepts                       |
| [`EventsOptions`](docs/API.md#eventsoptions)                               | `@vllnt/convex-events` (type)               | Client defaults and `record` guards                                  |
| [`EventDoc`](docs/API.md#eventdoc)                                         | `@vllnt/convex-events` (type)               | A stored event as returned by `list` and `paginate`                  |
| [`EventPage`](docs/API.md#eventpage)                                       | `@vllnt/convex-events` (type)               | Result of `paginate`                                                 |
| [`CountResult`](docs/API.md#countresult)                                   | `@vllnt/convex-events`, `/react` (type)     | Result of `count`: `{ count, isExact }`                              |
| [`MetadataValidator`](docs/API.md#metadatavalidator)                       | `@vllnt/convex-events` (type)               | `(metadata: TMeta) => TMeta`, run by `record`                        |
| [`EventValidationError`](docs/API.md#eventvalidationerror)                 | `@vllnt/convex-events`                      | Error class thrown by the `record` guards, with a `code`             |
| [`EVENT_ERROR_CODES`](docs/API.md#event_error_codes)                       | `@vllnt/convex-events`                      | The `EventValidationError` codes                                     |
| [`EventErrorCode`](docs/API.md#eventerrorcode)                             | `@vllnt/convex-events` (type)               | Union of the `EVENT_ERROR_CODES` values                              |
| [`useActivityFeed`](docs/API.md#useactivityfeed)                           | `@vllnt/convex-events/react`                | Reactive paginated feed over your own public query                   |
| [`useEventCount`](docs/API.md#useeventcount)                               | `@vllnt/convex-events/react`                | Reactive count over your own public query                            |
| [`ActivityFeedRef`](docs/API.md#activityfeedref)                           | `@vllnt/convex-events/react` (type)         | Query reference shape `useActivityFeed` accepts                      |
| [`EventCountRef`](docs/API.md#eventcountref)                               | `@vllnt/convex-events/react` (type)         | Query reference shape `useEventCount` accepts                        |
| [`default` (component config)](docs/API.md#convexconfig)                   | `@vllnt/convex-events/convex.config`        | Pass to `app.use(...)`                                               |
| [`register`](docs/API.md#register)                                         | `@vllnt/convex-events/test`                 | Mount the component in `convex-test`                                 |
| [`ComponentApi`](docs/API.md#componentapi)                                 | `@vllnt/convex-events/_generated/component` | Generated type of the mounted component                              |

## Common tasks

Show a live, paginated feed and count in React. The hooks take your own public
queries, which must check that the caller may read `subjectRef`:

```ts
// convex/feed.ts
import { Events } from "@vllnt/convex-events";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { components } from "./_generated/api";
import { query } from "./_generated/server";

const events = new Events(components.events);

export const page = query({
  args: {
    subjectRef: v.string(),
    type: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { subjectRef, type, paginationOpts }) => {
    const user = await ctx.auth.getUserIdentity();
    if (user?.tokenIdentifier !== subjectRef)
      throw new ConvexError("forbidden");
    return events.paginate(ctx, subjectRef, paginationOpts, { type });
  },
});

export const total = query({
  args: { subjectRef: v.string(), type: v.optional(v.string()) },
  returns: v.object({ count: v.number(), isExact: v.boolean() }),
  handler: async (ctx, { subjectRef, type }) => {
    const user = await ctx.auth.getUserIdentity();
    if (user?.tokenIdentifier !== subjectRef)
      throw new ConvexError("forbidden");
    return events.count(ctx, subjectRef, { type, maxCount: 99 });
  },
});
```

```tsx
// src/ActivityFeed.tsx
import { useActivityFeed, useEventCount } from "@vllnt/convex-events/react";

import { api } from "../convex/_generated/api";

export function ActivityFeed({ subjectRef }: { subjectRef: string }) {
  const { results, status, loadMore } = useActivityFeed(
    api.feed.page,
    { subjectRef },
    { initialNumItems: 20 },
  );
  const total = useEventCount(api.feed.total, { subjectRef });
  return (
    <section>
      <h2>
        Activity ({total === undefined ? "…" : total.count}
        {total?.isExact === false ? "+" : ""})
      </h2>
      <ul>
        {results.map((event) => (
          <li key={event._id}>{event.type}</li>
        ))}
      </ul>
      {status === "CanLoadMore" ? (
        <button onClick={() => loadMore(20)}>Load more</button>
      ) : null}
    </section>
  );
}
```

Filter by type and time, make a retried call safe, and delete a subject's
history (for example on account deletion):

```ts
// convex/orders.ts
import { Events } from "@vllnt/convex-events";
import { v } from "convex/values";

import { components } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";

const events = new Events<{ amount: number }>(components.events);

export const recordPayment = internalMutation({
  args: { orderId: v.string(), paymentId: v.string(), amount: v.number() },
  returns: v.string(),
  handler: (ctx, { orderId, paymentId, amount }) =>
    events.record(ctx, orderId, "order.paid", {
      idempotencyKey: paymentId,
      metadata: { amount },
    }),
});

export const recentPayments = query({
  args: { orderId: v.string() },
  handler: (ctx, { orderId }) =>
    events.list(ctx, orderId, {
      type: "order.paid",
      since: Date.now() - 7 * 24 * 60 * 60 * 1000,
      limit: 100,
    }),
});

export const eraseOrderHistory = internalMutation({
  args: { orderId: v.string() },
  returns: v.number(),
  handler: (ctx, { orderId }) => events.purge(ctx, orderId),
});
```

Turn on retention. Run `configureRetention` once (for example with
`npx convex run retention:configureRetention`); the component's daily cron then
deletes events older than the window. `configure(ctx)` with no window turns it
off again.

```ts
// convex/retention.ts
import { Events } from "@vllnt/convex-events";
import { v } from "convex/values";

import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const events = new Events(components.events);

export const configureRetention = internalMutation({
  args: {},
  returns: v.null(),
  handler: (ctx) => events.configure(ctx, 90 * 24 * 60 * 60 * 1000),
});

export const pruneNow = internalMutation({
  args: {},
  returns: v.number(),
  handler: (ctx) => events.pruneExpired(ctx),
});
```

Restrict event types and validate metadata, and turn a guard rejection into a
`ConvexError` the client can read:

```ts
// convex/comments.ts
import {
  EVENT_ERROR_CODES,
  EventValidationError,
  Events,
} from "@vllnt/convex-events";
import { ConvexError, v } from "convex/values";

import { components } from "./_generated/api";
import { mutation } from "./_generated/server";

const events = new Events<{ note: string }>(components.events, {
  allowedTypes: ["comment.created", "comment.deleted"],
  maxMetadataBytes: 2048,
  metadataValidator: (metadata) => {
    const note = metadata.note.trim();
    if (note.length === 0) throw new Error("note must not be blank");
    return { note };
  },
});

export const recordComment = mutation({
  args: { documentId: v.string(), type: v.string(), note: v.string() },
  returns: v.string(),
  handler: async (ctx, { documentId, type, note }) => {
    const user = await ctx.auth.getUserIdentity();
    if (user === null) throw new ConvexError("not signed in");
    try {
      return await events.record(ctx, documentId, type, {
        actorRef: user.tokenIdentifier,
        metadata: { note },
      });
    } catch (error) {
      if (error instanceof EventValidationError) {
        const status =
          error.code === EVENT_ERROR_CODES.METADATA_TOO_LARGE ? 413 : 400;
        throw new ConvexError({ code: error.code, status });
      }
      throw error;
    }
  },
});
```

Mount the component twice. Each named mount has its own events, retry keys,
retention window and cron:

```ts
// convex/convex.config.ts
import events from "@vllnt/convex-events/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(events, { name: "auditEvents" });
app.use(events, { name: "gameEvents" });
export default app;
```

```ts
// convex/clients.ts
import { Events } from "@vllnt/convex-events";

import { components } from "./_generated/api";

export const auditEvents = new Events(components.auditEvents);
export const gameEvents = new Events(components.gameEvents);
```

## Errors and fixes

The component throws a `ConvexError` whose `data` is `{ code, message }`. Catch
it in the host with `error instanceof ConvexError` and read `error.data.code`.

| Code                      | Message                                                                                                                        | Cause                                                                                       | Fix                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `INVALID_ARGUMENT`        | `subjectRef must be non-empty` (or `type`, `actorRef`)                                                                         | `record` got an empty `subjectRef`, `type` or `actorRef`; `purge` got an empty `subjectRef` | Pass non-empty strings; omit `actorRef` instead of passing `""`              |
| `INVALID_IDEMPOTENCY_KEY` | `idempotencyKey must be between 1 and 256 characters`                                                                          | `record` got an empty key or one longer than 256 UTF-16 code units                          | Pass 1..256 characters; hash longer ids                                      |
| `INVALID_LIMIT`           | `limit must be an integer between 1 and 1000` (or `paginationOpts.numItems`), `maxCount must be an integer between 0 and 1000` | `list` `limit` or `paginate` `numItems` outside 1..1000; `count` `maxCount` outside 0..1000 | Pass an integer in range; page with `paginate` to read more than 1000 events |
| `INVALID_SINCE`           | `since must be finite`                                                                                                         | `list` or `paginate` got `NaN` or `Infinity` as `since`                                     | Pass a millisecond timestamp, or omit `since`                                |
| `INVALID_BATCH`           | `batch must be an integer between 1 and 500`                                                                                   | `purge` or `pruneExpired` got a batch outside 1..500 or not an integer                      | Pass an integer in 1..500, or omit it (default 256)                          |
| `INVALID_BEFORE`          | `before must be finite`                                                                                                        | `purge` got `NaN` or `Infinity` as `before`                                                 | Pass a millisecond timestamp, or omit `before` to delete everything          |
| `INVALID_RETENTION`       | `retentionMs must be a non-negative finite number`                                                                             | `configure` got a negative, `NaN` or infinite window                                        | Pass milliseconds `>= 0`, or call `configure(ctx)` to turn retention off     |

The client's `record` guards throw an `EventValidationError` (`error.code`,
`error.message`) before anything is written. A plain error thrown from a Convex
function reaches the browser without its message in production, so rethrow it as
a `ConvexError` if the client must see the code (see Common tasks).

| Code                        | Message                                                                | Cause                                                     | Fix                                                         |
| --------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| `EVENTS_TYPE_NOT_ALLOWED`   | `event type "<type>" is not in the allowed set`                        | `type` is not in the client's `allowedTypes`              | Add the type to `allowedTypes`, or fix the caller           |
| `EVENTS_TYPE_TOO_LONG`      | `event type exceeds maxTypeLength (<n>)`                               | `type.length` is above `maxTypeLength`                    | Shorten the type or raise `maxTypeLength`                   |
| `EVENTS_METADATA_INVALID`   | the `metadataValidator` error message, or `metadata validation failed` | Your `metadataValidator` threw                            | Send metadata your validator accepts                        |
| `EVENTS_METADATA_TOO_LARGE` | `metadata exceeds maxMetadataBytes (<n>)`                              | UTF-8 size of `JSON.stringify(metadata)` is above the cap | Store less, or store a reference to a host document instead |

Arguments of the wrong type (for example a number `subjectRef`) are rejected by
Convex argument validation before the component runs. With `maxMetadataBytes`
set, metadata that `JSON.stringify` cannot serialize (a `bigint`) throws its own
`TypeError`.

## Limits and gotchas

- `list` returns at most `limit` events (default 50, max 1000) and does not say
  whether more exist. Use `paginate` to read a whole feed.
- `count` scans at most `maxCount + 1` rows (default 1000, max 1000). When the
  feed is larger it returns `{ count: maxCount, isExact: false }`, not the true
  total. `count` has no `since` filter.
- `since` is inclusive (`createdAt >= since`). `purge` `before` and the
  retention cutoff are strict (`createdAt < before`).
- `createdAt` is stamped by the component with `Date.now()`; the host cannot set
  or backdate it. Feeds are ordered by `createdAt`, newest-first.
- Retention is off until `configure` sets a window. Until then the daily
  `prune-expired-events` cron (00:00 UTC) and `pruneExpired` delete nothing and
  return `0`, and an invalid `batch` passed to `pruneExpired` is not checked.
- The retention window is one value per mount, applied to every subject.
- `purge` and `pruneExpired` delete up to `batch` rows (default 256, max 500)
  oldest-first and return only that first batch's count. Follow-up batches run
  as scheduled mutations until a batch comes back short.
- An `idempotencyKey` is scoped to the subject. A second `record` with the same
  subject and key returns the first event's id even if `type` or `metadata`
  differ, and writes nothing. Once the event is purged or expired, the key
  writes a new event. Reads never return the key.
- The guards in `EventsOptions` (`allowedTypes`, `maxTypeLength`,
  `maxMetadataBytes`, `metadataValidator`) run in the `Events` client only.
  Calling `components.events.mutations.record` directly skips them.
  `metadataValidator` and `maxMetadataBytes` run only when `metadata` is set.
- `metadata` is stored as-is (`v.any()`) and is not validated on read; Convex
  document size limits still apply.
- Reads with an empty `subjectRef` return no events instead of throwing.
- Events are never updated. There is no edit method.

## Compatibility

- Peer dependencies: `convex@^1.45.0`; `react@>=18` (optional, only for
  `@vllnt/convex-events/react`). CI runs the unit tests on the locked convex
  version (1.51.0), and type-checks and runs the packed package against convex
  1.45.0 and React 18.
- Node.js: `package.json` declares `>=18`, but convex itself requires Node.js
  `>=20` (convex 1.45 to 1.48) and `>=22` (convex 1.49 and newer). ES modules
  only.
- `@vllnt/convex-events/test` ships as TypeScript source and needs
  `convex-test`, `vitest`, `vite` and `@edge-runtime/vm`, with the Vitest config
  shown under Testing.

## Testing

### Testing your app

Mount the component in your own `convex-test` suite with `register`. Use the
Vitest settings `convex-test` recommends (edge runtime, `convex-test` inlined).
`register` uses Vite's `import.meta.glob`, so it only works under Vitest/Vite:

```ts
// vitest.config.mts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
```

```ts
// convex/activity.test.ts
/// <reference types="vite/client" />
import { register } from "@vllnt/convex-events/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

test("a completed task shows in my activity", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  register(t);
  const user = t.withIdentity({ tokenIdentifier: "user-1" });
  await user.mutation(api.activity.completeTask, { taskId: "task-1" });
  const feed = await user.query(api.activity.myActivity, {});
  expect(feed.map((event) => event.type)).toEqual(["task.completed"]);
});
```

`register(t, name)` takes the mount name when you used
`app.use(events, { name })`. It accepts a `convexTest` instance built from any
host schema, with no cast.

### This repository

`pnpm test:coverage` runs the tests on the simulated `convex-test` runtime with
100% coverage enforced. They do not prove production concurrency or scheduler
delivery. `pnpm test:package` installs the packed tarball in a temporary app,
checks these docs and type-checks and runs the README examples.

## Security

- The component does not authenticate. The host must authorize every call and
  derive `subjectRef` and `actorRef` itself; never trust a ref sent by the
  client without checking it.
- Its `events` and `config` tables are reachable only through the component's
  functions, and it never reads host tables.
- `subjectRef`, `actorRef` and `metadata` are opaque: the component does not
  inspect them beyond rejecting empty refs.

Report vulnerabilities as described in
[SECURITY.md](https://github.com/vllnt/convex-events/blob/main/SECURITY.md).

## Related packages

None. This package has no dependency, shared test or example with another
package.

## Contributing

See
[CONTRIBUTING.md](https://github.com/vllnt/convex-events/blob/main/CONTRIBUTING.md).

## Links

- Docs and changelog: [oss.vllnt.com/packages/convex-events](https://oss.vllnt.com/packages/convex-events) · [release feed](https://oss.vllnt.com/packages/convex-events/rss.xml)
- All @vllnt packages: [oss.vllnt.com](https://oss.vllnt.com) · [search packages and docs on index.vllnt.com](https://index.vllnt.com)
- Source and issues: [GitHub](https://github.com/vllnt/convex-events) · [issues](https://github.com/vllnt/convex-events/issues) · [npm](https://www.npmjs.com/package/@vllnt/convex-events)
- Questions and updates: [Discord](https://bntvllnt.com/discord) · [X @bntvllnt](https://x.com/bntvllnt)
- Company and author: [vllnt.com](https://vllnt.com) · [bntvllnt.com](https://bntvllnt.com) · [GitHub @bntvllnt](https://github.com/bntvllnt) · [LinkedIn](https://linkedin.com/in/bntvllnt)
- Sponsor: [GitHub Sponsors](https://github.com/sponsors/bntvllnt)

## License

MIT. See [LICENSE](LICENSE).

[![npm](https://img.shields.io/npm/v/@vllnt/convex-events.svg)](https://www.npmjs.com/package/@vllnt/convex-events)
[![CI](https://github.com/vllnt/convex-events/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-events/actions/workflows/ci.yml)

---

Part of [vllnt open source](https://oss.vllnt.com) · [Package page](https://oss.vllnt.com/packages/convex-events) · [vllnt.com](https://vllnt.com) · Built by [bntvllnt](https://bntvllnt.com)
