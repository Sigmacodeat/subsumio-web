"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarCheck, Loader2, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  checkSingleDeadline,
  parseDeadlineCalendarPage,
  type DeadlineCheckResult,
} from "@/lib/deadline-post-check";

interface DeadlineCalendarPage {
  slug: string;
  title: string;
  frontmatter?: Record<string, unknown>;
  content?: string;
}

async function fetchDeadlineChecks(): Promise<DeadlineCheckResult[]> {
  const pages = await api.brain.listPages({ type: "deadline_calendar", limit: 100 });
  const results: DeadlineCheckResult[] = [];

  for (const page of pages as DeadlineCalendarPage[]) {
    const fm = page.frontmatter ?? {};
    const caseSlug = String(fm.case_ref ?? page.slug.replace("deadline-calendars/", ""));
    const caseTitle = String(fm.title ?? caseSlug).replace(/^Fristenkalender — /, "");
    const content = page.content ?? "";

    const entries = parseDeadlineCalendarPage(content, caseSlug, caseTitle);

    for (const entry of entries) {
      const result = checkSingleDeadline(
        caseSlug,
        caseTitle,
        entry.label,
        entry.date,
        entry.startDate,
        entry.law
      );
      if (result) results.push(result);
    }
  }

  // Sort: critical first, then warnings, then ok
  const severityOrder = { critical: 0, warning: 1, ok: 2 };
  return results.sort((a, b) => {
    const orderDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (orderDiff !== 0) return orderDiff;
    return Math.abs(b.discrepancyDays) - Math.abs(a.discrepancyDays);
  });
}

export function DeadlineCheckWidget() {
  const { lang } = useLang();
  const isEn = lang === "en";
  const { data, isLoading } = useQuery<DeadlineCheckResult[]>({
    queryKey: ["deadline-post-check"],
    queryFn: fetchDeadlineChecks,
    staleTime: 120_000,
    refetchInterval: 300_000,
  });

  const stats = useMemo(() => {
    if (!data) return { total: 0, matched: 0, discrepancies: 0, critical: 0, warnings: 0 };
    return {
      total: data.length,
      matched: data.filter((r) => r.severity === "ok").length,
      discrepancies: data.filter((r) => r.severity !== "ok").length,
      critical: data.filter((r) => r.severity === "critical").length,
      warnings: data.filter((r) => r.severity === "warning").length,
    };
  }, [data]);

  if (isLoading) {
    return (
      <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <CalendarCheck size={15} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Deadline Verification" : "Fristen-Kontrolle"}
          </span>
        </div>
        <div className="flex h-20 items-center justify-center">
          <Loader2 size={18} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      </section>
    );
  }

  if (!data || data.length === 0) {
    return (
      <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <CalendarCheck size={15} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Deadline Verification" : "Fristen-Kontrolle"}
          </span>
        </div>
        <p className="text-[13px] text-[color:var(--ds-text-muted)]">
          {isEn
            ? "No deadlines to verify yet. Deadlines detected by AI analysis are cross-checked here automatically."
            : "Noch keine Fristen zu prüfen. KI-erkannte Fristen werden hier automatisch gegengeprüft."}
        </p>
      </section>
    );
  }

  const discrepancies = data.filter((r) => r.severity !== "ok");

  return (
    <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarCheck size={15} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Deadline Verification" : "Fristen-Kontrolle"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {stats.critical > 0 && (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
              {stats.critical} {isEn ? "critical" : "kritisch"}
            </span>
          )}
          {stats.warnings > 0 && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
              {stats.warnings} {isEn ? "warnings" : "Warnungen"}
            </span>
          )}
          {stats.matched > 0 && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
              {stats.matched} ✓
            </span>
          )}
        </div>
      </div>

      {/* Summary line */}
      <p className="mb-3 text-[11px] text-[color:var(--ds-text-subtle)]">
        {isEn
          ? `${stats.matched}/${stats.total} deadlines match the statutory calculation`
          : `${stats.matched}/${stats.total} Fristen stimmen mit der gesetzlichen Fristberechnung überein`}
      </p>

      {/* Discrepancy list */}
      {discrepancies.length > 0 ? (
        <div className="space-y-1.5">
          {discrepancies.slice(0, 8).map((r, i) => {
            const encoded = r.caseSlug.split("/").map(encodeURIComponent).join("/");
            const Icon = r.severity === "critical" ? AlertCircle : AlertTriangle;
            const iconColor = r.severity === "critical" ? "text-red-600" : "text-amber-600";
            const borderClasses =
              r.severity === "critical"
                ? "border-red-500/30 bg-red-500/5"
                : "border-amber-500/30 bg-amber-500/5";

            return (
              <Link
                key={`${r.caseSlug}-${i}`}
                href={`/dashboard/cases/${encoded}`}
                className={cn(
                  "group flex items-start gap-2 rounded-md border px-2 py-1.5 transition-colors hover:opacity-80",
                  borderClasses
                )}
              >
                <Icon size={14} className={cn("mt-0.5 shrink-0", iconColor)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-[color:var(--ds-text)]">
                    {r.deadlineLabel}
                  </p>
                  <p className="truncate text-[11px] text-[color:var(--ds-text-muted)]">
                    {r.caseTitle} · {isEn ? "AI" : "KI"}: {r.aiDate} → {isEn ? "check" : "Prüfung"}:{" "}
                    {r.deterministicDate}
                    <span className={cn("ml-1 font-semibold", iconColor)}>
                      ({r.discrepancyDays > 0 ? "+" : ""}
                      {r.discrepancyDays}d)
                    </span>
                  </p>
                  <p className="truncate text-[10px] text-[color:var(--ds-text-subtle)]">
                    {r.ruleLaw}
                  </p>
                </div>
              </Link>
            );
          })}
          {discrepancies.length > 8 && (
            <p className="px-1 text-[11px] text-[color:var(--ds-text-subtle)]">
              {isEn ? `+${discrepancies.length - 8} more` : `+${discrepancies.length - 8} weitere`}
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5">
          <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
          <p className="text-[12px] text-emerald-700">
            {isEn
              ? "All deadlines match the statutory calculation."
              : "Alle Fristen stimmen mit der gesetzlichen Fristberechnung überein."}
          </p>
        </div>
      )}
    </section>
  );
}
