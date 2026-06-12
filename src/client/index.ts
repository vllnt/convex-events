import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
} from "convex/server";
import type {
  CountResult,
  EventDoc,
  EventPage,
  EventsOptions,
  MetadataValidator,
} from "./types.js";
import {
  DEFAULT_LIMIT,
  DEFAULT_MAX_COUNT,
  EVENT_ERROR_CODES,
  EventValidationError,
} from "../shared.js";

/**
 * The events component's function references, as exposed on the host via
 * `components.events`. Generic over the host's metadata type `TMeta`.
 */
export interface EventsComponent<TMeta = unknown> {
  mutations: {
    record: FunctionReference<
      "mutation",
      "internal",
      {
        subjectRef: string;
        type: string;
        actorRef?: string;
        metadata?: TMeta;
      },
      string
    >;
    purge: FunctionReference<
      "mutation",
      "internal",
      { subjectRef: string; before?: number; batch?: number },
      number
    >;
    configure: FunctionReference<
      "mutation",
      "internal",
      { retentionMs?: number },
      null
    >;
    pruneExpired: FunctionReference<
      "mutation",
      "internal",
      { batch?: number },
      number
    >;
  };
  queries: {
    list: FunctionReference<
      "query",
      "internal",
      { subjectRef: string; type?: string; since?: number; limit: number },
      EventDoc<TMeta>[]
    >;
    listPaginated: FunctionReference<
      "query",
      "internal",
      {
        subjectRef: string;
        type?: string;
        since?: number;
        paginationOpts: PaginationOptions;
      },
      EventPage<TMeta>
    >;
    count: FunctionReference<
      "query",
      "internal",
      { subjectRef: string; type?: string; maxCount?: number },
      CountResult
    >;
  };
}

interface RunQueryCtx {
  runQuery<Q extends FunctionReference<"query", "internal">>(
    reference: Q,
    args: FunctionArgs<Q>,
  ): Promise<FunctionReturnType<Q>>;
}

interface RunMutationCtx {
  runMutation<M extends FunctionReference<"mutation", "internal">>(
    reference: M,
    args: FunctionArgs<M>,
  ): Promise<FunctionReturnType<M>>;
}

/**
 * Serialized byte size of a defined value (UTF-8), for the `maxMetadataBytes`
 * guard. Only ever called with non-`undefined` metadata.
 */
function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Consumer-facing client for the append-only per-subject activity feed. The
 * host owns meaning and auth; it passes opaque `subjectRef` / `actorRef` refs
 * and a host-typed `metadata` payload (typed here as `TMeta`).
 */
export class Events<TMeta = unknown> {
  private readonly defaultLimit: number;
  private readonly defaultMaxCount: number;
  private readonly allowedTypes?: ReadonlySet<string>;
  private readonly maxTypeLength?: number;
  private readonly maxMetadataBytes?: number;
  private readonly metadataValidator?: MetadataValidator<TMeta>;

  constructor(
    private readonly component: EventsComponent<TMeta>,
    options: EventsOptions<TMeta> = {},
  ) {
    this.defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;
    this.defaultMaxCount = options.defaultMaxCount ?? DEFAULT_MAX_COUNT;
    this.allowedTypes = options.allowedTypes
      ? new Set(options.allowedTypes)
      : undefined;
    this.maxTypeLength = options.maxTypeLength;
    this.maxMetadataBytes = options.maxMetadataBytes;
    this.metadataValidator = options.metadataValidator;
  }

  /**
   * Apply the configured client-boundary guards to one `record` call.
   * Returns the (possibly transformed) metadata to store; throws an
   * {@link EventValidationError} on rejection.
   */
  private guard(type: string, metadata?: TMeta): TMeta | undefined {
    if (this.allowedTypes && !this.allowedTypes.has(type)) {
      throw new EventValidationError(
        EVENT_ERROR_CODES.TYPE_NOT_ALLOWED,
        `event type "${type}" is not in the allowed set`,
      );
    }
    if (this.maxTypeLength !== undefined && type.length > this.maxTypeLength) {
      throw new EventValidationError(
        EVENT_ERROR_CODES.TYPE_TOO_LONG,
        `event type exceeds maxTypeLength (${this.maxTypeLength})`,
      );
    }
    let next = metadata;
    if (next !== undefined && this.metadataValidator) {
      next = this.metadataValidator(next);
    }
    if (
      this.maxMetadataBytes !== undefined &&
      next !== undefined &&
      byteSize(next) > this.maxMetadataBytes
    ) {
      throw new EventValidationError(
        EVENT_ERROR_CODES.METADATA_TOO_LARGE,
        `metadata exceeds maxMetadataBytes (${this.maxMetadataBytes})`,
      );
    }
    return next;
  }

  /**
   * Append an event of `type` for `subjectRef`. Returns the new event id.
   * Applies the configured boundary guards (`allowedTypes`, `maxTypeLength`,
   * `maxMetadataBytes`, `metadataValidator`) before writing — throws an
   * {@link EventValidationError} on rejection.
   */
  record(
    ctx: RunMutationCtx,
    subjectRef: string,
    type: string,
    opts: { actorRef?: string; metadata?: TMeta } = {},
  ): Promise<string> {
    const metadata = this.guard(type, opts.metadata);
    return ctx.runMutation(this.component.mutations.record, {
      subjectRef,
      type,
      actorRef: opts.actorRef,
      metadata,
    });
  }

  /** List events for `subjectRef`, newest-first. Filter by `type` / `since`; `limit` defaults to the client's `defaultLimit`. */
  list(
    ctx: RunQueryCtx,
    subjectRef: string,
    opts: { type?: string; since?: number; limit?: number } = {},
  ): Promise<EventDoc<TMeta>[]> {
    return ctx.runQuery(this.component.queries.list, {
      subjectRef,
      type: opts.type,
      since: opts.since,
      limit: opts.limit ?? this.defaultLimit,
    });
  }

  /**
   * Cursor-paginated feed for `subjectRef`, newest-first, honoring the same
   * `type` / `since` filters as {@link Events.list}. Returns Convex's
   * `{ page, isDone, continueCursor }` so a host can page past any `limit`.
   */
  paginate(
    ctx: RunQueryCtx,
    subjectRef: string,
    paginationOpts: PaginationOptions,
    opts: { type?: string; since?: number } = {},
  ): Promise<EventPage<TMeta>> {
    return ctx.runQuery(this.component.queries.listPaginated, {
      subjectRef,
      type: opts.type,
      since: opts.since,
      paginationOpts,
    });
  }

  /**
   * Bounded count for `subjectRef` (optionally one `type`). Scans at most
   * `maxCount + 1` rows (default the client's `defaultMaxCount`); `isExact` is
   * `false` when the feed is larger than the bound.
   */
  count(
    ctx: RunQueryCtx,
    subjectRef: string,
    opts: { type?: string; maxCount?: number } = {},
  ): Promise<CountResult> {
    return ctx.runQuery(this.component.queries.count, {
      subjectRef,
      type: opts.type,
      maxCount: opts.maxCount ?? this.defaultMaxCount,
    });
  }

  /**
   * Delete events for `subjectRef` (all, or only those before `before`). Batched
   * and self-rescheduling for large feeds; returns the count deleted in the
   * first batch (the remainder is pruned by scheduled follow-ups).
   */
  purge(
    ctx: RunMutationCtx,
    subjectRef: string,
    opts: { before?: number; batch?: number } = {},
  ): Promise<number> {
    return ctx.runMutation(this.component.mutations.purge, {
      subjectRef,
      before: opts.before,
      batch: opts.batch,
    });
  }

  /**
   * Set (or clear, with `undefined`) the retention window the component's daily
   * cron prunes against. Without this, the retention sweep is a no-op.
   */
  configure(ctx: RunMutationCtx, retentionMs?: number): Promise<null> {
    return ctx.runMutation(this.component.mutations.configure, { retentionMs });
  }

  /**
   * Manually run the retention sweep (the same work the daily cron performs):
   * prune one batch of events older than the configured window, rescheduling
   * follow-up batches. A no-op until {@link Events.configure} sets a window.
   * Returns the count deleted in the first batch.
   */
  pruneExpired(
    ctx: RunMutationCtx,
    opts: { batch?: number } = {},
  ): Promise<number> {
    return ctx.runMutation(this.component.mutations.pruneExpired, {
      batch: opts.batch,
    });
  }
}

export type {
  CountResult,
  EventDoc,
  EventPage,
  EventsOptions,
  MetadataValidator,
};
export { EventValidationError, EVENT_ERROR_CODES } from "../shared.js";
export type { EventErrorCode } from "../shared.js";
