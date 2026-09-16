<!-- Badges -->

[![Convex Component](https://img.shields.io/badge/convex-component-EE342F.svg)](https://www.convex.dev/components)
[![npm](https://img.shields.io/npm/v/@vllnt/convex-events.svg)](https://www.npmjs.com/package/@vllnt/convex-events)
[![CI](https://github.com/vllnt/convex-events/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-events/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@vllnt/convex-events.svg)](./LICENSE)

# @vllnt/convex-events

Append-only per-subject activity feed and event ledger, as a Convex component —
record events against an opaque `subjectRef`, read them back newest-first as a
feed or history.

```ts
const events = new Events(components.events);
await events.record(ctx, subjectRef, "created", { actorRef });
const feed = await events.list(ctx, subjectRef, { limit: 20 });
```

## Features

- **Append-only ledger** — `record` stamps `createdAt`; optional
  `idempotencyKey` replays the retained event ID without inserting another row.
- **Per-subject feeds** — list / count keyed by an opaque `subjectRef`,
  newest-first.
- **Cursor pagination** — `paginate` returns Convex's
  `{ page, isDone, continueCursor }`.
- **Type filter & since filter** — narrow a feed (or count) to one `type`, or
  page forward from a timestamp.
- **Bounded count** — scans at most `maxCount + 1` rows and reports
  `{ count, isExact }`.
- **Batched purge + retention cron** — drains large feeds in self-rescheduling
  batches; an idempotent daily cron prunes past `retentionMs`.
- **Typed metadata + host validator** — generic over the host's metadata type,
  with optional client-boundary value guards.
- **Opaque refs** — `subjectRef` / `actorRef` are arbitrary host strings the
  component never inspects.

## Installation

```bash
pnpm add @vllnt/convex-events
```

Node.js >=18; required peer: `convex@^1.45.0`. React >=18 is optional. The
default npm channel is stable; install `@vllnt/convex-events@canary` for the
current prerelease surface documented here, including `idempotencyKey`.

## Usage

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import events from "@vllnt/convex-events/convex.config";

const app = defineApp();
app.use(events);
export default app;
```

```ts
// convex/activity.ts — host owns auth; pass opaque refs in.
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { Events } from "@vllnt/convex-events";

interface Meta {
  note?: string;
}

const events = new Events<Meta>(components.events, {
  allowedTypes: ["created", "updated", "deleted"], // optional value guard
});

export const log = mutation({
  args: { userId: v.string(), type: v.string() },
  handler: (ctx, { userId, type }) =>
    events.record(ctx, userId, type, { actorRef: userId }),
});

export const feed = query({
  args: { userId: v.string() },
  handler: (ctx, { userId }) => events.list(ctx, userId, { limit: 20 }),
});

export const feedPage = query({
  args: { userId: v.string(), paginationOpts: paginationOptsValidator },
  handler: (ctx, { userId, paginationOpts }) =>
    events.paginate(ctx, userId, paginationOpts),
});
```

These wrappers illustrate calls, not production auth: authenticate the caller
and authorize all subject/actor refs before reading or recording. After
mounting, run `pnpm convex dev` to generate the host's component references.

## Configuration and limits

Client defaults: `defaultLimit: 50`, `defaultMaxCount: 1000`. List/page sizes
must be integers in 1–1000; count bounds are integers in 0–1000
(`INVALID_LIMIT`). `allowedTypes`, `maxTypeLength`, `maxMetadataBytes` and
`metadataValidator` are opt-in guards; Convex platform limits still apply.
Retention is disabled until `configure` sets a non-negative finite
`retentionMs`; `undefined` clears it. Purge/prune batches default to 256 and
must be integers in 1–500.

`record(ctx, subjectRef, type, { actorRef?, metadata?, idempotencyKey? })`
returns the existing ID on a retry key shared by that subject, even if the new
payload or type differs. Keys must contain 1–256 UTF-16 code units. Purge or
retention deletion removes replay protection. Without a key, each call inserts.
This is an activity ledger, not durable event delivery; the host owns retries
and any downstream side effects.

## Multiple mounts

```ts
app.use(events, { name: "webEvents" });
app.use(events, { name: "gameEvents" });
// new Events(components.webEvents), new Events(components.gameEvents)
```

Each mount has independent feeds, retry keys, retention configuration and cron
work.

## API Reference

| Method                                             | Kind     | Result                                    |
| -------------------------------------------------- | -------- | ----------------------------------------- |
| `record(ctx, subjectRef, type, opts?)`             | mutation | new or retained event id (`string`)       |
| `list(ctx, subjectRef, opts?)`                     | query    | `EventDoc<TMeta>[]` (newest-first)        |
| `paginate(ctx, subjectRef, paginationOpts, opts?)` | query    | `EventPage<TMeta>`                        |
| `count(ctx, subjectRef, opts?)`                    | query    | `{ count, isExact }`                      |
| `purge(ctx, subjectRef, opts?)`                    | mutation | `number` (deleted in the first batch)     |
| `configure(ctx, retentionMs?)`                     | mutation | `null` (sets/clears the retention window) |
| `pruneExpired(ctx, opts?)`                         | mutation | `number` (manual retention sweep)         |

Full reference: [docs/API.md](docs/API.md) — including client options
(`defaultLimit`, `allowedTypes`, `metadataValidator`, …) and
`EVENT_ERROR_CODES`.

## React

Optional, tree-shakeable hooks at `@vllnt/convex-events/react`; `react` is
optional; `convex` is required. Pass the host's own re-exported query refs — the
component never imports your `api`.

The host query refs below must accept `subjectRef` (and pagination options for
`paginate`); they are not the `userId` wrappers above.

```tsx
import { useActivityFeed, useEventCount } from "@vllnt/convex-events/react";
import { api } from "../convex/_generated/api";

const { results, status, loadMore } = useActivityFeed(
  api.events.paginate,
  { subjectRef },
  { initialNumItems: 20 },
);
const count = useEventCount(api.events.count, { subjectRef });
```

| Hook                                                                       | Wraps               | Returns                           |
| -------------------------------------------------------------------------- | ------------------- | --------------------------------- |
| `useActivityFeed(paginateRef, { subjectRef, type? }, { initialNumItems })` | `usePaginatedQuery` | `{ results, status, loadMore }`   |
| `useEventCount(countRef, { subjectRef, type? })`                           | `useQuery`          | `{ count, isExact } \| undefined` |

## Security

- Auth-agnostic — the host resolves identity, decides who may record or read a
  feed, and passes opaque refs.
- Tables are sandboxed; `subjectRef`, `actorRef`, and `metadata` are opaque and
  never inspected.
- Optional client-boundary guards (`allowedTypes`, `maxTypeLength`,
  `maxMetadataBytes`, `metadataValidator`) reject malformed input with a
  code-tagged `EventValidationError`.

See [docs/API.md](docs/API.md).

## Testing

```bash
pnpm test           # single run
pnpm test:coverage  # enforced 100% on covered files
```

Tests use the simulated `convex-test` backend (`@edge-runtime/vm`), not a real
Convex deployment; they do not prove production concurrency or scheduler
delivery.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

Built by [bntvllnt](https://github.com/bntvllnt) ·
[bntvllnt.com](https://bntvllnt.com) · [X @bntvllnt](https://x.com/bntvllnt)

Part of the [@vllnt](https://github.com/vllnt) Convex component fleet —
[vllnt.com](https://vllnt.com)

If this is useful, [sponsor the work](https://github.com/sponsors/bntvllnt).

## License

MIT — see [LICENSE](LICENSE).
