"use client";

/**
 * /ops/demo — first-party analytics for the public live demo.
 *
 * Layout follows the interactive-demo dashboard standard (Basedash/
 * Navattic): scorecards with benchmark deltas → funnel chart → drop-off
 * table → segmentation → capacity → recent activity → leads. All numbers
 * come from /api/admin/demo, computed server-side from
 * subsumio_demo_sessions + subsumio_demo_events — no third-party tracker,
 * no consent gap (Ad-Blocker/ITP lose 30–40% of client-side events).
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Copy,
  Download,
  FlaskConical,
  Link2,
  MailCheck,
  MousePointerClick,
  PlayCircle,
  TrendingUp,
  UserCheck,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn } from "@/lib/utils";

// ── API types (mirror src/lib/demo/analytics.ts) ──────────────────────

type RangeKey = "24h" | "7d" | "30d" | "90d";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "24h", label: "24 Std." },
  { key: "7d", label: "7 Tage" },
  { key: "30d", label: "30 Tage" },
  { key: "90d", label: "90 Tage" },
];

/** Top-quartile interactive-demo benchmarks (HowdyGo/Navattic). */
const BENCH = { engagementPct: 55, completionPct: 30, ctaCtrPct: 15 };

interface Summary {
  sessions: number;
  engagedSessions: number;
  engagementPct: number | null;
  completedSessions: number;
  completionPct: number | null;
  ctaClicks: number;
  ctaCtrPct: number | null;
  gateLeads: number;
  signups: number;
  signupRatePct: number | null;
  questions: number;
}

interface FunnelStage {
  key: string;
  label: string;
  count: number;
  stepConvPct: number | null;
  cumConvPct: number;
  medianSecondsToReach: number | null;
}

interface SegmentRow {
  key: string;
  sessions: number;
  engagementPct: number | null;
  completionPct: number | null;
  gateLeads: number;
  signups: number;
}

interface AnalyticsResponse {
  ok: boolean;
  persistent: boolean;
  summary: Summary;
  previous: Summary;
  funnel: FunnelStage[];
  segments: Record<"persona" | "jurisdiction" | "ref", SegmentRow[]>;
  timeseries: {
    day: string;
    sessions: number;
    questions: number;
    gateLeads: number;
    signups: number;
  }[];
  recent: {
    sid: string;
    startedAt: string;
    durationSec: number;
    persona: string;
    jurisdiction: string;
    ref: string | null;
    questionsUsed: number;
    stage: string | null;
    gate: boolean;
    converted: boolean;
    expired: boolean;
  }[];
  leads: {
    sid: string;
    email: string;
    persona: string;
    jurisdiction: string;
    ref: string | null;
    questionsUsed: number;
    score: number;
    converted: boolean;
    createdAt: string;
  }[];
  capacity: {
    activeSessions: number;
    maxActiveSessions: number;
    questionsToday: number;
    dailyQuestionCap: number;
    estimatedCostTodayEur: number;
    pendingPurge: number;
    persistent: boolean;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("de-DE")} %`);
const num = (v: number) => v.toLocaleString("de-DE");

function fmtDuration(sec: number | null): string {
  if (sec === null) return "—";
  if (sec < 60) return `${Math.round(sec)} s`;
  return `${(sec / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })} min`;
}

function fmtTime(isoTs: string): string {
  return new Date(isoTs).toLocaleString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Delta({
  cur,
  prev,
  invert = false,
}: {
  cur: number | null;
  prev: number | null;
  invert?: boolean;
}) {
  if (cur === null || prev === null)
    return <span className="text-xs text-[color:var(--ds-text-subtle)]">—</span>;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return <span className="text-xs text-[color:var(--ds-text-subtle)]">±0</span>;
  const good = invert ? d < 0 : d > 0;
  const Icon = d > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        good ? "text-[color:var(--ds-success-text)]" : "text-[color:var(--ds-danger-text)]"
      )}
    >
      <Icon size={12} aria-hidden />
      {d > 0 ? "+" : ""}
      {d.toLocaleString("de-DE")}
    </span>
  );
}

function Scorecard({
  icon: Icon,
  label,
  value,
  deltaCur,
  deltaPrev,
  benchmark,
  benchmarkLabel,
}: {
  icon: typeof PlayCircle;
  label: string;
  value: string;
  deltaCur?: number | null;
  deltaPrev?: number | null;
  benchmark?: number;
  benchmarkLabel?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-subtle)]">
        <Icon size={14} aria-hidden />
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight text-[color:var(--ds-text)]">
          {value}
        </span>
        {deltaCur !== undefined && <Delta cur={deltaCur} prev={deltaPrev ?? null} />}
      </div>
      {benchmark !== undefined && (
        <p className="mt-1 text-[0.6875rem] text-[color:var(--ds-text-subtle)]">
          {benchmarkLabel ?? "Benchmark Top 25 %"}: {benchmark} %
        </p>
      )}
    </Card>
  );
}

const PERSONA_LABEL: Record<string, string> = { lawyer: "Anwalt", assistant: "Assistenz" };
const JUR_LABEL: Record<string, string> = { at: "Österreich", de: "Deutschland" };

const EVENT_LABEL: Record<string, string> = {
  started: "Demo gestartet",
  tour_step: "Tour-Schritt",
  tour_skipped: "Tour übersprungen",
  question: "Frage gestellt",
  cap_reached: "Limit erreicht",
  ingest: "Dokument aufgenommen",
  deadline_confirmed: "Frist bestätigt",
  gate: "E-Mail hinterlassen",
  cta: "Signup-CTA geklickt",
  reset: "Demo zurückgesetzt",
  expired: "Session abgelaufen",
  signup: "Registriert",
};

interface SessionEvent {
  sid: string;
  event: string;
  step: number | null;
  props: Record<string, unknown>;
  createdAt: string;
}

/** Expandable row: click opens the ordered event timeline for the session. */
function SessionRow({ r }: { r: AnalyticsResponse["recent"][number] }) {
  const [open, setOpen] = useState(false);
  const detail = useQuery<{ ok: boolean; events: SessionEvent[] }>({
    queryKey: ["ops-demo-session", r.sid],
    queryFn: async () => {
      const res = await fetch(`/api/admin/demo?sid=${encodeURIComponent(r.sid)}`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: open,
    staleTime: 300_000,
  });

  const detailId = `demo-timeline-${r.sid}`;
  return (
    <>
      <tr
        className="cursor-pointer border-b border-[color:var(--ds-border)]/50 transition-colors last:border-0 hover:bg-[color:var(--ds-surface-hover)]"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="py-2.5 tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailId}
              aria-label={`Event-Timeline ${open ? "schließen" : "öffnen"}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
              className="rounded p-0.5 text-[color:var(--ds-text-subtle)] transition-colors hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
            >
              <ChevronDown
                size={13}
                aria-hidden
                className={cn(
                  "transition-transform motion-reduce:transition-none",
                  open && "rotate-180"
                )}
              />
            </button>
            {fmtTime(r.startedAt)}
          </span>
        </td>
        <td className="py-2.5 text-[color:var(--ds-text-muted)] tabular-nums">
          {fmtDuration(r.durationSec)}
        </td>
        <td className="py-2.5">{PERSONA_LABEL[r.persona] ?? r.persona}</td>
        <td className="py-2.5">{JUR_LABEL[r.jurisdiction] ?? r.jurisdiction}</td>
        <td className="py-2.5 text-[color:var(--ds-text-muted)]">{r.ref ?? "direkt"}</td>
        <td className="py-2.5 text-right tabular-nums">{num(r.questionsUsed)}</td>
        <td className="py-2.5">{r.stage ? FUNNEL_LABEL(r.stage) : "—"}</td>
        <td className="py-2.5 text-right">
          {r.converted ? (
            <Badge variant="success">Registriert</Badge>
          ) : r.gate ? (
            <Badge variant="info">Lead</Badge>
          ) : r.expired ? (
            <span className="text-xs text-[color:var(--ds-text-subtle)]">Abgelaufen</span>
          ) : (
            <span className="text-xs text-[color:var(--ds-success-text)]">Aktiv</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-[color:var(--ds-border)]/50 last:border-0">
          <td colSpan={8} id={detailId} className="bg-[color:var(--ds-surface-2)]/40 px-4 py-3">
            {detail.isLoading ? (
              <p className="text-xs text-[color:var(--ds-text-subtle)]">Timeline wird geladen…</p>
            ) : detail.isError ? (
              <p className="text-xs text-[color:var(--ds-danger-text)]" role="alert">
                Timeline konnte nicht geladen werden.
              </p>
            ) : detail.data && detail.data.events.length === 0 ? (
              <p className="text-xs text-[color:var(--ds-text-subtle)]">Keine Events.</p>
            ) : (
              <ol className="space-y-1.5" aria-label="Event-Timeline">
                {detail.data?.events.map((e, i) => (
                  <li key={i} className="flex items-baseline gap-3 text-xs">
                    <span className="w-28 shrink-0 text-[color:var(--ds-text-subtle)] tabular-nums">
                      {new Date(e.createdAt).toLocaleTimeString("de-AT")}
                    </span>
                    <span className="font-medium text-[color:var(--ds-text)]">
                      {EVENT_LABEL[e.event] ?? e.event}
                      {e.step !== null ? ` ${e.step}` : ""}
                    </span>
                    {Object.keys(e.props).length > 0 && (
                      <span className="truncate text-[color:var(--ds-text-subtle)]">
                        {Object.entries(e.props)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(" · ")}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function DemoAnalytics() {
  const router = useRouter();
  const params = useSearchParams();
  const rangeParam = params.get("range");
  const range: RangeKey = RANGES.some((r) => r.key === rangeParam)
    ? (rangeParam as RangeKey)
    : "7d";
  const [segmentBy, setSegmentBy] = useState<"persona" | "jurisdiction" | "ref">("persona");

  const query = useQuery<AnalyticsResponse>({
    queryKey: ["ops-demo", range],
    queryFn: async () => {
      const res = await fetch(`/api/admin/demo?range=${range}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  function setRange(key: RangeKey) {
    const p = new URLSearchParams(params.toString());
    p.set("range", key);
    router.push(`/ops/demo?${p.toString()}`);
  }

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="h-[104px] animate-pulse p-4 motion-reduce:animate-none" />
        ))}
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card className="p-6" role="alert">
        <p className="text-sm text-[color:var(--ds-danger-text)]">
          Demo-Analytics konnten nicht geladen werden (
          {query.error instanceof Error ? query.error.message : "unbekannt"}).
        </p>
      </Card>
    );
  }

  const d = query.data;
  const { summary: s, previous: p, capacity: cap } = d;
  const maxFunnel = Math.max(1, d.funnel[0]?.count ?? 1);
  const biggestDrop = d.funnel
    .slice(1)
    .reduce<{
      key: string;
      drop: number;
    } | null>((acc, st) => (st.stepConvPct !== null && (acc === null || 100 - st.stepConvPct > acc.drop) ? { key: st.key, drop: 100 - st.stepConvPct } : acc), null);
  const capPct = cap.maxActiveSessions > 0 ? (cap.activeSessions / cap.maxActiveSessions) * 100 : 0;
  const budgetPct =
    cap.dailyQuestionCap > 0 ? (cap.questionsToday / cap.dailyQuestionCap) * 100 : 0;

  return (
    <div className="space-y-6">
      {!d.persistent && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-3.5 text-xs text-[color:var(--ds-warning-text)]"
        >
          <AlertTriangle size={15} aria-hidden />
          Persistenz inaktiv — die Instanz läuft ohne Postgres, Analytics zeigt nur In-Memory-Daten
          dieses Prozesses.
        </div>
      )}
      {(capPct >= 80 || budgetPct >= 80) && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-[color:var(--ds-danger-border,var(--ds-warning-border))] bg-[color:var(--ds-danger-bg,var(--ds-warning-bg))] p-3.5 text-xs text-[color:var(--ds-danger-text,var(--ds-warning-text))]"
        >
          <AlertTriangle size={15} aria-hidden />
          {capPct >= 80
            ? `Kapazität kritisch: ${cap.activeSessions}/${cap.maxActiveSessions} aktive Demo-Sessions.`
            : `Tagesbudget fast erreicht: ${num(cap.questionsToday)}/${num(cap.dailyQuestionCap)} Demo-Fragen heute.`}
        </div>
      )}

      {/* Zeitraum + Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Zeitraum"
          className="inline-flex rounded-lg border border-[color:var(--ds-border)] p-1"
        >
          {RANGES.map((r, i) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={range === r.key}
              tabIndex={range === r.key ? 0 : -1}
              onClick={() => setRange(r.key)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") setRange(RANGES[(i + 1) % RANGES.length].key);
                if (e.key === "ArrowLeft")
                  setRange(RANGES[(i - 1 + RANGES.length) % RANGES.length].key);
              }}
              className={cn(
                "min-h-[36px] rounded-md px-3.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none",
                range === r.key
                  ? "bg-[color:var(--ds-surface-2)] font-medium text-[color:var(--ds-text)]"
                  : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/admin/demo?range=${range}&format=csv`} download>
            <Download size={14} aria-hidden /> CSV-Export
          </a>
        </Button>
      </div>

      {/* Scorecards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" aria-live="polite">
        <Scorecard
          icon={PlayCircle}
          label="Demo-Sessions"
          value={num(s.sessions)}
          deltaCur={s.sessions}
          deltaPrev={p.sessions}
        />
        <Scorecard
          icon={Activity}
          label="Engagement"
          value={pct(s.engagementPct)}
          deltaCur={s.engagementPct}
          deltaPrev={p.engagementPct}
          benchmark={BENCH.engagementPct}
        />
        <Scorecard
          icon={TrendingUp}
          label="Tour-Abschluss"
          value={pct(s.completionPct)}
          deltaCur={s.completionPct}
          deltaPrev={p.completionPct}
          benchmark={BENCH.completionPct}
        />
        <Scorecard
          icon={MousePointerClick}
          label="CTA-Rate"
          value={pct(s.ctaCtrPct)}
          deltaCur={s.ctaCtrPct}
          deltaPrev={p.ctaCtrPct}
          benchmark={BENCH.ctaCtrPct}
        />
        <Scorecard
          icon={MailCheck}
          label="Gate-Leads"
          value={num(s.gateLeads)}
          deltaCur={s.gateLeads}
          deltaPrev={p.gateLeads}
        />
        <Scorecard
          icon={UserCheck}
          label="Registrierungen"
          value={num(s.signups)}
          deltaCur={s.signups}
          deltaPrev={p.signups}
          benchmarkLabel="Signup-Rate"
          benchmark={undefined}
        />
      </div>

      {s.sessions === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="Noch keine Demo-Sessions im Zeitraum"
          description="Sobald Besucher über /demo starten, erscheint hier der komplette Funnel. Tipp: den Demo-Link auf der Landingpage prominent platzieren."
        />
      ) : (
        <>
          {/* Funnel + Drop-off */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold">Funnel (strikt sequentiell)</h2>
              <div className="space-y-3">
                {d.funnel.map((st) => (
                  <div key={st.key}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className="font-medium text-[color:var(--ds-text)]">{st.label}</span>
                      <span className="text-[color:var(--ds-text-subtle)]">
                        {num(st.count)}
                        {st.stepConvPct !== null && (
                          <span
                            className={cn(
                              "ml-2",
                              biggestDrop?.key === st.key
                                ? "font-semibold text-[color:var(--ds-danger-text)]"
                                : "text-[color:var(--ds-text-muted)]"
                            )}
                          >
                            {st.stepConvPct.toLocaleString("de-DE")} %
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)]">
                      <div
                        className="h-full rounded-full bg-[color:var(--brand-primary)] transition-[width] motion-reduce:transition-none"
                        style={{ width: `${(st.count / maxFunnel) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {biggestDrop && (
                <p className="mt-4 text-xs text-[color:var(--ds-danger-text)]">
                  Größter Abbruch: {FUNNEL_LABEL(biggestDrop.key)} (−
                  {biggestDrop.drop.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %).
                </p>
              )}
            </Card>

            <Card className="overflow-x-auto p-5">
              <h2 className="mb-4 text-sm font-semibold">Abbruch-Analyse</h2>
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--ds-border)] text-left text-xs text-[color:var(--ds-text-subtle)]">
                    <th className="pb-2 font-medium">Stufe</th>
                    <th className="pb-2 text-right font-medium">Erreicht</th>
                    <th className="pb-2 text-right font-medium">Schritt-Conv.</th>
                    <th className="pb-2 text-right font-medium">Gesamt-Conv.</th>
                    <th className="pb-2 text-right font-medium">Ø Zeit bis Stufe</th>
                  </tr>
                </thead>
                <tbody>
                  {d.funnel.map((st) => (
                    <tr
                      key={st.key}
                      className="border-b border-[color:var(--ds-border)]/50 last:border-0"
                    >
                      <td className="py-2.5">{st.label}</td>
                      <td className="py-2.5 text-right tabular-nums">{num(st.count)}</td>
                      <td className="py-2.5 text-right tabular-nums">{pct(st.stepConvPct)}</td>
                      <td className="py-2.5 text-right tabular-nums">{pct(st.cumConvPct)}</td>
                      <td className="py-2.5 text-right text-[color:var(--ds-text-muted)] tabular-nums">
                        {fmtDuration(st.medianSecondsToReach)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          {/* Segmente + Zeitreihe */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="overflow-x-auto p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">Segmente</h2>
                <div
                  role="tablist"
                  aria-label="Segment-Dimension"
                  className="inline-flex rounded-md border border-[color:var(--ds-border)] p-0.5 text-xs"
                >
                  {(
                    [
                      ["persona", "Rolle"],
                      ["jurisdiction", "Rechtsraum"],
                      ["ref", "Quelle"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      role="tab"
                      aria-selected={segmentBy === key}
                      onClick={() => setSegmentBy(key)}
                      className={cn(
                        "min-h-[32px] rounded px-2.5 py-1 focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none",
                        segmentBy === key
                          ? "bg-[color:var(--ds-surface-2)] font-medium"
                          : "text-[color:var(--ds-text-muted)]"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--ds-border)] text-left text-xs text-[color:var(--ds-text-subtle)]">
                    <th className="pb-2 font-medium">Segment</th>
                    <th className="pb-2 text-right font-medium">Sessions</th>
                    <th className="pb-2 text-right font-medium">Engagement</th>
                    <th className="pb-2 text-right font-medium">Abschluss</th>
                    <th className="pb-2 text-right font-medium">Leads</th>
                    <th className="pb-2 text-right font-medium">Signups</th>
                  </tr>
                </thead>
                <tbody>
                  {d.segments[segmentBy].map((r) => (
                    <tr
                      key={r.key}
                      className="border-b border-[color:var(--ds-border)]/50 last:border-0"
                    >
                      <td className="py-2.5 font-medium">
                        {segmentBy === "persona"
                          ? (PERSONA_LABEL[r.key] ?? r.key)
                          : segmentBy === "jurisdiction"
                            ? (JUR_LABEL[r.key] ?? r.key)
                            : r.key}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{num(r.sessions)}</td>
                      <td className="py-2.5 text-right tabular-nums">{pct(r.engagementPct)}</td>
                      <td className="py-2.5 text-right tabular-nums">{pct(r.completionPct)}</td>
                      <td className="py-2.5 text-right tabular-nums">{num(r.gateLeads)}</td>
                      <td className="py-2.5 text-right tabular-nums">{num(r.signups)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold">Verlauf</h2>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={d.timeseries} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--ds-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: "var(--ds-text-subtle)" }}
                    tickFormatter={(v: string) => v.slice(5)}
                    stroke="var(--ds-border)"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "var(--ds-text-subtle)" }}
                    stroke="var(--ds-border)"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--ds-surface)",
                      border: "1px solid var(--ds-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sessions"
                    name="Sessions"
                    stroke="var(--brand-primary)"
                    fill="var(--brand-primary)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="signups"
                    name="Signups"
                    stroke="var(--ds-success-text)"
                    fill="var(--ds-success-text)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Kapazität + Leads */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Wallet size={15} aria-hidden /> Kosten &amp; Kapazität
              </h2>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-[color:var(--ds-text-muted)]">Aktive Sessions</dt>
                  <dd className="font-medium tabular-nums">
                    {num(cap.activeSessions)} / {num(cap.maxActiveSessions)}
                  </dd>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)]">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      capPct >= 80
                        ? "bg-[color:var(--ds-danger-text)]"
                        : "bg-[color:var(--brand-primary)]"
                    )}
                    style={{ width: `${Math.min(100, capPct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[color:var(--ds-text-muted)]">Fragen heute</dt>
                  <dd className="font-medium tabular-nums">
                    {num(cap.questionsToday)} / {num(cap.dailyQuestionCap)}
                  </dd>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)]">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      budgetPct >= 80
                        ? "bg-[color:var(--ds-danger-text)]"
                        : "bg-[color:var(--brand-primary)]"
                    )}
                    style={{ width: `${Math.min(100, budgetPct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[color:var(--ds-text-muted)]">Geschätzte Kosten heute</dt>
                  <dd className="font-medium tabular-nums">
                    {cap.estimatedCostTodayEur.toLocaleString("de-DE", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[color:var(--ds-text-muted)]">Ausstehende Bereinigung</dt>
                  <dd className="font-medium tabular-nums">{num(cap.pendingPurge)}</dd>
                </div>
              </dl>
            </Card>

            <Card className="overflow-x-auto p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Gate-Leads</h2>
                <Link
                  href="/ops/leads"
                  className="text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                >
                  Alle Anfragen →
                </Link>
              </div>
              {d.leads.length === 0 ? (
                <p className="py-6 text-center text-xs text-[color:var(--ds-text-subtle)]">
                  Noch keine Gate-E-Mails im Zeitraum.
                </p>
              ) : (
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--ds-border)] text-left text-xs text-[color:var(--ds-text-subtle)]">
                      <th className="pb-2 font-medium">E-Mail</th>
                      <th className="pb-2 font-medium">Rolle</th>
                      <th className="pb-2 text-right font-medium">Fragen</th>
                      <th className="pb-2 text-right font-medium">Score</th>
                      <th className="pb-2 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.leads.slice(0, 10).map((l) => (
                      <tr
                        key={l.sid}
                        className="border-b border-[color:var(--ds-border)]/50 last:border-0"
                      >
                        <td className="py-2.5 font-medium">{l.email}</td>
                        <td className="py-2.5 text-[color:var(--ds-text-muted)]">
                          {PERSONA_LABEL[l.persona] ?? l.persona}
                          {l.ref && <span className="ml-1 text-xs">· {l.ref}</span>}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{num(l.questionsUsed)}</td>
                        <td className="py-2.5 text-right">
                          <Badge variant={l.score >= 50 ? "success" : "info"}>{l.score}</Badge>
                        </td>
                        <td className="py-2.5 text-right text-xs">
                          {l.converted ? (
                            <Badge variant="success">Registriert</Badge>
                          ) : (
                            <span className="text-[color:var(--ds-text-muted)]">Lead</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          {/* Referral-link generator */}
          <RefLinkGenerator />

          {/* Recent sessions */}
          <Card className="overflow-x-auto p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold">Letzte Sessions</h2>
              <p className="text-xs text-[color:var(--ds-text-subtle)]">
                Zeile anklicken für Event-Timeline
              </p>
            </div>
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-left text-xs text-[color:var(--ds-text-subtle)]">
                  <th className="pb-2 font-medium">Start</th>
                  <th className="pb-2 font-medium">Dauer</th>
                  <th className="pb-2 font-medium">Rolle</th>
                  <th className="pb-2 font-medium">Rechtsraum</th>
                  <th className="pb-2 font-medium">Quelle</th>
                  <th className="pb-2 text-right font-medium">Fragen</th>
                  <th className="pb-2 font-medium">Tiefste Stufe</th>
                  <th className="pb-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {d.recent.map((r) => (
                  <SessionRow key={r.sid} r={r} />
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

/** Referral-link generator: ops types a slug, gets a ready /demo?ref= link
 * to hand to a partner/channel. Sanitized client-side to the same
 * whitelist as the server ([a-z0-9_-]{1,32}). */
function RefLinkGenerator() {
  const [ref, setRef] = useState("");
  const [jur, setJur] = useState<"at" | "de">("at");
  const [persona, setPersona] = useState<"" | "lawyer" | "assistant">("");
  const [copied, setCopied] = useState(false);

  const cleanRef = ref
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
  const url = (() => {
    const params = new URLSearchParams();
    if (cleanRef) params.set("ref", cleanRef);
    if (jur === "de") params.set("jur", "de");
    if (persona) params.set("persona", persona);
    const qs = params.toString();
    return `https://subsumio.at/demo${qs ? `?${qs}` : ""}`;
  })();

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (non-secure context) — select fallback.
      setCopied(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Link2 size={15} aria-hidden /> Demo-Link erzeugen
      </h2>
      <p className="mb-4 text-xs text-[color:var(--ds-text-subtle)]">
        Kampagnen-Links für Partner/Ads — die Quelle landet in den Segmenten oben.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--ds-text-muted)]">
          Quelle (ref)
          <input
            type="text"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="z. B. anwaltstag2026"
            maxLength={32}
            className="w-48 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--ds-text-muted)]">
          Rechtsraum
          <select
            value={jur}
            onChange={(e) => setJur(e.target.value as "at" | "de")}
            className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-sm text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
          >
            <option value="at">Österreich</option>
            <option value="de">Deutschland</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--ds-text-muted)]">
          Rolle (optional)
          <select
            value={persona}
            onChange={(e) => setPersona(e.target.value as "" | "lawyer" | "assistant")}
            className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-sm text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
          >
            <option value="">–</option>
            <option value="lawyer">Anwalt</option>
            <option value="assistant">Assistenz</option>
          </select>
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-1.5 text-xs text-[color:var(--ds-text-muted)]">
            {url}
          </code>
          <Button size="sm" variant="secondary" onClick={copy} disabled={!cleanRef}>
            <Copy size={13} aria-hidden className="mr-1" />
            {copied ? "Kopiert!" : "Kopieren"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function FUNNEL_LABEL(key: string): string {
  const labels: Record<string, string> = {
    started: "Demo gestartet",
    question: "Frage gestellt",
    ingest: "Dokument aufgenommen",
    deadline_confirmed: "Frist bestätigt",
    cta: "Signup geklickt",
    signup: "Registriert",
  };
  return labels[key] ?? key;
}
