"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  CheckSquare,
  Circle,
  FileText,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  PenTool,
  Pin,
  PinOff,
  Scale,
  Sparkles,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useBrainStats, useCockpitData } from "@/lib/queries/brain";
import { useRecentMatters } from "@/lib/use-recent-matters";
import { useLang } from "@/lib/use-lang";
import type { Lang } from "@/content/site";
import type { BrainPage, BrainStats, RecentQuery } from "@/lib/types";
import { StaggerContainer, StaggerItem } from "@/components/marketing/motion-system";
import dynamic from "next/dynamic";

const KanzleiInsights = dynamic(() => import("./kanzlei-insights").then((m) => m.KanzleiInsights), {
  loading: () => (
    <div className="flex h-48 items-center justify-center text-sm text-[color:var(--ds-text-muted)]">
      Laden…
    </div>
  ),
});

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

function formatDate(date: Date, lang: Lang = "de") {
  return date.toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
    day: "2-digit",
    month: "short",
  });
}

function isOpenStatus(status: unknown) {
  return ![
    "done",
    "closed",
    "settled",
    "won",
    "lost",
    "paid",
    "archived",
    "approved",
    "rejected",
    "fulfilled",
    "signed",
    "declined",
    "cancelled",
    "canceled",
  ].includes(String(status ?? "").toLowerCase());
}

function pageHref(page: DashboardPageLike, fallback: string) {
  if (!page.slug) return fallback;
  if (page.type === "legal_case") return `/dashboard/cases/${page.slug}`;
  return fallback;
}

export type CockpitData = ReturnType<typeof useKanzleiCockpitData>;

export function useKanzleiCockpitData() {
  const cockpitQuery = useCockpitData({ recentLimit: 5 });
  const statsQuery = useBrainStats();

  const pages = cockpitQuery.data?.pages ?? {};
  const cases = (pages.legal_case ?? []) as DashboardPageLike[];
  const deadlines = (pages.legal_deadline ?? []) as DashboardPageLike[];
  const invoices = (pages.invoice ?? []) as DashboardPageLike[];
  const intake = (pages.intake_request ?? []) as DashboardPageLike[];
  const bea = (pages.bea_draft ?? []) as DashboardPageLike[];
  const beaMessages = (pages.bea_message ?? []) as DashboardPageLike[];
  const documentRequests = (pages.document_request ?? []) as DashboardPageLike[];
  const signatures = (pages.signature_request ?? []) as DashboardPageLike[];
  const reviews = (pages.review_item ?? []) as DashboardPageLike[];
  const agentActions = (pages.agent_action ?? []) as DashboardPageLike[];
  const docs = [
    ...((pages.document ?? []) as DashboardPageLike[]),
    ...((pages.legal_document ?? []) as DashboardPageLike[]),
  ];
  const recent = (cockpitQuery.data?.recent ?? []) as RecentQuery[];
  const stats = (statsQuery.data ?? cockpitQuery.data?.stats ?? null) as BrainStats | null;

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
  const unassignedDocs = docs.filter((d) => {
    const fm = d.frontmatter ?? {};
    return !fm.case_slug && fm.assignment_status !== "assigned";
  });
  const reviewGaps = docs.filter((d) => {
    const fm = d.frontmatter ?? {};
    const es = fm.extraction_status;
    const as = fm.analysis_status;
    return (
      es === "ocr_needed" ||
      es === "ocr_failed" ||
      es === "uploaded" ||
      es === "processing" ||
      es === "ocr_processing" ||
      fm.extraction_unverified === true ||
      as === "failed" ||
      as === "pending"
    );
  });
  const openDocumentRequests = documentRequests.filter((p) =>
    ["draft", "sent", "partially_fulfilled"].includes(
      String(p.frontmatter?.status ?? "").toLowerCase()
    )
  );
  const pendingSignatures = signatures.filter((p) => isOpenStatus(p.frontmatter?.status));
  const inboxItems = [...intake, ...bea, ...beaMessages].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const openInvoices = invoices.filter((p) => isOpenStatus(p.frontmatter?.status));
  const pendingReviews = [...reviews, ...agentActions].filter((p) =>
    isOpenStatus(p.frontmatter?.status)
  );

  const degraded = cockpitQuery.isError;
  const loading = cockpitQuery.isLoading;

  return {
    stats,
    recent,
    cases,
    activeCases,
    deadlines: deadlineItems,
    criticalDeadlines,
    unassignedDocs,
    reviewGaps,
    inboxItems,
    openInvoices,
    pendingReviews,
    openDocumentRequests,
    pendingSignatures,
    loading,
    degraded,
  };
}

export function EmptyLine({ text, icon: Icon = Inbox }: { text: string; icon?: typeof Inbox }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-4 py-6 text-center">
      <Icon size={20} className="text-[color:var(--ds-text-subtle)]" />
      <p className="text-sm text-[color:var(--ds-text-muted)]">{text}</p>
    </div>
  );
}

export function QueuePanel({
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
    <section className="overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--card-shadow)]">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--ds-border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={15} className="shrink-0 text-[color:var(--ds-text-muted)]" />
          <h2 className="truncate text-[15px] font-semibold text-[color:var(--ds-text)]">
            {title}
          </h2>
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

export function QueueRow({
  href,
  icon: Icon,
  title,
  meta,
  badge,
  badgeVariant = "default",
  urgent = false,
  pin,
}: {
  href: string;
  icon: typeof Briefcase;
  title: string;
  meta: string;
  badge?: string;
  badgeVariant?: "default" | "warning" | "danger" | "success" | "info" | "accent";
  urgent?: boolean;
  pin?: { pinned: boolean; onToggle: () => void; pinLabel: string; unpinLabel: string };
}) {
  const inner = (
    <>
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-md border ${
          urgent
            ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]"
            : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]"
        }`}
      >
        <Icon
          size={15}
          className={
            urgent ? "text-[color:var(--ds-warning-text)]" : "text-[color:var(--ds-text-muted)]"
          }
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
    </>
  );

  if (!pin) {
    return (
      <Link
        href={href}
        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[color:var(--ds-border)] px-4 py-2.5 last:border-b-0 hover:bg-[color:var(--ds-hover)]"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="group flex items-center border-b border-[color:var(--ds-border)] pr-2 last:border-b-0 hover:bg-[color:var(--ds-hover)]">
      <Link
        href={href}
        className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5"
      >
        {inner}
      </Link>
      <button
        type="button"
        onClick={pin.onToggle}
        aria-label={pin.pinned ? pin.unpinLabel : pin.pinLabel}
        title={pin.pinned ? pin.unpinLabel : pin.pinLabel}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-text)] ${
          pin.pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        }`}
      >
        {pin.pinned ? (
          <Pin size={13} className="fill-current text-[var(--brand-primary)]" />
        ) : (
          <Pin size={13} />
        )}
      </button>
    </div>
  );
}

export function DeadlineList({
  items,
}: {
  items: ReturnType<typeof useKanzleiCockpitData>["deadlines"];
}) {
  const { t, lang } = useLang();
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
                meta={`${formatDate(item.due, lang)} · ${text(item.page.frontmatter?.status, "open")}`}
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

export function InboxList({ items }: { items: DashboardPageLike[] }) {
  const { t, lang } = useLang();
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
                meta={`${source} · ${formatDate(new Date(item.created_at), lang)}`}
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

function titleFromSlug(slug: string) {
  const tail = slug.split("/").pop() ?? slug;
  return tail.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PinnedMatters({ cases }: { cases: DashboardPageLike[] }) {
  const { t } = useLang();
  const { pinned, recent, togglePin, isPinned } = useRecentMatters();

  const bySlug = new Map(cases.filter((c) => c.slug).map((c) => [c.slug, c]));
  const orderedSlugs = [...pinned, ...recent.filter((s) => !pinned.includes(s))];
  if (orderedSlugs.length === 0) return null;

  return (
    <div className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Pin size={14} className="shrink-0 text-[color:var(--ds-text-muted)]" />
        <span className="text-sm font-semibold text-[color:var(--ds-text)]">
          {t("cockpit.pinned_title")}
        </span>
        <span className="truncate text-xs text-[color:var(--ds-text-subtle)]">
          {t("cockpit.pinned_hint")}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {orderedSlugs.map((slug) => {
          const found = bySlug.get(slug);
          const label = text(found?.title, titleFromSlug(slug));
          const pinnedNow = isPinned(slug);
          return (
            <div
              key={slug}
              className="group flex items-center gap-1 rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] pr-1 pl-1 transition-colors hover:border-[color:var(--ds-border-strong)]"
            >
              <Link
                href={`/dashboard/cases/${slug}`}
                title={label}
                className="flex items-center gap-2 rounded-full py-1.5 pr-1 pl-2 text-sm text-[color:var(--ds-text)]"
              >
                <Briefcase size={13} className="shrink-0 text-[color:var(--ds-text-muted)]" />
                <span className="max-w-[180px] truncate">{label}</span>
              </Link>
              <button
                type="button"
                onClick={() => togglePin(slug)}
                aria-label={pinnedNow ? t("cockpit.unpin") : t("cockpit.pin")}
                title={pinnedNow ? t("cockpit.unpin") : t("cockpit.pin")}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              >
                {pinnedNow ? (
                  <Pin size={12} className="fill-current text-[var(--brand-primary)]" />
                ) : (
                  <PinOff size={12} />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ActiveCasesList({ cases }: { cases: DashboardPageLike[] }) {
  const { t } = useLang();
  const { togglePin, isPinned } = useRecentMatters();
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
                pin={
                  item.slug
                    ? {
                        pinned: isPinned(item.slug),
                        onToggle: () => togglePin(item.slug),
                        pinLabel: t("cockpit.pin"),
                        unpinLabel: t("cockpit.unpin"),
                      }
                    : undefined
                }
              />
            );
          })
        )}
      </div>
    </QueuePanel>
  );
}

export function QuickActions() {
  const { t } = useLang();
  const actions = [
    {
      href: "#",
      event: "subsumio:create-case",
      icon: Briefcase,
      label: t("cockpit.action_case"),
      isButton: true,
    },
    { href: "/dashboard/kollisionspruefung", icon: Scale, label: t("cockpit.action_conflict") },
    {
      href: "#",
      event: "subsumio:create-deadline",
      icon: CalendarClock,
      label: t("cockpit.action_deadline"),
      isButton: true,
    },
    { href: "/dashboard/intake", icon: Inbox, label: t("cockpit.action_intake") },
    { href: "/dashboard/drafting", icon: PenTool, label: t("cockpit.action_draft") },
    { href: "/dashboard/upload", icon: Upload, label: t("cockpit.action_upload") },
    { href: "/dashboard/chat", icon: MessageSquare, label: t("cockpit.action_ai") },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actions.map((action) => {
        const Icon = action.icon;
        if (action.isButton) {
          return (
            <button
              key={action.label}
              onClick={() => window.dispatchEvent(new CustomEvent(action.event!))}
              className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-[13px] font-medium text-[color:var(--ds-text-muted)] transition-colors hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            >
              <Icon size={13} className="shrink-0" />
              <span className="min-w-0 truncate">{action.label}</span>
            </button>
          );
        }
        return (
          <Link
            key={action.href}
            href={action.href}
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-[13px] font-medium text-[color:var(--ds-text-muted)] transition-colors hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
          >
            <Icon size={13} className="shrink-0" />
            <span className="min-w-0 truncate">{action.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

// ── HeutePanel — calm "today" list, no hero numbers ───────────────────

type DeadlineItem = ReturnType<typeof useKanzleiCockpitData>["deadlines"][number];

export function HeutePanel({
  loading,
  criticalDeadlines,
  deadlines,
  inboxCount,
  reviewCount,
  documentRequestCount,
  signatureCount,
  gapsCount: _gapsCount,
}: {
  loading: boolean;
  criticalDeadlines: DeadlineItem[];
  deadlines: DeadlineItem[];
  inboxCount: number;
  reviewCount: number;
  documentRequestCount: number;
  signatureCount: number;
  gapsCount: number;
}) {
  const { t, lang } = useLang();
  const hasCritical = criticalDeadlines.length > 0;
  const lead = hasCritical ? criticalDeadlines[0] : (deadlines[0] ?? null);

  const leadDue = (() => {
    if (!lead) return null;
    if (lead.overdue) return t("cockpit.hero_overdue");
    if (lead.daysLeft === 0) return t("cockpit.hero_due_today");
    return `${t("cockpit.hero_due_in")} ${lead.daysLeft}T`;
  })();

  const items = [
    {
      label: t("cockpit.stat_deadlines"),
      count: criticalDeadlines.length,
      href: "/dashboard/deadlines",
      urgent: true,
    },
    {
      label: t("cockpit.na_inbox"),
      count: inboxCount,
      href: "/dashboard/intake",
      urgent: inboxCount > 0,
    },
    {
      label: t("cockpit.na_reviews"),
      count: reviewCount,
      href: "/dashboard/review-queue",
      urgent: reviewCount > 0,
    },
    {
      label: t("cockpit.na_document_requests"),
      count: documentRequestCount,
      href: "/dashboard/document-requests",
      urgent: documentRequestCount > 0,
    },
    {
      label: t("cockpit.na_signatures"),
      count: signatureCount,
      href: "/dashboard/signature",
      urgent: signatureCount > 0,
    },
  ].filter((a) => a.count > 0);

  return (
    <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
          {t("cockpit.today_title")}
        </span>
        {hasCritical && (
          <span className="flex items-center gap-1 text-xs text-[color:var(--ds-danger-text)]">
            <AlertTriangle size={12} />
            {criticalDeadlines.length} {t("cockpit.stat_deadlines")}
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-[13px] text-[color:var(--ds-text-subtle)]">—</p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-[color:var(--ds-text-muted)]">
          {t("cockpit.hero_all_clear_desc")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {items.map((item, _i) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex items-center gap-1.5 text-[13px] transition-colors hover:underline"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  item.urgent
                    ? "bg-[color:var(--ds-danger-text)]"
                    : "bg-[color:var(--ds-text-subtle)]"
                }`}
                aria-hidden
              />
              <span
                className={
                  item.urgent
                    ? "font-medium text-[color:var(--ds-danger-text)]"
                    : "text-[color:var(--ds-text-muted)]"
                }
              >
                {item.count} {item.label}
              </span>
            </Link>
          ))}
        </div>
      )}

      {lead && (
        <div className="mt-3 flex items-center gap-2 border-t border-[color:var(--ds-border)] pt-3">
          <Sparkles size={13} className="shrink-0 text-[color:var(--brand-primary)]" />
          <p className="text-[13px] text-[color:var(--ds-text-muted)]">
            {leadDue && <span className="font-medium text-[color:var(--ds-text)]">{leadDue}</span>}
            {" · "}
            <Link
              href={pageHref(lead.page, "/dashboard/deadlines")}
              className="text-[color:var(--ds-text)] transition-colors hover:underline"
            >
              {text(lead.page.title, t("dashboard.unnamed_deadline"))}
            </Link>
            {" · "}
            {formatDate(lead.due, lang)}
          </p>
        </div>
      )}
    </section>
  );
}

// ── AIActivityFeed — Attio-style background activity (✓ ⟳ ○) ──────────

export function AIActivityFeed({
  reviews,
  agentActions,
}: {
  reviews: DashboardPageLike[];
  agentActions: DashboardPageLike[];
}) {
  const { t, lang } = useLang();
  const items = [...reviews, ...agentActions].slice(0, 8);

  if (items.length === 0) {
    return (
      <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
            {t("cockpit.ai_control_title")}
          </span>
        </div>
        <p className="text-[13px] text-[color:var(--ds-text-muted)]">
          {lang === "en"
            ? "No active AI tasks. Start a workflow to delegate."
            : "Keine aktiven KI-Aufgaben. Starten Sie einen Workflow."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[13px] font-semibold text-[color:var(--ds-text)]">
          {t("cockpit.ai_control_title")}
        </span>
        <span className="text-xs text-[color:var(--ds-text-subtle)]">
          {items.length} {lang === "en" ? "active" : "aktiv"}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const fm = item.frontmatter ?? {};
          const status = String(fm.status ?? "pending").toLowerCase();
          const isDone = ["done", "completed", "approved", "signed", "fulfilled"].includes(status);
          const isRunning = [
            "processing",
            "running",
            "pending",
            "in_progress",
            "uploaded",
            "ocr_processing",
          ].includes(status);
          const Icon = isDone ? CheckSquare : isRunning ? Loader2 : Circle;
          const iconClass = isDone
            ? "text-[color:var(--ds-success-text)]"
            : isRunning
              ? "text-[color:var(--brand-primary)]"
              : "text-[color:var(--ds-text-subtle)]";
          return (
            <div key={item.slug} className="flex items-center gap-2.5 text-[13px]">
              <Icon
                size={14}
                className={`shrink-0 ${iconClass} ${isRunning ? "animate-spin" : ""}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-[color:var(--ds-text)]">
                {text(item.title, item.type)}
              </span>
              <span className="shrink-0 text-xs text-[color:var(--ds-text-subtle)]">
                {formatDate(new Date(item.created_at), lang)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SecondaryStats({
  loading,
  items,
}: {
  loading: boolean;
  items: Array<{ label: string; value: number; href: string }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-[color:var(--ds-text-muted)]">
      {items.map((item, i) => (
        <Link
          key={item.label}
          href={item.href}
          className="inline-flex items-center gap-1 transition-colors hover:underline"
        >
          <span className="font-semibold text-[color:var(--ds-text)] tabular-nums">
            {loading ? "—" : item.value}
          </span>
          <span>{item.label}</span>
          {i < items.length - 1 && <span className="text-[color:var(--ds-text-subtle)]">·</span>}
        </Link>
      ))}
    </div>
  );
}

export function WidgetDashboard() {
  const { t, lang } = useLang();
  const data = useKanzleiCockpitData();
  const openInvoiceCount = data.openInvoices.length;
  const reviewCount = data.pendingReviews.length;
  const documentRequestCount = data.openDocumentRequests.length;
  const signatureCount = data.pendingSignatures.length;

  const gapsCount = data.unassignedDocs.length + data.reviewGaps.length;
  const secondaryStats = [
    {
      label: t("cockpit.stat_cases"),
      value: data.activeCases.length,
      href: "/dashboard/cases",
    },
    {
      label: t("cockpit.stat_inbox"),
      value: data.inboxItems.length,
      href: "/dashboard/intake",
    },
    {
      label: t("cockpit.stat_reviews"),
      value: reviewCount,
      href: "/dashboard/review-queue",
    },
    {
      label: t("cockpit.stat_billing"),
      value: openInvoiceCount,
      href: "/dashboard/invoicing",
    },
  ];

  return (
    <div className="space-y-6">
      {data.degraded && (
        <div className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={17}
              className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[color:var(--ds-warning-text)]">
                {t("cockpit.degraded_title")}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                {t("cockpit.degraded_desc")}
              </p>
            </div>
          </div>
        </div>
      )}

      <StaggerContainer className="space-y-4">
        <StaggerItem>
          <HeutePanel
            loading={data.loading}
            criticalDeadlines={data.criticalDeadlines}
            deadlines={data.deadlines}
            inboxCount={data.inboxItems.length}
            reviewCount={reviewCount}
            documentRequestCount={documentRequestCount}
            signatureCount={signatureCount}
            gapsCount={gapsCount}
          />
        </StaggerItem>

        <StaggerItem>
          <SecondaryStats loading={data.loading} items={secondaryStats} />
        </StaggerItem>

        <StaggerItem>
          <PinnedMatters cases={data.cases} />
        </StaggerItem>
      </StaggerContainer>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <DeadlineList items={data.deadlines} />
        <InboxList items={data.inboxItems} />
      </div>

      {/* Review-Lücken & Unzugeordnete Dokumente — höher priorisiert als generische Metriken */}
      {(data.unassignedDocs.length > 0 || data.reviewGaps.length > 0) && (
        <QueuePanel
          icon={AlertTriangle}
          title={t("cockpit.gaps_title")}
          href="/dashboard/vault"
          action={t("cockpit.open")}
        >
          <div className="space-y-2 p-4">
            {data.unassignedDocs.length > 0 && (
              <Link
                href="/dashboard/vault"
                className="flex items-center justify-between rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2.5 transition-colors hover:opacity-80"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileText size={15} className="shrink-0 text-[color:var(--ds-warning-text)]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {t("cockpit.gaps_unassigned")}
                    </p>
                    <p className="truncate text-xs text-[color:var(--ds-text-muted)]">
                      {t("cockpit.gaps_unassigned_desc")}
                    </p>
                  </div>
                </div>
                <Badge variant="warning" className="shrink-0">
                  {data.unassignedDocs.length}
                </Badge>
              </Link>
            )}
            {data.reviewGaps.length > 0 && (
              <Link
                href="/dashboard/review-queue"
                className="flex items-center justify-between rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2.5 transition-colors hover:opacity-80"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <AlertTriangle
                    size={15}
                    className="shrink-0 text-[color:var(--ds-danger-text)]"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                      {t("cockpit.gaps_review")}
                    </p>
                    <p className="truncate text-xs text-[color:var(--ds-text-muted)]">
                      {t("cockpit.gaps_review_desc")}
                    </p>
                  </div>
                </div>
                <Badge variant="danger" className="shrink-0">
                  {data.reviewGaps.length}
                </Badge>
              </Link>
            )}
          </div>
        </QueuePanel>
      )}

      <QuickActions />

      <div className="grid gap-4 lg:grid-cols-2">
        <ActiveCasesList cases={data.activeCases} />
        <AIActivityFeed
          reviews={data.pendingReviews}
          agentActions={data.pendingReviews.filter((p) => p.type === "agent_action")}
        />
      </div>

      {/* Kanzlei Insights — Tremor Charts */}
      <KanzleiInsights />

      {/* Recent Queries */}
      {data.recent.length > 0 && (
        <QueuePanel
          icon={MessageSquare}
          title={t("cockpit.recent_queries")}
          href="/dashboard/chat"
          action={t("cockpit.recent_queries_all")}
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
                    {new Date(rq.created_at).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
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
