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

import {
  useMutationQueue,
  __resetMutationQueueForTests,
  formatPendingLabel,
  conflictAgeDays,
  oldestConflictDays,
  sortConflictsOldestFirst,
} from "./use-mutation";
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
    // State ist module-level (geteilt zwischen Konsumenten) →
    // zwischen Tests explizit zurücksetzen.
    __resetMutationQueueForTests();
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

  test("syncPending-Re-Entry: paralleler Call waehrend laufendem Sync ist no-op", async () => {
    // Zwei syncPending-Calls duerfen nicht parallel laufen — der
    // state.syncing-Guard muss den zweiten frueh returnen lassen,
    // sonst kaeme es zu doppelten Replays (z.B. online-Event +
    // manueller Button-Klick gleichzeitig).
    let resolveSlow!: (v: Awaited<ReturnType<typeof getPendingMutations>>) => void;
    const slow = new Promise<Awaited<ReturnType<typeof getPendingMutations>>>((r) => {
      resolveSlow = r;
    });
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount-refreshPending
      .mockReturnValueOnce(slow) // erster syncPending haengt
      .mockResolvedValue([]); // refreshPending am Ende + evtl. zweiter Sync
    const { result } = renderHook(() => useMutationQueue());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const p1 = result.current.syncPending();
    const p2 = result.current.syncPending();
    resolveSlow([
      {
        id: "m1",
        type: "createPage",
        payload: { slug: "test", title: "Test" },
        createdAt: "2024-01-01",
      },
    ]);
    await act(async () => {
      await Promise.all([p1, p2]);
    });

    // Waere der zweite Call nicht geblockt worden, haette er die
    // Mutation ein zweites Mal replayed — createPage darf genau
    // einmal gelaufen sein.
    expect(api.brain.createPage).toHaveBeenCalledTimes(1);
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

  test("resolveConflict rename zaehlt -N-Suffix hoch (Kaskade)", async () => {
    const conflicted = {
      id: "m1",
      type: "createPage" as const,
      payload: { slug: "cases/neu-2", title: "Kopie", type: "legal_case" },
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

    expect(api.brain.createPage).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "cases/neu-3" })
    );
  });

  test("resolveConflict rename nutzt customSlug wenn valide + frei", async () => {
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
      await result.current.resolveConflict("m1", "rename", "cases/neu-kopie-mandant");
    });

    expect(api.brain.getPage).toHaveBeenCalledWith("cases/neu-kopie-mandant");
    expect(api.brain.createPage).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "cases/neu-kopie-mandant" })
    );
  });

  test("resolveConflict rename lehnt belegten customSlug ab", async () => {
    const conflicted = {
      id: "m1",
      type: "createPage" as const,
      payload: { slug: "cases/neu", title: "Neue Akte", type: "legal_case" },
      createdAt: "2024-01-01T00:00:00Z",
      conflicted: true,
    };
    vi.mocked(getPendingMutations).mockResolvedValue([conflicted]);
    vi.mocked(api.brain.getPage).mockResolvedValueOnce({
      slug: "cases/existiert",
      title: "x",
      content: "",
      created_at: "",
      updated_at: "",
    });
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      await result.current.resolveConflict("m1", "rename", "cases/existiert");
    });

    expect(api.brain.createPage).not.toHaveBeenCalled();
    expect(removeMutation).not.toHaveBeenCalled();
    expect(result.current.lastError).toContain("existiert bereits");
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

  test("fehlgeschlagener keep-mine laesst Konflikt resolvierbar", async () => {
    const conflicted = {
      id: "m1",
      type: "updatePage" as const,
      payload: { slug: "cases/neu", title: "x" },
      createdAt: "2024-01-01T00:00:00Z",
      conflicted: true,
    };
    vi.mocked(getPendingMutations).mockResolvedValue([conflicted]);
    vi.mocked(api.brain.updatePage).mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      await result.current.resolveConflict("m1", "keep-mine");
    });

    // Eintrag bleibt conflicted in der Queue — weiterhin sichtbar/resolvierbar
    expect(removeMutation).not.toHaveBeenCalled();
    expect(result.current.lastError).toContain("boom");
    expect(result.current.conflicts).toHaveLength(1);
    expect(result.current.conflicts[0].conflicted).toBe(true);
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

  test("syncPending setzt lastNotice bei vollstaendigem Erfolg", async () => {
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValue([
        {
          id: "m1",
          type: "updatePage",
          payload: { slug: "cases/x", title: "Edit" },
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

    expect(result.current.lastError).toBeNull();
    expect(result.current.lastNotice).toBe("1 Änderung(en) synchronisiert");
  });

  test("syncPending zaehlt Datei-Uploads separat in der Notice", async () => {
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValue([
        {
          id: "m1",
          type: "deletePage",
          payload: { slug: "cases/x" },
          createdAt: "2024-01-01T00:00:00Z",
        },
      ]);
    vi.mocked(getPendingFileUploads)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValue([
        {
          id: "fu1",
          bytes: new Uint8Array([1, 2]).buffer,
          fileName: "dok.pdf",
          fileType: "application/pdf",
          fileSize: 2,
          metadata: {},
          createdAt: "2024-01-01T00:00:00Z",
          retries: 0,
        },
      ]);
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      await result.current.syncPending();
    });

    expect(api.upload.file).toHaveBeenCalled();
    expect(result.current.lastNotice).toBe("1 Änderung(en) und 1 Datei(en) synchronisiert");
  });

  test("syncPending setzt keine Erfolgs-Notice bei Konflikt", async () => {
    // Eine Mutation synct, eine kollidiert → Fehler statt Erfolgs-Notice
    vi.mocked(api.brain.getPage).mockResolvedValue({
      slug: "cases/konflikt",
      updated_at: "2024-06-01T00:00:00Z",
    } as never);
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValue([
        {
          id: "m1",
          type: "updatePage",
          payload: { slug: "cases/konflikt", title: "Lokal" },
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

    expect(result.current.lastNotice).toBeNull();
    expect(result.current.lastError).toContain("Sync-Konflikt");
  });

  test("syncPending meldet fehlgeschlagene Retries im Fehler", async () => {
    vi.mocked(api.brain.updatePage).mockRejectedValueOnce(new Error("500"));
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValue([
        {
          id: "m1",
          type: "updatePage",
          payload: { slug: "cases/x", title: "Edit" },
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

    expect(result.current.lastError).toContain("1 fehlgeschlagen");
    expect(result.current.lastNotice).toBeNull();
  });

  test("lastNotice verschwindet nach 8s automatisch", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useMutationQueue());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await result.current.resolveConflict("m1", "discard");
      });
      expect(result.current.lastNotice).toContain("verworfen");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(7000);
      });
      expect(result.current.lastNotice).toContain("verworfen");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(result.current.lastNotice).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("zwei Hook-Instanzen teilen denselben State (globaler Store)", async () => {
    const a = renderHook(() => useMutationQueue());
    const b = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    vi.mocked(getPendingMutations).mockResolvedValue([
      { id: "m1", type: "createPage", payload: {}, createdAt: "2024-01-01" },
    ]);
    await act(async () => {
      await a.result.current.refreshPending();
    });

    // Beide Konsumenten sehen denselben Stand — vorher hatte jede
    // Komponente ihren eigenen useState.
    expect(a.result.current.pendingCount).toBe(1);
    expect(b.result.current.pendingCount).toBe(1);

    // Notice aus Instanz A ist auch in B sichtbar.
    await act(async () => {
      await a.result.current.resolveConflict("m1", "discard");
    });
    expect(b.result.current.lastNotice).toContain("verworfen");
  });

  test("konkurrierende refreshPending-Calls: letzter Stand gewinnt, kein Tearing", async () => {
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Erster Call langsam (3 Items), zweiter schnell (1 Item) —
    // Reihenfolge der Auflösung darf das finale Bild nicht
    // vermischen.
    let resolveSlow: ((v: Awaited<ReturnType<typeof getPendingMutations>>) => void) | undefined;
    vi.mocked(getPendingMutations)
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveSlow = res;
          })
      )
      .mockResolvedValue([{ id: "m1", type: "createPage", payload: {}, createdAt: "2024-01-01" }]);

    let first: Promise<void> | undefined;
    await act(async () => {
      first = result.current.refreshPending();
      await result.current.refreshPending();
    });
    // Zwischenstand: schneller Call schon durch → 1 Item.
    expect(result.current.pendingCount).toBe(1);

    await act(async () => {
      resolveSlow?.([
        { id: "a", type: "createPage", payload: {}, createdAt: "2024-01-01" },
        { id: "b", type: "createPage", payload: {}, createdAt: "2024-01-01" },
        { id: "c", type: "createPage", payload: {}, createdAt: "2024-01-01" },
      ]);
      await first;
    });
    // Letzter aufgelöster Stand gewinnt — State ist atomar
    // (kein halb-gemergter Zwischenwert sichtbar).
    expect(result.current.pendingCount).toBe(3);
  });

  describe("formatPendingLabel", () => {
    const t = (k: string) =>
      ({
        "mobile.changes_short": "Änderung(en)",
        "mobile.uploads_short": "Upload(s)",
        "mobile.pending_suffix": "ausstehend",
        "mobile.offline_suffix": "offline gespeichert",
      })[k] ?? k;

    test("nur Mutations", () => {
      expect(formatPendingLabel(t, 3, 0, "mobile.pending_suffix")).toBe(
        "3 Änderung(en) ausstehend"
      );
    });

    test("nur Uploads", () => {
      expect(formatPendingLabel(t, 2, 2, "mobile.pending_suffix")).toBe("2 Upload(s) ausstehend");
    });

    test("gemischt", () => {
      expect(formatPendingLabel(t, 4, 1, "mobile.pending_suffix")).toBe(
        "3 Änderung(en) + 1 Upload(s) ausstehend"
      );
    });

    test("offline-Suffix, nur Uploads", () => {
      expect(formatPendingLabel(t, 1, 1, "mobile.offline_suffix")).toBe(
        "1 Upload(s) offline gespeichert"
      );
    });
  });

  describe("conflictAgeDays / oldestConflictDays / sortConflictsOldestFirst", () => {
    const conflict = (id: string, conflictAt?: string) => ({
      id,
      type: "updatePage" as const,
      payload: { slug: id },
      createdAt: "2024-01-01T00:00:00Z",
      conflicted: true,
      conflictAt,
    });

    test("fehlendes conflictAt zaehlt als 0 Tage", () => {
      expect(conflictAgeDays(undefined)).toBe(0);
      expect(oldestConflictDays([conflict("m1")])).toBe(0);
    });

    test("oldestConflictDays gibt das Maximum zurueck", () => {
      const old = new Date(Date.now() - 9 * 86_400_000).toISOString();
      const fresh = new Date(Date.now() - 2 * 86_400_000).toISOString();
      expect(
        oldestConflictDays([conflict("fresh", fresh), conflict("old", old), conflict("none")])
      ).toBe(9);
    });

    test("leere Liste → 0", () => {
      expect(oldestConflictDays([])).toBe(0);
    });

    test("sortConflictsOldestFirst: aelteste zuerst, ohne conflictAt ans Ende, Input unberuehrt", () => {
      const old = conflict("old", new Date(Date.now() - 9 * 86_400_000).toISOString());
      const fresh = conflict("fresh", new Date(Date.now() - 2 * 86_400_000).toISOString());
      const none = conflict("none");
      const input = [fresh, none, old];
      const sorted = sortConflictsOldestFirst(input);
      expect(sorted.map((c) => c.id)).toEqual(["old", "fresh", "none"]);
      // Store-Snapshots sind immutable — in-place sortieren wuerde
      // den geteilten State mutieren.
      expect(input.map((c) => c.id)).toEqual(["fresh", "none", "old"]);
    });
  });

  test("resolveAllConflicts löst jeden Konflikt mit demselben Modus", async () => {
    const conflicts = [
      {
        id: "m1",
        type: "updatePage" as const,
        payload: { slug: "cases/a" },
        createdAt: "2024-01-01",
        conflicted: true,
      },
      {
        id: "m2",
        type: "updatePage" as const,
        payload: { slug: "cases/b" },
        createdAt: "2024-01-01",
        conflicted: true,
      },
    ];
    vi.mocked(getPendingMutations).mockResolvedValue(conflicts);
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.conflictCount).toBe(2);

    await act(async () => {
      await result.current.resolveAllConflicts("discard");
    });

    expect(removeMutation).toHaveBeenCalledWith("m1");
    expect(removeMutation).toHaveBeenCalledWith("m2");
    expect(api.brain.updatePage).not.toHaveBeenCalled();
  });

  test("syncPending: Server-Edit innerhalb Skew-Toleranz ist KEIN Konflikt", async () => {
    // updated_at nur 30s nach lokalem createdAt — innerhalb der
    // 60s-Uhren-Toleranz, kein echter externer Edit.
    const createdAt = new Date("2024-01-01T12:00:00Z");
    vi.mocked(api.brain.getPage).mockResolvedValueOnce({
      slug: "test",
      updated_at: new Date(createdAt.getTime() + 30_000).toISOString(),
    } as never);
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValue([
        {
          id: "m1",
          type: "updatePage",
          payload: { slug: "test", title: "Lokal" },
          createdAt: createdAt.toISOString(),
        },
      ]);
    const { result } = renderHook(() => useMutationQueue());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      await result.current.syncPending();
    });

    expect(api.brain.updatePage).toHaveBeenCalledWith({ slug: "test", title: "Lokal" });
    expect(setMutationConflicted).not.toHaveBeenCalled();
    expect(result.current.lastNotice).toContain("synchronisiert");
  });

  test("syncPending: Server-Edit nach Toleranz ist Konflikt", async () => {
    const createdAt = new Date("2024-01-01T12:00:00Z");
    vi.mocked(api.brain.getPage).mockResolvedValueOnce({
      slug: "test",
      updated_at: new Date(createdAt.getTime() + 90_000).toISOString(),
    } as never);
    vi.mocked(getPendingMutations)
      .mockResolvedValueOnce([]) // mount
      .mockResolvedValue([
        {
          id: "m1",
          type: "updatePage",
          payload: { slug: "test", title: "Lokal" },
          createdAt: createdAt.toISOString(),
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
    expect(setMutationConflicted).toHaveBeenCalledWith("m1", true);
  });
});
