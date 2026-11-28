# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - Unreleased

### Added

- The published tarball now includes `docs/API.md`, `CHANGELOG.md` and `llms.txt` (with
  `README.md`), so coding agents can read version-matched docs from
  `node_modules/@vllnt/convex-events/`. `llms.txt` links to the shipped files relatively.
- `docs/API.md` documents the `./react` and `./test` entry points and the remaining exported
  types and constants, and the guard order.
- `pnpm test:package` (run in CI) fails when a required file is missing from the tarball, a
  repository-only file ships, or `llms.txt` links to a file the tarball lacks.
- README sections "For coding agents" and "Related packages".

### Fixed

- The published tarball no longer includes the React test file.
- `record` rejects an empty `subjectRef`, `type` or supplied `actorRef`, and `purge` an empty
  `subjectRef`, with `ConvexError({ code: "INVALID_ARGUMENT" })`.
- `list` and `paginate` reject a non-finite `since` with `ConvexError({ code: "INVALID_SINCE" })`.
- `@vllnt/convex-events/test` now type-checks under `moduleResolution: nodenext`
  (explicit `.js` relative imports, Vite client types referenced).

### Changed

- Upgrade dev tooling (vitest 5.1.1, vite 8.3, convex 1.51, convex-test 0.0.73, prettier 3.10,
  jsdom 31, `@vllnt/typescript` 3 with `exactOptionalPropertyTypes` kept off) and override the
  vulnerable transitive `handlebars`, `deepmerge-ts` and `minimatch` releases.
- Adopt pnpm 10 with a release-age gate; releases are published only from CI with npm
  trusted publishing and provenance.
- Document the component error codes and how to use `/test` in a consuming app.
- `package.json` `homepage` is now `https://oss.vllnt.com/packages/convex-events`, with more
  `keywords`.
- The publish workflow publishes a canary (under `@canary` only, never `@latest`) on every push
  to `main` that changes the package source, `package.json`, the lockfile or a shipped doc; a
  repository variable no longer gates it.

## [0.1.0] - 2026-09-01

### Added

- First release of `@vllnt/convex-events`: append-only per-subject activity
  ledger with `record` / `list` / `count` / `purge` and a typed-generic client.
- `paginate` — cursor pagination returning Convex's
  `{ page, isDone, continueCursor }`, honoring the `type` / `since` filters; feeds
  page past any single-call limit.
- Bounded `count` — scans at most `maxCount + 1` rows and returns
  `{ count, isExact }` instead of loading the whole feed.
- Batched, self-rescheduling `purge` — drains arbitrarily large feeds without a
  single huge transaction.
- Retention — `configure(retentionMs)` plus an internal idempotent daily cron
  (`prune-expired-events` / `pruneExpired`) that prunes events past the window;
  a no-op until configured.
- Client value guards — optional `allowedTypes`, `maxTypeLength`,
  `maxMetadataBytes`, and a host `metadataValidator`, validated at the `record`
  boundary and throwing a code-tagged `EventValidationError`.

### Changed

- `count` now returns `{ count, isExact }` (was a bare `number`).
- `purge` and `count` take an options object; `purge` returns the count deleted
  in the first batch.
- `EventDoc.metadata` is now optional (`metadata?: TMeta`) — an event recorded
  without metadata round-trips as absent, so the shape never lies to a host with
  a non-nullable `TMeta`.
- Treat Convex `_generated` output as CLI-owned, exclude it from formatting, and expose a
  dedicated codegen script.
- Require `convex@^1.45.0` and update `convex-test` to `^0.0.56`.

### Fixed

- Reject unsafe purge/prune batches, non-finite cutoffs, and negative or non-finite retention
  windows before they can trigger scheduler loops or destructive retention.
- Bound and validate list/count controls so malformed values cannot produce invalid results or
  caller-controlled read amplification.
- Add optional per-subject idempotency keys so ambiguous host retries replay the original event ID
  instead of duplicating ledger entries.
- `metadataValidator` errors are now wrapped as `EventValidationError` with code
  `EVENTS_METADATA_INVALID` (preserving the original message), making the error
  contract real and catchable by consumers. Previously the host's plain `Error`
  surfaced unwrapped, so `EVENTS_METADATA_INVALID` was never thrown.
