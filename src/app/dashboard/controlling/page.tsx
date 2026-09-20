"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/use-lang";
import { useRouter } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/dashboard/skeleton";
import { cn, formatEur } from "@/lib/utils";
import { api } from "@/lib/api";
import { caseFrontmatter, type TimeEntry } from "@/lib/legal-types";
import { PageHeader } from "@/components/dashboard/page-header";
import { CappedResultsNotice } from "@/components/dashboard/capped-results-notice";
const CASES_LIMIT = 500;
/** Soll-Stunden je Anwalt: 150 h pro Monat, hochgerechnet auf den gewählten Zeitraum. */
const TARGET_HOURS = { month: 150, quarter: 450, year: 1800 } as const;

interface LawyerStats {
  name: string;
  totalHours: number;
  totalRevenue: number;
  caseCount: number;
  /** Abrechenbare Stunden (entry.billable !== false). */
  billedHours: number;
  /** Stunden mit hinterlegtem Stundensatz — Basis für den Ø-Satz. */
  ratedHours: number;
  targetHours: number;
}

export default function ControllingPage() {
  const { t, lang } = useLang();
  const router = useRouter();
  const hoursFmt = (h: number) =>
    `${new Intl.NumberFormat(lang === "en" ? "en-GB" : "de-AT", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(h)} h`;
  const [stats, setStats] = useState<LawyerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const pages = await api.brain.listPages({ type: "legal_case", limit: CASES_LIMIT });
        if (cancelled) return;
        setCapped(pages.length >= CASES_LIMIT);
        const lawyerMap = new Map<string, LawyerStats>();

        pages.forEach((p) => {
          const fm = caseFrontmatter(p);
          const lawyer = fm.own_lawyer_name || "Ohne zuständigen Anwalt";
          if (!lawyerMap.has(lawyer)) {
            lawyerMap.set(lawyer, {
              name: lawyer,
              totalHours: 0,
              totalRevenue: 0,
              caseCount: 0,
              billedHours: 0,
              ratedHours: 0,
              targetHours: TARGET_HOURS[period],
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
            if (entry.billable !== false) s.billedHours += hours;
            // Leistungswert nur aus hinterlegten Stundensätzen — kein erfundener Standardsatz.
            if (entry.rate) {
              s.totalRevenue += hours * entry.rate;
              s.ratedHours += hours;
            }
          });
        });

        if (!cancelled) setStats(Array.from(lawyerMap.values()));
      } catch (e) {
        console.error("[controlling] load failed:", e instanceof Error ? e.message : e);
        if (!cancelled)
          setLoadError(
            "Die Kennzahlen konnten nicht geladen werden. Bitte laden Sie die Seite neu."
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const totalRevenue = stats.reduce((s, l) => s + l.totalRevenue, 0);
  const totalHours = stats.reduce((s, l) => s + l.totalHours, 0);
  const ratedHours = stats.reduce((s, l) => s + l.ratedHours, 0);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("controlling.title")}
        description={t("controlling.desc")}
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("controlling.title") },
        ]}
        actions={
          <div
            role="group"
            aria-label="Zeitraum"
            className="inline-flex rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-0.5"
          >
            {(["month", "quarter", "year"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => {
                  if (p === period) return;
                  setLoading(true);
                  setPeriod(p);
                }}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-[background-color,color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
                  period === p
                    ? "bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] shadow-[var(--ds-shadow-1)]"
                    : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                )}
              >
                {p === "month"
                  ? t("controlling.period_month")
                  : p === "quarter"
                    ? t("controlling.period_quarter")
                    : t("controlling.period_year")}
              </button>
            ))}
          </div>
        }
      />

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          {loadError}
        </div>
      )}

      {capped && <CappedResultsNotice limit={CASES_LIMIT} />}

      {loading ? (
        <div className="space-y-6" role="status" aria-label={t("aria.loading")}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : loadError ? null : stats.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={t("controlling.empty_title")}
          description={t("controlling.empty_desc")}
          actionLabel="Zur Zeiterfassung"
          onAction={() => router.push("/dashboard/time")}
        />
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <CtrlStat label={t("controlling.kpi_lawyers")} value={String(stats.length)} />
            <CtrlStat label={t("controlling.kpi_total_hours")} value={hoursFmt(totalHours)} />
            <CtrlStat
              label={t("controlling.kpi_total_revenue")}
              value={formatEur(totalRevenue, lang)}
              sub={
                ratedHours < totalHours
                  ? `${hoursFmt(totalHours - ratedHours)} ohne Stundensatz`
                  : undefined
              }
            />
            <CtrlStat
              label={t("controlling.kpi_avg_rate")}
              value={ratedHours > 0 ? formatEur(totalRevenue / ratedHours, lang) : "—"}
            />
          </div>

          {/* Lawyer Table */}
          <div className="overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)]">
                  <th className="px-4 py-3 text-left font-medium">{t("controlling.col_lawyer")}</th>
                  <th className="hidden px-4 py-3 text-right font-medium md:table-cell">
                    {t("controlling.col_cases")}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">{t("controlling.col_hours")}</th>
                  <th className="hidden px-4 py-3 text-right font-medium lg:table-cell">
                    {t("controlling.col_billable")}
                  </th>
                  <th
                    className="hidden px-4 py-3 text-right font-medium md:table-cell"
                    title={`Erfasste Stunden im Verhältnis zu ${TARGET_HOURS[period]} Soll-Stunden im Zeitraum`}
                  >
                    {t("controlling.col_utilization")}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {t("controlling.col_revenue")}
                  </th>
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
                      className="border-b border-[color:var(--ds-border)]/50 transition-[background-color,border-color,color] hover:bg-[color:var(--ds-surface)] motion-reduce:transition-none"
                    >
                      <td className="px-4 py-3 text-[color:var(--ds-text)]">{s.name}</td>
                      <td className="hidden px-4 py-3 text-right text-[color:var(--ds-text-muted)] md:table-cell">
                        {s.caseCount}
                      </td>
                      <td className="px-4 py-3 text-right text-[color:var(--ds-text)]">
                        {hoursFmt(s.totalHours)}
                      </td>
                      <td className="hidden px-4 py-3 text-right text-[color:var(--ds-text)] lg:table-cell">
                        {hoursFmt(s.billedHours)}
                      </td>
                      <td className="hidden px-4 py-3 text-right md:table-cell">
                        <div className="flex items-center justify-end gap-2">
                          <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-[color:var(--ds-border)] lg:flex">
                            <div
                              className="h-full rounded-full bg-[color:var(--ds-text-subtle)]"
                              style={{ width: `${utilization}%` }}
                            />
                          </div>
                          <span className="text-xs text-[color:var(--ds-text-muted)] tabular-nums">
                            {utilization} %
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-[color:var(--ds-text)]">
                        {formatEur(s.totalRevenue, lang)}
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

function CtrlStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3">
      <div className="text-xs text-[color:var(--ds-text-muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold text-[color:var(--ds-text)] tabular-nums">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{sub}</div>}
    </div>
  );
}
