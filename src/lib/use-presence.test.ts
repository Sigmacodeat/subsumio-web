import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePresence } from "./use-presence";

vi.mock("./realtime", () => {
  const listeners = new Map<string, Array<(payload: unknown) => void>>();
  return {
    ensureRealtime: vi.fn(),
    realtime: {
      on: vi.fn((event: string, handler: (payload: unknown) => void) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event)!.push(handler);
        return () => {
          const arr = listeners.get(event) ?? [];
          const idx = arr.indexOf(handler);
          if (idx >= 0) arr.splice(idx, 1);
        };
      }),
      emit: (event: string, payload: unknown) => {
        (listeners.get(event) ?? []).forEach((h) => h(payload));
      },
    },
  };
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(globalThis, "navigator", {
    value: { sendBeacon: vi.fn() },
    writable: true,
    configurable: true,
  });
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("usePresence", () => {
  it("returns empty users when no user is provided", () => {
    const { result } = renderHook(() => usePresence("page-1", null));
    expect(result.current).toEqual([]);
  });

  it("sends heartbeat on mount and every 15 seconds", async () => {
    const fetchMock = vi
      .mocked(globalThis.fetch)
      .mockResolvedValue(new Response(null, { status: 200 }));
    renderHook(() => usePresence("page-1", { id: "u1", email: "a@example.com" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/realtime/presence",
      expect.objectContaining({ method: "POST" })
    );
    act(() => vi.advanceTimersByTime(15000));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("disables heartbeat on 401 response", async () => {
    const fetchMock = vi
      .mocked(globalThis.fetch)
      .mockResolvedValue(new Response(null, { status: 401 }));
    renderHook(() => usePresence("page-1", { id: "u1", email: "a@example.com" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => vi.advanceTimersByTime(15000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("adds other users on presence.joined", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const { realtime } = await import("./realtime");
    const { result } = renderHook(() =>
      usePresence("page-1", { id: "u1", email: "a@example.com" })
    );
    act(() => {
      (realtime as unknown as { emit: (event: string, payload: unknown) => void }).emit(
        "presence.joined",
        {
          userId: "u2",
          email: "b@example.com",
          page: "page-1",
          joinedAt: new Date().toISOString(),
          lastHeartbeat: new Date().toISOString(),
        }
      );
    });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].email).toBe("b@example.com");
  });

  it("removes users on presence.left", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const { realtime } = await import("./realtime");
    const { result } = renderHook(() =>
      usePresence("page-1", { id: "u1", email: "a@example.com" })
    );
    act(() => {
      (realtime as unknown as { emit: (event: string, payload: unknown) => void }).emit(
        "presence.joined",
        {
          userId: "u2",
          email: "b@example.com",
          page: "page-1",
          joinedAt: new Date().toISOString(),
          lastHeartbeat: new Date().toISOString(),
        }
      );
    });
    await waitFor(() => expect(result.current).toHaveLength(1));
    act(() => {
      (realtime as unknown as { emit: (event: string, payload: unknown) => void }).emit(
        "presence.left",
        { userId: "u2", page: "page-1" }
      );
    });
    await waitFor(() => expect(result.current).toHaveLength(0));
  });

  it("updates heartbeat timestamp on presence.heartbeat", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const { realtime } = await import("./realtime");
    const { result } = renderHook(() =>
      usePresence("page-1", { id: "u1", email: "a@example.com" })
    );
    const initial = new Date().toISOString();
    act(() => {
      (realtime as unknown as { emit: (event: string, payload: unknown) => void }).emit(
        "presence.joined",
        {
          userId: "u2",
          email: "b@example.com",
          page: "page-1",
          joinedAt: initial,
          lastHeartbeat: initial,
        }
      );
    });
    await waitFor(() => expect(result.current).toHaveLength(1));
    const updated = new Date(Date.now() + 1000).toISOString();
    act(() => {
      (realtime as unknown as { emit: (event: string, payload: unknown) => void }).emit(
        "presence.heartbeat",
        {
          userId: "u2",
          email: "b@example.com",
          page: "page-1",
          lastHeartbeat: updated,
        }
      );
    });
    await waitFor(() => expect(result.current[0].lastHeartbeat).toBe(updated));
  });

  it("ignores events from other pages", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const { realtime } = await import("./realtime");
    const { result } = renderHook(() =>
      usePresence("page-1", { id: "u1", email: "a@example.com" })
    );
    act(() => {
      (realtime as unknown as { emit: (event: string, payload: unknown) => void }).emit(
        "presence.joined",
        {
          userId: "u2",
          email: "b@example.com",
          page: "page-2",
          joinedAt: new Date().toISOString(),
          lastHeartbeat: new Date().toISOString(),
        }
      );
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toHaveLength(0);
  });

  it("sends leave beacon on unmount", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(null, { status: 200 }));
    const { unmount } = renderHook(() =>
      usePresence("page-1", { id: "u1", email: "a@example.com" })
    );
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    unmount();
    const sendBeacon = (globalThis.navigator as unknown as { sendBeacon: ReturnType<typeof vi.fn> })
      .sendBeacon;
    await waitFor(() => expect(sendBeacon).toHaveBeenCalled());
    expect(sendBeacon).toHaveBeenCalledWith("/api/realtime/presence", expect.any(Blob));
  });
});
