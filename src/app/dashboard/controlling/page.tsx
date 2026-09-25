"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/use-lang";
import { useRouter } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/dashboard/skeleton";
import { cn, formatEur } from "@/lib/utils";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/page-header";
import { CappedResultsNotice } from "@/components/dashboard/capped-results-notice";
import {
  TARGET_HOURS,
  aggregateLawyerStats,
  entryFromTimeEntryPage,
  type LawyerStats,
} from "@/lib/controlling";

/** Safety stop for one read (paged in batches of 100) — the notice shows when reached. */
const READ_LIMIT = 20_000;

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
        // Matters (with their time lists) and standalone timer entries —
        // both are recorded time.
        const [casePages, entryPages] = await Promise.all([
          api.brain.listAllPages({ type: "legal_case", max: READ_LIMIT }),
          api.brain.listAllPages({ type: "time_entry", max: READ_LIMIT }),
        ]);
        if (cancelled) return;
        setCapped(casePages.length >= READ_LIMIT || entryPages.length >= READ_LIMIT);
        const stats = aggregateLawyerStats(
          casePages.map((p) => ({
            slug: p.slug,
            frontmatter: (p.frontmatter ?? {}) as Record<string, unknown>,
          })),
          entryPages.map((p) =>
            entryFromTimeEntryPage(p.slug, (p.frontmatter ?? {}) as Record<string, unknown>)
          ),
          period
        );
        if (!cancelled) setStats(stats);
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
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
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

      {capped && <CappedResultsNotice limit={READ_LIMIT} />}

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
                        {hoursFmt(s.billableHours)}
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
