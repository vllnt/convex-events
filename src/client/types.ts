/** Public TypeScript surface for the events client. */

/**
 * A stored event, as returned by {@link Events.list} / {@link Events.paginate}.
 * `TMeta` is the host's metadata type. `metadata` is optional: a record made
 * without it round-trips as `undefined`, so the shape never lies to a host whose
 * `TMeta` is non-nullable.
 */
export interface EventDoc<TMeta = unknown> {
  _id: string;
  _creationTime: number;
  /** Opaque host-owned subject this event belongs to. */
  subjectRef: string;
  /** Host-defined event type / verb (e.g. `"created"`, `"login"`). */
  type: string;
  /** Opaque host-owned actor that caused the event, if any. */
  actorRef?: string;
  /** Host-owned payload. Opaque to the component; typed as `TMeta` for the host. Omitted when the event was recorded without metadata. */
  metadata?: TMeta;
  /** Host-stamped creation time (ms since epoch); the ledger's sort key. */
  createdAt: number;
}

/** One page of events, as returned by {@link Events.paginate}. */
export interface EventPage<TMeta = unknown> {
  page: EventDoc<TMeta>[];
  isDone: boolean;
  continueCursor: string;
  splitCursor?: string | null;
  pageStatus?: "SplitRecommended" | "SplitRequired" | null;
}

/** A capped count, as returned by {@link Events.count}. */
export interface CountResult {
  /** Number of matching events, capped at the scan bound. */
  count: number;
  /** `false` when more events exist than the scan bound (so `count` is the bound). */
  isExact: boolean;
}

/**
 * Validate (or parse) a host metadata payload at the `record` boundary. Return
 * the value to store (optionally transformed); throw to reject. Lets a host with
 * a non-`unknown` `TMeta` enforce its own shape without the component knowing it.
 */
export type MetadataValidator<TMeta> = (metadata: TMeta) => TMeta;

/** Construction options for the {@link Events} client. */
export interface EventsOptions<TMeta = unknown> {
  /** Page size applied when a `list` call omits `limit`. Default `50`. */
  defaultLimit?: number;
  /** Scan bound applied when a `count` call omits `maxCount`. Default `1000`. */
  defaultMaxCount?: number;
  /** If set, `record` rejects any `type` not in this allow-list. Default: freeform. */
  allowedTypes?: readonly string[];
  /** Max length of an event `type`. `record` rejects longer. Default: unbounded. */
  maxTypeLength?: number;
  /** Max serialized byte size of `metadata`. `record` rejects larger. Default: unbounded. */
  maxMetadataBytes?: number;
  /** Host-supplied validator/parser run on `metadata` at the `record` boundary. */
  metadataValidator?: MetadataValidator<TMeta>;
}
