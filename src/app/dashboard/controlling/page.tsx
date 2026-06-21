"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/use-lang";
import { Users, Clock, Euro, TrendingUp, Loader2, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { caseFrontmatter, type TimeEntry } from "@/lib/legal-types";
import { PageHeader } from "@/components/dashboard/page-header";
import { CappedResultsNotice } from "@/components/dashboard/capped-results-notice";

const CASES_LIMIT = 500;

interface LawyerStats {
  name: string;
  totalHours: number;
  totalRevenue: number;
  caseCount: number;
  billedHours: number;
  targetHours: number;
}

export default function ControllingPage() {
  const { t } = useLang();
  const [stats, setStats] = useState<LawyerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");

  useEffect(() => {
    async function load() {
      try {
        const pages = await api.brain.listPages({ type: "legal_case", limit: CASES_LIMIT });
        setCapped(pages.length >= CASES_LIMIT);
        const lawyerMap = new Map<string, LawyerStats>();

        pages.forEach((p) => {
          const fm = caseFrontmatter(p);
          const lawyer = fm.own_lawyer_name || "Unbekannt";
          if (!lawyerMap.has(lawyer)) {
            lawyerMap.set(lawyer, {
              name: lawyer,
              totalHours: 0,
              totalRevenue: 0,
              caseCount: 0,
              billedHours: 0,
              targetHours: 150, // Standard-Ziel pro Monat
            });
          }
          const s = lawyerMap.get(lawyer)!;
          s.caseCount += 1;

          const entries = (fm.time_entries || []) as TimeEntry[];
          entries.forEach((entry) => {
            if (!entry.date) return;
            const d = new Date(entry.date);
            const now = new Date();
            const match =
              period === "month"
                ? d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
                : period === "quarter"
                  ? Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3) &&
                    d.getFullYear() === now.getFullYear()
                  : d.getFullYear() === now.getFullYear();
            if (!match) return;

            const hours = (entry.minutes || 0) / 60;
            s.totalHours += hours;
            if (entry.billed) s.billedHours += hours;
            s.totalRevenue += hours * (entry.rate || 200);
          });
        });

        setStats(Array.from(lawyerMap.values()));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Daten konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [period]);

  const totalRevenue = stats.reduce((s, l) => s + l.totalRevenue, 0);
  const totalHours = stats.reduce((s, l) => s + l.totalHours, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Leistungscontrolling"
        description="Übersicht über Anwälte, Stunden und Umsatz"
        breadcrumbs={[
          { label: "Übersicht", href: "/dashboard" },
          { label: "Leistungscontrolling" },
        ]}
        actions={
          <div className="flex gap-2">
            {(["month", "quarter", "year"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p
                    ? "brand-soft/20 brand-text brand-border border"
                    : "border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)]"
                }`}
              >
                {p === "month" ? "Monat" : p === "quarter" ? "Quartal" : "Jahr"}
              </button>
            ))}
          </div>
        }
      />

      {loadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {capped && <CappedResultsNotice limit={CASES_LIMIT} />}

      {loading ? (
        <div
          className="flex items-center justify-center py-20"
          role="status"
          aria-label={t("aria.loading")}
        >
          <Loader2 size={24} className="brand-text animate-spin" aria-hidden="true" />
        </div>
      ) : stats.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--ds-border-strong)] bg-[color:var(--ds-surface)] px-6 py-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--ds-surface-2)]">
            <BarChart3 size={26} className="text-[color:var(--ds-text-subtle)]" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">
            Keine Daten verfügbar
          </h3>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
            Es wurden noch keine Akten mit Zeiterfassung angelegt. Lege Akten an und erfasse Zeiten,
            um hier Auswertungen zu sehen.
          </p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="mb-2 flex items-center gap-2 text-[color:var(--ds-text-muted)]">
                <Users size={14} />
                <span className="text-xs">Anwälte</span>
              </div>
              <div className="text-2xl font-semibold text-[color:var(--ds-text)]">
                {stats.length}
              </div>
            </div>
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="mb-2 flex items-center gap-2 text-[color:var(--ds-text-muted)]">
                <Clock size={14} />
                <span className="text-xs">Gesamtstunden</span>
              </div>
              <div className="text-2xl font-semibold text-[color:var(--ds-text)]">
                {totalHours.toFixed(1)} h
              </div>
            </div>
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="mb-2 flex items-center gap-2 text-[color:var(--ds-text-muted)]">
                <Euro size={14} />
                <span className="text-xs">Gesamtumsatz</span>
              </div>
              <div className="text-2xl font-semibold text-emerald-600">
                {totalRevenue.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
              </div>
            </div>
            <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
              <div className="mb-2 flex items-center gap-2 text-[color:var(--ds-text-muted)]">
                <TrendingUp size={14} />
                <span className="text-xs">Ø Stundensatz</span>
              </div>
              <div className="text-2xl font-semibold text-[color:var(--ds-text)]">
                {totalHours > 0 ? Math.round(totalRevenue / totalHours) : 0} €
              </div>
            </div>
          </div>

          {/* Lawyer Table */}
          <div className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]">
                  <th className="px-4 py-3 text-left font-medium">Anwalt</th>
                  <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Akten</th>
                  <th className="px-4 py-3 text-right font-medium">Stunden</th>
                  <th className="hidden px-4 py-3 text-right font-medium lg:table-cell">
                    Abrechenbar
                  </th>
                  <th className="hidden px-4 py-3 text-right font-medium md:table-cell">
                    Auslastung
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Umsatz</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const utilization = Math.min(
                    100,
                    Math.round((s.totalHours / s.targetHours) * 100)
                  );
                  return (
                    <tr
                      key={s.name}
                      className="border-b border-[color:var(--ds-border)]/50 transition-colors hover:bg-[color:var(--ds-surface)]"
                    >
                      <td className="px-4 py-3 text-[color:var(--ds-text)]">{s.name}</td>
                      <td className="hidden px-4 py-3 text-right text-[color:var(--ds-text-muted)] md:table-cell">
                        {s.caseCount}
                      </td>
                      <td className="px-4 py-3 text-right text-[color:var(--ds-text)]">
                        {s.totalHours.toFixed(1)} h
                      </td>
                      <td className="hidden px-4 py-3 text-right text-[color:var(--ds-text)] lg:table-cell">
                        {s.billedHours.toFixed(1)} h
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-[color:var(--ds-border)] md:flex">
                            <div
                              className={`h-full rounded-full ${
                                utilization >= 80
                                  ? "bg-emerald-400"
                                  : utilization >= 50
                                    ? "bg-amber-400"
                                    : "bg-red-400"
                              }`}
                              style={{ width: `${utilization}%` }}
                            />
                          </div>
                          <span className="text-xs text-[color:var(--ds-text-muted)]">
                            {utilization}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">
                        {s.totalRevenue.toLocaleString("de-DE", {
                          style: "currency",
                          currency: "EUR",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
