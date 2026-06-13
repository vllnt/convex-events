# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `metadataValidator` errors are now wrapped as `EventValidationError` with code
  `EVENTS_METADATA_INVALID` (preserving the original message), making the error
  contract real and catchable by consumers. Previously the host's plain `Error`
  surfaced unwrapped, so `EVENTS_METADATA_INVALID` was never thrown.

## [0.1.0] - 2026-06-12

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
