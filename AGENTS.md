<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `example/convex/_generated/ai/guidelines.md` first** for
important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

`example/convex/_generated/ai/guidelines.md` is generated and gitignored, so a fresh clone lacks it.
If it is missing, run `pnpm exec convex ai-files install` (no login or deployment needed; it writes
there because `convex.json` sets `functions: example/convex`). That command also adds `CLAUDE.md`
and `.claude/` and rewraps the section above: remove both and run `git restore AGENTS.md` before
committing. If the command cannot run, use the official Convex docs at https://docs.convex.dev.

# @vllnt/convex-events

Append-only per-subject activity feed and event ledger, as a Convex component. Follows the vllnt
Component Standard (see the `oss-packages` hub `AGENTS.md`).

## Agent instructions

`AGENTS.md` is the sole agent-instruction source for this repository. Do not add
`CLAUDE.md` or `.claude` content.

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
  opaque refs in. `subjectRef` and `actorRef` are arbitrary non-empty strings — the component rejects
  empty ones on writes (`INVALID_ARGUMENT`) and never inspects their shape otherwise.
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
| `README.md` | Fixed agent-first sections, in order: For coding agents, When to use, Install, Quick start, API, Common tasks, Errors and fixes, Limits and gotchas, Compatibility, Testing, Security, Related packages, Contributing, Links, License, footer |
| `docs/API.md` | Full method signatures, types, guards, error codes, compatibility line; one heading per export and `Events` method (the README API table links them) |
| `llms.txt` | the only LLM index, curated by hand — `convex@^X.Y.Z` must match `package.json` `peerDependencies.convex` |
| `AGENTS.md` | canonical agent instructions (this file) |
| `CHANGELOG.md` | Keep-a-Changelog entry per release |
| `scripts/check-documentation.mjs` | docs contract run by `pnpm test:package` on the packed tarball: README sections and order, exports/methods/error codes documented, links and anchors, Links block, footer, llms.txt Ecosystem block, description and keywords; README `ts`/`tsx` examples and the `docs/API.md` signatures of standalone function exports (`register`, the React hooks) are type-checked, and the README test example is run |

Update the `llms.txt` summary by hand after any source, README, or API.md change, then run
`pnpm generate:llms` (it only checks `llms.txt`; it generates nothing). Grep stale values before
committing.

`README.md`, `docs/API.md`, `CHANGELOG.md` and `llms.txt` ship in the npm tarball (`package.json`
`files`), so consumers and their coding agents read them from `node_modules`. Link shipped files
from `llms.txt` relatively (`./docs/API.md`); link repository-only files by GitHub URL. Do not
ship `AGENTS.md`, tests or other `docs/` files. `pnpm test:package` (run after `pnpm build`, and
in CI) enforces this.

## Generated code

- Every `**/_generated/**` file is owned exclusively by Convex CLI codegen.
- Never create, edit, lint, or format generated files manually.
- Run `pnpm codegen` to regenerate them and commit the generated output unchanged.
