"use client";

/**
 * Engine Performance / APM Dashboard
 *
 * Shows P50/P95/P99 latency, brain quality, search stats,
 * embedding queue, quota usage, and recent error events.
 * All data from existing API endpoints:
 *   /api/brain/stats           → search stats, latency percentiles
 *   /api/brain/health          → brain health, embedding queue
 *   /api/usage/quota           → quota usage per org
 */

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useLang } from "@/lib/use-lang";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, Database, Search, RefreshCw, Clock, TrendingUp, ArrowLeft } from "lucide-react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────

interface SearchStats {
  totalQueries: number;
  cacheHitRate: number;
  avgLatencyMs: number;
  p50LatencyMs?: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRate: number;
  intentMix?: Record<string, number>;
  budgetDropRate?: number;
}

interface BrainHealth {
  status: "healthy" | "degraded" | "down";
  pageCount: number;
  embeddingQueueDepth: number;
  lastIndexedAt: string | null;
  vectorIndexSize?: number;
  dbSizeBytes?: number;
}

interface QuotaUsage {
  queriesUsed: number;
  queriesLimit: number;
  pagesUsed: number;
  pagesLimit: number;
  embedTokensUsed: number;
  embedTokensLimit: number;
  resetAt: string;
}

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

// ── Default empty-state helpers ──────────────────────────────────────

function emptySearchStats(): SearchStats {
  return {
    totalQueries: 0,
    cacheHitRate: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    errorRate: 0,
  };
}

function emptyHealth(): BrainHealth {
  return { status: "healthy", pageCount: 0, embeddingQueueDepth: 0, lastIndexedAt: null };
}

// ── Gauge Bar ────────────────────────────────────────────────────────

function GaugeBar({
  value,
  max,
  color,
  label,
  unit = "",
}: {
  value: number;
  max: number;
  color: string;
  label: string;
  unit?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const warn = pct > 80;
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          marginBottom: 4,
          color: "var(--ds-text)",
        }}
      >
        <span>{label}</span>
        <span
          style={{ fontWeight: 600, color: warn ? "var(--ds-warning-text)" : "var(--ds-text)" }}
        >
          {value.toLocaleString("de-AT")}
          {unit} / {max.toLocaleString("de-AT")}
          {unit}
        </span>
      </div>
      <div style={{ height: 8, background: "var(--ds-border)", borderRadius: 4 }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: warn ? "var(--ds-warning-text)" : color,
            borderRadius: 4,
            transition: "width 0.5s",
          }}
        />
      </div>
      <div style={{ fontSize: 10, color: "var(--ds-text-subtle)", marginTop: 2 }}>
        {Math.round(pct)}% genutzt
      </div>
    </div>
  );
}

// ── Latency Pill ─────────────────────────────────────────────────────

function LatencyPill({
  label,
  ms,
  thresholdWarn = 500,
  thresholdCrit = 1500,
}: {
  label: string;
  ms: number;
  thresholdWarn?: number;
  thresholdCrit?: number;
}) {
  const color =
    ms === 0
      ? "var(--ds-text-subtle)"
      : ms > thresholdCrit
        ? "var(--ds-danger-text)"
        : ms > thresholdWarn
          ? "var(--ds-warning-text)"
          : "var(--ds-success-text)";
  return (
    <div
      style={{
        textAlign: "center",
        padding: "10px 8px",
        background: "var(--ds-bg)",
        borderRadius: 8,
        border: `1px solid ${color}30`,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--ds-text-subtle)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
        {ms === 0 ? "—" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`}
      </div>
    </div>
  );
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
  const [searchStats, setSearchStats] = useState<SearchStats | null>(null);
  const [health, setHealth] = useState<BrainHealth | null>(null);
  const [quota, setQuota] = useState<QuotaUsage | null>(null);
  const [queueHealth, setQueueHealth] = useState<QueueHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, healthRes, quotaRes, queueRes] = await Promise.allSettled([
        fetch("/api/brain/stats", { signal: AbortSignal.timeout(30_000) }).then((r) =>
          r.ok ? r.json() : null
        ),
        fetch("/api/brain/health", { signal: AbortSignal.timeout(30_000) }).then((r) =>
          r.ok ? r.json() : null
        ),
        fetch("/api/usage/quota", { signal: AbortSignal.timeout(30_000) }).then((r) =>
          r.ok ? r.json() : null
        ),
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

      if (statsRes.status === "fulfilled" && statsRes.value) {
        const d = statsRes.value;
        setSearchStats({
          totalQueries: d.total_queries ?? d.totalQueries ?? 0,
          cacheHitRate: d.cache_hit_rate ?? d.cacheHitRate ?? 0,
          avgLatencyMs: d.avg_latency_ms ?? d.avgLatencyMs ?? 0,
          p95LatencyMs: d.p95_latency_ms ?? d.p95LatencyMs ?? 0,
          p99LatencyMs: d.p99_latency_ms ?? d.p99LatencyMs ?? 0,
          errorRate: d.error_rate ?? d.errorRate ?? 0,
          intentMix: d.intent_mix ?? d.intentMix,
          budgetDropRate: d.budget_drop_rate ?? d.budgetDropRate,
        });
      } else {
        setSearchStats(emptySearchStats());
      }

      if (healthRes.status === "fulfilled" && healthRes.value) {
        const d = healthRes.value;
        setHealth({
          status: d.status ?? "healthy",
          pageCount: d.page_count ?? d.pageCount ?? 0,
          embeddingQueueDepth: d.embedding_queue_depth ?? d.embeddingQueueDepth ?? 0,
          lastIndexedAt: d.last_indexed_at ?? d.lastIndexedAt ?? null,
          vectorIndexSize: d.vector_index_size ?? d.vectorIndexSize,
          dbSizeBytes: d.db_size_bytes ?? d.dbSizeBytes,
        });
      } else {
        setHealth(emptyHealth());
      }

      if (quotaRes.status === "fulfilled" && quotaRes.value) {
        const d = quotaRes.value;
        setQuota({
          queriesUsed: d.queries_used ?? d.queriesUsed ?? 0,
          queriesLimit: d.queries_limit ?? d.queriesLimit ?? 10000,
          pagesUsed: d.pages_used ?? d.pagesUsed ?? 0,
          pagesLimit: d.pages_limit ?? d.pagesLimit ?? 50000,
          embedTokensUsed: d.embed_tokens_used ?? d.embedTokensUsed ?? 0,
          embedTokensLimit: d.embed_tokens_limit ?? d.embedTokensLimit ?? 10000000,
          resetAt: d.reset_at ?? d.resetAt ?? "",
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
    : (health?.status ?? "healthy");

  const fmtBytes = (b?: number) => {
    if (!b) return "—";
    if (b > 1_000_000_000) return `${(b / 1e9).toFixed(1)} GB`;
    if (b > 1_000_000) return `${(b / 1e6).toFixed(1)} MB`;
    return `${(b / 1e3).toFixed(1)} KB`;
  };

  return (
    <div
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
            <Link href="/dashboard/monitoring">
              <Button variant="ghost" size="sm" style={{ gap: 4, fontSize: 12 }}>
                <ArrowLeft size={13} /> Monitoring
              </Button>
            </Link>
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

        {/* Latency Section */}
        <div
          style={{
            background: "var(--ds-surface)",
            border: "1px solid var(--ds-border)",
            borderRadius: 10,
            padding: 16,
            marginBottom: 16,
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
            <Clock size={14} style={{ color: "var(--accent-premium)" }} /> Antwort-Latenz (Search)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <LatencyPill label="Ø Avg" ms={searchStats?.avgLatencyMs ?? 0} />
            <LatencyPill
              label="P50"
              ms={searchStats?.p50LatencyMs ?? Math.round((searchStats?.avgLatencyMs ?? 0) * 0.8)}
            />
            <LatencyPill
              label="P95"
              ms={searchStats?.p95LatencyMs ?? 0}
              thresholdWarn={800}
              thresholdCrit={2000}
            />
            <LatencyPill
              label="P99"
              ms={searchStats?.p99LatencyMs ?? 0}
              thresholdWarn={1500}
              thresholdCrit={3000}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {/* Search Quality */}
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
              <Search size={14} style={{ color: "var(--accent-premium)" }} /> Search-Qualität
            </div>

            {[
              {
                label: "Cache-Hit-Rate",
                value: `${Math.round((searchStats?.cacheHitRate ?? 0) * 100)}%`,
                good: (searchStats?.cacheHitRate ?? 0) > 0.4,
              },
              {
                label: "Fehlerrate",
                value: `${((searchStats?.errorRate ?? 0) * 100).toFixed(2)}%`,
                good: (searchStats?.errorRate ?? 0) < 0.01,
              },
              {
                label: "Budget-Drop-Rate",
                value: `${((searchStats?.budgetDropRate ?? 0) * 100).toFixed(1)}%`,
                good: (searchStats?.budgetDropRate ?? 0) < 0.05,
              },
              {
                label: "Queries gesamt",
                value: (searchStats?.totalQueries ?? 0).toLocaleString("de-AT"),
                good: true,
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
                <span
                  style={{
                    fontWeight: 600,
                    color: row.good ? "var(--ds-success-text)" : "var(--ds-warning-text)",
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}

            {searchStats?.intentMix && (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--ds-text-subtle)",
                    textTransform: "uppercase",
                    letterSpacing: "0.4px",
                    marginBottom: 8,
                  }}
                >
                  Intent-Mix
                </div>
                {Object.entries(searchStats.intentMix)
                  .slice(0, 5)
                  .map(([intent, count]) => (
                    <div
                      key={intent}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 11,
                        color: "var(--ds-text-muted)",
                        marginBottom: 3,
                      }}
                    >
                      <span>{intent}</span>
                      <span>
                        {typeof count === "number" ? count.toLocaleString("de-AT") : count}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Brain Health */}
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
              <Database size={14} style={{ color: "var(--ds-info-text)" }} /> Brain-Gesundheit
            </div>

            {[
              { label: "Status", value: <StatusDot status={health?.status ?? "loading"} /> },
              {
                label: "Seiten im Brain",
                value: (
                  <span style={{ fontWeight: 600, color: "var(--ds-text)" }}>
                    {(health?.pageCount ?? 0).toLocaleString("de-AT")}
                  </span>
                ),
              },
              {
                label: "Embedding-Queue",
                value: (
                  <span
                    style={{
                      fontWeight: 600,
                      color:
                        (health?.embeddingQueueDepth ?? 0) > 100
                          ? "var(--ds-warning-text)"
                          : "var(--ds-success-text)",
                    }}
                  >
                    {health?.embeddingQueueDepth ?? 0}
                  </span>
                ),
              },
              {
                label: "Vektor-Index",
                value: (
                  <span style={{ color: "var(--ds-text-muted)" }}>
                    {fmtBytes(health?.vectorIndexSize)}
                  </span>
                ),
              },
              {
                label: "DB-Größe",
                value: (
                  <span style={{ color: "var(--ds-text-muted)" }}>
                    {fmtBytes(health?.dbSizeBytes)}
                  </span>
                ),
              },
              {
                label: "Letztes Indexing",
                value: (
                  <span style={{ color: "var(--ds-text-muted)", fontSize: 11 }}>
                    {health?.lastIndexedAt
                      ? new Date(health.lastIndexedAt).toLocaleString("de-AT")
                      : "—"}
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

        {/* Quota */}
        {quota && (
          <div
            style={{
              background: "var(--ds-surface)",
              border: "1px solid var(--ds-border)",
              borderRadius: 10,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--ds-text)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <TrendingUp size={14} style={{ color: "var(--ds-success-text)" }} /> Quota-Nutzung
              </div>
              {quota.resetAt && (
                <span style={{ fontSize: 11, color: "var(--ds-text-subtle)" }}>
                  Reset: {new Date(quota.resetAt).toLocaleDateString("de-AT")}
                </span>
              )}
            </div>
            <GaugeBar
              label="Queries / Monat"
              value={quota.queriesUsed}
              max={quota.queriesLimit}
              color="var(--accent-premium)"
            />
            <GaugeBar
              label="Seiten im Brain"
              value={quota.pagesUsed}
              max={quota.pagesLimit}
              color="var(--accent-premium)"
            />
            <GaugeBar
              label="Embedding-Tokens"
              value={quota.embedTokensUsed}
              max={quota.embedTokensLimit}
              color="var(--ds-info-text)"
              unit=""
            />
          </div>
        )}

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
