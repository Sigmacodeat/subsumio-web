"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  CheckSquare,
  FileSignature,
  FileText,
  Inbox,
  Mail,
  MessageSquare,
  PenTool,
  Pin,
  PinOff,
  Scale,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBrainStats, usePages, useRecentQueries } from "@/lib/queries/brain";
import { useRecentMatters } from "@/lib/use-recent-matters";
import { useLang } from "@/lib/use-lang";
import type { Lang } from "@/content/site";
import type { BrainPage, BrainStats, RecentQuery } from "@/lib/types";
import { StaggerContainer, StaggerItem, GlowCard } from "@/components/marketing/motion-system";

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

function useKanzleiCockpitData() {
  const statsQuery = useBrainStats();
  const recentQuery = useRecentQueries(5);
  const casesQuery = usePages({ type: "legal_case", limit: 50 });
  const deadlinesQuery = usePages({ type: "legal_deadline", limit: 50 });
  const invoicesQuery = usePages({ type: "invoice", limit: 50 });
  const intakeQuery = usePages({ type: "intake_request", limit: 20 });
  const beaQuery = usePages({ type: "bea_draft", limit: 20 });
  const beaMessagesQuery = usePages({ type: "bea_message", limit: 20 });
  const documentRequestsQuery = usePages({ type: "document_request", limit: 50 });
  const signaturesQuery = usePages({ type: "signature_request", limit: 50 });
  const reviewQuery = usePages({ type: "review_item", limit: 20 });
  const agentActionsQuery = usePages({ type: "agent_action", limit: 50 });
  const docsQuery = usePages({ type: "document", limit: 100 });
  const legalDocsQuery = usePages({ type: "legal_document", limit: 100 });

  const cases = Array.isArray(casesQuery.data) ? (casesQuery.data as DashboardPageLike[]) : [];
  const deadlines = Array.isArray(deadlinesQuery.data)
    ? (deadlinesQuery.data as DashboardPageLike[])
    : [];
  const invoices = Array.isArray(invoicesQuery.data)
    ? (invoicesQuery.data as DashboardPageLike[])
    : [];
  const intake = Array.isArray(intakeQuery.data) ? (intakeQuery.data as DashboardPageLike[]) : [];
  const bea = Array.isArray(beaQuery.data) ? (beaQuery.data as DashboardPageLike[]) : [];
  const beaMessages = Array.isArray(beaMessagesQuery.data)
    ? (beaMessagesQuery.data as DashboardPageLike[])
    : [];
  const documentRequests = Array.isArray(documentRequestsQuery.data)
    ? (documentRequestsQuery.data as DashboardPageLike[])
    : [];
  const signatures = Array.isArray(signaturesQuery.data)
    ? (signaturesQuery.data as DashboardPageLike[])
    : [];
  const reviews = Array.isArray(reviewQuery.data) ? (reviewQuery.data as DashboardPageLike[]) : [];
  const agentActions = Array.isArray(agentActionsQuery.data)
    ? (agentActionsQuery.data as DashboardPageLike[])
    : [];
  const docs = [
    ...(Array.isArray(docsQuery.data) ? (docsQuery.data as DashboardPageLike[]) : []),
    ...(Array.isArray(legalDocsQuery.data) ? (legalDocsQuery.data as DashboardPageLike[]) : []),
  ];
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

  const degraded =
    statsQuery.isError ||
    casesQuery.isError ||
    deadlinesQuery.isError ||
    invoicesQuery.isError ||
    intakeQuery.isError ||
    beaQuery.isError ||
    beaMessagesQuery.isError ||
    documentRequestsQuery.isError ||
    signaturesQuery.isError ||
    reviewQuery.isError ||
    agentActionsQuery.isError ||
    docsQuery.isError ||
    legalDocsQuery.isError;

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
    loading:
      casesQuery.isLoading ||
      deadlinesQuery.isLoading ||
      invoicesQuery.isLoading ||
      intakeQuery.isLoading ||
      beaQuery.isLoading ||
      beaMessagesQuery.isLoading ||
      documentRequestsQuery.isLoading ||
      signaturesQuery.isLoading ||
      reviewQuery.isLoading ||
      agentActionsQuery.isLoading ||
      docsQuery.isLoading ||
      legalDocsQuery.isLoading,
    degraded,
  };
}

function EmptyLine({ text, icon: Icon = Inbox }: { text: string; icon?: typeof Inbox }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-4 py-6 text-center">
      <Icon size={20} className="text-[color:var(--ds-text-subtle)]" />
      <p className="text-sm text-[color:var(--ds-text-muted)]">{text}</p>
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

function QueueRow({
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
        className={`flex h-9 w-9 items-center justify-center rounded-md border ${
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
        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[color:var(--ds-border)] px-4 py-3 last:border-b-0 hover:bg-[color:var(--ds-hover)]"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="group flex items-center border-b border-[color:var(--ds-border)] pr-2 last:border-b-0 hover:bg-[color:var(--ds-hover)]">
      <Link
        href={href}
        className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
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

function DeadlineList({ items }: { items: ReturnType<typeof useKanzleiCockpitData>["deadlines"] }) {
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

function InboxList({ items }: { items: DashboardPageLike[] }) {
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

function PinnedMatters({ cases }: { cases: DashboardPageLike[] }) {
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

function ActiveCasesList({ cases }: { cases: DashboardPageLike[] }) {
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
      href: "/dashboard/kollisionspruefung",
      icon: Scale,
      label: t("cockpit.action_conflict"),
      tone: "urgent",
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
    <section className="overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--card-shadow)]">
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
      <div className="grid gap-px bg-[color:var(--ds-border)] sm:grid-cols-2 xl:grid-cols-7">
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

// ── Editorial cockpit hero ────────────────────────────────────────────
// One dominant focus (critical deadlines) + a curated next-action column,
// replacing the flat 5-up metric rail. Hierarchy by size/colour, not by
// adding another identical card.

type DeadlineItem = ReturnType<typeof useKanzleiCockpitData>["deadlines"][number];

function CockpitHero({
  loading,
  criticalDeadlines,
  deadlines,
  inboxCount,
  reviewCount,
  documentRequestCount,
  signatureCount,
  gapsCount,
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

  const actions = [
    {
      href: "/dashboard/intake",
      icon: Inbox,
      label: t("cockpit.na_inbox"),
      count: inboxCount,
      urgent: inboxCount > 0,
    },
    {
      href: "/dashboard/review-queue",
      icon: CheckSquare,
      label: t("cockpit.na_reviews"),
      count: reviewCount,
      urgent: reviewCount > 0,
    },
    {
      href: "/dashboard/document-requests",
      icon: FileText,
      label: t("cockpit.na_document_requests"),
      count: documentRequestCount,
      urgent: documentRequestCount > 0,
    },
    {
      href: "/dashboard/signature",
      icon: FileSignature,
      label: t("cockpit.na_signatures"),
      count: signatureCount,
      urgent: signatureCount > 0,
    },
    {
      href: "/dashboard/vault",
      icon: FileText,
      label: t("cockpit.na_gaps"),
      count: gapsCount,
      urgent: false,
    },
  ].filter((a) => a.count > 0);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
      <section
        className={`flex flex-col justify-between rounded-xl border p-5 shadow-[var(--card-shadow)] md:p-6 ${
          hasCritical
            ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)]"
            : "border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)]"
        }`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          {hasCritical ? (
            <AlertTriangle size={17} className="text-[color:var(--ds-danger-text)]" />
          ) : (
            <ShieldCheck size={17} className="text-[color:var(--ds-success-text)]" />
          )}
          <span
            className={
              hasCritical
                ? "text-[color:var(--ds-danger-text)]"
                : "text-[color:var(--ds-success-text)]"
            }
          >
            {hasCritical ? t("cockpit.stat_deadlines") : t("cockpit.hero_all_clear")}
          </span>
        </div>

        <div className="my-4 flex items-end gap-4">
          {hasCritical ? (
            <span className="text-5xl leading-none font-semibold tracking-tight text-[color:var(--ds-danger-text)] tabular-nums md:text-6xl">
              {loading ? "—" : criticalDeadlines.length}
            </span>
          ) : null}
          <div className="min-w-0 pb-1">
            {lead ? (
              <>
                <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                  {text(lead.page.title, t("dashboard.unnamed_deadline"))}
                </p>
                <p className="mt-0.5 truncate text-xs text-[color:var(--ds-text-muted)]">
                  {leadDue ? <span className="font-medium">{leadDue}</span> : null}
                  {" · "}
                  {formatDate(lead.due, lang)}
                  {hasCritical && criticalDeadlines.length > 1
                    ? ` · ${criticalDeadlines.length - 1} ${t("cockpit.hero_more_critical")}`
                    : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                {t("cockpit.hero_all_clear_desc")}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/deadlines">
            <Button size="sm" variant={hasCritical ? "glow" : "outline"}>
              <CalendarClock size={14} /> {t("cockpit.hero_open")}
            </Button>
          </Link>
          <Link href="/dashboard/drafting">
            <Button size="sm" variant="outline">
              <PenTool size={14} /> {t("cockpit.action_draft")}
            </Button>
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5 shadow-[var(--card-shadow)]">
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--ds-text)]">
          {t("cockpit.hero_next_action")}
        </h2>
        {actions.length === 0 ? (
          <p className="py-4 text-sm text-[color:var(--ds-text-muted)]">{t("cockpit.na_clear")}</p>
        ) : (
          <div>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-3 border-b border-[color:var(--ds-border)] py-2.5 last:border-b-0 hover:opacity-80"
                >
                  <Icon
                    size={17}
                    className={
                      action.urgent
                        ? "text-[color:var(--ds-warning-text)]"
                        : "text-[color:var(--ds-text-muted)]"
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--ds-text)]">
                    {action.label}
                  </span>
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      action.urgent
                        ? "text-[color:var(--ds-warning-text)]"
                        : "text-[color:var(--ds-text-muted)]"
                    }`}
                  >
                    {action.count}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SecondaryStats({
  loading,
  items,
}: {
  loading: boolean;
  items: Array<{ label: string; value: number; href: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-border)] md:grid-cols-4">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="bg-[color:var(--ds-surface)] px-4 py-3 transition-colors hover:bg-[color:var(--ds-hover)]"
        >
          <span className="truncate text-xs text-[color:var(--ds-text-muted)]">{item.label}</span>
          <div className="mt-1 text-2xl leading-none font-semibold tracking-tight text-[color:var(--ds-text)] tabular-nums">
            {loading ? "—" : item.value}
          </div>
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

      <StaggerContainer className="space-y-6">
        <StaggerItem>
          <CockpitHero
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

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <GlowCard className="rounded-lg" glowColor="var(--brand-primary)" intensity={0.12}>
          <DeadlineList items={data.deadlines} />
        </GlowCard>
        <GlowCard className="rounded-lg" glowColor="var(--brand-primary)" intensity={0.12}>
          <InboxList items={data.inboxItems} />
        </GlowCard>
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

      <div className="grid gap-6 lg:grid-cols-2">
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
