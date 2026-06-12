// @vitest-environment jsdom
/**
 * Unit tests for the optional React front-tooling. `convex/react` is mocked so
 * the hooks are exercised in isolation — we assert each thin wrapper forwards
 * exactly the right arguments to the underlying Convex hook and returns its
 * result unchanged (loaded and loading branches). No backend runs here.
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useQuery, usePaginatedQuery } from "convex/react";
import {
  useActivityFeed,
  useEventCount,
  type ActivityFeedRef,
  type EventCountRef,
} from "./index";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

const mockedUseQuery = vi.mocked(useQuery);
const mockedUsePaginatedQuery = vi.mocked(usePaginatedQuery);

// Opaque function references — the hooks pass these straight through; their
// runtime shape is irrelevant because the underlying Convex hook is mocked.
const countRef = { _ref: "count" } as unknown as EventCountRef;
const paginateRef = { _ref: "paginate" } as unknown as ActivityFeedRef;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useEventCount", () => {
  it("forwards (ref, args) to useQuery and returns the loaded value", () => {
    const args = { subjectRef: "user:1", type: "login" };
    mockedUseQuery.mockReturnValue({ count: 3, isExact: true });

    const { result } = renderHook(() => useEventCount(countRef, args));

    expect(mockedUseQuery).toHaveBeenCalledTimes(1);
    expect(mockedUseQuery).toHaveBeenCalledWith(countRef, args);
    expect(result.current).toEqual({ count: 3, isExact: true });
  });

  it("returns undefined while loading", () => {
    const args = { subjectRef: "user:2" };
    mockedUseQuery.mockReturnValue(undefined);

    const { result } = renderHook(() => useEventCount(countRef, args));

    expect(mockedUseQuery).toHaveBeenCalledWith(countRef, args);
    expect(result.current).toBeUndefined();
  });
});

describe("useActivityFeed", () => {
  it("forwards (ref, args, opts) to usePaginatedQuery and returns its result", () => {
    const args = { subjectRef: "user:1", type: "login" } as never;
    const opts = { initialNumItems: 10 };
    const loadMore = vi.fn();
    const paginated = {
      results: [{ id: "e1" }],
      status: "CanLoadMore" as const,
      isLoading: false,
      loadMore,
    };
    mockedUsePaginatedQuery.mockReturnValue(paginated);

    const { result } = renderHook(() =>
      useActivityFeed(paginateRef, args, opts),
    );

    expect(mockedUsePaginatedQuery).toHaveBeenCalledTimes(1);
    expect(mockedUsePaginatedQuery).toHaveBeenCalledWith(paginateRef, args, opts);
    expect(result.current).toBe(paginated);
    expect(result.current.results).toEqual([{ id: "e1" }]);
    expect(result.current.status).toBe("CanLoadMore");
    expect(result.current.loadMore).toBe(loadMore);
  });
});
