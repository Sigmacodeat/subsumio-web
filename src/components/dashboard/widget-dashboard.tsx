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
    <div className="rounded-md border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-4 py-5 text-center text-sm text-[color:var(--ds-text-muted)]">
      {text}
    </div>
  );
}

function QueuePanel({
  icon: Icon,
  title,
  href,
  action,
  children,
}: {
  icon: typeof Briefcase;
  title: string;
  href: string;
  action: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--ds-border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={15} className="shrink-0 text-[color:var(--ds-text-muted)]" />
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
      {children}
    </section>
  );
}

function QueueRow({
  href,
  icon: Icon,
  title,
  meta,
  badge,
  badgeVariant = "default",
  urgent = false,
}: {
  href: string;
  icon: typeof Briefcase;
  title: string;
  meta: string;
  badge?: string;
  badgeVariant?: "default" | "warning" | "danger" | "success" | "info" | "accent";
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[color:var(--ds-border)] px-4 py-3 last:border-b-0 hover:bg-[color:var(--ds-hover)]"
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-md border ${
          urgent
            ? "border-amber-500/30 bg-amber-500/10"
            : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]"
        }`}
      >
        <Icon
          size={15}
          className={urgent ? "text-amber-600" : "text-[color:var(--ds-text-muted)]"}
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">{title}</p>
        <p className="mt-0.5 truncate text-xs text-[color:var(--ds-text-muted)]">{meta}</p>
      </div>
      {badge && (
        <Badge variant={badgeVariant} className="shrink-0">
          {badge}
        </Badge>
      )}
    </Link>
  );
}

function DeadlineList({ items }: { items: ReturnType<typeof useKanzleiCockpitData>["deadlines"] }) {
  const { t } = useLang();
  return (
    <QueuePanel
      icon={CalendarClock}
      title={t("cockpit.deadlines_title")}
      href="/dashboard/deadlines"
      action={t("cockpit.open")}
    >
      <div>
        {items.slice(0, 6).length === 0 ? (
          <div className="p-3">
            <EmptyLine text={t("cockpit.no_deadlines")} />
          </div>
        ) : (
          items.slice(0, 6).map((item) => {
            const title = text(item.page.title, t("dashboard.unnamed_deadline"));
            return (
              <QueueRow
                key={item.page.slug}
                icon={CalendarClock}
                href={pageHref(item.page, "/dashboard/deadlines")}
                title={title}
                meta={`${formatDate(item.due)} · ${text(item.page.frontmatter?.status, "open")}`}
                urgent={item.overdue || item.critical}
                badge={
                  item.overdue
                    ? t("cockpit.overdue")
                    : item.daysLeft === 0
                      ? t("dashboard.today")
                      : `${item.daysLeft}T`
                }
                badgeVariant={item.overdue ? "danger" : item.critical ? "warning" : "default"}
              />
            );
          })
        )}
      </div>
    </QueuePanel>
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
    <QueuePanel
      icon={Clock}
      title={t("cockpit.today_title")}
      href="/dashboard/workflows"
      action={t("cockpit.plan")}
    >
      <div>
        {tasks.map((task) => {
          const Icon = task.icon;
          return (
            <QueueRow
              key={task.href}
              href={task.href}
              icon={Icon}
              title={task.label}
              meta={task.detail}
              urgent={task.urgent}
              badge={task.urgent ? t("cockpit.task_critical") : undefined}
              badgeVariant="warning"
            />
          );
        })}
      </div>
    </QueuePanel>
  );
}

function InboxList({ items }: { items: DashboardPageLike[] }) {
  const { t } = useLang();
  return (
    <QueuePanel
      icon={Inbox}
      title={t("cockpit.inbox_title")}
      href="/dashboard/intake"
      action={t("cockpit.triage")}
    >
      <div>
        {items.slice(0, 5).length === 0 ? (
          <div className="p-3">
            <EmptyLine text={t("cockpit.no_inbox")} />
          </div>
        ) : (
          items.slice(0, 5).map((item) => {
            const source = item.type === "bea_draft" ? "beA" : t("nav.intake");
            return (
              <QueueRow
                key={item.slug}
                icon={Mail}
                href={item.type === "bea_draft" ? "/dashboard/bea" : "/dashboard/intake"}
                title={text(item.title, t("cockpit.untitled_inbox"))}
                meta={`${source} · ${formatDate(new Date(item.created_at))}`}
                badge={source}
                badgeVariant="info"
              />
            );
          })
        )}
      </div>
    </QueuePanel>
  );
}

function ActiveCasesList({ cases }: { cases: DashboardPageLike[] }) {
  const { t } = useLang();
  return (
    <QueuePanel
      icon={Briefcase}
      title={t("cockpit.cases_title")}
      href="/dashboard/cases"
      action={t("cockpit.open")}
    >
      <div>
        {cases.slice(0, 5).length === 0 ? (
          <div className="p-3">
            <EmptyLine text={t("cockpit.no_cases")} />
          </div>
        ) : (
          cases.slice(0, 5).map((item) => {
            const fm = item.frontmatter ?? {};
            return (
              <QueueRow
                key={item.slug}
                icon={Briefcase}
                href={`/dashboard/cases/${item.slug}`}
                title={text(item.title, t("cases.empty_title"))}
                meta={text(fm.legal_area, t("cockpit.case_area_fallback"))}
                badge={text(fm.status, "open")}
              />
            );
          })
        )}
      </div>
    </QueuePanel>
  );
}

function QuickActions() {
  const { t } = useLang();
  const actions = [
    {
      href: "/dashboard/cases/new",
      icon: Briefcase,
      label: t("cockpit.action_case"),
      tone: "primary",
    },
    {
      href: "/dashboard/deadlines",
      icon: CalendarClock,
      label: t("cockpit.action_deadline"),
      tone: "urgent",
    },
    { href: "/dashboard/intake", icon: Inbox, label: t("cockpit.action_intake"), tone: "urgent" },
    { href: "/dashboard/drafting", icon: PenTool, label: t("cockpit.action_draft") },
    { href: "/dashboard/upload", icon: Upload, label: t("cockpit.action_upload") },
    { href: "/dashboard/chat", icon: MessageSquare, label: t("cockpit.action_ai") },
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--ds-border)] px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
            {t("cockpit.quick_title")}
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
            {t("cockpit.quick_desc")}
          </p>
        </div>
        <Link
          href="/dashboard/workflows"
          className="brand-text inline-flex shrink-0 items-center gap-1 text-xs font-semibold hover:underline"
        >
          {t("cockpit.plan")}
          <ArrowRight size={13} />
        </Link>
      </div>
      <div className="grid gap-px bg-[color:var(--ds-border)] sm:grid-cols-2 xl:grid-cols-6">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className={`group flex h-12 items-center gap-2 bg-[color:var(--ds-surface)] px-3 text-sm font-medium transition-colors hover:bg-[color:var(--ds-hover)] ${
                action.tone === "primary"
                  ? "text-[color:var(--ds-text)]"
                  : action.tone === "urgent"
                    ? "text-[color:var(--accent-gold)]"
                    : "text-[color:var(--ds-text-muted)]"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                  action.tone === "primary"
                    ? "brand-border brand-soft"
                    : action.tone === "urgent"
                      ? "border-[color:var(--accent-gold-border)] bg-[color:var(--accent-gold-soft)]"
                      : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]"
                }`}
              >
                <Icon size={14} className="shrink-0" />
              </span>
              <span className="min-w-0 truncate">{action.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function MetricRail({
  loading,
  items,
}: {
  loading: boolean;
  items: Array<{
    label: string;
    value: number;
    icon: typeof AlertTriangle;
    description: string;
    href: string;
    tone?: "danger" | "warning" | "neutral";
  }>;
}) {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-border)] md:grid-cols-5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            className="group bg-[color:var(--ds-surface)] px-4 py-3 transition-colors hover:bg-[color:var(--ds-hover)]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
                {item.label}
              </span>
              <Icon
                size={15}
                className={
                  item.tone === "danger"
                    ? "text-red-600"
                    : item.tone === "warning"
                      ? "text-amber-600"
                      : "group-hover:brand-text text-[color:var(--ds-text-subtle)]"
                }
              />
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-2xl leading-none font-semibold tracking-tight text-[color:var(--ds-text)] tabular-nums">
                {loading ? "—" : item.value}
              </span>
              <span className="pb-0.5 text-xs text-[color:var(--ds-text-muted)]">
                {item.description}
              </span>
            </div>
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
      href: "/dashboard/deadlines",
      tone: data.criticalDeadlines.length > 0 ? ("danger" as const) : ("neutral" as const),
    },
    {
      label: t("cockpit.stat_cases"),
      value: data.activeCases.length,
      icon: Briefcase,
      description: t("cockpit.stat_cases_desc"),
      href: "/dashboard/cases",
    },
    {
      label: t("cockpit.stat_inbox"),
      value: data.inboxItems.length,
      icon: Inbox,
      description: t("cockpit.stat_inbox_desc"),
      href: "/dashboard/intake",
      tone: data.inboxItems.length > 0 ? ("warning" as const) : ("neutral" as const),
    },
    {
      label: t("cockpit.stat_reviews"),
      value: reviewCount,
      icon: CheckSquare,
      description: t("cockpit.stat_reviews_desc"),
      href: "/dashboard/review-queue",
    },
    {
      label: t("cockpit.stat_billing"),
      value: openInvoiceCount,
      icon: BarChart3,
      description: t("cockpit.stat_billing_desc"),
      href: "/dashboard/invoicing",
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

      <MetricRail loading={data.loading} items={statsCards} />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <TodayList
          cases={data.activeCases}
          criticalDeadlines={data.criticalDeadlines}
          inboxCount={data.inboxItems.length}
          reviewCount={reviewCount}
        />
        <DeadlineList items={data.deadlines} />
      </div>

      <QuickActions />

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <InboxList items={data.inboxItems} />
        <ActiveCasesList cases={data.activeCases} />
        <QueuePanel
          icon={ShieldCheck}
          title={t("cockpit.ai_control_title")}
          href="/dashboard/review-queue"
          action={t("cockpit.review")}
        >
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
        </QueuePanel>
      </div>

      {/* Recent Queries */}
      {data.recent.length > 0 && (
        <QueuePanel
          icon={MessageSquare}
          title="Letzte Anfragen"
          href="/dashboard/chat"
          action="Alle anzeigen"
        >
          <div>
            {data.recent.slice(0, 5).map((rq) => (
              <Link
                key={rq.id ?? rq.query}
                href={`/dashboard/chat?q=${encodeURIComponent(rq.query)}`}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[color:var(--ds-border)] px-4 py-3 last:border-b-0 hover:bg-[color:var(--ds-hover)]"
              >
                <MessageSquare size={14} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                <div className="min-w-0">
                  <p className="truncate text-sm text-[color:var(--ds-text)]">{rq.query}</p>
                  {rq.answer_preview && (
                    <p className="truncate text-xs text-[color:var(--ds-text-subtle)]">
                      {rq.answer_preview}
                    </p>
                  )}
                </div>
                {rq.created_at && (
                  <span className="shrink-0 text-xs text-[color:var(--ds-text-subtle)]">
                    {new Date(rq.created_at).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </QueuePanel>
      )}
    </div>
  );
}
