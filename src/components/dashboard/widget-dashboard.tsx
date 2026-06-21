"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Briefcase,
  CalendarClock,
  CheckSquare,
  Clock,
  FileText,
  Inbox,
  Mail,
  MessageSquare,
  PenTool,
  Scale,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatsCard } from "@/components/dashboard/stats-card";
import { useBrainStats, usePages, useRecentQueries } from "@/lib/queries/brain";
import { useLang } from "@/lib/use-lang";
import type { BrainPage, BrainStats, RecentQuery } from "@/lib/types";

type DashboardPageLike = BrainPage & {
  frontmatter?: Record<string, unknown>;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function dateFrom(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function formatDate(date: Date) {
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

function isOpenStatus(status: unknown) {
  return !["done", "closed", "settled", "won", "lost", "paid", "archived"].includes(
    String(status ?? "").toLowerCase()
  );
}

function pageHref(page: DashboardPageLike, fallback: string) {
  if (!page.slug) return fallback;
  if (page.type === "legal_case") return `/dashboard/cases/${page.slug}`;
  return fallback;
}

function useKanzleiCockpitData() {
  const statsQuery = useBrainStats();
  const recentQuery = useRecentQueries(5);
  const casesQuery = usePages({ type: "legal_case", limit: 50 });
  const deadlinesQuery = usePages({ type: "legal_deadline", limit: 50 });
  const invoicesQuery = usePages({ type: "invoice", limit: 50 });
  const intakeQuery = usePages({ type: "intake_request", limit: 20 });
  const beaQuery = usePages({ type: "bea_draft", limit: 20 });
  const reviewQuery = usePages({ type: "review_item", limit: 20 });

  const cases = Array.isArray(casesQuery.data) ? (casesQuery.data as DashboardPageLike[]) : [];
  const deadlines = Array.isArray(deadlinesQuery.data)
    ? (deadlinesQuery.data as DashboardPageLike[])
    : [];
  const invoices = Array.isArray(invoicesQuery.data)
    ? (invoicesQuery.data as DashboardPageLike[])
    : [];
  const intake = Array.isArray(intakeQuery.data) ? (intakeQuery.data as DashboardPageLike[]) : [];
  const bea = Array.isArray(beaQuery.data) ? (beaQuery.data as DashboardPageLike[]) : [];
  const reviews = Array.isArray(reviewQuery.data) ? (reviewQuery.data as DashboardPageLike[]) : [];
  const recent = (recentQuery.data ?? []) as RecentQuery[];
  const stats = (statsQuery.data ?? null) as BrainStats | null;

  const activeCases = cases.filter((p) => isOpenStatus(p.frontmatter?.status));
  const deadlineItems = deadlines
    .map((p) => {
      const fm = p.frontmatter ?? {};
      const due = dateFrom(fm.due_date ?? fm.date ?? p.created_at);
      if (!due) return null;
      const delta = daysUntil(due);
      return {
        page: p,
        due,
        daysLeft: delta,
        overdue: delta < 0 && isOpenStatus(fm.status),
        critical: delta >= 0 && delta <= 3 && isOpenStatus(fm.status),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const criticalDeadlines = deadlineItems.filter((item) => item.overdue || item.critical);
  const inboxItems = [...intake, ...bea].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const openInvoices = invoices.filter((p) => isOpenStatus(p.frontmatter?.status));
  const pendingReviews = reviews.filter((p) => isOpenStatus(p.frontmatter?.status));

  const degraded =
    statsQuery.isError ||
    casesQuery.isError ||
    deadlinesQuery.isError ||
    invoicesQuery.isError ||
    intakeQuery.isError ||
    beaQuery.isError ||
    reviewQuery.isError;

  return {
    stats,
    recent,
    cases,
    activeCases,
    deadlines: deadlineItems,
    criticalDeadlines,
    inboxItems,
    openInvoices,
    pendingReviews,
    loading:
      casesQuery.isLoading ||
      deadlinesQuery.isLoading ||
      invoicesQuery.isLoading ||
      intakeQuery.isLoading ||
      beaQuery.isLoading ||
      reviewQuery.isLoading,
    degraded,
  };
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[color:var(--ds-border)] px-4 py-5 text-center text-sm text-[color:var(--ds-text-muted)]">
      {text}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  href,
  action,
}: {
  icon: typeof Briefcase;
  title: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--ds-border)] p-4">
      <div className="flex min-w-0 items-center gap-2">
        <Icon size={16} className="shrink-0 text-[color:var(--ds-text-muted)]" />
        <h2 className="truncate text-sm font-semibold text-[color:var(--ds-text)]">{title}</h2>
      </div>
      <Link
        href={href}
        className="brand-text inline-flex shrink-0 items-center gap-1 text-xs font-semibold hover:underline"
      >
        {action}
        <ArrowRight size={13} />
      </Link>
    </div>
  );
}

function DeadlineList({ items }: { items: ReturnType<typeof useKanzleiCockpitData>["deadlines"] }) {
  const { t } = useLang();
  return (
    <Card className="min-h-[320px]">
      <SectionHeader
        icon={CalendarClock}
        title={t("cockpit.deadlines_title")}
        href="/dashboard/deadlines"
        action={t("cockpit.open")}
      />
      <div className="space-y-2 p-3">
        {items.slice(0, 6).length === 0 ? (
          <EmptyLine text={t("cockpit.no_deadlines")} />
        ) : (
          items.slice(0, 6).map((item) => {
            const title = text(item.page.title, t("dashboard.unnamed_deadline"));
            return (
              <Link
                key={item.page.slug}
                href={pageHref(item.page, "/dashboard/deadlines")}
                className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-[color:var(--ds-hover)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {title}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                      {formatDate(item.due)}
                    </p>
                  </div>
                  <Badge
                    variant={item.overdue ? "danger" : item.critical ? "warning" : "default"}
                    className="shrink-0"
                  >
                    {item.overdue
                      ? t("cockpit.overdue")
                      : item.daysLeft === 0
                        ? t("dashboard.today")
                        : `${item.daysLeft}T`}
                  </Badge>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </Card>
  );
}

function TodayList({
  cases,
  criticalDeadlines,
  inboxCount,
  reviewCount,
}: {
  cases: DashboardPageLike[];
  criticalDeadlines: ReturnType<typeof useKanzleiCockpitData>["criticalDeadlines"];
  inboxCount: number;
  reviewCount: number;
}) {
  const { t } = useLang();
  const tasks = [
    {
      href: "/dashboard/deadlines",
      icon: CalendarClock,
      label: t("cockpit.task_deadlines"),
      detail:
        criticalDeadlines.length > 0
          ? `${criticalDeadlines.length} ${t("cockpit.task_critical")}`
          : t("cockpit.task_clear"),
      urgent: criticalDeadlines.length > 0,
    },
    {
      href: "/dashboard/intake",
      icon: Inbox,
      label: t("cockpit.task_inbox"),
      detail: `${inboxCount} ${t("cockpit.task_items")}`,
      urgent: inboxCount > 0,
    },
    {
      href: "/dashboard/review-queue",
      icon: CheckSquare,
      label: t("cockpit.task_reviews"),
      detail: `${reviewCount} ${t("cockpit.task_items")}`,
      urgent: reviewCount > 0,
    },
    {
      href: "/dashboard/cases",
      icon: Briefcase,
      label: t("cockpit.task_cases"),
      detail: `${cases.length} ${t("cockpit.task_active_cases")}`,
      urgent: false,
    },
  ];

  return (
    <Card className="min-h-[320px]">
      <SectionHeader
        icon={Clock}
        title={t("cockpit.today_title")}
        href="/dashboard/workflows"
        action={t("cockpit.plan")}
      />
      <div className="divide-y divide-[color:var(--ds-border)]">
        {tasks.map((task) => {
          const Icon = task.icon;
          return (
            <Link
              key={task.href}
              href={task.href}
              className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-[color:var(--ds-hover)]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
                <Icon
                  size={16}
                  className={task.urgent ? "text-amber-600" : "text-[color:var(--ds-text-muted)]"}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                  {task.label}
                </p>
                <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{task.detail}</p>
              </div>
              <ArrowRight size={14} className="shrink-0 text-[color:var(--ds-text-subtle)]" />
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function InboxList({ items }: { items: DashboardPageLike[] }) {
  const { t } = useLang();
  return (
    <Card>
      <SectionHeader
        icon={Inbox}
        title={t("cockpit.inbox_title")}
        href="/dashboard/intake"
        action={t("cockpit.triage")}
      />
      <div className="space-y-2 p-3">
        {items.slice(0, 5).length === 0 ? (
          <EmptyLine text={t("cockpit.no_inbox")} />
        ) : (
          items.slice(0, 5).map((item) => (
            <Link
              key={item.slug}
              href={item.type === "bea_draft" ? "/dashboard/bea" : "/dashboard/intake"}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[color:var(--ds-hover)]"
            >
              <Mail size={15} className="shrink-0 text-[color:var(--ds-text-muted)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                  {text(item.title, t("cockpit.untitled_inbox"))}
                </p>
                <p className="text-xs text-[color:var(--ds-text-muted)]">
                  {item.type === "bea_draft" ? "beA" : t("nav.intake")}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}

function ActiveCasesList({ cases }: { cases: DashboardPageLike[] }) {
  const { t } = useLang();
  return (
    <Card>
      <SectionHeader
        icon={Briefcase}
        title={t("cockpit.cases_title")}
        href="/dashboard/cases"
        action={t("cockpit.open")}
      />
      <div className="space-y-2 p-3">
        {cases.slice(0, 5).length === 0 ? (
          <EmptyLine text={t("cockpit.no_cases")} />
        ) : (
          cases.slice(0, 5).map((item) => {
            const fm = item.frontmatter ?? {};
            return (
              <Link
                key={item.slug}
                href={`/dashboard/cases/${item.slug}`}
                className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-[color:var(--ds-hover)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {text(item.title, t("cases.empty_title"))}
                    </p>
                    <p className="mt-1 truncate text-xs text-[color:var(--ds-text-muted)]">
                      {text(fm.legal_area, t("cockpit.case_area_fallback"))}
                    </p>
                  </div>
                  <Badge variant="default" className="shrink-0">
                    {text(fm.status, "open")}
                  </Badge>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </Card>
  );
}

function QuickActions() {
  const { t } = useLang();
  const actions = [
    { href: "/dashboard/cases/new", icon: Briefcase, label: t("cockpit.action_case") },
    { href: "/dashboard/deadlines", icon: CalendarClock, label: t("cockpit.action_deadline") },
    { href: "/dashboard/intake", icon: Inbox, label: t("cockpit.action_intake") },
    { href: "/dashboard/drafting", icon: PenTool, label: t("cockpit.action_draft") },
    { href: "/dashboard/upload", icon: Upload, label: t("cockpit.action_upload") },
    { href: "/dashboard/query", icon: MessageSquare, label: t("cockpit.action_ai") },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.href}
            href={action.href}
            className="group flex min-h-20 items-center gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-all hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-hover)]"
          >
            <div className="brand-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
              <Icon size={16} className="brand-text" />
            </div>
            <span className="group-hover:brand-text text-sm leading-snug font-semibold text-[color:var(--ds-text)]">
              {action.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function WidgetDashboard() {
  const { t } = useLang();
  const data = useKanzleiCockpitData();
  const openInvoiceCount = data.openInvoices.length;
  const reviewCount = data.pendingReviews.length;

  const statsCards = [
    {
      label: t("cockpit.stat_deadlines"),
      value: data.criticalDeadlines.length,
      icon: AlertTriangle,
      description: t("cockpit.stat_deadlines_desc"),
    },
    {
      label: t("cockpit.stat_cases"),
      value: data.activeCases.length,
      icon: Briefcase,
      description: t("cockpit.stat_cases_desc"),
    },
    {
      label: t("cockpit.stat_inbox"),
      value: data.inboxItems.length,
      icon: Inbox,
      description: t("cockpit.stat_inbox_desc"),
    },
    {
      label: t("cockpit.stat_reviews"),
      value: reviewCount,
      icon: CheckSquare,
      description: t("cockpit.stat_reviews_desc"),
    },
    {
      label: t("cockpit.stat_billing"),
      value: openInvoiceCount,
      icon: BarChart3,
      description: t("cockpit.stat_billing_desc"),
    },
  ];

  return (
    <div className="space-y-6">
      {data.degraded && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-700" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-800">{t("cockpit.degraded_title")}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-800/80">
                {t("cockpit.degraded_desc")}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {statsCards.map((card) => (
          <StatsCard
            key={card.label}
            title={card.label}
            value={data.loading ? "—" : card.value}
            icon={card.icon}
            description={card.description}
            loading={data.loading}
          />
        ))}
      </div>

      <QuickActions />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <TodayList
          cases={data.activeCases}
          criticalDeadlines={data.criticalDeadlines}
          inboxCount={data.inboxItems.length}
          reviewCount={reviewCount}
        />
        <DeadlineList items={data.deadlines} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <InboxList items={data.inboxItems} />
        <ActiveCasesList cases={data.activeCases} />
        <Card>
          <SectionHeader
            icon={ShieldCheck}
            title={t("cockpit.ai_control_title")}
            href="/dashboard/review-queue"
            action={t("cockpit.review")}
          />
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between rounded-lg border border-[color:var(--ds-border)] px-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Scale size={16} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                <span className="truncate text-sm text-[color:var(--ds-text)]">
                  {t("cockpit.conflicts")}
                </span>
              </div>
              <Link href="/dashboard/kollisionspruefung">
                <Button size="sm" variant="outline">
                  {t("cockpit.check")}
                </Button>
              </Link>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[color:var(--ds-border)] px-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileText size={16} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                <span className="truncate text-sm text-[color:var(--ds-text)]">
                  {t("cockpit.documents")}
                </span>
              </div>
              <Link href="/dashboard/analyze">
                <Button size="sm" variant="outline">
                  {t("cockpit.analyze")}
                </Button>
              </Link>
            </div>
            <div className="rounded-lg bg-[color:var(--ds-surface-2)] px-3 py-3 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              {data.stats
                ? `${data.stats.total_pages} ${t("cockpit.brain_pages")} · ${data.stats.total_queries} ${t("cockpit.brain_queries")}`
                : t("cockpit.brain_degraded")}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
