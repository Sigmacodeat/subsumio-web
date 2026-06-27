"use client";

import {
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Receipt,
  Users,
  ShieldAlert,
  Briefcase,
  ArrowRight,
  Scale,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/use-lang";
import type { CaseDetail } from "@/app/dashboard/cases/[...slug]/page";
import type { DashboardKey } from "@/content/dashboard";
import { cn } from "@/lib/utils";

interface CaseOverviewWidgetsProps {
  caseData: CaseDetail;
  onTabChange?: (tab: string) => void;
}

interface DeadlineLike {
  status?: string;
  due_date?: string;
  date?: string;
  title?: string;
}

interface TaskLike {
  done?: boolean;
}

interface TimeEntryLike {
  billable?: boolean;
  billed?: boolean;
  minutes: number;
}

interface ExpenseLike {
  billable?: boolean;
  billed?: boolean;
  amount: number;
}

interface DocumentLike {
  name?: string;
  kind?: string;
}

function WidgetCard({
  icon: Icon,
  title,
  children,
  onClick,
}: {
  icon: typeof Briefcase;
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        "rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 shadow-[var(--card-shadow)]",
        onClick &&
          "cursor-pointer transition-colors hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Icon size={15} className="text-[color:var(--ds-text-muted)]" />
        <h3 className="text-[13px] font-semibold text-[color:var(--ds-text)]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function CaseOverviewWidgets({ caseData, onTabChange }: CaseOverviewWidgetsProps) {
  const { t, lang } = useLang();

  const deadlines = (caseData.deadlines ?? []) as DeadlineLike[];
  const tasks = (caseData.tasks ?? []) as TaskLike[];
  const timeEntries = (caseData.timeEntries ?? []) as TimeEntryLike[];
  const expenses = (caseData.expenses ?? []) as ExpenseLike[];
  const documents = (caseData.documents ?? []) as DocumentLike[];

  const activeDeadlines = deadlines.filter((d: DeadlineLike) => d.status !== "done");
  const criticalDeadlines = activeDeadlines.filter((dl: DeadlineLike) => {
    const days = daysUntil(dl.due_date || dl.date || "");
    return days <= 3;
  });
  const openTasks = tasks.filter((t: TaskLike) => !t.done).length;
  const unbilledMinutes = timeEntries
    .filter((e: TimeEntryLike) => e.billable !== false && !e.billed)
    .reduce((sum: number, e: TimeEntryLike) => sum + e.minutes, 0);
  const unbilledExpenses = expenses
    .filter((e: ExpenseLike) => e.billable !== false && !e.billed)
    .reduce((sum: number, e: ExpenseLike) => sum + e.amount, 0);

  const formatMinutes = (m: number) =>
    m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m}min`;

  const hasConflict = caseData.conflictStatus === "conflict_pending";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Status & Next Action */}
      <WidgetCard icon={Scale} title={t("cases.widget.status" as DashboardKey)}>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg border",
              hasConflict
                ? "border-amber-500/20 bg-amber-500/10"
                : "border-emerald-500/20 bg-emerald-500/10"
            )}
          >
            {hasConflict ? (
              <ShieldAlert size={18} className="text-amber-600" />
            ) : (
              <CheckCircle2 size={18} className="text-emerald-600" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              {hasConflict
                ? t("cases.detail_conflict_pending" as DashboardKey)
                : t("cases.widget.status_ok" as DashboardKey)}
            </p>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {caseData.status === "open" && activeDeadlines.length > 0
                ? t("cases.widget.next_deadline" as DashboardKey)
                : t("cases.widget.no_blockers" as DashboardKey)}
            </p>
          </div>
        </div>
        {activeDeadlines.length > 0 && (
          <div className="mt-3 border-t border-[color:var(--ds-border)] pt-3">
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {activeDeadlines[0].title || t("cases.widget.unnamed_deadline" as DashboardKey)}{" "}
              <span
                className={cn(
                  "font-medium",
                  criticalDeadlines.length > 0 ? "text-red-600" : "text-[color:var(--ds-text)]"
                )}
              >
                {daysUntil(activeDeadlines[0].due_date || activeDeadlines[0].date || "") <= 0
                  ? t("cases.widget.due_today" as DashboardKey)
                  : `${t("cases.widget.due_in" as DashboardKey)} ${daysUntil(activeDeadlines[0].due_date || activeDeadlines[0].date || "")}T`}
              </span>
            </p>
          </div>
        )}
      </WidgetCard>

      {/* Parties */}
      <WidgetCard icon={Users} title={t("cases.widget.parties" as DashboardKey)}>
        <div className="space-y-2">
          {caseData.clientName && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[color:var(--ds-text-muted)]">
                {t("casesnew.label_client" as DashboardKey)}
              </span>
              <span className="font-medium text-[color:var(--ds-text)]">{caseData.clientName}</span>
            </div>
          )}
          {caseData.opponentName && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[color:var(--ds-text-muted)]">
                {t("casesnew.label_opponent" as DashboardKey)}
              </span>
              <span className="font-medium text-[color:var(--ds-text)]">
                {caseData.opponentName}
              </span>
            </div>
          )}
          {caseData.courtName && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[color:var(--ds-text-muted)]">
                {t("casesnew.label_court" as DashboardKey)}
              </span>
              <span className="font-medium text-[color:var(--ds-text)]">{caseData.courtName}</span>
            </div>
          )}
          {!caseData.clientName && !caseData.opponentName && !caseData.courtName && (
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              {t("cases.widget.no_parties" as DashboardKey)}
            </p>
          )}
        </div>
      </WidgetCard>

      {/* Deadlines & Tasks */}
      <WidgetCard
        icon={CalendarClock}
        title={t("cases.widget.deadlines" as DashboardKey)}
        onClick={() => onTabChange?.("deadlines_tasks")}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
            <Clock size={18} className="text-[color:var(--ds-text-muted)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              {activeDeadlines.length} {t("cases.widget.open_deadlines" as DashboardKey)}
            </p>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {criticalDeadlines.length > 0
                ? `${criticalDeadlines.length} ${t("cases.widget.critical" as DashboardKey)}`
                : t("cases.widget.no_critical" as DashboardKey)}
            </p>
          </div>
          {criticalDeadlines.length > 0 && (
            <Badge variant="danger" className="shrink-0">
              {criticalDeadlines.length}
            </Badge>
          )}
        </div>
        <div className="mt-3 border-t border-[color:var(--ds-border)] pt-3">
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            {openTasks} {t("cases.widget.open_tasks" as DashboardKey)}
          </p>
        </div>
      </WidgetCard>

      {/* Documents */}
      <WidgetCard
        icon={FileText}
        title={t("cases.widget.documents" as DashboardKey)}
        onClick={() => onTabChange?.("documents")}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
            <FileText size={18} className="text-[color:var(--ds-text-muted)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              {documents.length} {t("cases.widget.document_count" as DashboardKey)}
            </p>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {documents.length === 0
                ? t("cases.widget.no_documents" as DashboardKey)
                : t("cases.widget.document_hint" as DashboardKey)}
            </p>
          </div>
        </div>
      </WidgetCard>

      {/* Billing */}
      <WidgetCard
        icon={Receipt}
        title={t("cases.widget.billing" as DashboardKey)}
        onClick={() => onTabChange?.("billing")}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
            <Receipt size={18} className="text-[color:var(--ds-text-muted)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              {unbilledMinutes > 0
                ? formatMinutes(unbilledMinutes)
                : t("cases.widget.no_time" as DashboardKey)}
            </p>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {unbilledExpenses > 0
                ? `${unbilledExpenses.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} € ${t("cases.widget.expenses" as DashboardKey)}`
                : t("cases.widget.no_expenses" as DashboardKey)}
            </p>
          </div>
        </div>
      </WidgetCard>

      {/* AI / Strategy */}
      <WidgetCard
        icon={Scale}
        title={t("cases.widget.strategy" as DashboardKey)}
        onClick={() => onTabChange?.("strategy")}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[color:var(--brand-primary)]/20 bg-[color:var(--brand-glow)]">
            <Scale size={18} className="brand-text" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[color:var(--ds-text)]">
              {t("cases.widget.ai_ready" as DashboardKey)}
            </p>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {t("cases.widget.ai_hint" as DashboardKey)}
            </p>
          </div>
          <ArrowRight size={14} className="text-[color:var(--ds-text-subtle)]" />
        </div>
      </WidgetCard>
    </div>
  );
}
