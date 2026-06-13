# API Reference — @vllnt/convex-events

Construct the client with the mounted component and optional config. The client
is generic over the host's metadata type `TMeta`:

```ts
import { Events } from "@vllnt/convex-events";

interface Meta {
  note?: string;
}

const events = new Events<Meta>(components.events, {
  defaultLimit: 50, // page size when a `list` call omits `limit`
  defaultMaxCount: 1000, // scan bound when a `count` call omits `maxCount`
  allowedTypes: ["created", "updated"], // optional `type` allow-list
  maxTypeLength: 64, // optional `type` length cap
  maxMetadataBytes: 4096, // optional serialized-`metadata` byte cap
  metadataValidator: (m) => m, // optional host validator/parser for `metadata`
});
```

All methods take the host `ctx` (a query or mutation context) as the first
argument. `subjectRef` and `actorRef` are opaque host strings — the component
never inspects them.

## Mutations

### `record(ctx, subjectRef, type, opts?) → string`

Append an event of `type` for `subjectRef` and return the new event id. The
component stamps `createdAt` (`Date.now()`) on insert. Before writing, the
client applies its configured boundary guards (see **Guards** below) — on
rejection it throws an `EventValidationError`. `opts`:

- `actorRef?: string` — opaque ref for who caused the event.
- `metadata?: TMeta` — host-owned payload. Omitted ⇒ the field is not stored, so
  it reads back absent (`undefined`) rather than a fake `TMeta` value.

### `purge(ctx, subjectRef, opts?) → number`

Delete events for `subjectRef` and return how many were deleted **in the first
batch**. Deletion is batched and self-rescheduling: large feeds drain across
scheduled follow-up mutations rather than one huge transaction. `opts`:

- `before?: number` — only delete events with `createdAt < before` (a timestamp).
  Omitted ⇒ delete every event for the subject.
- `batch?: number` — rows deleted per batch before rescheduling (default `256`).

### `configure(ctx, retentionMs?) → null`

Set (or clear, by passing `undefined`) the singleton retention window the
component's internal daily cron prunes against. Without a configured window the
retention sweep is a no-op — nothing is ever auto-deleted.

### `pruneExpired(ctx, opts?) → number`

Run the retention sweep manually (the same work the daily cron performs): delete
one batch of events older than the configured window, rescheduling follow-up
batches. Returns the count deleted in the first batch. A no-op until `configure`
sets a window. `opts`: `{ batch?: number }` (default `256`).

## Queries

### `list(ctx, subjectRef, opts?) → EventDoc<TMeta>[]`

The subject's events, newest-first. `opts`:

- `type?: string` — restrict to one event type (uses the `by_subject_type` index).
- `since?: number` — only events with `createdAt >= since`.
- `limit?: number` — page size; defaults to the client's `defaultLimit` (50).

### `paginate(ctx, subjectRef, paginationOpts, opts?) → EventPage<TMeta>`

Cursor-paginated feed, newest-first, honoring the same `type` / `since` filters
as `list`. `paginationOpts` is Convex's `{ cursor, numItems, ... }`
(`paginationOptsValidator`). Returns Convex's pagination shape
`{ page, isDone, continueCursor }` (plus optional `splitCursor` / `pageStatus`),
so a host pages past any single-call `limit` by passing `continueCursor` back as
the next `cursor`.

### `count(ctx, subjectRef, opts?) → CountResult`

A bounded count for `subjectRef` (optionally one `type`). Scans at most
`maxCount + 1` rows — it never loads a whole feed. `opts`:

- `type?: string` — restrict to one event type.
- `maxCount?: number` — scan bound; defaults to the client's `defaultMaxCount`
  (1000).

Returns `{ count, isExact }`: `isExact` is `false` when the feed has more events
than the bound, in which case `count` equals the bound rather than the true total.

## Guards

When set on the client, these reject malformed input at the `record` boundary by
throwing an `EventValidationError` (carrying a stable `code`):

| Option | Rejects when | `code` |
|--------|--------------|--------|
| `allowedTypes` | `type` not in the allow-list | `EVENTS_TYPE_NOT_ALLOWED` |
| `maxTypeLength` | `type.length` exceeds the cap | `EVENTS_TYPE_TOO_LONG` |
| `maxMetadataBytes` | serialized `metadata` exceeds the cap | `EVENTS_METADATA_TOO_LARGE` |
| `metadataValidator` | the host validator throws | `EVENTS_METADATA_INVALID` |

`metadataValidator` may also **transform** the payload (e.g. trim fields); its
return value is what gets stored. When the validator throws, the original error
message is preserved in the `EventValidationError`.

## Types

### `EventDoc<TMeta>`

```ts
interface EventDoc<TMeta = unknown> {
  _id: string;
  _creationTime: number;
  subjectRef: string;
  type: string;
  actorRef?: string;
  metadata?: TMeta; // omitted when the event was recorded without metadata
  createdAt: number;
}
```

`metadata` is optional: an event recorded without it round-trips as absent, so
the shape never lies to a host whose `TMeta` is non-nullable.

### `EventPage<TMeta>`

```ts
interface EventPage<TMeta = unknown> {
  page: EventDoc<TMeta>[];
  isDone: boolean;
  continueCursor: string;
  splitCursor?: string | null;
  pageStatus?: "SplitRecommended" | "SplitRequired" | null;
}
```

### `CountResult`

```ts
interface CountResult {
  count: number; // capped at the scan bound
  isExact: boolean; // false when more events exist than the bound
}
```

### `EventsOptions<TMeta>`

```ts
interface EventsOptions<TMeta = unknown> {
  defaultLimit?: number; // default 50
  defaultMaxCount?: number; // default 1000
  allowedTypes?: readonly string[];
  maxTypeLength?: number;
  maxMetadataBytes?: number;
  metadataValidator?: (metadata: TMeta) => TMeta;
}
```

### `EventValidationError`

```ts
class EventValidationError extends Error {
  readonly code: EventErrorCode; // one of EVENT_ERROR_CODES
}
```
