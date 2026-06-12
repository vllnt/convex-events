import { defineComponent } from "convex/server";

/**
 * The events component. Owns the sandboxed `events` ledger + a singleton
 * `config` row, and runs an internal daily retention cron (see `crons.ts`,
 * `mutations.pruneExpired`) that prunes events past the host-configured window.
 */
const component = defineComponent("events");

export default component;
