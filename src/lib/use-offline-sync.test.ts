// @vitest-environment jsdom

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock offline-store
vi.mock("./offline-store", () => ({
  isOnline: vi.fn(() => true),
  setCache: vi.fn(async () => {}),
  getCache: vi.fn(async () => null),
}));

import { useOfflineSync, useNetworkStatus } from "./use-offline-sync";
import { isOnline, setCache, getCache } from "./offline-store";

describe("useOfflineSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOnline).mockReturnValue(true);
    vi.mocked(getCache).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("starts with loading=true and null data", () => {
    const fetcher = vi.fn(async () => "data");
    const { result } = renderHook(() =>
      useOfflineSync({ key: "test", fetcher }),
    );
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  test("fetches data and sets it", async () => {
    const fetcher = vi.fn(async () => ({ items: [1, 2, 3] }));
    const { result } = renderHook(() =>
      useOfflineSync({ key: "test", fetcher }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual({ items: [1, 2, 3] });
    expect(result.current.error).toBeNull();
    expect(result.current.isOffline).toBe(false);
  });

  test("caches data on successful fetch", async () => {
    const fetcher = vi.fn(async () => "fresh");
    renderHook(() => useOfflineSync({ key: "test-key", fetcher }));

    await waitFor(() => {
      expect(setCache).toHaveBeenCalled();
    });

    expect(setCache).toHaveBeenCalledWith("test-key", "fresh");
  });

  test("falls back to cache on fetch error", async () => {
    const fetcher = vi.fn(async () => { throw new Error("network"); });
    vi.mocked(getCache).mockResolvedValueOnce("cached-data");
    const { result } = renderHook(() =>
      useOfflineSync({ key: "test", fetcher }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBe("cached-data");
    expect(result.current.isOffline).toBe(true);
    expect(result.current.error).toBeNull();
  });

  test("sets error when fetch fails and no cache", async () => {
    const fetcher = vi.fn(async () => { throw new Error("network"); });
    vi.mocked(getCache).mockResolvedValue(null);
    const { result } = renderHook(() =>
      useOfflineSync({ key: "test", fetcher }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("network");
  });

  test("does not fetch when disabled", async () => {
    const fetcher = vi.fn(async () => "data");
    const { result } = renderHook(() =>
      useOfflineSync({ key: "test", fetcher, enabled: false }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  test("refresh re-fetches data", async () => {
    const fetcher = vi.fn(async () => "data1");
    const { result } = renderHook(() =>
      useOfflineSync({ key: "test", fetcher }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    fetcher.mockResolvedValueOnce("data2");
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.data).toBe("data2");
  });

  test("handles non-Error thrown values", async () => {
    const fetcher = vi.fn(async () => { throw "string error"; });
    vi.mocked(getCache).mockResolvedValue(null);
    const { result } = renderHook(() =>
      useOfflineSync({ key: "test", fetcher }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("string error");
  });
});

describe("useNetworkStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOnline).mockReturnValue(true);
  });

  test("returns true when online", () => {
    vi.mocked(isOnline).mockReturnValue(true);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(true);
  });

  test("returns false when offline", () => {
    vi.mocked(isOnline).mockReturnValue(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(false);
  });

  test("adds online/offline event listeners", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderHook(() => useNetworkStatus());
    expect(addSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith("offline", expect.any(Function));
  });

  test("removes listeners on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useNetworkStatus());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("offline", expect.any(Function));
  });
});
