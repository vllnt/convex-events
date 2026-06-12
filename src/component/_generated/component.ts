/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    mutations: {
      configure: FunctionReference<
        "mutation",
        "internal",
        { retentionMs?: number },
        null,
        Name
      >;
      pruneExpired: FunctionReference<
        "mutation",
        "internal",
        { batch?: number },
        number,
        Name
      >;
      purge: FunctionReference<
        "mutation",
        "internal",
        { batch?: number; before?: number; subjectRef: string },
        number,
        Name
      >;
      record: FunctionReference<
        "mutation",
        "internal",
        { actorRef?: string; metadata?: any; subjectRef: string; type: string },
        string,
        Name
      >;
    };
    queries: {
      count: FunctionReference<
        "query",
        "internal",
        { maxCount?: number; subjectRef: string; type?: string },
        { count: number; isExact: boolean },
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { limit: number; since?: number; subjectRef: string; type?: string },
        Array<{
          _creationTime: number;
          _id: string;
          actorRef?: string;
          createdAt: number;
          metadata?: any;
          subjectRef: string;
          type: string;
        }>,
        Name
      >;
      listPaginated: FunctionReference<
        "query",
        "internal",
        {
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          since?: number;
          subjectRef: string;
          type?: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            _creationTime: number;
            _id: string;
            actorRef?: string;
            createdAt: number;
            metadata?: any;
            subjectRef: string;
            type: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
    };
  };
