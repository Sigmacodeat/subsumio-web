"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Wallet,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
} from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  computeBudgetStatus,
  FEE_MODEL_LABELS,
  type FeeAgreement,
  type BudgetStatus,
} from "@/lib/fee-agreements";
import type { TimeEntry, ExpenseEntry } from "@/lib/legal-types";

interface MatterBudget {
  agreement: FeeAgreement;
  status: BudgetStatus;
  trackedMinutes: number;
  expenseTotal: number;
  billedAmount: number;
  caseTitle: string;
}

interface CasePage {
  slug: string;
  title: string;
  frontmatter?: Record<string, unknown>;
  content?: string;
}

async function fetchMatterBudgets(): Promise<MatterBudget[]> {
  // Fetch all fee agreements
  const agreementPages = await api.brain.listPages({ type: "fee_agreement", limit: 200 });
  const agreements = agreementPages.map((p) => p.frontmatter as unknown as FeeAgreement);

  // Fetch case pages to get time entries and expenses
  const casePages = await api.brain.listPages({ type: "case", limit: 200 });
  const caseMap = new Map<string, CasePage>();
  for (const page of casePages as CasePage[]) {
    caseMap.set(page.slug, page);
    // Also map by case_slug frontmatter
    const caseRef = page.frontmatter?.case_ref ?? page.frontmatter?.case_slug;
    if (caseRef) caseMap.set(String(caseRef), page);
  }

  const budgets: MatterBudget[] = [];

  for (const agreement of agreements) {
    const casePage = caseMap.get(agreement.case_slug);
    let timeEntries: TimeEntry[] = [];
    let expenses: ExpenseEntry[] = [];

    if (casePage) {
      try {
        const raw = casePage.content ?? "";
        const parsed = JSON.parse(raw) as {
          time_entries?: TimeEntry[];
          expenses?: ExpenseEntry[];
        };
        if (Array.isArray(parsed.time_entries)) timeEntries = parsed.time_entries;
        if (Array.isArray(parsed.expenses)) expenses = parsed.expenses;
      } catch {
        // Try frontmatter
        const fm = casePage.frontmatter ?? {};
        if (Array.isArray(fm.time_entries)) timeEntries = fm.time_entries as TimeEntry[];
        if (Array.isArray(fm.expenses)) expenses = fm.expenses as ExpenseEntry[];
      }
    }

    const trackedMinutes = timeEntries
      .filter((e) => e.billable !== false)
      .reduce((sum, e) => sum + (e.minutes || 0), 0);

    const expenseTotal = expenses
      .filter((e) => e.billable !== false)
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const billedAmount = timeEntries
      .filter((e) => e.billed === true)
      .reduce((sum, e) => sum + (e.rate ?? agreement.hourly_rate ?? 0) * (e.minutes / 60), 0);

    const status = computeBudgetStatus(agreement, {
      minutes: trackedMinutes,
      hourlyRate: agreement.hourly_rate,
      billedAmount,
    });

    budgets.push({
      agreement,
      status,
      trackedMinutes,
      expenseTotal,
      billedAmount,
      caseTitle: casePage?.title ?? agreement.case_slug,
    });
  }

  // Sort: critical first, then warning, then by utilization descending
  const alertOrder = { critical: 0, warning: 1, none: 2 };
  return budgets.sort((a, b) => {
    const alertDiff = alertOrder[a.status.alert_level] - alertOrder[b.status.alert_level];
    if (alertDiff !== 0) return alertDiff;
    return b.status.utilization - a.status.utilization;
  });
}

export function MatterBudgetWidget() {
  const { lang } = useLang();
  const isEn = lang === "en";
  const { data, isLoading } = useQuery<MatterBudget[]>({
    queryKey: ["matter-budgets"],
    queryFn: fetchMatterBudgets,
    staleTime: 120_000,
    refetchInterval: 300_000,
  });

  const stats = useMemo(() => {
    if (!data) return { total: 0, critical: 0, warning: 0, ok: 0, totalValue: 0, totalBudget: 0 };
    return {
      total: data.length,
      critical: data.filter((b) => b.status.alert_level === "critical").length,
      warning: data.filter((b) => b.status.alert_level === "warning").length,
      ok: data.filter((b) => b.status.alert_level === "none").length,
      totalValue: data.reduce((sum, b) => sum + b.status.total_value, 0),
      totalBudget: data.reduce((sum, b) => sum + (b.status.budget_cap ?? 0), 0),
    };
  }, [data]);

  if (isLoading) {
    return (
      <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <Wallet size={15} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Matter Budgets" : "Akten-Budgets"}
          </span>
        </div>
        <div className="flex h-20 items-center justify-center" role="status" aria-live="polite">
          <Loader2 size={18} className="animate-spin text-[color:var(--ds-text-muted)]" />
        </div>
      </section>
    );
  }

  if (!data || data.length === 0) {
    return (
      <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <Wallet size={15} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Matter Budgets" : "Akten-Budgets"}
          </span>
        </div>
        <p className="text-[13px] text-[color:var(--ds-text-muted)]">
          {isEn
            ? "No fee agreements found. Create one to start tracking matter budgets."
            : "Keine Honorarvereinbarungen gefunden. Erstellen Sie eine, um Akten-Budgets zu verfolgen."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet size={15} className="text-[color:var(--ds-text-muted)]" />
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Matter Budgets" : "Akten-Budgets"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {stats.critical > 0 && (
            <span className="rounded-full border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--ds-danger-text)]">
              {stats.critical} {isEn ? "over" : "über"}
            </span>
          )}
          {stats.warning > 0 && (
            <span className="rounded-full border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--ds-warning-text)]">
              {stats.warning} {isEn ? "near" : "nah"}
            </span>
          )}
          {stats.ok > 0 && (
            <span className="rounded-full border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--ds-success-text)]">
              {stats.ok} ✓
            </span>
          )}
        </div>
      </div>

      {/* Summary */}
      {stats.totalBudget > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-2 py-1.5">
            <span className="text-[color:var(--ds-text-muted)]">
              {isEn ? "Tracked value" : "Erfasster Wert"}
            </span>
            <p className="font-semibold text-[color:var(--ds-text)] tabular-nums">
              {stats.totalValue.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
            </p>
          </div>
          <div className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-2 py-1.5">
            <span className="text-[color:var(--ds-text-muted)]">
              {isEn ? "Total budget" : "Gesamtbudget"}
            </span>
            <p className="font-semibold text-[color:var(--ds-text)] tabular-nums">
              {stats.totalBudget.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
            </p>
          </div>
        </div>
      )}

      {/* Budget list */}
      <div className="space-y-2">
        {data.slice(0, 8).map((budget) => {
          const encoded = budget.agreement.case_slug.split("/").map(encodeURIComponent).join("/");
          const pct = Math.round(budget.status.utilization * 100);
          const isOver = budget.status.alert_level === "critical";
          const isWarning = budget.status.alert_level === "warning";
          const barColor = isOver
            ? "bg-[color:var(--ds-danger-solid)]"
            : isWarning
              ? "bg-[color:var(--ds-warning-solid)]"
              : "bg-[color:var(--ds-success-solid)]";
          const Icon = isOver ? AlertTriangle : isWarning ? TrendingUp : CheckCircle2;
          const iconColor = isOver
            ? "text-[color:var(--ds-danger-text)]"
            : isWarning
              ? "text-[color:var(--ds-warning-text)]"
              : "text-[color:var(--ds-success-text)]";

          return (
            <Link
              key={budget.agreement.id}
              href={`/dashboard/fee-agreements`}
              className="group block rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-bg)] px-2 py-2 transition-colors hover:opacity-80"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Icon size={12} className={cn("shrink-0", iconColor)} />
                  <span className="truncate text-[12px] font-medium text-[color:var(--ds-text)]">
                    {budget.caseTitle}
                  </span>
                </div>
                <span className={cn("shrink-0 text-[11px] font-semibold tabular-nums", iconColor)}>
                  {pct}%
                </span>
              </div>

              {/* Progress bar */}
              {budget.status.budget_cap && budget.status.budget_cap > 0 ? (
                <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--ds-border)]">
                  <div
                    className={cn("h-full rounded-full transition-all", barColor)}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              ) : null}

              <div className="flex items-center justify-between text-[10px] text-[color:var(--ds-text-subtle)]">
                <span>
                  {FEE_MODEL_LABELS[budget.agreement.model][isEn ? "en" : "de"]}
                  {budget.trackedMinutes > 0 && ` · ${Math.round(budget.trackedMinutes / 60)}h`}
                </span>
                <span className="tabular-nums">
                  {budget.status.total_value.toLocaleString("de-DE", {
                    style: "currency",
                    currency: "EUR",
                  })}
                  {budget.status.budget_cap &&
                    ` / ${budget.status.budget_cap.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`}
                </span>
              </div>
            </Link>
          );
        })}
        {data.length > 8 && (
          <p className="px-1 text-[11px] text-[color:var(--ds-text-subtle)]">
            {isEn ? `+${data.length - 8} more` : `+${data.length - 8} weitere`}
          </p>
        )}
      </div>
    </section>
  );
}
