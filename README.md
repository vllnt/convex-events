<!-- Badges -->
[![Convex Component](https://img.shields.io/badge/convex-component-EE342F.svg)](https://www.convex.dev/components)
[![npm](https://img.shields.io/npm/v/@vllnt/convex-events.svg)](https://www.npmjs.com/package/@vllnt/convex-events)
[![CI](https://github.com/vllnt/convex-events/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-events/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@vllnt/convex-events.svg)](./LICENSE)

# @vllnt/convex-events

Append-only per-subject activity feed and event ledger, as a Convex component.

Record events against an opaque `subjectRef` (a user, a document, an order — any
host entity), then read them back newest-first as a feed or history. Each event
carries a host-defined `type`, an optional `actorRef`, and an opaque `metadata`
payload typed by the host. Domain-neutral: audit logs, activity streams,
notification feeds, timelines — any append-only per-subject ledger. The host
owns the subject, the actor, and the meaning; this component owns only the
ordered event store.

## Features

- **Append-only ledger** — `record` stamps `createdAt` and inserts; events are never mutated.
- **Per-subject feeds** — list / count keyed by an opaque `subjectRef`, newest-first.
- **Cursor pagination** — `paginate` returns Convex's `{ page, isDone, continueCursor }` so a feed pages past any single-call limit.
- **Type filter** — narrow a feed (or a count) to a single event `type` via a dedicated index.
- **Since filter** — page a feed forward from a timestamp watermark.
- **Bounded count** — `count` scans at most `maxCount + 1` rows and reports `{ count, isExact }`; never loads a whole feed.
- **Batched purge** — `purge` deletes in self-rescheduling batches, draining arbitrarily large feeds without a single huge transaction.
- **Retention cron** — set `retentionMs` via `configure`; an internal, idempotent daily cron prunes events past the window.
- **Typed metadata + host validator** — the client is generic over the host's metadata type (`Events<TMeta>`) and accepts an optional `metadataValidator` run at the `record` boundary.
- **Value guards** — optional `allowedTypes`, `maxTypeLength`, and `maxMetadataBytes` reject malformed input at the client boundary with code-tagged errors.
- **Opaque refs** — `subjectRef` and `actorRef` are arbitrary host strings; the component never inspects them.

## Architecture

```
src/
├── shared.ts              # constants, error codes + SubjectRef type (pure)
├── test.ts                # convex-test register() helper
├── client/                # Events<TMeta> class (the public API)
└── component/             # schema (events, config) + mutations + queries + crons
```

Sandboxed tables:

- `events {subjectRef, type, actorRef?, metadata, createdAt}`, indexed
  `by_subject` (`subjectRef, createdAt`), `by_subject_type`
  (`subjectRef, type, createdAt`), and `by_createdAt` (`createdAt`, for retention).
- `config {retentionMs?}` — singleton retention window written by the host via
  `configure`, read by the internal daily prune cron.

The component runs an internal idempotent daily cron (`prune-expired-events`)
that deletes events older than `retentionMs` in self-rescheduling batches. It is
a no-op until the host calls `configure`.

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

// Page a long feed past any single-call limit.
export const feedPage = query({
  args: { userId: v.string(), paginationOpts: paginationOptsValidator },
  handler: (ctx, { userId, paginationOpts }) =>
    events.paginate(ctx, userId, paginationOpts),
});

// Set a 30-day retention window — the internal daily cron prunes older events.
export const setRetention = mutation({
  args: {},
  handler: (ctx) => events.configure(ctx, 30 * 24 * 60 * 60 * 1000),
});
```

## API Reference

See [docs/API.md](docs/API.md). Summary:

| Method | Kind | Result |
|--------|------|--------|
| `record(ctx, subjectRef, type, opts?)` | mutation | new event id (`string`) |
| `list(ctx, subjectRef, opts?)` | query | `EventDoc<TMeta>[]` (newest-first) |
| `paginate(ctx, subjectRef, paginationOpts, opts?)` | query | `EventPage<TMeta>` (`{ page, isDone, continueCursor }`) |
| `count(ctx, subjectRef, opts?)` | query | `CountResult` (`{ count, isExact }`) |
| `purge(ctx, subjectRef, opts?)` | mutation | `number` (deleted in the first batch) |
| `configure(ctx, retentionMs?)` | mutation | `null` (sets/clears the retention window) |
| `pruneExpired(ctx, opts?)` | mutation | `number` (manual retention sweep; the cron's entry point) |

`opts` for `record`: `{ actorRef?, metadata? }` (metadata passes the client's
guards). `opts` for `list` / `paginate`: `{ type?, since? }` (+ `limit?` on
`list`). `opts` for `count`: `{ type?, maxCount? }`. `opts` for `purge`:
`{ before?, batch? }`.

Client options:

```ts
new Events<TMeta>(component, {
  defaultLimit = 50,       // page size when `list` omits `limit`
  defaultMaxCount = 1000,  // scan bound when `count` omits `maxCount`
  allowedTypes,            // if set, `record` rejects types outside it
  maxTypeLength,           // `record` rejects longer types
  maxMetadataBytes,        // `record` rejects larger metadata
  metadataValidator,       // host validator/parser run on metadata at `record`
});
```

Guard rejections throw an `EventValidationError` carrying a stable
`code` (`EVENT_ERROR_CODES`).

## React

Optional, tree-shakeable front-tooling for the reactive feed surface, exported
from `@vllnt/convex-events/react`. `react` and `convex` are **optional peer
deps** — a backend-only consumer pulls none of this code. The hooks never import
the host's `api`; the host passes its own **re-exported** public query
references.

```tsx
import { useActivityFeed, useEventCount } from "@vllnt/convex-events/react";
// `api.events.*` are the host's own re-exports of the component's queries.
import { api } from "../convex/_generated/api";

function Feed({ subjectRef }: { subjectRef: string }) {
  const { results, status, loadMore } = useActivityFeed(
    api.events.paginate,
    { subjectRef, type: "comment" }, // `type` optional
    { initialNumItems: 20 },
  );
  const count = useEventCount(api.events.count, { subjectRef });

  return (
    <div>
      <p>{count?.count ?? "…"} events{count && !count.isExact ? "+" : ""}</p>
      {results.map((e) => (
        <Event key={e._id} event={e} />
      ))}
      {status === "CanLoadMore" && (
        <button onClick={() => loadMore(20)}>Load more</button>
      )}
    </div>
  );
}
```

| Hook | Wraps | Args | Returns |
|------|-------|------|---------|
| `useActivityFeed(paginateRef, { subjectRef, type? }, { initialNumItems })` | `usePaginatedQuery` | host's re-exported paginated feed query | `{ results, status, loadMore }` |
| `useEventCount(countRef, { subjectRef, type? })` | `useQuery` | host's re-exported `count` query | `{ count, isExact }` \| `undefined` |

## Security Model

The component is **auth-agnostic**: it never authenticates or authorizes. The
host resolves identity, decides who may record or read a subject's feed, and
passes opaque `subjectRef` / `actorRef` strings. Component tables are sandboxed
— the host reaches them only through the exported functions. `subjectRef`,
`actorRef`, and `metadata` are opaque to the component; it never inspects or
de-references them.

The host owns input shape: optional client-boundary guards (`allowedTypes`,
`maxTypeLength`, `maxMetadataBytes`, `metadataValidator`) let the host reject or
parse `type` / `metadata` before a write, throwing a code-tagged
`EventValidationError`. The component itself stays domain-neutral — it stores
whatever the (host-validated) call hands it. Retention is host-configured
(`configure`) and enforced by an internal idempotent cron; absent config, no
data is ever auto-deleted.

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
