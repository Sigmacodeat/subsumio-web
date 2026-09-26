"use client";

/**
 * Engine / platform operations dashboard.
 *
 * Platform-wide values only, from platform.operator routes:
 *   /api/admin/queue-health    → job queue, dead letters, services, corpus
 *
 * /api/brain/* and /api/usage/quota are firm-scoped (the caller's own brain)
 * and must not be shown here as platform figures; platform-wide search and
 * latency metrics are not connected yet (the page says so).
 */

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, Database, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────

interface QueueHealth {
  waiting: number;
  active: number;
  stalled: number;
  deadTotal: number;
  outboxExhausted: number | null;
  docsFailed: number | null;
  wedgeMinutes: number | null;
  engineReachable: boolean;
  clamavReachable: boolean | null;
  clamavHost: string | null;
  clamavLatencyMs: number | null;
  corpusTotalBooks: number | null;
  corpusTotalPages: number | null;
  corpusThinPages: number | null;
  corpusCriticalBooks: string[];
}

// ── Status Dot ───────────────────────────────────────────────────────

function StatusDot({ status }: { status: "healthy" | "degraded" | "down" | "loading" }) {
  const colors = {
    healthy: "var(--ds-success-text)",
    degraded: "var(--ds-warning-text)",
    down: "var(--ds-danger-text)",
    loading: "var(--ds-text-subtle)",
  };
  const labels = {
    healthy: "Gesund",
    degraded: "Degradiert",
    down: "Ausgefallen",
    loading: "Lädt…",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: colors[status],
          boxShadow: status === "healthy" ? `0 0 6px ${colors.healthy}` : undefined,
        }}
      />
      <span style={{ fontSize: 12, color: colors[status] }}>{labels[status]}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────

export default function EngineAPMPage() {
  const { t } = useLang();
  const [queueHealth, setQueueHealth] = useState<QueueHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Only platform.operator routes — never the caller's own brain.
      const [queueRes] = await Promise.allSettled([
        fetch("/api/admin/queue-health", { signal: AbortSignal.timeout(30_000) }).then((r) =>
          r.ok ? r.json() : null
        ),
      ]);

      if (queueRes.status === "fulfilled" && queueRes.value) {
        const d = queueRes.value as {
          queue_health?: { waiting?: number; active?: number; stalled?: number };
          by_type?: Array<{ dead?: number }>;
          wedge?: { minutes_since_completion?: number | null } | null;
          dead_letter?: { outbox_exhausted?: number | null; docs_failed?: number | null };
          engine_reachable?: boolean;
          clamav?: { reachable?: boolean; host?: string; latency_ms?: number; error?: string };
          corpus_completeness?: {
            total_books?: number;
            total_pages?: number;
            thin_pages?: number;
            critical_books?: string[];
          };
        };
        setQueueHealth({
          waiting: d.queue_health?.waiting ?? 0,
          active: d.queue_health?.active ?? 0,
          stalled: d.queue_health?.stalled ?? 0,
          deadTotal: (d.by_type ?? []).reduce((s, t) => s + (t.dead ?? 0), 0),
          outboxExhausted: d.dead_letter?.outbox_exhausted ?? null,
          docsFailed: d.dead_letter?.docs_failed ?? null,
          wedgeMinutes: d.wedge?.minutes_since_completion ?? null,
          engineReachable: d.engine_reachable ?? false,
          clamavReachable: d.clamav?.reachable ?? null,
          clamavHost: d.clamav?.host ?? null,
          clamavLatencyMs: d.clamav?.latency_ms ?? null,
          corpusTotalBooks: d.corpus_completeness?.total_books ?? null,
          corpusTotalPages: d.corpus_completeness?.total_pages ?? null,
          corpusThinPages: d.corpus_completeness?.thin_pages ?? null,
          corpusCriticalBooks: d.corpus_completeness?.critical_books ?? [],
        });
      }
    } catch (err) {
      console.error("[apm] load error:", err);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [autoRefresh, load]);

  const engineStatus: "healthy" | "degraded" | "down" | "loading" = loading
    ? "loading"
    : queueHealth?.engineReachable
      ? "healthy"
      : "down";

  return (
    <div
      className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8"
      style={{
        minHeight: "100vh",
        background: "var(--ds-bg)",
        color: "var(--ds-text)",
        paddingBottom: 40,
      }}
    >
      <PageHeader
        title={t("monitoring_engine.title")}
        description={t("monitoring_engine.description")}
      />

      <div style={{ padding: "0 24px" }}>
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Button asChild variant="ghost" size="sm" style={{ gap: 4, fontSize: 12 }}>
              <Link href="/ops">
                <ArrowLeft size={13} /> Übersicht
              </Link>
            </Button>
            <StatusDot status={engineStatus} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "var(--ds-text-subtle)" }}>
              Zuletzt: {lastRefresh.toLocaleTimeString("de-AT")}
            </span>
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 4,
                background: autoRefresh ? "var(--accent-premium-soft)" : "var(--ds-surface)",
                border: `1px solid ${autoRefresh ? "var(--accent-premium-border)" : "var(--ds-border)"}`,
                color: autoRefresh ? "var(--accent-premium)" : "var(--ds-text-subtle)",
                cursor: "pointer",
              }}
            >
              Auto-Refresh {autoRefresh ? "AN" : "AUS"}
            </button>
            <Button
              size="sm"
              variant="outline"
              onClick={load}
              disabled={loading}
              style={{ gap: 4, fontSize: 12 }}
            >
              <RefreshCw
                size={12}
                style={loading ? { animation: "spin 1s linear infinite" } : {}}
              />
              Aktualisieren
            </Button>
          </div>
        </div>

        {/* Firm-scoped metrics are deliberately not shown here: /api/brain/*
            and /api/usage/quota answer for the caller's own brain (or, in a
            support session, one firm's) — not for the platform. */}
        <div
          role="status"
          style={{
            background: "var(--ds-surface)",
            border: "1px solid var(--ds-border)",
            borderRadius: 10,
            padding: 16,
            marginBottom: 16,
            fontSize: 12,
            color: "var(--ds-text-muted)",
          }}
        >
          Plattformweite Such-, Latenz- und Kontingent-Kennzahlen sind noch nicht angebunden.
          Angezeigt werden nur plattformweite Werte (Job-Queue, Dienste, Korpus).
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginBottom: 16 }}>
          {/* Pipeline / Job-Queue + DLQ */}
          <div
            style={{
              background: "var(--ds-surface)",
              border: "1px solid var(--ds-border)",
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ds-text)",
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Database size={14} style={{ color: "var(--accent-premium)" }} /> Pipeline &
              Dead-Letter
            </div>

            {[
              {
                label: "Wartende Jobs",
                value: (
                  <span
                    style={{
                      fontWeight: 600,
                      color:
                        (queueHealth?.waiting ?? 0) > 100
                          ? "var(--ds-warning-text)"
                          : "var(--ds-success-text)",
                    }}
                  >
                    {queueHealth?.waiting ?? 0}
                  </span>
                ),
              },
              {
                label: "Aktive Jobs",
                value: (
                  <span style={{ color: "var(--ds-text-muted)" }}>{queueHealth?.active ?? 0}</span>
                ),
              },
              {
                label: "Dead-lettered Jobs",
                value: (
                  <span
                    style={{
                      fontWeight: 600,
                      color:
                        (queueHealth?.deadTotal ?? 0) > 0
                          ? "var(--ds-danger-text)"
                          : "var(--ds-success-text)",
                    }}
                  >
                    {queueHealth?.deadTotal ?? 0}
                  </span>
                ),
              },
              {
                label: "Post-Upload-Tasks erschöpft",
                value: (
                  <span
                    style={{
                      fontWeight: 600,
                      color:
                        (queueHealth?.outboxExhausted ?? 0) > 0
                          ? "var(--ds-danger-text)"
                          : "var(--ds-success-text)",
                    }}
                  >
                    {queueHealth?.outboxExhausted ?? "—"}
                  </span>
                ),
              },
              {
                label: "Dokumente fehlgeschlagen",
                value: (
                  <span
                    style={{
                      fontWeight: 600,
                      color:
                        (queueHealth?.docsFailed ?? 0) > 0
                          ? "var(--ds-warning-text)"
                          : "var(--ds-success-text)",
                    }}
                  >
                    {queueHealth?.docsFailed ?? "—"}
                  </span>
                ),
              },
              {
                label: "Min. seit letztem Abschluss",
                value: (
                  <span
                    style={{
                      color:
                        (queueHealth?.wedgeMinutes ?? 0) > 30
                          ? "var(--ds-warning-text)"
                          : "var(--ds-text-muted)",
                    }}
                  >
                    {queueHealth?.wedgeMinutes != null
                      ? `${Math.round(queueHealth.wedgeMinutes)} min`
                      : "—"}
                  </span>
                ),
              },
              {
                label: "Engine erreichbar",
                value: <StatusDot status={queueHealth?.engineReachable ? "healthy" : "loading"} />,
              },
              {
                label: "ClamAV",
                value: (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                    }}
                  >
                    <StatusDot
                      status={
                        queueHealth?.clamavReachable === null
                          ? "loading"
                          : queueHealth?.clamavReachable
                            ? "healthy"
                            : "down"
                      }
                    />
                    {queueHealth?.clamavReachable === null
                      ? "—"
                      : queueHealth?.clamavReachable
                        ? `${queueHealth.clamavLatencyMs ?? 0}ms`
                        : "nicht erreichbar"}
                  </span>
                ),
              },
              {
                label: "Normkorpus",
                value: (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                    }}
                  >
                    <StatusDot
                      status={
                        queueHealth?.corpusTotalBooks === null
                          ? "loading"
                          : (queueHealth?.corpusCriticalBooks?.length ?? 0) > 0
                            ? "down"
                            : (queueHealth?.corpusThinPages ?? 0) > 0
                              ? "degraded"
                              : "healthy"
                      }
                    />
                    {queueHealth?.corpusTotalBooks === null
                      ? "—"
                      : (queueHealth?.corpusCriticalBooks?.length ?? 0) > 0
                        ? `${queueHealth?.corpusCriticalBooks?.length ?? 0} kritisch`
                        : (queueHealth?.corpusThinPages ?? 0) > 0
                          ? `${queueHealth?.corpusThinPages ?? 0} dünn`
                          : `${queueHealth?.corpusTotalPages ?? 0} § ok`}
                  </span>
                ),
              },
            ].map((row) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "7px 0",
                  borderBottom: "1px solid var(--ds-border)",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "var(--ds-text-muted)" }}>{row.label}</span>
                {row.value}
              </div>
            ))}
          </div>
        </div>

        {/* Search Mode Info */}
        <div
          style={{
            background: "var(--ds-surface)",
            border: "1px solid var(--ds-border)",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--ds-text)",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Zap size={14} style={{ color: "var(--ds-warning-text)" }} /> Search-Mode
            Kostenschätzung (10K Queries/Monat)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {[
              {
                mode: "conservative",
                desc: "~4K Token",
                haiku: "€37",
                sonnet: "€111",
                opus: "€185",
                color: "var(--ds-success-text)",
              },
              {
                mode: "balanced",
                desc: "~10K Token",
                haiku: "€93",
                sonnet: "€278",
                opus: "€463",
                color: "var(--ds-warning-text)",
              },
              {
                mode: "tokenmax",
                desc: "~20K Token",
                haiku: "€185",
                sonnet: "€556",
                opus: "€926",
                color: "var(--ds-danger-text)",
              },
            ].map((m) => (
              <div
                key={m.mode}
                style={{
                  background: "var(--ds-bg)",
                  borderRadius: 8,
                  padding: "12px 14px",
                  border: `1px solid ${m.color}20`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: m.color }}>{m.mode}</span>
                  <Badge
                    variant="default"
                    style={{ fontSize: 10, border: `1px solid ${m.color}40`, color: m.color }}
                  >
                    {m.desc}
                  </Badge>
                </div>
                <div style={{ fontSize: 11, color: "var(--ds-text-muted)", lineHeight: 1.8 }}>
                  <div>
                    Haiku 4.5: <span style={{ color: "var(--ds-text)" }}>{m.haiku}/mo</span>
                  </div>
                  <div>
                    Sonnet 4.6: <span style={{ color: "var(--ds-text)" }}>{m.sonnet}/mo</span>
                  </div>
                  <div>
                    Opus 4.8: <span style={{ color: "var(--ds-text)" }}>{m.opus}/mo</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--ds-text-subtle)", marginTop: 10 }}>
            * Cache-Hits reduzieren Kosten um ~50%. Preise basierend auf Anthropic API Listenpreis.
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
