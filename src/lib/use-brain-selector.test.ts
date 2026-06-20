// @vitest-environment jsdom

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock next/navigation useRouter
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

import { useBrainSelector, type BrainInfo } from "./use-brain-selector";

describe("useBrainSelector", () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = origFetch;
  });

  test("starts with loading=true and empty brains", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ brains: [] }), { status: 200 }),
    );
    const { result } = renderHook(() => useBrainSelector());
    expect(result.current.loading).toBe(true);
    expect(result.current.brains).toEqual([]);
    expect(result.current.activeBrain).toBeNull();
  });

  test("loads brains from API", async () => {
    const mockBrains: BrainInfo[] = [
      { name: "Brain 1", slug: "brain-1", source: "src-1", engine: "pglite" },
      { name: "Brain 2", slug: "brain-2", source: "src-2", engine: "pglite" },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ brains: mockBrains }), { status: 200 }),
    );
    const { result } = renderHook(() => useBrainSelector());

    // Wait for effect
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.brains).toHaveLength(2);
    expect(result.current.loading).toBe(false);
  });

  test("sets first brain as active when no saved brain", async () => {
    const mockBrains: BrainInfo[] = [
      { name: "Brain 1", slug: "brain-1", source: "src-1", engine: "pglite" },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ brains: mockBrains }), { status: 200 }),
    );
    const { result } = renderHook(() => useBrainSelector());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.activeBrain?.slug).toBe("brain-1");
  });

  test("restores saved brain from localStorage", async () => {
    const mockBrains: BrainInfo[] = [
      { name: "Brain 1", slug: "brain-1", source: "src-1", engine: "pglite" },
      { name: "Brain 2", slug: "brain-2", source: "src-2", engine: "pglite" },
    ];
    localStorage.setItem("subsumio:active_brain", "brain-2");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ brains: mockBrains }), { status: 200 }),
    );
    const { result } = renderHook(() => useBrainSelector());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.activeBrain?.slug).toBe("brain-2");
  });

  test("falls back to default brain on fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useBrainSelector());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.brains).toHaveLength(1);
    expect(result.current.brains[0].slug).toBe("default");
    expect(result.current.activeBrain?.slug).toBe("default");
    expect(result.current.loading).toBe(false);
  });

  test("falls back to default brain on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("error", { status: 500 }),
    );
    const { result } = renderHook(() => useBrainSelector());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.brains[0].slug).toBe("default");
    expect(result.current.loading).toBe(false);
  });

  test("falls back when fetch returns null (caught)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(null as unknown as Response);
    const { result } = renderHook(() => useBrainSelector());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(result.current.brains[0].slug).toBe("default");
  });

  test("selectBrain updates active brain and saves to localStorage", async () => {
    const mockBrains: BrainInfo[] = [
      { name: "Brain 1", slug: "brain-1", source: "src-1", engine: "pglite" },
      { name: "Brain 2", slug: "brain-2", source: "src-2", engine: "pglite" },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ brains: mockBrains }), { status: 200 }),
    );
    const { result } = renderHook(() => useBrainSelector());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    act(() => {
      result.current.selectBrain(mockBrains[1]);
    });

    expect(result.current.activeBrain?.slug).toBe("brain-2");
    expect(localStorage.getItem("subsumio:active_brain")).toBe("brain-2");
  });
});
