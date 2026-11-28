# API Reference — @vllnt/convex-events

**Compatibility:** `convex@^1.45.0`; `react@>=18` optional (only for `./react`).
This reference is bundled in the package and describes the installed version.

## Entry points

| Import                                                 | Exports                                                                                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@vllnt/convex-events`                                 | `Events`, `EventValidationError`, `EVENT_ERROR_CODES`; types `EventsComponent`, `EventsOptions`, `EventDoc`, `EventPage`, `CountResult`, `MetadataValidator`, `EventErrorCode` |
| `@vllnt/convex-events/convex.config` (or `.js`)        | default component config for `app.use(...)`                                                                                                                                    |
| `@vllnt/convex-events/react`                           | `useActivityFeed`, `useEventCount`; types `ActivityFeedRef`, `EventCountRef`, `CountResult`                                                                                    |
| `@vllnt/convex-events/test`                            | `register(t, name = "events")` for `convex-test` (TypeScript source; needs Vite `import.meta.glob`)                                                                            |
| `@vllnt/convex-events/_generated/component` (or `.js`) | type `ComponentApi`                                                                                                                                                            |

`./package.json` is exported as-is. `subjectRef` and `actorRef` are opaque host
strings; the component only rejects empty ones on writes.

## Client

### `Events`

```ts
new Events<TMeta = unknown>(component: EventsComponent<TMeta>, options?: EventsOptions<TMeta>)
```

`component` is the mounted component, `components.events` (or the name passed to
`app.use`). `TMeta` types the `metadata` you record and read back. See
[`EventsOptions`](#eventsoptions) for the defaults and guards. Every method
takes the host `ctx` first: a mutation context for `record`, `purge`,
`configure` and `pruneExpired`, a query or mutation context for `list`,
`paginate` and `count`.

### `record`

```ts
record(
  ctx,
  subjectRef: string,
  type: string,
  opts?: { actorRef?: string; idempotencyKey?: string; metadata?: TMeta },
): Promise<string>
```

Appends an event and returns its id. The component stamps `createdAt` with
`Date.now()`.

Before calling the component, the client runs its guards in this order:
`allowedTypes`, `maxTypeLength`, `metadataValidator`, `maxMetadataBytes`. The
first failure throws an [`EventValidationError`](#eventvalidationerror) and
nothing is written. `metadataValidator` and `maxMetadataBytes` run only when
`metadata` is set; the value the validator returns is what is stored and
measured.

- `subjectRef`, `type` and a supplied `actorRef` must be non-empty
  (`INVALID_ARGUMENT`).
- `idempotencyKey` must be 1..256 UTF-16 code units (`INVALID_IDEMPOTENCY_KEY`).
  While an event with the same `subjectRef` and key exists, `record` returns
  that event's id and writes nothing, even if `type` or `metadata` differ. Purge
  and retention delete the key with the event.
- `metadata` omitted: the field is not stored and reads back as `undefined`.

### `list`

```ts
list(
  ctx,
  subjectRef: string,
  opts?: { type?: string; since?: number; limit?: number },
): Promise<EventDoc<TMeta>[]>
```

Returns up to `limit` events for the subject, newest-first by `createdAt`.

- `type`: only events of this type.
- `since`: only events with `createdAt >= since`. Must be finite
  (`INVALID_SINCE`).
- `limit`: defaults to the client's `defaultLimit` (50). Integer in 1..1000
  (`INVALID_LIMIT`).

### `paginate`

```ts
paginate(
  ctx,
  subjectRef: string,
  paginationOpts: PaginationOptions,
  opts?: { type?: string; since?: number },
): Promise<EventPage<TMeta>>
```

One page of the same feed as `list`, newest-first, with the same `type` and
`since` filters. `paginationOpts` is Convex's `{ cursor, numItems }`
(`paginationOptsValidator`): start with `cursor: null`, then pass the returned
`continueCursor` until `isDone`. `numItems` must be an integer in 1..1000
(`INVALID_LIMIT`).

### `count`

```ts
count(
  ctx,
  subjectRef: string,
  opts?: { type?: string; maxCount?: number },
): Promise<CountResult>
```

Counts the subject's events (optionally one `type`), reading at most
`maxCount + 1` rows. `maxCount` defaults to the client's `defaultMaxCount`
(1000) and must be an integer in 0..1000 (`INVALID_LIMIT`). Returns
`{ count, isExact }`; when more than `maxCount` events exist it returns
`{ count: maxCount, isExact: false }`.

### `purge`

```ts
purge(
  ctx,
  subjectRef: string,
  opts?: { before?: number; batch?: number },
): Promise<number>
```

Deletes the subject's events, oldest-first, `batch` rows per mutation (default
256, integer 1..500, `INVALID_BATCH`). When a batch is full it schedules the
next one, until a batch comes back short. Returns the count deleted by this
first batch only.

- `before`: only delete events with `createdAt < before`. Must be finite
  (`INVALID_BEFORE`). Omitted: delete all of the subject's events.
- An empty `subjectRef` throws `INVALID_ARGUMENT`.

### `configure`

```ts
configure(ctx, retentionMs?: number): Promise<null>
```

Sets the mount's single retention window in milliseconds, or clears it when
`retentionMs` is `undefined`. It must be `>= 0` and finite
(`INVALID_RETENTION`). The daily `prune-expired-events` cron (00:00 UTC) prunes
events older than the window, across all subjects. Without a window nothing is
pruned.

### `pruneExpired`

```ts
pruneExpired(ctx, opts?: { batch?: number }): Promise<number>
```

Runs the retention sweep now: deletes up to `batch` events (default 256, integer
1..500, `INVALID_BATCH`) with `createdAt < Date.now() - retentionMs`, and
schedules the next batch when this one is full. Returns the count deleted by
this first batch. Returns `0` and checks nothing (not even `batch`) until
`configure` sets a window.

## Types

### `EventsComponent`

```ts
interface EventsComponent<TMeta = unknown> {
  mutations: { record; purge; configure; pruneExpired };
  queries: { list; listPaginated; count };
}
```

The function references `Events` calls, as internal Convex references. Pass
`components.events`; you do not build this yourself.

### `EventsOptions`

```ts
interface EventsOptions<TMeta = unknown> {
  defaultLimit?: number; // list limit when omitted; default 50
  defaultMaxCount?: number; // count bound when omitted; default 1000
  allowedTypes?: readonly string[]; // record rejects other types; default: any type
  maxTypeLength?: number; // record rejects longer types; default: no limit
  maxMetadataBytes?: number; // record rejects larger metadata; default: no limit
  metadataValidator?: MetadataValidator<TMeta>; // parse, transform or reject metadata
}
```

`defaultLimit` and `defaultMaxCount` are not checked when the client is built;
an out-of-range value fails each call with `INVALID_LIMIT`. `maxTypeLength`
compares `type.length` (UTF-16 code units). `maxMetadataBytes` compares the
UTF-8 byte length of `JSON.stringify(metadata)`.

### `EventDoc`

```ts
interface EventDoc<TMeta = unknown> {
  _id: string;
  _creationTime: number;
  subjectRef: string;
  type: string;
  actorRef?: string;
  metadata?: TMeta; // absent when recorded without metadata
  createdAt: number; // ms since epoch, stamped by the component
}
```

`idempotencyKey` is stored but never returned.

### `EventPage`

```ts
interface EventPage<TMeta = unknown> {
  page: EventDoc<TMeta>[];
  isDone: boolean;
  continueCursor: string;
  splitCursor?: string | null;
  pageStatus?: "SplitRecommended" | "SplitRequired" | null;
}
```

Convex's pagination result for [`paginate`](#paginate).

### `CountResult`

```ts
interface CountResult {
  count: number; // capped at the scan bound
  isExact: boolean; // false when more events exist than the bound
}
```

Also exported from `@vllnt/convex-events/react`.

### `MetadataValidator`

```ts
type MetadataValidator<TMeta> = (metadata: TMeta) => TMeta;
```

Return the value to store; throw to reject. An `Error`'s message is kept in the
resulting `EventValidationError` (`EVENTS_METADATA_INVALID`); any other thrown
value gives the message `metadata validation failed`.

## Errors

### `EventValidationError`

```ts
class EventValidationError extends Error {
  readonly code: EventErrorCode;
  // error.name is "EventValidationError"
}
```

Thrown by `record` in the client, before the component is called:

| `code`                      | Thrown when                                     | Message                                                       |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| `EVENTS_TYPE_NOT_ALLOWED`   | `type` is not in `allowedTypes`                 | `event type "<type>" is not in the allowed set`               |
| `EVENTS_TYPE_TOO_LONG`      | `type.length > maxTypeLength`                   | `event type exceeds maxTypeLength (<n>)`                      |
| `EVENTS_METADATA_INVALID`   | `metadataValidator` threw                       | the thrown `Error`'s message, or `metadata validation failed` |
| `EVENTS_METADATA_TOO_LARGE` | serialized metadata is above `maxMetadataBytes` | `metadata exceeds maxMetadataBytes (<n>)`                     |

### `EVENT_ERROR_CODES`

```ts
const EVENT_ERROR_CODES = {
  TYPE_NOT_ALLOWED: "EVENTS_TYPE_NOT_ALLOWED",
  TYPE_TOO_LONG: "EVENTS_TYPE_TOO_LONG",
  METADATA_TOO_LARGE: "EVENTS_METADATA_TOO_LARGE",
  METADATA_INVALID: "EVENTS_METADATA_INVALID",
} as const;
```

### `EventErrorCode`

```ts
type EventErrorCode =
  (typeof EVENT_ERROR_CODES)[keyof typeof EVENT_ERROR_CODES];
```

### Component errors

The component throws `ConvexError` with `data: { code, message }`:

| `data.code`               | Thrown by                   | Message                                                                                                                     |
| ------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_ARGUMENT`        | `record`, `purge`           | `<field> must be non-empty` for `subjectRef`, `type` or `actorRef`                                                          |
| `INVALID_IDEMPOTENCY_KEY` | `record`                    | `idempotencyKey must be between 1 and 256 characters`                                                                       |
| `INVALID_LIMIT`           | `list`, `paginate`, `count` | `limit` / `paginationOpts.numItems must be an integer between 1 and 1000`; `maxCount must be an integer between 0 and 1000` |
| `INVALID_SINCE`           | `list`, `paginate`          | `since must be finite`                                                                                                      |
| `INVALID_BATCH`           | `purge`, `pruneExpired`     | `batch must be an integer between 1 and 500`                                                                                |
| `INVALID_BEFORE`          | `purge`                     | `before must be finite`                                                                                                     |
| `INVALID_RETENTION`       | `configure`                 | `retentionMs must be a non-negative finite number`                                                                          |

## React

Optional entry `@vllnt/convex-events/react`. The hooks take your own re-exported
public query references; the component never imports your `api`.

### `useActivityFeed`

```ts
useActivityFeed<Ref extends ActivityFeedRef>(
  paginateRef: Ref,
  args: PaginatedQueryArgs<Ref>,
  opts: { initialNumItems: number },
): UsePaginatedQueryResult<PaginatedQueryItem<Ref>>
```

Wraps Convex's `usePaginatedQuery`. `args` is your query's arguments without
`paginationOpts` (for example `{ subjectRef, type? }`); the hook manages pages.
Returns `{ results, status, loadMore, isLoading }`.

### `useEventCount`

```ts
useEventCount(
  countRef: EventCountRef,
  args: { subjectRef: string; type?: string },
): CountResult | undefined
```

Wraps Convex's `useQuery`. Returns `undefined` while loading.

### `ActivityFeedRef`

```ts
type ActivityFeedRef = FunctionReference<
  "query",
  "public",
  { subjectRef: string; type?: string; paginationOpts: PaginationOptions },
  { page: unknown[]; isDone: boolean; continueCursor: string }
>;
```

A public query that returns a Convex page, typically a wrapper around
[`paginate`](#paginate).

### `EventCountRef`

```ts
type EventCountRef = FunctionReference<
  "query",
  "public",
  { subjectRef: string; type?: string },
  CountResult
>;
```

A public query that returns [`CountResult`](#countresult), typically a wrapper
around [`count`](#count).

## Component config

### `convex.config`

```ts
import events from "@vllnt/convex-events/convex.config";
```

The default export is the component definition (`defineComponent("events")`).
Mount it with `app.use(events)`, or `app.use(events, { name })` once per named
mount. Each mount has its own tables, retention window and daily cron.

### `ComponentApi`

```ts
import type { ComponentApi } from "@vllnt/convex-events/_generated/component";
```

Generated type of the mounted component's internal functions (`mutations.*`,
`queries.*`). `components.events` in the host has this type.

## Testing

### `register`

```ts
register(t: TestConvex<SchemaDefinition<GenericSchema, boolean>>, name?: string): void
```

Registers the component with a `convex-test` instance under `name` (default
`"events"`; pass the mount name if you used `app.use(events, { name })`). `t`
can be built from any host schema. The helper ships as TypeScript source and
uses Vite's `import.meta.glob`, so it needs Vitest (or another Vite-based
runner) plus `convex-test`.
