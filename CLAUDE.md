<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `example/convex/_generated/ai/guidelines.md` first** for
important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

# @vllnt/convex-events

Append-only per-subject activity feed and event ledger, as a Convex component. Follows the vllnt
Component Standard (see the `convex-components` hub `.claude/rules/component-standard.md`).

## Architecture

```
src/
├── shared.ts              # constants, error codes, SubjectRef type (pure)
├── test.ts                # convex-test register() helper
├── client/
│   ├── index.ts           # Events<TMeta> class (consumer-facing API)
│   └── types.ts           # public TypeScript interfaces
├── react/
│   └── index.tsx          # optional ./react hooks (useActivityFeed, useEventCount)
└── component/
    ├── schema.ts          # events + config sandboxed tables
    ├── convex.config.ts   # defineComponent("events")
    ├── mutations.ts       # record, purge, configure, pruneExpired
    ├── queries.ts         # list, listPaginated, count
    ├── validators.ts      # shared validators (jsonValue alias)
    └── crons.ts           # daily idempotent prune-expired-events cron
```

## Ownership boundary

| Concern | Owner |
|---------|-------|
| Ordered event store (append, list, count, purge, retention) | **Component** |
| `events` and `config` sandboxed tables | **Component** |
| Subject identity, actor identity, auth/authz | **Host** |
| Meaning of `subjectRef`, `actorRef`, `type`, `metadata` | **Host** |
| Metadata shape and validation beyond byte/length guards | **Host** (via `metadataValidator`) |
| Payment, subscription, domain rules | **Host** |

The component never reads host or sibling tables. Host data enters only as opaque strings
(`subjectRef`, `actorRef`) or a host-typed generic payload (`TMeta`).

## Key design decisions

- **Append-only ledger.** `record` stamps `createdAt` (`Date.now()`) and inserts; events are never
  mutated. Ordering is by the host-stamped `createdAt` field, not Convex's internal `_creationTime`.
- **Bounded count via ternary + `isExact` flag.** `count` scans at most `maxCount + 1` rows and
  returns `{ count, isExact }`. The extra-row probe avoids loading a full feed; `isExact` is `false`
  when the feed exceeds the bound. Implemented as a ternary (not an `if`/`else`) so v8 coverage
  counts the branch.
- **Batched, self-rescheduling purge.** `purge` deletes in configurable batches (`default 256`)
  and schedules a follow-up mutation for the remainder — no single huge transaction, safe for
  arbitrarily large feeds.
- **Daily idempotent retention cron.** `pruneExpired` is the cron's entry point. It is a no-op
  until the host calls `configure`; the daily `prune-expired-events` cron runs idempotently and
  self-reschedules batches. Purge boundary uses strict-`<` (not `<=`) on `createdAt`.
- **Typed-generic metadata.** The client is `Events<TMeta>`. The Convex layer stores metadata
  as `jsonValue` (an aliased `v.any()` — documented last resort for truly arbitrary host payloads);
  the TypeScript layer is fully typed end-to-end via the generic. The host supplies an optional
  `metadataValidator` that can parse, transform, or reject the payload before the write.
- **`guard()` re-wraps host validator errors.** When `metadataValidator` throws, `guard()` catches
  and re-throws as `EventValidationError(METADATA_INVALID)`, preserving the original message.
  All client-boundary rejections carry a stable `code` from `EVENT_ERROR_CODES`.
- **Auth-agnostic.** No auth library assumed. The host resolves identity, gates access, and passes
  opaque refs in. `subjectRef` and `actorRef` are arbitrary strings — the component never inspects
  their shape.
- **Optional `./react` layer.** `useActivityFeed` (wraps `usePaginatedQuery`) and `useEventCount`
  (wraps `useQuery`) ship as an optional tree-shakeable `./react` entry. Hooks accept the host's
  re-exported function refs — the component never imports the host `api`. Backend-only consumers
  pull zero React code. The react layer is render-tested and coverage-included at 100%.

## Conventions

- Mutations in `mutations.ts`, queries in `queries.ts` (enforced by `@vllnt/eslint-config/convex`).
- Explicit `args` + `returns` on every Convex function.
- Host data via typed generics / host-supplied validator — `jsonValue` alias only as a documented
  last resort for metadata's truly arbitrary shape.
- 100% test coverage is BLOCKING (`vitest.config.mts` thresholds).
- Runtime deps: only official `@convex-dev/*` + `@vllnt/*`.

## Docs sync

| Doc | Owns |
|-----|------|
| `README.md` | Features, Architecture, Installation, Usage, API Reference, React, Security Model, Testing, Contributing, Author, License |
| `docs/API.md` | Full method signatures, types, guards, error codes, compatibility line |
| `llms.txt` | curated index — `convex@^X.Y.Z` must match `package.json` `peerDependencies.convex` |
| `AGENTS.md` | canonical agent instructions (this file) |
| `CLAUDE.md` | verbatim mirror of AGENTS.md |
| `CHANGELOG.md` | Keep-a-Changelog entry per release |

Grep stale values before committing (see `.claude/rules/docs-sync.md`).
