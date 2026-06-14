<!-- Badges -->
[![Convex Component](https://img.shields.io/badge/convex-component-EE342F.svg)](https://www.convex.dev/components)
[![npm](https://img.shields.io/npm/v/@vllnt/convex-events.svg)](https://www.npmjs.com/package/@vllnt/convex-events)
[![CI](https://github.com/vllnt/convex-events/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-events/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@vllnt/convex-events.svg)](./LICENSE)

# @vllnt/convex-events

Append-only per-subject activity feed and event ledger, as a Convex component — record events against an opaque `subjectRef`, read them back newest-first as a feed or history.

```ts
const events = new Events(components.events);
await events.record(ctx, subjectRef, "created", { actorRef });
const feed = await events.list(ctx, subjectRef, { limit: 20 });
```

## Features

- **Append-only ledger** — `record` stamps `createdAt` and inserts; events are never mutated.
- **Per-subject feeds** — list / count keyed by an opaque `subjectRef`, newest-first.
- **Cursor pagination** — `paginate` returns Convex's `{ page, isDone, continueCursor }`.
- **Type filter & since filter** — narrow a feed (or count) to one `type`, or page forward from a timestamp.
- **Bounded count** — scans at most `maxCount + 1` rows and reports `{ count, isExact }`.
- **Batched purge + retention cron** — drains large feeds in self-rescheduling batches; an idempotent daily cron prunes past `retentionMs`.
- **Typed metadata + host validator** — generic over the host's metadata type, with optional client-boundary value guards.
- **Opaque refs** — `subjectRef` / `actorRef` are arbitrary host strings the component never inspects.

## Installation

```bash
pnpm add @vllnt/convex-events
```

Peer dependency: `convex@^1.41.0`.

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

interface Meta { note?: string }

const events = new Events<Meta>(components.events, {
  allowedTypes: ["created", "updated", "deleted"], // optional value guard
});

export const log = mutation({
  args: { userId: v.string(), type: v.string() },
  handler: (ctx, { userId, type }) => events.record(ctx, userId, type, { actorRef: userId }),
});

export const feed = query({
  args: { userId: v.string() },
  handler: (ctx, { userId }) => events.list(ctx, userId, { limit: 20 }),
});

export const feedPage = query({
  args: { userId: v.string(), paginationOpts: paginationOptsValidator },
  handler: (ctx, { userId, paginationOpts }) => events.paginate(ctx, userId, paginationOpts),
});
```

## API Reference

| Method | Kind | Result |
|--------|------|--------|
| `record(ctx, subjectRef, type, opts?)` | mutation | new event id (`string`) |
| `list(ctx, subjectRef, opts?)` | query | `EventDoc<TMeta>[]` (newest-first) |
| `paginate(ctx, subjectRef, paginationOpts, opts?)` | query | `EventPage<TMeta>` |
| `count(ctx, subjectRef, opts?)` | query | `{ count, isExact }` |
| `purge(ctx, subjectRef, opts?)` | mutation | `number` (deleted in the first batch) |
| `configure(ctx, retentionMs?)` | mutation | `null` (sets/clears the retention window) |
| `pruneExpired(ctx, opts?)` | mutation | `number` (manual retention sweep) |

Full reference: [docs/API.md](docs/API.md) — including client options (`defaultLimit`, `allowedTypes`, `metadataValidator`, …) and `EVENT_ERROR_CODES`.

## React

Optional, tree-shakeable hooks at `@vllnt/convex-events/react`; `react` and `convex` are optional peer deps. Pass the host's own re-exported query refs — the component never imports your `api`.

```tsx
import { useActivityFeed, useEventCount } from "@vllnt/convex-events/react";
import { api } from "../convex/_generated/api";

const { results, status, loadMore } = useActivityFeed(api.events.paginate, { subjectRef }, { initialNumItems: 20 });
const count = useEventCount(api.events.count, { subjectRef });
```

| Hook | Wraps | Returns |
|------|-------|---------|
| `useActivityFeed(paginateRef, { subjectRef, type? }, { initialNumItems })` | `usePaginatedQuery` | `{ results, status, loadMore }` |
| `useEventCount(countRef, { subjectRef, type? })` | `useQuery` | `{ count, isExact } \| undefined` |

## Security

- Auth-agnostic — the host resolves identity, decides who may record or read a feed, and passes opaque refs.
- Tables are sandboxed; `subjectRef`, `actorRef`, and `metadata` are opaque and never inspected.
- Optional client-boundary guards (`allowedTypes`, `maxTypeLength`, `maxMetadataBytes`, `metadataValidator`) reject malformed input with a code-tagged `EventValidationError`.

See [docs/API.md](docs/API.md).

## Testing

```bash
pnpm test           # single run
pnpm test:coverage  # enforced 100% on covered files
```

Tests run against the real component runtime via `convex-test` (`@edge-runtime/vm`), not mocks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

Built by [bntvllnt](https://github.com/bntvllnt) · [bntvllnt.com](https://bntvllnt.com) · [X @bntvllnt](https://x.com/bntvllnt)

Part of the [@vllnt](https://github.com/vllnt) Convex component fleet — [vllnt.com](https://vllnt.com)

If this is useful, [sponsor the work](https://github.com/sponsors/bntvllnt).

## License

MIT — see [LICENSE](LICENSE).
