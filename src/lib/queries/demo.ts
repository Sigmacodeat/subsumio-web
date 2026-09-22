"use client";

/**
 * Public live-demo queries — session status, ingest, reset, e-mail gate.
 * The ["demo-session"] key is the single state source for the demo UI
 * (banner counter, ingest card, tour progress).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface DemoSessionState {
  demo: boolean;
  sid?: string;
  persona?: "lawyer" | "assistant";
  jurisdiction?: "at" | "de";
  questionsUsed?: number;
  questionsCap?: number;
  ingested?: boolean;
  expiresAt?: string;
}

/**
 * First-party funnel beacon for UI-only demo signals. Fire-and-forget,
 * `keepalive` so a CTA click that navigates away still lands. Never throws.
 */
export function demoBeacon(
  event: "tour_step" | "tour_skipped" | "deadline_confirmed" | "cta",
  extra: { step?: number; place?: string } = {}
): void {
  try {
    void fetch("/api/demo/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({ event, ...extra }),
    }).catch(() => {});
  } catch {
    // analytics must never break the demo
  }
}

async function fetchDemoSession(): Promise<DemoSessionState> {
  const res = await fetch("/api/demo/session", { credentials: "same-origin" });
  if (!res.ok) return { demo: false };
  return (await res.json()) as DemoSessionState;
}

export function useDemoSession(enabled: boolean) {
  return useQuery({
    queryKey: ["demo-session"],
    queryFn: fetchDemoSession,
    enabled,
    // The budget counter must feel live: refetch on focus and every 15s.
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useDemoIngest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/demo/ingest", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`ingest_${res.status}`);
      return (await res.json()) as { ok: boolean; already?: boolean; slugs?: string[] };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demo-session"] });
      // New pages landed in the session source — refresh case/deadline lists.
      qc.invalidateQueries({ queryKey: ["pages"] });
      qc.invalidateQueries({ queryKey: ["deadlines"] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["intake"] });
    },
  });
}

export function useDemoReset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/demo/session/reset", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`reset_${res.status}`);
      return (await res.json()) as { ok: boolean };
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDemoGate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/demo/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, company: "" }),
      });
      if (!res.ok) throw new Error(`gate_${res.status}`);
      return (await res.json()) as { ok: boolean; questionsCap: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["demo-session"] });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}
