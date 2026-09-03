"use client";

/**
 * AdminTokenUsageClient — Token-Management für Admins.
 *
 - Goldstandard wie OpenAI Global Admin Console Analytics.
 - Per-User Leaderboard (Top Verbraucher).
 - Per-Model Breakdown (welche Modelle kosten am meisten).
 - Daily Trend (Verbrauch über Zeit).
 - Totals: Credits, Tokens, Calls, Cache-Hit-Rate, Unique Users.
 - Date-Range Filter (7/30/90 Tage).
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Cpu,
  TrendingUp,
  Users,
  Zap,
  Gauge,
  Coins,
  Calendar,
  Download,
  Trophy,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { apiGet } from "@/lib/queries/settings";
import { getModelById } from "@/lib/model-config";
import { cn } from "@/lib/utils";

interface AdminUserUsageRow {
  ownerId: string;
  ownerType: string;
  totalCredits: number;
  totalInputTokens: number;
  totalCachedTokens: number;
  totalCacheCreateTokens: number;
  totalOutputTokens: number;
  callCount: number;
  lastActivity: string | null;
}

interface AdminModelUsageRow {
  modelId: string;
  totalCredits: number;
  totalInputTokens: number;
  totalCachedTokens: number;
  totalCacheCreateTokens: number;
  totalOutputTokens: number;
  callCount: number;
  uniqueUsers: number;
}

interface AdminDailyTrendRow {
  date: string;
  totalCredits: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

interface AdminTokenUsageResponse {
  ok: boolean;
  perUser: AdminUserUsageRow[];
  perModel: AdminModelUsageRow[];
  dailyTrend: AdminDailyTrendRow[];
  totals: {
    totalCredits: number;
    totalInputTokens: number;
    totalCachedTokens: number;
    totalCacheCreateTokens: number;
    totalOutputTokens: number;
    totalCalls: number;
    uniqueUsers: number;
    cacheHitRate: number;
  };
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

function formatCredits(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

const DATE_RANGES = [
  { days: 7, label: "7 Tage" },
  { days: 30, label: "30 Tage" },
  { days: 90, label: "90 Tage" },
];

export function AdminTokenUsageClient() {
  const [days, setDays] = useState(30);
  const [trendSheetOpen, setTrendSheetOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "token-usage", days],
    queryFn: () => apiGet<AdminTokenUsageResponse>(`/api/admin/token-usage?days=${days}`),
    refetchInterval: 60_000,
  });

  const overview = data;

  const maxDailyCredits = useMemo(() => {
    if (!overview?.dailyTrend.length) return 1;
    return Math.max(...overview.dailyTrend.map((d) => d.totalCredits), 1);
  }, [overview?.dailyTrend]);

  const maxUserCredits = useMemo(() => {
    if (!overview?.perUser.length) return 1;
    return Math.max(...overview.perUser.map((u) => u.totalCredits), 1);
  }, [overview?.perUser]);

  if (isLoading || !overview) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-[color:var(--ds-border)]" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-xl bg-[color:var(--ds-border)]" />
      </div>
    );
  }

  const totals = overview.totals;
  const cacheHitPct = Math.round(totals.cacheHitRate * 100);

  const exportCsv = () => {
    if (!overview.perUser.length) return;
    const headers = [
      "ownerId",
      "ownerType",
      "totalCredits",
      "totalInputTokens",
      "totalCachedTokens",
      "totalOutputTokens",
      "callCount",
      "lastActivity",
    ];
    const rows = overview.perUser.map((u) =>
      [
        u.ownerId,
        u.ownerType,
        u.totalCredits,
        u.totalInputTokens,
        u.totalCachedTokens,
        u.totalOutputTokens,
        u.callCount,
        u.lastActivity ?? "",
      ].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `token-usage-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Date Range Filter + Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-[color:var(--ds-text-muted)]" aria-hidden />
          <div className="flex gap-1.5">
            {DATE_RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setDays(r.days)}
                aria-pressed={days === r.days}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-[background-color,color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none active:scale-[0.98]",
                  days === r.days
                    ? "brand-bg text-white"
                    : "border border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={exportCsv}
          disabled={!overview.perUser.length}
        >
          <Download size={12} />
          CSV Export
        </Button>
      </div>

      {/* Totals Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={Coins}
          label="Credits verbraucht"
          value={`${formatCredits(totals.totalCredits)} €`}
          accent="brand"
        />
        <StatCard
          icon={Users}
          label="Aktive User"
          value={String(totals.uniqueUsers)}
          hint={`${totals.totalCalls.toLocaleString("de-DE")} Calls`}
        />
        <StatCard
          icon={Zap}
          label="Output Tokens"
          value={formatTokens(totals.totalOutputTokens)}
          hint={`${formatTokens(totals.totalInputTokens)} input`}
        />
        <StatCard
          icon={Gauge}
          label="Cache-Hit-Rate"
          value={`${cacheHitPct}%`}
          hint={cacheHitPct >= 50 ? "Optimal" : cacheHitPct > 0 ? "Verbesserbar" : "Keine Caches"}
          accent={cacheHitPct >= 50 ? "success" : undefined}
        />
      </div>

      {/* Daily Trend Chart — Desktop: inline Card, Mobile: Bottom-Sheet */}
      {overview.dailyTrend.length > 0 && (
        <>
          {/* Desktop Chart (md+ — inline) */}
          <Card className="hidden md:block">
            <div className="space-y-4 p-6">
              <div className="flex items-center gap-2.5">
                <TrendingUp size={16} className="brand-text" aria-hidden />
                <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  Verbrauch über Zeit ({days} Tage)
                </h2>
              </div>
              <div
                className="flex h-40 items-end gap-1"
                role="img"
                aria-label="Daily credit consumption chart"
              >
                {overview.dailyTrend.map((day) => {
                  const heightPct = (day.totalCredits / maxDailyCredits) * 100;
                  return (
                    <div
                      key={day.date}
                      className="group brand-soft relative flex-1 rounded-t-sm transition-[height,opacity] duration-200 hover:opacity-80"
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                      title={`${day.date}: ${formatCredits(day.totalCredits)} € · ${day.totalCalls} Calls`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-[color:var(--ds-text-muted)]">
                <span>{overview.dailyTrend[0]?.date}</span>
                <span>{overview.dailyTrend[overview.dailyTrend.length - 1]?.date}</span>
              </div>
            </div>
          </Card>

          {/* Mobile Trend Summary (klickbar → Bottom-Sheet) */}
          <Card className="md:hidden">
            <button
              type="button"
              onClick={() => setTrendSheetOpen(true)}
              className="flex w-full items-center justify-between gap-3 rounded-[inherit] p-4 text-left transition-[background-color] duration-200 hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
              aria-label="Verbrauch über Zeit anzeigen"
            >
              <div className="flex items-center gap-2.5">
                <TrendingUp size={16} className="brand-text" aria-hidden />
                <div>
                  <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                    Verbrauch über Zeit
                  </h2>
                  <p className="text-xs text-[color:var(--ds-text-muted)]">
                    {days} Tage · {overview.dailyTrend.length} Datenpunkte
                  </p>
                </div>
              </div>
              <ChevronRight size={18} className="text-[color:var(--ds-text-muted)]" aria-hidden />
            </button>
            {/* Mini sparkline preview */}
            <div className="flex h-12 items-end gap-0.5 px-4 pb-3" aria-hidden>
              {overview.dailyTrend.slice(-14).map((day) => {
                const heightPct = (day.totalCredits / maxDailyCredits) * 100;
                return (
                  <div
                    key={day.date}
                    className="brand-soft flex-1 rounded-t-sm"
                    style={{ height: `${Math.max(heightPct, 5)}%` }}
                  />
                );
              })}
            </div>
          </Card>

          {/* Mobile Bottom-Sheet mit vollem Chart */}
          <Sheet
            open={trendSheetOpen}
            onClose={() => setTrendSheetOpen(false)}
            title="Verbrauch über Zeit"
            description={`${days} Tage · ${overview.dailyTrend.length} Datenpunkte`}
            side="bottom"
          >
            <div className="space-y-4">
              <div
                className="flex h-48 items-end gap-1"
                role="img"
                aria-label="Daily credit consumption chart"
              >
                {overview.dailyTrend.map((day) => {
                  const heightPct = (day.totalCredits / maxDailyCredits) * 100;
                  return (
                    <div
                      key={day.date}
                      className="group brand-soft relative flex-1 rounded-t-sm transition-[height,opacity] duration-200 hover:opacity-80"
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                      title={`${day.date}: ${formatCredits(day.totalCredits)} € · ${day.totalCalls} Calls`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-[color:var(--ds-text-muted)]">
                <span>{overview.dailyTrend[0]?.date}</span>
                <span>{overview.dailyTrend[overview.dailyTrend.length - 1]?.date}</span>
              </div>
              {/* Daily breakdown list */}
              <div className="space-y-1.5">
                {overview.dailyTrend
                  .slice()
                  .reverse()
                  .slice(0, 10)
                  .map((day) => (
                    <div
                      key={day.date}
                      className="flex items-center justify-between rounded-md border border-[color:var(--ds-border)] px-3 py-2"
                    >
                      <span className="text-xs text-[color:var(--ds-text-muted)]">{day.date}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="font-mono font-medium text-[color:var(--ds-text)]">
                          {formatCredits(day.totalCredits)} €
                        </span>
                        <span className="text-[color:var(--ds-text-subtle)]">
                          {day.totalCalls} calls
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </Sheet>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Per-User Leaderboard */}
        <Card>
          <div className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Trophy size={16} className="brand-text" aria-hidden />
                <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  Top Verbraucher
                </h2>
              </div>
              <Badge variant="info">{overview.perUser.length} User</Badge>
            </div>
            {overview.perUser.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Users size={24} className="text-[color:var(--ds-text-muted)]" aria-hidden />
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Noch keine Token-Usage in diesem Zeitraum.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {overview.perUser.slice(0, 10).map((user, idx) => {
                  const pct = (user.totalCredits / maxUserCredits) * 100;
                  return (
                    <div key={`${user.ownerId}-${user.ownerType}`}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold",
                              idx === 0
                                ? "bg-[color:var(--ds-warning-solid)] text-white"
                                : idx === 1
                                  ? "bg-[color:var(--ds-text-subtle)] text-white"
                                  : idx === 2
                                    ? "bg-[color:var(--ds-info-text)] text-white"
                                    : "bg-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]"
                            )}
                            aria-hidden
                          >
                            {idx + 1}
                          </span>
                          <span className="font-mono text-xs text-[color:var(--ds-text)]">
                            {user.ownerId.slice(0, 8)}…
                          </span>
                          <Badge variant="default" className="text-[10px]">
                            {user.ownerType}
                          </Badge>
                        </div>
                        <span className="font-mono text-xs font-medium text-[color:var(--ds-text)]">
                          {formatCredits(user.totalCredits)} €
                        </span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-border)]"
                        role="progressbar"
                        aria-valuenow={Math.round(pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`User ${user.ownerId} credit usage`}
                      >
                        <div
                          className="brand-soft h-full rounded-full transition-[width] duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[color:var(--ds-text-subtle)]">
                        <span>{formatTokens(user.totalInputTokens)} in</span>
                        <span>{formatTokens(user.totalOutputTokens)} out</span>
                        <span>{user.callCount.toLocaleString("de-DE")} calls</span>
                        <span className="ml-auto">{formatDate(user.lastActivity)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Per-Model Breakdown */}
        <Card>
          <div className="space-y-4 p-6">
            <div className="flex items-center gap-2.5">
              <Cpu size={16} className="brand-text" aria-hidden />
              <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                Modell-Verteilung
              </h2>
            </div>
            {overview.perModel.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Cpu size={24} className="text-[color:var(--ds-text-muted)]" aria-hidden />
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  Keine Modell-Usage in diesem Zeitraum.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {overview.perModel.map((row) => {
                  const model = getModelById(row.modelId);
                  const modelName = model?.name ?? row.modelId;
                  const provider = model ? model.provider : "—";
                  const pct =
                    totals.totalCredits > 0 ? (row.totalCredits / totals.totalCredits) * 100 : 0;
                  return (
                    <div key={row.modelId}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-[color:var(--ds-text)]">
                            {modelName}
                          </span>
                          <span className="text-xs tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                            {provider}
                          </span>
                        </div>
                        <span className="font-mono text-xs text-[color:var(--ds-text-muted)]">
                          {formatCredits(row.totalCredits)} €
                        </span>
                      </div>
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-border)]"
                        role="progressbar"
                        aria-valuenow={Math.round(pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${modelName} credit usage`}
                      >
                        <div
                          className="brand-soft h-full rounded-full transition-[width] duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[color:var(--ds-text-subtle)]">
                        <span>{formatTokens(row.totalInputTokens)} in</span>
                        {row.totalCachedTokens > 0 && (
                          <span className="text-[color:var(--ds-success-text)]">
                            {formatTokens(row.totalCachedTokens)} cached
                          </span>
                        )}
                        <span>{formatTokens(row.totalOutputTokens)} out</span>
                        <span>{row.callCount.toLocaleString("de-DE")} calls</span>
                        <span className="ml-auto">{row.uniqueUsers} User</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  hint?: string;
  accent?: "brand" | "success";
}) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
      <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
        <Icon
          size={14}
          className={cn(
            accent === "brand" && "brand-text",
            accent === "success" && "text-[color:var(--ds-success-text)]",
            !accent && "text-[color:var(--ds-text-muted)]"
          )}
          aria-hidden
        />
        <span>{label}</span>
      </div>
      <p
        className={cn(
          "mt-2 font-mono text-xl font-semibold tabular-nums",
          accent === "brand" && "brand-text",
          accent === "success" && "text-[color:var(--ds-success-text)]",
          !accent && "text-[color:var(--ds-text)]"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">{hint}</p>}
    </div>
  );
}
