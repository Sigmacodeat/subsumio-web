import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const csrfFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/csrf", () => ({ csrfFetch }));

import { useCancelAgent, usePauseAgent, useReplayAgent, useSubmitSupervisor } from "./agents";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => csrfFetch.mockReset());

describe("agent mutations report failures", () => {
  it("start: a refused request throws with the route's error text", async () => {
    csrfFetch.mockResolvedValue(
      Response.json({ error: "Auftrag konnte nicht gestartet werden" }, { status: 502 })
    );
    const { result } = renderHook(() => useSubmitSupervisor(), { wrapper });
    await expect(result.current.mutateAsync({ prompt: "x" })).rejects.toThrow(
      "Auftrag konnte nicht gestartet werden"
    );
  });

  it("pause / cancel / replay throw instead of resolving silently", async () => {
    csrfFetch.mockResolvedValue(new Response("", { status: 500 }));
    const pause = renderHook(() => usePauseAgent(), { wrapper }).result.current;
    const cancel = renderHook(() => useCancelAgent(), { wrapper }).result.current;
    const replay = renderHook(() => useReplayAgent(), { wrapper }).result.current;
    await expect(pause.mutateAsync(1)).rejects.toThrow(/Pausieren/);
    await expect(cancel.mutateAsync(1)).rejects.toThrow(/Abbrechen/);
    await expect(replay.mutateAsync(1)).rejects.toThrow(/Wiederholen/);
  });

  it("success still resolves", async () => {
    csrfFetch.mockResolvedValue(Response.json({ jobId: 7 }));
    const { result } = renderHook(() => useSubmitSupervisor(), { wrapper });
    await expect(result.current.mutateAsync({ prompt: "x" })).resolves.toBe(7);
  });
});
