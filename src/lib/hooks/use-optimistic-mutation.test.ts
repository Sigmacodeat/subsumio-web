import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useOptimisticMutation } from "./use-optimistic-mutation";

// ── Test-Setup: QueryClient mit defaultOptions die kein retrying machen
// (sonst laufen fehlgeschlagene Mutationen endlos im Test).
function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  }
  // Attach qc to wrapper for test access.
  (Wrapper as unknown as { qc: QueryClient }).qc = qc;
  return Wrapper;
}

function getQC(wrapper: ReturnType<typeof createWrapper>) {
  return (wrapper as unknown as { qc: QueryClient }).qc;
}

describe("useOptimisticMutation", () => {
  it("single-query: ruft updater auf und schreibt optimistisch in den Cache", async () => {
    const wrapper = createWrapper();
    const qc = getQC(wrapper);

    qc.setQueryData(["todos"], { items: [{ id: 1, text: "Alt" }] });

    const mutationFn = vi.fn().mockResolvedValue({ id: 2, text: "Neu" });
    const updater = vi.fn((old: unknown, vars: { text: string }) => ({
      ...(old as { items: unknown[] }),
      items: [...(old as { items: unknown[] }).items, { id: 999, text: vars.text }],
    }));

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn,
          queryKey: ["todos"],
          updater,
        }),
      { wrapper },
    );

    act(() => result.current.mutate({ text: "Neu" }));

    // onMutate ist async (cancelQueries) — warten bis updater gelaufen ist.
    await waitFor(() => expect(updater).toHaveBeenCalled());

    const cached = qc.getQueryData<{ items: unknown[] }>(["todos"]);
    expect(cached?.items).toHaveLength(2);
    expect(cached?.items[1]).toEqual({ id: 999, text: "Neu" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("multi-query: aktualisiert mehrere Caches gleichzeitig via targets", async () => {
    const wrapper = createWrapper();
    const qc = getQC(wrapper);

    qc.setQueryData(["list"], { files: [{ path: "a.md" }, { path: "b.md" }] });
    qc.setQueryData(["overview"], { totals: { totalFiles: 2 } });

    const mutationFn = vi.fn().mockResolvedValue({});
    const listUpdater = vi.fn((old: unknown, vars: { path: string }) => {
      const data = old as { files: { path: string }[] };
      if (!data) return data;
      return { ...data, files: data.files.filter((f) => f.path !== vars.path) };
    });
    const overviewUpdater = vi.fn((old: unknown) => {
      const data = old as { totals: { totalFiles: number } };
      if (!data) return data;
      return { ...data, totals: { ...data.totals, totalFiles: data.totals.totalFiles - 1 } };
    });

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn,
          targets: [
            { queryKey: ["list"], updater: listUpdater },
            { queryKey: ["overview"], updater: overviewUpdater },
          ],
        }),
      { wrapper },
    );

    act(() => result.current.mutate({ path: "a.md" }));

    await waitFor(() => expect(listUpdater).toHaveBeenCalled());
    await waitFor(() => expect(overviewUpdater).toHaveBeenCalled());

    expect(qc.getQueryData<{ files: unknown[] }>(["list"])?.files).toHaveLength(1);
    expect(qc.getQueryData<{ totals: { totalFiles: number } }>(["overview"])?.totals.totalFiles).toBe(1);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rollback: stellt Snapshot bei Fehler wieder her", async () => {
    const wrapper = createWrapper();
    const qc = getQC(wrapper);

    qc.setQueryData(["todos"], { items: [{ id: 1, text: "Alt" }] });

    const mutationFn = vi.fn().mockRejectedValue(new Error("Server down"));
    const updater = vi.fn((old: unknown, vars: { text: string }) => ({
      ...(old as { items: unknown[] }),
      items: [...(old as { items: unknown[] }).items, { id: 999, text: vars.text }],
    }));
    const onError = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn,
          queryKey: ["todos"],
          updater,
          onError,
        }),
      { wrapper },
    );

    act(() => result.current.mutate({ text: "Neu" }));

    // Warten bis Mutation fehlerhaft beendet ist.
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Nach Fehler: Snapshot wiederhergestellt (nur 1 Item, nicht das optimistische).
    expect(qc.getQueryData<{ items: unknown[] }>(["todos"])?.items).toHaveLength(1);
    expect(qc.getQueryData<{ items: unknown[] }>(["todos"])?.items[0]).toEqual({ id: 1, text: "Alt" });
    expect(onError).toHaveBeenCalled();
    // hadSnapshot: true weil Cache Daten hatte.
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { text: "Neu" }, true);
    // Updater wurde für den optimistischen Write aufgerufen (auch wenn rollback folgte).
    expect(updater).toHaveBeenCalled();
  });

  it("hadSnapshot=false: onError wird mit false aufgerufen wenn Cache leer war", async () => {
    const wrapper = createWrapper();
    // KEIN setQueryData — Cache ist leer.

    const mutationFn = vi.fn().mockRejectedValue(new Error("Fail"));
    const onError = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn,
          queryKey: ["todos"],
          updater: (old) => old, // no-op updater
          onError,
        }),
      { wrapper },
    );

    act(() => result.current.mutate({}));

    await waitFor(() => expect(result.current.isError).toBe(true));

    // hadSnapshot: false weil Cache leer war — "wiederhergestellt" wäre irreführend.
    expect(onError).toHaveBeenCalledWith(expect.any(Error), {}, false);
  });

  it("multi-query rollback: stellt alle Snapshots wieder her", async () => {
    const wrapper = createWrapper();
    const qc = getQC(wrapper);

    qc.setQueryData(["list"], { files: [{ path: "a.md" }, { path: "b.md" }] });
    qc.setQueryData(["overview"], { totals: { totalFiles: 2 } });

    const mutationFn = vi.fn().mockRejectedValue(new Error("Fail"));
    const listUpdater = vi.fn((old: unknown, vars: { path: string }) => {
      const data = old as { files: { path: string }[] };
      return { ...data, files: data.files.filter((f) => f.path !== vars.path) };
    });
    const overviewUpdater = vi.fn((old: unknown) => {
      const data = old as { totals: { totalFiles: number } };
      return { ...data, totals: { ...data.totals, totalFiles: data.totals.totalFiles - 1 } };
    });

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn,
          targets: [
            { queryKey: ["list"], updater: listUpdater },
            { queryKey: ["overview"], updater: overviewUpdater },
          ],
        }),
      { wrapper },
    );

    act(() => result.current.mutate({ path: "a.md" }));

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Nach Fehler: beide Snapshots wiederhergestellt.
    expect(qc.getQueryData<{ files: unknown[] }>(["list"])?.files).toHaveLength(2);
    expect(qc.getQueryData<{ totals: { totalFiles: number } }>(["overview"])?.totals.totalFiles).toBe(2);
    expect(listUpdater).toHaveBeenCalled();
    expect(overviewUpdater).toHaveBeenCalled();
  });

  it("onSuccess Callback wird nach Erfolg aufgerufen", async () => {
    const wrapper = createWrapper();
    const qc = getQC(wrapper);
    qc.setQueryData(["todos"], { items: [] });

    const mutationFn = vi.fn().mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn,
          queryKey: ["todos"],
          updater: (old) => old,
          onSuccess,
        }),
      { wrapper },
    );

    act(() => result.current.mutate({}));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onSuccess).toHaveBeenCalledWith({ ok: true }, {});
  });

  it("invalidates: nach Settled werden alle invalidates-Keys invalidated", async () => {
    const wrapper = createWrapper();
    const qc = getQC(wrapper);
    qc.setQueryData(["todos"], { items: [] });
    qc.setQueryData(["other"], { foo: "bar" });

    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const mutationFn = vi.fn().mockResolvedValue({});

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn,
          queryKey: ["todos"],
          updater: (old) => old,
          invalidates: [["todos"], ["other"], ["third"]],
        }),
      { wrapper },
    );

    act(() => result.current.mutate({}));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // invalidateQueries wurde für jeden Key einzeln aufgerufen.
    const calledKeys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(calledKeys).toContainEqual(["todos"]);
    expect(calledKeys).toContainEqual(["other"]);
    expect(calledKeys).toContainEqual(["third"]);
  });

  it("targets ohne queryKey/updater: nutzt targets, ignoriert queryKey", async () => {
    const wrapper = createWrapper();
    const qc = getQC(wrapper);
    qc.setQueryData(["target-cache"], { value: 1 });
    qc.setQueryData(["ignored-cache"], { value: 999 });

    const mutationFn = vi.fn().mockResolvedValue({});
    const targetUpdater = vi.fn((old: unknown) => ({
      ...(old as { value: number }),
      value: (old as { value: number }).value + 1,
    }));
    const ignoredUpdater = vi.fn();

    const { result } = renderHook(
      () =>
        useOptimisticMutation({
          mutationFn,
          queryKey: ["ignored-cache"],
          updater: ignoredUpdater,
          targets: [{ queryKey: ["target-cache"], updater: targetUpdater }],
        }),
      { wrapper },
    );

    act(() => result.current.mutate({}));

    // targets hat Vorrang — ignored-cache wird nicht angefasst.
    await waitFor(() => expect(targetUpdater).toHaveBeenCalled());
    expect(ignoredUpdater).not.toHaveBeenCalled();
    expect(qc.getQueryData<{ value: number }>(["target-cache"])?.value).toBe(2);
    expect(qc.getQueryData<{ value: number }>(["ignored-cache"])?.value).toBe(999);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
