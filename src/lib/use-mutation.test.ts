// @vitest-environment jsdom

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock offline-store
vi.mock("./offline-store", () => ({
  isOnline: vi.fn(() => true),
  enqueueMutation: vi.fn(async () => {}),
  getPendingMutations: vi.fn(async () => []),
  removeMutation: vi.fn(async () => {}),
  setMutationConflicted: vi.fn(async () => {}),
  setOfflineErrorReporter: vi.fn(),
  getPendingFileUploads: vi.fn(async () => []),
  removeFileUpload: vi.fn(async () => {}),
  incrementFileUploadRetries: vi.fn(async () => {}),
  incrementMutationRetries: vi.fn(async () => {}),
}));

// Mock api
vi.mock("./api", () => ({
  api: {
    brain: {
      createPage: vi.fn(async () => ({ slug: "test" })),
      updatePage: vi.fn(async () => ({ slug: "test", success: true })),
      deletePage: vi.fn(async () => ({ success: true })),
      // Default: Seite existiert nicht (404) — create/update duerfen laufen.
      // Konflikt-Tests ueberschreiben mit mockResolvedValueOnce.
      getPage: vi.fn(async () => {
        throw new Error("404");
      }),
    },
    upload: {
      file: vi.fn(async () => ({ slug: "test-doc", title: "test" })),
    },
  },
}));

import { useMutationQueue } from "./use-mutation";
import {
  isOnline,
  enqueueMutation,
  getPendingMutations,
  removeMutation,
  setMutationConflicted,
  setOfflineErrorReporter,
  getPendingFileUploads,
} from "./offline-store";
import { api } from "./api";

describe("useMutationQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isOnline).mockReturnValue(true);
    vi.mocked(getPendingMutations).mockResolvedValue([]);
    vi.mocked(getPendingFileUploads).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("starts with initial state", () => {
    const { result } = renderHook(() => useMutationQueue());
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.syncing).toBe(false);
    expect(result.current.lastError).toBeNull();
  });

  test("sets offline error reporter on mount", () => {
    renderHook(() => useMutationQueue());
    expect(setOfflineErrorReporter).toHaveBeenCalledWith(expect.any(Function));
  });

  test("refreshPending updates pendingCount", async () => {
    // First call is from mount effect (returns []), second is our explicit call
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount effect
      .mockResolvedValueOnce([
        { id: "m1", type: "createPage", payload: {}, createdAt: "2024-01-01" },
        { id: "m2", type: "updatePage", payload: {}, createdAt: "2024-01-02" },
      ]);
    const { result } = renderHook(() => useMutationQueue());

    // Wait for mount effect to finish
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await act(async () => {
      await result.current.refreshPending();
    });

    expect(result.current.pendingCount).toBe(2);
  });

  test("mutate calls onlineFetcher when online", async () => {
    const fetcher = vi.fn(async () => "result");
    const { result } = renderHook(() => useMutationQueue());

    let res: string | null = null;
    await act(async () => {
      res = await result.current.mutate("createPage", { slug: "test" }, fetcher);
    });

    expect(res).toBe("result");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(enqueueMutation).not.toHaveBeenCalled();
  });

  test("mutate enqueues when offline", async () => {
    vi.mocked(isOnline).mockReturnValue(false);
    const fetcher = vi.fn(async () => "result");
    const { result } = renderHook(() => useMutationQueue());

    let res: string | null = null;
    await act(async () => {
      res = await result.current.mutate("createPage", { slug: "test" }, fetcher);
    });

    expect(res).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(enqueueMutation).toHaveBeenCalledWith({ type: "createPage", payload: { slug: "test" } });
  });

  test("syncPending does nothing when offline", async () => {
    vi.mocked(isOnline).mockReturnValue(false);
    // Mount effect still calls refreshPending which calls getPendingMutations
    vi.mocked(getPendingMutations).mockResolvedValue([]);
    const { result } = renderHook(() => useMutationQueue());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    vi.mocked(getPendingMutations).mockClear();

    await act(async () => {
      await result.current.syncPending();
    });

    // syncPending checks isOnline() first and returns early
    // getPendingMutations should not have been called by syncPending
    // (only by the mount refreshPending which we already cleared)
    expect(getPendingMutations).not.toHaveBeenCalled();
  });

  test("syncPending processes createPage mutations", async () => {
    // First call from mount effect, second from syncPending
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValueOnce([
        {
          id: "m1",
          type: "createPage",
          payload: { slug: "test", title: "Test" },
          createdAt: "2024-01-01",
        },
      ]);
    const { result } = renderHook(() => useMutationQueue());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await act(async () => {
      await result.current.syncPending();
    });

    expect(api.brain.createPage).toHaveBeenCalledWith({ slug: "test", title: "Test" });
    expect(removeMutation).toHaveBeenCalledWith("m1");
  });

  test("syncPending processes updatePage mutations", async () => {
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValueOnce([
        {
          id: "m1",
          type: "updatePage",
          payload: { slug: "test", title: "Updated" },
          createdAt: "2024-01-01",
        },
      ]);
    const { result } = renderHook(() => useMutationQueue());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await act(async () => {
      await result.current.syncPending();
    });

    expect(api.brain.updatePage).toHaveBeenCalledWith({ slug: "test", title: "Updated" });
  });

  test("syncPending markiert updatePage bei Server-Konflikt (bleibt in Queue)", async () => {
    vi.mocked(api.brain.getPage).mockResolvedValueOnce({
      slug: "test",
      updated_at: "2024-06-01T00:00:00Z",
    } as never);
    const conflicted = {
      id: "m1",
      type: "updatePage" as const,
      payload: { slug: "test", title: "Offline-Edit" },
      createdAt: "2024-01-01T00:00:00Z",
    };
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValueOnce([conflicted]) // syncPending
      .mockResolvedValue([conflicted]); // refreshPending danach
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      await result.current.syncPending();
    });

    expect(api.brain.updatePage).not.toHaveBeenCalled();
    expect(removeMutation).not.toHaveBeenCalledWith("m1");
    expect(setMutationConflicted).toHaveBeenCalledWith("m1", true);
    expect(result.current.lastError).toContain("test");
  });

  test("syncPending markiert createPage-Kollision als Konflikt", async () => {
    // getPage liefert eine Seite → Slug existiert bereits
    vi.mocked(api.brain.getPage).mockResolvedValueOnce({
      slug: "cases/neu",
      updated_at: "2024-01-01T00:00:00Z",
    } as never);
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValueOnce([
        {
          id: "m1",
          type: "createPage",
          payload: { slug: "cases/neu", title: "Offline erstellt", type: "legal_case" },
          createdAt: "2024-01-01T00:00:00Z",
        },
      ]);
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      await result.current.syncPending();
    });

    expect(api.brain.createPage).not.toHaveBeenCalled();
    expect(setMutationConflicted).toHaveBeenCalledWith("m1", true);
  });

  test("syncPending ueberspringt conflicted Mutationen", async () => {
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValueOnce([
        {
          id: "m1",
          type: "updatePage",
          payload: { slug: "test", title: "Edit" },
          createdAt: "2024-01-01T00:00:00Z",
          conflicted: true,
        },
      ]);
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      await result.current.syncPending();
    });

    expect(api.brain.updatePage).not.toHaveBeenCalled();
    expect(api.brain.getPage).not.toHaveBeenCalled();
  });

  test("resolveConflict keep-mine replayed die Mutation", async () => {
    const conflicted = {
      id: "m1",
      type: "updatePage" as const,
      payload: { slug: "test", title: "Meine Version" },
      createdAt: "2024-01-01T00:00:00Z",
      conflicted: true,
    };
    vi.mocked(getPendingMutations).mockResolvedValue([conflicted]);
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      await result.current.resolveConflict("m1", "keep-mine");
    });

    expect(api.brain.updatePage).toHaveBeenCalledWith({ slug: "test", title: "Meine Version" });
    expect(removeMutation).toHaveBeenCalledWith("m1");
  });

  test("resolveConflict rename legt createPage unter slug-2 an", async () => {
    const conflicted = {
      id: "m1",
      type: "createPage" as const,
      payload: { slug: "cases/neu", title: "Neue Akte", type: "legal_case" },
      createdAt: "2024-01-01T00:00:00Z",
      conflicted: true,
    };
    vi.mocked(getPendingMutations).mockResolvedValue([conflicted]);
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      await result.current.resolveConflict("m1", "rename");
    });

    expect(api.brain.createPage).toHaveBeenCalledWith({
      slug: "cases/neu-2",
      title: "Neue Akte",
      type: "legal_case",
    });
    expect(removeMutation).toHaveBeenCalledWith("m1");
  });

  test("resolveConflict rename ignoriert Nicht-createPage", async () => {
    const conflicted = {
      id: "m1",
      type: "updatePage" as const,
      payload: { slug: "test" },
      createdAt: "2024-01-01T00:00:00Z",
      conflicted: true,
    };
    vi.mocked(getPendingMutations).mockResolvedValue([conflicted]);
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      await result.current.resolveConflict("m1", "rename");
    });

    expect(api.brain.createPage).not.toHaveBeenCalled();
    expect(removeMutation).not.toHaveBeenCalled();
  });

  test("resolveConflict discard entfernt ohne Replay", async () => {
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      await result.current.resolveConflict("m1", "discard");
    });

    expect(removeMutation).toHaveBeenCalledWith("m1");
    expect(api.brain.updatePage).not.toHaveBeenCalled();
  });

  test("syncPending replayt updatePage wenn updated_at aus diesem Sync stammt", async () => {
    // updated_at > syncStart (z. B. eigener frueherer Replay) → kein Konflikt
    vi.mocked(api.brain.getPage).mockResolvedValueOnce({
      slug: "test",
      updated_at: "2999-01-01T00:00:00Z",
    } as never);
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValueOnce([
        {
          id: "m1",
          type: "updatePage",
          payload: { slug: "test", title: "Zweiter Edit" },
          createdAt: "2024-01-01T00:00:00Z",
        },
      ]);
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      await result.current.syncPending();
    });

    expect(api.brain.updatePage).toHaveBeenCalledWith({ slug: "test", title: "Zweiter Edit" });
    expect(result.current.lastError).toBeNull();
  });

  test("syncPending replayt updatePage wenn getPage fehlschlaegt", async () => {
    vi.mocked(api.brain.getPage).mockRejectedValueOnce(new Error("offline geworden"));
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValueOnce([
        {
          id: "m1",
          type: "updatePage",
          payload: { slug: "test", title: "Edit" },
          createdAt: "2024-01-01T00:00:00Z",
        },
      ]);
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      await result.current.syncPending();
    });

    expect(api.brain.updatePage).toHaveBeenCalledWith({ slug: "test", title: "Edit" });
  });

  test("syncPending processes deletePage mutations", async () => {
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValueOnce([
        { id: "m1", type: "deletePage", payload: { slug: "cases/1" }, createdAt: "2024-01-01" },
      ]);
    const { result } = renderHook(() => useMutationQueue());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await act(async () => {
      await result.current.syncPending();
    });

    expect(api.brain.deletePage).toHaveBeenCalledWith("cases/1");
  });

  test("syncPending handles deletePage with missing slug", async () => {
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValueOnce([
        { id: "m1", type: "deletePage", payload: {}, createdAt: "2024-01-01" },
      ]);
    const { result } = renderHook(() => useMutationQueue());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await act(async () => {
      await result.current.syncPending();
    });

    // Should not throw — error is caught and mutation stays in queue
    expect(removeMutation).not.toHaveBeenCalledWith("m1");
  });

  test("syncPending keeps failed mutations in queue", async () => {
    vi.mocked(api.brain.createPage).mockRejectedValueOnce(new Error("API down"));
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValueOnce([
        {
          id: "m1",
          type: "createPage",
          payload: { slug: "test", title: "Test" },
          createdAt: "2024-01-01",
        },
      ]);
    const { result } = renderHook(() => useMutationQueue());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await act(async () => {
      await result.current.syncPending();
    });

    expect(removeMutation).not.toHaveBeenCalled();
  });

  test("syncPending sets syncing to true then false", async () => {
    vi.mocked(getPendingMutations).mockResolvedValue([]);
    const { result } = renderHook(() => useMutationQueue());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await act(async () => {
      await result.current.syncPending();
    });

    expect(result.current.syncing).toBe(false);
  });
});
