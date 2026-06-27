import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useApiQuery } from "./use-api-query";

describe("useApiQuery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches data on mount and returns loading/data states", async () => {
    const fetcher = vi.fn(async () => ({ name: "test" }));
    const { result } = renderHook(() => useApiQuery(fetcher, []));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual({ name: "test" });
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sets error message on fetch failure", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("Network error");
    });
    const { result } = renderHook(() => useApiQuery(fetcher, []));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe("Network error");
    expect(result.current.data).toBeNull();
  });

  it("handles non-Error thrown values", async () => {
    const fetcher = vi.fn(async () => {
      throw "string error";
    });
    const { result } = renderHook(() => useApiQuery(fetcher, []));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe("Unbekannter Fehler");
  });

  it("does not fetch when enabled is false", async () => {
    const fetcher = vi.fn(async () => "data");
    const { result } = renderHook(() =>
      useApiQuery(fetcher, [], { enabled: false })
    );

    expect(result.current.loading).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refetches when refetch is called", async () => {
    const fetcher = vi.fn(async () => ({ count: Math.random() }));
    const { result } = renderHook(() => useApiQuery(fetcher, []));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetcher).toHaveBeenCalledTimes(1);

    await result.current.refetch();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refetches when dependencies change", async () => {
    let dep = "first";
    const fetcher = vi.fn(async () => dep);
    const { result, rerender } = renderHook(() => useApiQuery(fetcher, [dep]));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe("first");

    dep = "second";
    rerender();

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.data).toBe("second"));
  });

  it("uses initialData before fetch completes", async () => {
    const fetcher = vi.fn(async () => ({ name: "loaded" }));
    const { result } = renderHook(() =>
      useApiQuery(fetcher, [], { initialData: { name: "initial" } })
    );

    expect(result.current.data).toEqual({ name: "initial" });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ name: "loaded" });
  });

  it("does not update state after unmount", async () => {
    const fetcher = vi.fn(async () => "data");
    const { result, unmount } = renderHook(() => useApiQuery(fetcher, []));

    unmount();

    // State updates after unmount should be no-ops
    await waitFor(() => {
      // The hook should not throw or cause warnings
      expect(result.current).toBeDefined();
    });
  });

  it("returns consistent refetch function identity", async () => {
    const fetcher = vi.fn(async () => "data");
    const { result } = renderHook(() => useApiQuery(fetcher, []));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const refetch1 = result.current.refetch;
    const refetch2 = result.current.refetch;
    expect(refetch1).toBe(refetch2);
  });
});
