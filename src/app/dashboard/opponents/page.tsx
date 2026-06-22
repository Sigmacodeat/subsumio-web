"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/use-lang";
import { ShieldAlert, Loader2, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn, encodeSlugPath } from "@/lib/utils";
import { caseFrontmatter } from "@/lib/legal-types";
import { PageHeader } from "@/components/dashboard/page-header";
import { CappedResultsNotice } from "@/components/dashboard/capped-results-notice";
import { RotateCcw } from "lucide-react";

const CASES_LIMIT = 200;

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

  useEffect(() => {
    let cancelled = false;
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
      } catch (e) {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : "Daten konnten nicht geladen werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <PageHeader title="Gegner-Analyse" description="Intelligence über Gegner aus allen Akten" />

      {capped && <CappedResultsNotice limit={CASES_LIMIT} />}

      {/* Stats summary */}
      {opponents.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="text-xs text-[color:var(--ds-text-muted)]">Gegner gesamt</div>
            <div className="text-xl font-bold text-[color:var(--ds-text)]">{opponents.length}</div>
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="text-xs text-[color:var(--ds-text-muted)]">Häufigster Gegner</div>
            <div className="truncate text-sm font-bold text-[color:var(--ds-text)]">
              {opponents[0]?.name}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="text-xs text-[color:var(--ds-text-muted)]">Gesamt-Akten</div>
            <div className="text-xl font-bold text-[color:var(--ds-text)]">
              {opponents.reduce((s, o) => s + o.caseCount, 0)}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
            <div className="text-xs text-[color:var(--ds-text-muted)]">Gewonnen</div>
            <div className="text-xl font-bold text-emerald-600">
              {opponents.reduce((s, o) => s + o.wins, 0)}
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          <span>{loadError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLoading(true);
              setLoadError(null);
              void (async () => {
                try {
                  await api.brain.listPages({ type: "legal_case", limit: CASES_LIMIT });
                  setOpponents([]);
                } catch (e) {
                  setLoadError(e instanceof Error ? e.message : "Fehler");
                } finally {
                  setLoading(false);
                }
              })();
            }}
            className="shrink-0 gap-1.5 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700"
          >
            <RotateCcw size={13} /> Erneut versuchen
          </Button>
        </div>
      )}

      {/* Opponent list */}
      {loading ? (
        <div
          className="flex items-center justify-center py-20"
          role="status"
          aria-label={t("aria.loading")}
        >
          <Loader2 size={24} className="brand-text animate-spin" />
        </div>
      ) : opponents.length === 0 ? (
        <div className="space-y-4 py-20 text-center">
          <ShieldAlert size={48} className="mx-auto text-[color:var(--ds-border)]" />
          <p className="text-[color:var(--ds-text-muted)]">
            Noch keine Gegner in den Akten erfasst.
          </p>
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Füge Gegner bei der Akten-Erstellung hinzu.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {selectedOpponent ? (
            <div className="space-y-4">
              <button
                onClick={() => setSelectedOpponent(null)}
                className="text-sm text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
              >
                ← Zurück zur Übersicht
              </button>

              <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                <h2 className="text-lg font-bold text-[color:var(--ds-text)]">
                  {selectedOpponent.name}
                </h2>
                <div className="mt-1 flex items-center gap-3 text-sm text-[color:var(--ds-text-muted)]">
                  <span>{selectedOpponent.caseCount} Akten</span>
                  <span
                    className={
                      selectedOpponent.winRate >= 0.5 ? "text-emerald-600" : "text-red-600"
                    }
                  >
                    {Math.round(selectedOpponent.winRate * 100)}% Siegquote
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                  <div className="text-xl font-bold text-emerald-600">{selectedOpponent.wins}</div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">Gewonnen</div>
                </div>
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-center">
                  <div className="text-xl font-bold text-red-600">{selectedOpponent.losses}</div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">Verloren</div>
                </div>
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-center">
                  <div className="text-xl font-bold text-blue-600">
                    {selectedOpponent.settlements}
                  </div>
                  <div className="text-xs text-[color:var(--ds-text-muted)]">Erledigt</div>
                </div>
              </div>

              {selectedOpponent.preferredAreas.length > 0 && (
                <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
                  <h3 className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]">
                    Rechtsgebiete
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
                <h3 className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]">Akten</h3>
                <div className="space-y-2">
                  {selectedOpponent.recentCases.map((c) => {
                    const statusColor =
                      c.status === "won"
                        ? "text-emerald-600"
                        : c.status === "lost"
                          ? "text-red-600"
                          : c.status === "settled"
                            ? "text-blue-600"
                            : "text-amber-600";
                    return (
                      <Link
                        key={c.slug}
                        href={`/dashboard/cases/${encodeSlugPath(c.slug)}`}
                        className="group flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-[color:var(--ds-hover)]"
                      >
                        <span className="text-sm text-[color:var(--ds-text)]">{c.title}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${statusColor}`}>
                            {c.status === "won"
                              ? "Gewonnen"
                              : c.status === "lost"
                                ? "Verloren"
                                : c.status === "settled"
                                  ? "Erledigt"
                                  : c.status}
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
              {opponents.map((o) => (
                <button
                  key={o.name}
                  onClick={() => setSelectedOpponent(o)}
                  className="hover:brand-border hover:brand-soft group flex w-full items-center gap-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-left transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)]">
                    <ShieldAlert size={18} className="text-red-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[color:var(--ds-text)]">{o.name}</div>
                    <div className="text-xs text-[color:var(--ds-text-muted)]">
                      {o.caseCount} Akten · {o.preferredAreas.slice(0, 2).join(", ")}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={cn(
                        "text-sm font-medium",
                        o.winRate >= 0.5 ? "text-emerald-600" : "text-red-600"
                      )}
                    >
                      {Math.round(o.winRate * 100)}%
                    </div>
                    <div className="text-xs text-[color:var(--ds-text-muted)]">Siegquote</div>
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
