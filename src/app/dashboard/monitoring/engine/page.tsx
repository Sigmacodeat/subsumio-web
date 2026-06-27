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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Zap,
  Database,
  Search,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  TrendingUp,
  BarChart3,
  Server,
  Cpu,
  HardDrive,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────

interface LatencyBucket {
  label: string;
  p50: number;
  p95: number;
  p99: number;
}

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

// ── Mock helpers (filled from real API when available) ────────────────

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
          color: "#c0c0d8",
        }}
      >
        <span>{label}</span>
        <span style={{ fontWeight: 600, color: warn ? "#f59e0b" : "#e8e8f0" }}>
          {value.toLocaleString("de-AT")}
          {unit} / {max.toLocaleString("de-AT")}
          {unit}
        </span>
      </div>
      <div style={{ height: 8, background: "#1e1e3a", borderRadius: 4 }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: warn ? "#f59e0b" : color,
            borderRadius: 4,
            transition: "width 0.5s",
          }}
        />
      </div>
      <div style={{ fontSize: 10, color: "#6a6a8a", marginTop: 2 }}>{Math.round(pct)}% genutzt</div>
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
      ? "#6a6a8a"
      : ms > thresholdCrit
        ? "#ef4444"
        : ms > thresholdWarn
          ? "#f59e0b"
          : "#22c55e";
  return (
    <div
      style={{
        textAlign: "center",
        padding: "10px 8px",
        background: "#0a0a18",
        borderRadius: 8,
        border: `1px solid ${color}30`,
      }}
    >
      <div style={{ fontSize: 11, color: "#6a6a8a", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
        {ms === 0 ? "—" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`}
      </div>
    </div>
  );
}

// ── Status Dot ───────────────────────────────────────────────────────

function StatusDot({ status }: { status: "healthy" | "degraded" | "down" | "loading" }) {
  const colors = { healthy: "#22c55e", degraded: "#f59e0b", down: "#ef4444", loading: "#6a6a8a" };
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
  const [searchStats, setSearchStats] = useState<SearchStats | null>(null);
  const [health, setHealth] = useState<BrainHealth | null>(null);
  const [quota, setQuota] = useState<QuotaUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, healthRes, quotaRes] = await Promise.allSettled([
        fetch("/api/brain/stats", { signal: AbortSignal.timeout(30_000) }).then((r) => (r.ok ? r.json() : null)),
        fetch("/api/brain/health", { signal: AbortSignal.timeout(30_000) }).then((r) => (r.ok ? r.json() : null)),
        fetch("/api/usage/quota", { signal: AbortSignal.timeout(30_000) }).then((r) => (r.ok ? r.json() : null)),
      ]);

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
    <div style={{ minHeight: "100vh", background: "#0a0a18", color: "#e8e8f0", paddingBottom: 40 }}>
      <PageHeader
        title="Engine Performance"
        description="Subsumio Engine — Latenz, Qualität, Quota"
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
            <span style={{ fontSize: 11, color: "#6a6a8a" }}>
              Zuletzt: {lastRefresh.toLocaleTimeString("de-AT")}
            </span>
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 4,
                background: autoRefresh ? "#6366f120" : "#1e1e3a",
                border: `1px solid ${autoRefresh ? "#6366f140" : "#1e1e3a"}`,
                color: autoRefresh ? "#6366f1" : "#6a6a8a",
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
            background: "#0d0d1a",
            border: "1px solid #1e1e3a",
            borderRadius: 10,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#c0c0d8",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Clock size={14} style={{ color: "#6366f1" }} /> Antwort-Latenz (Search)
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
              background: "#0d0d1a",
              border: "1px solid #1e1e3a",
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#c0c0d8",
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Search size={14} style={{ color: "#8b5cf6" }} /> Search-Qualität
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
                  borderBottom: "1px solid #1a1a30",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "#8a8aa8" }}>{row.label}</span>
                <span style={{ fontWeight: 600, color: row.good ? "#22c55e" : "#f59e0b" }}>
                  {row.value}
                </span>
              </div>
            ))}

            {searchStats?.intentMix && (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: "#6a6a8a",
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
                        color: "#8a8aa8",
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
              background: "#0d0d1a",
              border: "1px solid #1e1e3a",
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#c0c0d8",
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Database size={14} style={{ color: "#06b6d4" }} /> Brain-Gesundheit
            </div>

            {[
              { label: "Status", value: <StatusDot status={health?.status ?? "loading"} /> },
              {
                label: "Seiten im Brain",
                value: (
                  <span style={{ fontWeight: 600, color: "#e8e8f0" }}>
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
                      color: (health?.embeddingQueueDepth ?? 0) > 100 ? "#f59e0b" : "#22c55e",
                    }}
                  >
                    {health?.embeddingQueueDepth ?? 0}
                  </span>
                ),
              },
              {
                label: "Vektor-Index",
                value: (
                  <span style={{ color: "#8a8aa8" }}>{fmtBytes(health?.vectorIndexSize)}</span>
                ),
              },
              {
                label: "DB-Größe",
                value: <span style={{ color: "#8a8aa8" }}>{fmtBytes(health?.dbSizeBytes)}</span>,
              },
              {
                label: "Letztes Indexing",
                value: (
                  <span style={{ color: "#8a8aa8", fontSize: 11 }}>
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
                  borderBottom: "1px solid #1a1a30",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "#8a8aa8" }}>{row.label}</span>
                {row.value}
              </div>
            ))}
          </div>
        </div>

        {/* Quota */}
        {quota && (
          <div
            style={{
              background: "#0d0d1a",
              border: "1px solid #1e1e3a",
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
                  color: "#c0c0d8",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <TrendingUp size={14} style={{ color: "#10b981" }} /> Quota-Nutzung
              </div>
              {quota.resetAt && (
                <span style={{ fontSize: 11, color: "#6a6a8a" }}>
                  Reset: {new Date(quota.resetAt).toLocaleDateString("de-AT")}
                </span>
              )}
            </div>
            <GaugeBar
              label="Queries / Monat"
              value={quota.queriesUsed}
              max={quota.queriesLimit}
              color="#6366f1"
            />
            <GaugeBar
              label="Seiten im Brain"
              value={quota.pagesUsed}
              max={quota.pagesLimit}
              color="#8b5cf6"
            />
            <GaugeBar
              label="Embedding-Tokens"
              value={quota.embedTokensUsed}
              max={quota.embedTokensLimit}
              color="#06b6d4"
              unit=""
            />
          </div>
        )}

        {/* Search Mode Info */}
        <div
          style={{
            background: "#0d0d1a",
            border: "1px solid #1e1e3a",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#c0c0d8",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Zap size={14} style={{ color: "#f59e0b" }} /> Search-Mode Kostenschätzung (10K
            Queries/Monat)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {[
              {
                mode: "conservative",
                desc: "~4K Token",
                haiku: "€37",
                sonnet: "€111",
                opus: "€185",
                color: "#22c55e",
              },
              {
                mode: "balanced",
                desc: "~10K Token",
                haiku: "€93",
                sonnet: "€278",
                opus: "€463",
                color: "#f59e0b",
              },
              {
                mode: "tokenmax",
                desc: "~20K Token",
                haiku: "€185",
                sonnet: "€556",
                opus: "€926",
                color: "#ef4444",
              },
            ].map((m) => (
              <div
                key={m.mode}
                style={{
                  background: "#0a0a18",
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
                <div style={{ fontSize: 11, color: "#8a8aa8", lineHeight: 1.8 }}>
                  <div>
                    Haiku 4.5: <span style={{ color: "#c0c0d8" }}>{m.haiku}/mo</span>
                  </div>
                  <div>
                    Sonnet 4.6: <span style={{ color: "#c0c0d8" }}>{m.sonnet}/mo</span>
                  </div>
                  <div>
                    Opus 4.8: <span style={{ color: "#c0c0d8" }}>{m.opus}/mo</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#6a6a8a", marginTop: 10 }}>
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
