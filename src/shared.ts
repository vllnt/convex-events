/** Shared constants + types used by both `client/` and `component/`. */

export const COMPONENT_NAME = "events";

/** Default page size when a `list` call omits `limit`. */
export const DEFAULT_LIMIT = 50;

/** Default scan bound for a capped `count` before it reports `isExact: false`. */
export const DEFAULT_MAX_COUNT = 1000;

/** Opaque host-supplied subject reference. Never assume its shape or source. */
export type SubjectRef = string;

/** Stable, code-tagged reasons a boundary guard in `record` can reject input. */
export const EVENT_ERROR_CODES = {
  TYPE_NOT_ALLOWED: "EVENTS_TYPE_NOT_ALLOWED",
  TYPE_TOO_LONG: "EVENTS_TYPE_TOO_LONG",
  METADATA_TOO_LARGE: "EVENTS_METADATA_TOO_LARGE",
  METADATA_INVALID: "EVENTS_METADATA_INVALID",
} as const;

/** One of the {@link EVENT_ERROR_CODES} values. */
export type EventErrorCode =
  (typeof EVENT_ERROR_CODES)[keyof typeof EVENT_ERROR_CODES];

/** A code-tagged client-boundary rejection from `record`. */
export class EventValidationError extends Error {
  constructor(
    readonly code: EventErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EventValidationError";
  }
}
