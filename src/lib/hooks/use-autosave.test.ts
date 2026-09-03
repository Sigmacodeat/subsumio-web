import { describe, test, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAutosave } from "./use-autosave";

describe("useAutosave", () => {
  test("starts in idle state", () => {
    const save = vi.fn();
    const { result } = renderHook(() => useAutosave("initial", save));
    expect(result.current.status).toBe("idle");
    expect(result.current.lastSavedAt).toBeNull();
  });

  test("transitions to dirty when value changes", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, { delay: 100 }), {
      initialProps: { v: "initial" },
    });
    rerender({ v: "changed" });
    expect(result.current.status).toBe("dirty");
  });

  test("calls save after debounce delay", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, { delay: 100 }), {
      initialProps: { v: "initial" },
    });
    rerender({ v: "changed" });
    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith("changed", expect.any(AbortSignal));
    });
    await waitFor(() => {
      expect(result.current.status).toBe("saved");
    });
    expect(result.current.lastSavedAt).toBeInstanceOf(Date);
  });

  test("deduplicates rapid changes — only latest value is saved", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ v }) => useAutosave(v, save, { delay: 150 }), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    await new Promise((r) => setTimeout(r, 50));
    rerender({ v: "c" });
    await new Promise((r) => setTimeout(r, 50));
    rerender({ v: "d" });
    await waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith("d", expect.any(AbortSignal));
    });
  });

  test("transitions to failed when save throws", async () => {
    const save = vi.fn().mockRejectedValue(new Error("network"));
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, { delay: 100 }), {
      initialProps: { v: "initial" },
    });
    rerender({ v: "changed" });
    await waitFor(() => {
      expect(result.current.status).toBe("failed");
    });
  });

  test("saveNow triggers immediate save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutosave("value", save, { delay: 5000 }));
    await act(async () => {
      await result.current.saveNow();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");
  });

  test("reset returns to idle state", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, save, { delay: 100 }), {
      initialProps: { v: "initial" },
    });
    rerender({ v: "changed" });
    await waitFor(() => {
      expect(result.current.status).toBe("saved");
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.lastSavedAt).toBeNull();
  });

  test("does not save when enabled returns false", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ v }) => useAutosave(v, save, { delay: 100, enabled: () => false }),
      { initialProps: { v: "initial" } }
    );
    rerender({ v: "changed" });
    await new Promise((r) => setTimeout(r, 200));
    expect(save).not.toHaveBeenCalled();
  });
});
