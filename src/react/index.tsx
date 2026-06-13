/**
 * Optional React front-tooling for `@vllnt/convex-events`.
 *
 * Thin hooks over `convex/react` for the reactive activity-feed surface. They
 * never import the host's `api`: the host passes its own **re-exported** public
 * function reference (a `paginate` query, a `count` query) plus args. `react`
 * and `convex` are optional peer deps — a backend-only consumer pulls none of
 * this code (tree-shakeable, separate `./react` entry).
 *
 * @module
 */

import {
  useQuery,
  usePaginatedQuery,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  type UsePaginatedQueryResult,
} from "convex/react";
import type { FunctionReference, PaginationOptions } from "convex/server";
import type { CountResult } from "../client/types.js";

export type { CountResult };

/**
 * The host's re-exported **paginated** feed query. A public query taking
 * `{ subjectRef, type?, paginationOpts }` and returning a Convex page —
 * exactly the ref shape `usePaginatedQuery` consumes.
 */
export type ActivityFeedRef = FunctionReference<
  "query",
  "public",
  {
    subjectRef: string;
    type?: string;
    paginationOpts: PaginationOptions;
  },
  { page: unknown[]; isDone: boolean; continueCursor: string }
>;

/** The host's re-exported `count` query: `{ subjectRef, type? }` → {@link CountResult}. */
export type EventCountRef = FunctionReference<
  "query",
  "public",
  { subjectRef: string; type?: string },
  CountResult
>;

/**
 * Reactive, cursor-paginated activity feed for one `subjectRef`.
 *
 * Thin wrapper over `usePaginatedQuery` against the host's re-exported
 * `paginate` query reference — the component never owns the host's `api`. Stays
 * generic over the exact ref so the host's page item type flows through.
 *
 * @param paginateRef - the host's re-exported paginated feed query.
 * @param args - `{ subjectRef, type? }` (the page's `paginationOpts` are managed by the hook).
 * @param opts - `{ initialNumItems }` page size for the first load.
 * @returns `{ results, status, loadMore }` from `usePaginatedQuery`.
 */
export function useActivityFeed<Ref extends ActivityFeedRef>(
  paginateRef: Ref,
  args: PaginatedQueryArgs<Ref>,
  opts: { initialNumItems: number },
): UsePaginatedQueryResult<PaginatedQueryItem<Ref>> {
  return usePaginatedQuery(paginateRef, args, opts);
}

/**
 * Reactive bounded count for one `subjectRef` (optionally one `type`).
 *
 * Thin wrapper over `useQuery` against the host's re-exported `count` query.
 *
 * @param countRef - the host's re-exported `count` query.
 * @param args - `{ subjectRef, type? }`.
 * @returns the `{ count, isExact }` result, or `undefined` while loading.
 */
export function useEventCount(
  countRef: EventCountRef,
  args: { subjectRef: string; type?: string },
): CountResult | undefined {
  return useQuery(countRef, args);
}
