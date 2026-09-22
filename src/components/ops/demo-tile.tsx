"use client";

/**
 * /ops overview tile for the live demo — a glanceable summary (sessions
 * today, signups in 7d) linking to the full funnel at /ops/demo.
 */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FlaskConical } from "lucide-react";

interface DemoTileData {
  summary: { sessions: number; signups: number; gateLeads: number };
  capacity: { activeSessions: number };
}

export function OpsDemoTile() {
  const q = useQuery<DemoTileData>({
    queryKey: ["ops-demo", "7d"],
    queryFn: async () => {
      const res = await fetch("/api/admin/demo?range=7d", { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const s = q.data?.summary;
  return (
    <Link
      href="/ops/demo"
      className="group flex items-center justify-between gap-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 transition-colors hover:border-[color:var(--brand-primary)]/40 focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
    >
      <div className="flex items-center gap-3.5">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]">
          <FlaskConical size={18} aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-[color:var(--ds-text)]">Live-Demo (/demo)</p>
          <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
            {q.isLoading
              ? "Lädt…"
              : q.isError || !s
                ? "Funnel-Daten nicht verfügbar"
                : `${s.sessions.toLocaleString("de-DE")} Sessions · ${s.gateLeads} Leads · ${s.signups} Signups (7 Tage)`}
          </p>
        </div>
      </div>
      <ArrowRight
        size={16}
        className="shrink-0 text-[color:var(--ds-text-subtle)] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        aria-hidden
      />
    </Link>
  );
}
