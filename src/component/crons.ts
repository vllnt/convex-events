import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

/**
 * Component-internal retention sweep. Runs daily and prunes events older than
 * the host-configured `retentionMs` (set via `configure`). Idempotent and a
 * no-op until the host configures retention — see `mutations.pruneExpired`.
 */
const crons = cronJobs();

crons.daily(
  "prune-expired-events",
  { hourUTC: 0, minuteUTC: 0 },
  api.mutations.pruneExpired,
  {},
);

export default crons;
