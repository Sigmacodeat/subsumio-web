"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/use-lang";
import { ShieldAlert, ChevronRight, Search as SearchIcon, X } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { encodeSlugPath } from "@/lib/utils";
import { caseFrontmatter } from "@/lib/legal-types";
import { PageHeader } from "@/components/dashboard/page-header";
import { CappedResultsNotice } from "@/components/dashboard/capped-results-notice";
import { RotateCcw } from "lucide-react";

const CASES_LIMIT = 200;

const CASE_STATUS_LABEL: Record<string, string> = {
  open: "offen",
  active: "offen",
  in_progress: "in Bearbeitung",
  pending: "offen",
  closed: "abgeschlossen",
  archived: "archiviert",
};

function caseCountLabel(n: number): string {
  return n === 1 ? "1 Akte" : `${n} Akten`;
}

/** Win rate only means something once at least one case has been decided. */
function winRateLabel(o: { wins: number; losses: number; winRate: number }): string | null {
  return o.wins + o.losses > 0 ? `${Math.round(o.winRate * 100)} %` : null;
}

interface OpponentStats {
  name: string;
  caseCount: number;
  wins: number;
  losses: number;
  settlements: number;
  winRate: number;
  settlementRate: number;
  avgCaseValue?: number;
  preferredAreas: string[];
  recentCases: Array<{ slug: string; title: string; status: string; date: string }>;
}

export default function OpponentsPage() {
  const { t } = useLang();
  const [opponents, setOpponents] = useState<OpponentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedOpponent, setSelectedOpponent] = useState<OpponentStats | null>(null);
  const [capped, setCapped] = useState(false);
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const pages = await api.brain.listPages({ type: "legal_case", limit: CASES_LIMIT });
        if (cancelled) return;
        setCapped(pages.length >= CASES_LIMIT);

        // Aggregate opponent data from cases
        const opponentMap: Record<string, OpponentStats> = {};

        for (const page of pages) {
          const fm = caseFrontmatter(page);
          const opponentName = fm.opponent_name;
          if (!opponentName) continue;

          if (!opponentMap[opponentName]) {
            opponentMap[opponentName] = {
              name: opponentName,
              caseCount: 0,
              wins: 0,
              losses: 0,
              settlements: 0,
              winRate: 0,
              settlementRate: 0,
              preferredAreas: [],
              recentCases: [],
            };
          }

          const stats = opponentMap[opponentName];
          stats.caseCount++;

          const status = fm.status || "open";
          if (status === "won") stats.wins++;
          else if (status === "lost") stats.losses++;
          else if (status === "settled") stats.settlements++;

          if (fm.legal_area && !stats.preferredAreas.includes(fm.legal_area)) {
            stats.preferredAreas.push(fm.legal_area);
          }

          stats.recentCases.push({
            slug: page.slug,
            title: page.title,
            status,
            date: page.updated_at,
          });
        }

        // Calculate rates and sort
        for (const stats of Object.values(opponentMap)) {
          const decided = stats.wins + stats.losses;
          stats.winRate = decided > 0 ? stats.wins / decided : 0;
          stats.settlementRate = stats.caseCount > 0 ? stats.settlements / stats.caseCount : 0;
          stats.recentCases.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }

        setOpponents(Object.values(opponentMap).sort((a, b) => b.caseCount - a.caseCount));
      } catch {
        if (!cancelled) setLoadError(t("opponents.error_load"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, t]);

  const filtered = useMemo(() => {
    if (!query.trim()) return opponents;
    const q = query.toLowerCase();
    return opponents.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.preferredAreas.some((a) => a.toLowerCase().includes(q))
    );
  }, [opponents, query]);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("opponents.title")}
        description={t("opponents.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("opponents.title") },
        ]}
      />

      {capped && <CappedResultsNotice limit={CASES_LIMIT} />}

      {/* Stats summary */}
      {opponents.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="text-xs text-[color:var(--ds-text-muted)]">
              {t("opponents.stat_total")}
            </div>
            <div className="text-xl font-bold text-[color:var(--ds-text)]">{opponents.length}</div>
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="text-xs text-[color:var(--ds-text-muted)]">
              {t("opponents.stat_most_frequent")}
            </div>
            <div className="truncate text-sm font-bold text-[color:var(--ds-text)]">
              {opponents[0]?.name}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="text-xs text-[color:var(--ds-text-muted)]">
              {t("opponents.stat_total_cases")}
            </div>
            <div className="text-xl font-bold text-[color:var(--ds-text)]">
              {opponents.reduce((s, o) => s + o.caseCount, 0)}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="text-xs text-[color:var(--ds-text-muted)]">
              {t("opponents.stat_wins")}
            </div>
            <div className="text-xl font-bold text-[color:var(--ds-text)] tabular-nums">
              {opponents.reduce((s, o) => s + o.wins, 0)}
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReloadKey((k) => k + 1)}
            className="shrink-0 gap-1.5 text-xs text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
          >
            <RotateCcw size={13} /> {t("opponents.retry")}
          </Button>
        </div>
      )}

      {/* Search */}
      {!loading && opponents.length > 0 && !selectedOpponent && (
        <div className="relative max-w-md">
          <SearchIcon
            size={15}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("opponents.search_placeholder")}
            aria-label={t("opponents.search_aria")}
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2.5 pr-9 pl-9 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-text)] active:scale-[0.97] motion-reduce:transition-none"
              aria-label={t("opponents.search_clear")}
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {/* Opponent list */}
      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label={t("aria.loading")}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : loadError ? null : opponents.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title={t("opponents.empty_title")}
          description={t("opponents.empty_desc")}
          actionLabel="Zu den Akten"
          onAction={() => {
            window.location.href = "/dashboard/cases";
          }}
        />
      ) : (
        <div className="space-y-3">
          {selectedOpponent ? (
            <div className="space-y-4">
              <button
                onClick={() => setSelectedOpponent(null)}
                className="text-sm text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-text)] active:scale-[0.97] motion-reduce:transition-none"
              >
                {t("opponents.back")}
              </button>

              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <h2 className="text-lg font-bold text-[color:var(--ds-text)]">
                  {selectedOpponent.name}
                </h2>
                <div className="mt-1 flex items-center gap-3 text-sm text-[color:var(--ds-text-muted)]">
                  <span>{caseCountLabel(selectedOpponent.caseCount)}</span>
                  <span>
                    {winRateLabel(selectedOpponent)
                      ? `${winRateLabel(selectedOpponent)} ${t("opponents.win_rate")}`
                      : "noch keine entschiedene Akte"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
                  <div className="text-xl font-bold text-[color:var(--ds-text)] tabular-nums">
                    {selectedOpponent.wins}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("opponents.stat_wins")}
                  </div>
                </div>
                <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
                  <div className="text-xl font-bold text-[color:var(--ds-text)] tabular-nums">
                    {selectedOpponent.losses}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("opponents.lost")}
                  </div>
                </div>
                <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 text-center">
                  <div className="text-xl font-bold text-[color:var(--ds-text)] tabular-nums">
                    {selectedOpponent.settlements}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">
                    {t("opponents.settled")}
                  </div>
                </div>
              </div>

              {selectedOpponent.preferredAreas.length > 0 && (
                <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <h3 className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]">
                    {t("opponents.legal_areas")}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedOpponent.preferredAreas.map((area) => (
                      <Badge
                        key={area}
                        variant="default"
                        className="brand-soft brand-border/10 brand-text text-xs"
                      >
                        {area}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <h3 className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]">
                  {t("opponents.case_list")}
                </h3>
                <div className="space-y-2">
                  {selectedOpponent.recentCases.map((c) => {
                    const statusColor =
                      c.status === "won"
                        ? "text-[color:var(--ds-success-text)]"
                        : c.status === "lost"
                          ? "text-[color:var(--ds-danger-text)]"
                          : c.status === "settled"
                            ? "text-[color:var(--ds-info-text)]"
                            : "text-[color:var(--ds-text-muted)]";
                    return (
                      <Link
                        key={c.slug}
                        href={`/dashboard/cases/${encodeSlugPath(c.slug)}`}
                        className="group flex items-center justify-between rounded-lg px-3 py-2 transition-[background-color,border-color,color] hover:bg-[color:var(--ds-hover)] motion-reduce:transition-none"
                      >
                        <span className="text-sm text-[color:var(--ds-text)]">{c.title}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${statusColor}`}>
                            {c.status === "won"
                              ? t("opponents.stat_wins")
                              : c.status === "lost"
                                ? t("opponents.lost")
                                : c.status === "settled"
                                  ? t("opponents.settled")
                                  : (CASE_STATUS_LABEL[c.status] ?? c.status)}
                          </span>
                          <ChevronRight
                            size={12}
                            className="group-hover:brand-text text-[color:var(--ds-text-muted)]"
                          />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((o) => (
                <button
                  key={o.name}
                  onClick={() => setSelectedOpponent(o)}
                  className="hover:brand-border hover:brand-soft group flex w-full items-center gap-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-left transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)]">
                    <ShieldAlert
                      size={18}
                      className="text-[color:var(--ds-text-muted)]"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[color:var(--ds-text)]">{o.name}</div>
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {caseCountLabel(o.caseCount)}
                      {o.preferredAreas.length > 0 &&
                        ` · ${o.preferredAreas.slice(0, 2).join(", ")}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-medium text-[color:var(--ds-text)] tabular-nums">
                      {winRateLabel(o) ?? "—"}
                    </div>
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {t("opponents.win_rate")}
                    </div>
                  </div>
                  <ChevronRight
                    size={16}
                    className="group-hover:brand-text shrink-0 text-[color:var(--ds-text-muted)]"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
