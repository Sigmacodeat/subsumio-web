"use client";

import { useState, useMemo, useEffect, forwardRef, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Brain,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Zap,
  Bell,
  User,
  Users,
  CreditCard,
  X,
  Briefcase,
  CalendarClock,
  Landmark,
  Plug,
  PenTool,
  UserCircle,
  ShieldCheck,
  FileSpreadsheet,
  ScrollText,
  FileText,
  FileSignature,
  EyeOff,
  Gavel,
  CloudOff,
  BarChart3,
  FolderOpen,
  MessageSquareText,
  Globe,
  Search,
  ClipboardList,
  FileSearch,
  CheckSquare,
  Inbox,
  FileClock,
  Award,
  Bot,
  Receipt,
  FileUp,
  UserCog,
  Mail,
  Scale,
  FileCheck,
  Library,
  ClipboardCheck,
  MessageCircle,
  Network,
  Calculator,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutationQueue } from "@/lib/use-mutation";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { useNetworkStatus } from "@/lib/use-offline-sync";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: DashboardKey;
  comingSoon?: boolean;
};
type NavSection = { titleKey: DashboardKey; items: NavItem[] };

const DEFAULT_OPEN_SECTIONS: DashboardKey[] = [
  "nav.section.cockpit",
  "nav.section.cases_clients",
  "nav.section.communication",
  "nav.section.research_knowledge",
  "nav.section.documents_drafting",
  "nav.section.billing_compliance",
  "nav.section.admin",
];

export const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: "nav.section.cockpit",
    items: [
      { href: "/dashboard/review-queue", icon: CheckSquare, labelKey: "nav.review_queue" },
      { href: "/dashboard/approvals", icon: Gavel, labelKey: "nav.approvals" },
      { href: "/dashboard/workflows", icon: ClipboardList, labelKey: "nav.workflows" },
    ],
  },
  {
    titleKey: "nav.section.cases_clients",
    items: [
      { href: "/dashboard/contacts", icon: Users, labelKey: "nav.contacts" },
      { href: "/dashboard/opponents", icon: Scale, labelKey: "nav.opponents" },
      { href: "/dashboard/client-portal", icon: UserCircle, labelKey: "nav.client_portal" },
      { href: "/dashboard/document-requests", icon: FileClock, labelKey: "nav.document_requests" },
      { href: "/dashboard/kollisionspruefung", icon: Scale, labelKey: "nav.kollisionspruefung" },
      { href: "/dashboard/process-strategy", icon: Gavel, labelKey: "nav.process_strategy" },
    ],
  },
  {
    titleKey: "nav.section.communication",
    items: [
      { href: "/dashboard/bea", icon: Mail, labelKey: "nav.bea" },
      { href: "/dashboard/whatsapp", icon: MessageCircle, labelKey: "nav.whatsapp" },
      { href: "/dashboard/email-import", icon: FileText, labelKey: "nav.email_import" },
    ],
  },
  {
    titleKey: "nav.section.research_knowledge",
    items: [
      { href: "/dashboard/brain", icon: Brain, labelKey: "nav.brain" },
      { href: "/dashboard/graph", icon: Network, labelKey: "nav.graph" },
      { href: "/dashboard/sources", icon: Database, labelKey: "nav.sources" },
      { href: "/dashboard/research", icon: Globe, labelKey: "nav.legal_research" },
      { href: "/dashboard/precedent-search", icon: Search, labelKey: "nav.precedent_search" },
      { href: "/dashboard/rechtsprechung", icon: Landmark, labelKey: "nav.rechtsprechung" },
      { href: "/dashboard/norms", icon: BookOpen, labelKey: "nav.norms" },
      { href: "/dashboard/monitoring", icon: Bell, labelKey: "nav.monitoring" },
      { href: "/dashboard/playbooks", icon: ClipboardList, labelKey: "nav.playbooks" },
    ],
  },
  {
    titleKey: "nav.section.documents_drafting",
    items: [
      { href: "/dashboard/upload", icon: FileUp, labelKey: "nav.upload" },
      { href: "/dashboard/vault", icon: FolderOpen, labelKey: "nav.vault" },
      { href: "/dashboard/drafting", icon: PenTool, labelKey: "nav.drafting" },
      { href: "/dashboard/analyze", icon: FileSearch, labelKey: "nav.analyze" },
      { href: "/dashboard/contracts", icon: FileCheck, labelKey: "nav.contracts" },
      { href: "/dashboard/clause-library", icon: Library, labelKey: "nav.clause_library" },
      { href: "/dashboard/tabular-review", icon: FileSpreadsheet, labelKey: "nav.tabular_review" },
      {
        href: "/dashboard/obligation-tracking",
        icon: ClipboardCheck,
        labelKey: "nav.obligation_tracking",
      },
      { href: "/dashboard/translate", icon: Globe, labelKey: "nav.translate" },
      { href: "/dashboard/signature", icon: FileSignature, labelKey: "nav.signature" },
      { href: "/dashboard/word-addin", icon: FileText, labelKey: "nav.word_addin" },
      { href: "/dashboard/version-history", icon: FileClock, labelKey: "nav.version_history" },
    ],
  },
  {
    titleKey: "nav.section.billing_compliance",
    items: [
      { href: "/dashboard/invoicing", icon: Receipt, labelKey: "nav.invoicing" },
      { href: "/dashboard/cost-calculator", icon: Calculator, labelKey: "nav.cost_calculator" },
      { href: "/dashboard/datev-export", icon: FileSpreadsheet, labelKey: "nav.datev_export" },
      { href: "/dashboard/controlling", icon: BarChart3, labelKey: "nav.controlling" },
      { href: "/dashboard/compliance", icon: ShieldCheck, labelKey: "nav.compliance" },
      { href: "/dashboard/anonymize", icon: EyeOff, labelKey: "nav.anonymize" },
      { href: "/dashboard/verfahrensdoku", icon: ClipboardCheck, labelKey: "nav.verfahrensdoku" },
      { href: "/dashboard/data-export", icon: Database, labelKey: "nav.data_export" },
      { href: "/dashboard/import-kanzlei", icon: FileUp, labelKey: "nav.import_kanzlei" },
    ],
  },
];

export const BOTTOM_ITEMS: NavItem[] = [
  { href: "/dashboard/team", icon: UserCog, labelKey: "nav.team" },
  { href: "/dashboard/experience", icon: Award, labelKey: "nav.experience" },
  { href: "/dashboard/agents", icon: Bot, labelKey: "nav.agents" },
  { href: "/dashboard/connectors", icon: Plug, labelKey: "nav.connectors" },
  { href: "/dashboard/api-keys", icon: ShieldCheck, labelKey: "nav.api_keys" },
  { href: "/dashboard/audit", icon: ScrollText, labelKey: "nav.audit_log" },
  { href: "/dashboard/billing", icon: CreditCard, labelKey: "nav.billing" },
  { href: "/dashboard/settings", icon: Settings, labelKey: "nav.settings" },
];

const PRIMARY_ITEMS: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "nav.overview" },
  { href: "/dashboard/chat", icon: MessageSquareText, labelKey: "nav.chat" },
  { href: "/dashboard/deadlines", icon: CalendarClock, labelKey: "nav.deadlines" },
  { href: "/dashboard/cases", icon: Briefcase, labelKey: "nav.cases" },
  { href: "/dashboard/intake", icon: Inbox, labelKey: "nav.intake" },
];

const ADMIN_SECTION: NavSection = {
  titleKey: "nav.section.admin",
  items: BOTTOM_ITEMS,
};

const PREFERRED_SECTION_BY_HREF: Array<{ href: string; section: DashboardKey }> = [
  { href: "/dashboard/review-queue", section: "nav.section.cockpit" },
  { href: "/dashboard/approvals", section: "nav.section.cockpit" },
  { href: "/dashboard/workflows", section: "nav.section.cockpit" },
  { href: "/dashboard/contacts", section: "nav.section.cases_clients" },
  { href: "/dashboard/opponents", section: "nav.section.cases_clients" },
  { href: "/dashboard/client-portal", section: "nav.section.cases_clients" },
  { href: "/dashboard/document-requests", section: "nav.section.cases_clients" },
  { href: "/dashboard/kollisionspruefung", section: "nav.section.cases_clients" },
  { href: "/dashboard/process-strategy", section: "nav.section.cases_clients" },
  { href: "/dashboard/bea", section: "nav.section.communication" },
  { href: "/dashboard/whatsapp", section: "nav.section.communication" },
  { href: "/dashboard/email-import", section: "nav.section.communication" },
  { href: "/dashboard/brain", section: "nav.section.research_knowledge" },
  { href: "/dashboard/graph", section: "nav.section.research_knowledge" },
  { href: "/dashboard/sources", section: "nav.section.research_knowledge" },
  { href: "/dashboard/research", section: "nav.section.research_knowledge" },
  { href: "/dashboard/precedent-search", section: "nav.section.research_knowledge" },
  { href: "/dashboard/rechtsprechung", section: "nav.section.research_knowledge" },
  { href: "/dashboard/norms", section: "nav.section.research_knowledge" },
  { href: "/dashboard/monitoring", section: "nav.section.research_knowledge" },
  { href: "/dashboard/playbooks", section: "nav.section.research_knowledge" },
  { href: "/dashboard/upload", section: "nav.section.documents_drafting" },
  { href: "/dashboard/vault", section: "nav.section.documents_drafting" },
  { href: "/dashboard/drafting", section: "nav.section.documents_drafting" },
  { href: "/dashboard/analyze", section: "nav.section.documents_drafting" },
  { href: "/dashboard/contracts", section: "nav.section.documents_drafting" },
  { href: "/dashboard/clause-library", section: "nav.section.documents_drafting" },
  { href: "/dashboard/tabular-review", section: "nav.section.documents_drafting" },
  { href: "/dashboard/obligation-tracking", section: "nav.section.documents_drafting" },
  { href: "/dashboard/translate", section: "nav.section.documents_drafting" },
  { href: "/dashboard/signature", section: "nav.section.documents_drafting" },
  { href: "/dashboard/word-addin", section: "nav.section.documents_drafting" },
  { href: "/dashboard/version-history", section: "nav.section.documents_drafting" },
  { href: "/dashboard/invoicing", section: "nav.section.billing_compliance" },
  { href: "/dashboard/cost-calculator", section: "nav.section.billing_compliance" },
  { href: "/dashboard/datev-export", section: "nav.section.billing_compliance" },
  { href: "/dashboard/controlling", section: "nav.section.billing_compliance" },
  { href: "/dashboard/compliance", section: "nav.section.billing_compliance" },
  { href: "/dashboard/anonymize", section: "nav.section.billing_compliance" },
  { href: "/dashboard/verfahrensdoku", section: "nav.section.billing_compliance" },
  { href: "/dashboard/data-export", section: "nav.section.billing_compliance" },
  { href: "/dashboard/import-kanzlei", section: "nav.section.billing_compliance" },
  { href: "/dashboard/team", section: "nav.section.admin" },
  { href: "/dashboard/experience", section: "nav.section.admin" },
  { href: "/dashboard/agents", section: "nav.section.admin" },
  { href: "/dashboard/connectors", section: "nav.section.admin" },
  { href: "/dashboard/api-keys", section: "nav.section.admin" },
  { href: "/dashboard/audit", section: "nav.section.admin" },
  { href: "/dashboard/billing", section: "nav.section.admin" },
  { href: "/dashboard/settings", section: "nav.section.admin" },
];

function sectionDomId(titleKey: DashboardKey) {
  return `sidebar-section-${titleKey.replaceAll(".", "-")}`;
}

function isActiveHref(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function findActiveSection(pathname: string, sections: NavSection[]) {
  const preferred = PREFERRED_SECTION_BY_HREF.find((entry) => isActiveHref(pathname, entry.href));
  if (preferred && sections.some((section) => section.titleKey === preferred.section)) {
    return preferred.section;
  }
  return sections.find((section) =>
    section.items.some((item) => !item.comingSoon && isActiveHref(pathname, item.href))
  )?.titleKey;
}

function SyncStatus({ collapsed }: { collapsed: boolean }) {
  const { pendingCount, syncing, syncPending } = useMutationQueue();
  const { t } = useLang();
  if (collapsed || pendingCount === 0) return null;
  return (
    <div className="mx-3 mt-2 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[color:var(--ds-warning-text)]">
          {pendingCount} {t("sidebar.changes_pending")}
        </span>
        <button
          onClick={() => void syncPending()}
          disabled={syncing}
          className="brand-text text-xs transition-[opacity,color] duration-200 disabled:opacity-50"
        >
          {syncing ? t("sidebar.syncing") : t("sidebar.sync_now")}
        </button>
      </div>
    </div>
  );
}

export function NetworkStatusBadge() {
  const online = useNetworkStatus();
  const { t } = useLang();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-2 py-1 text-xs font-medium text-[color:var(--ds-danger-text)]"
      title={t("sidebar.offline_tooltip")}
    >
      <CloudOff size={12} aria-hidden />
      {t("sidebar.offline")}
    </div>
  );
}

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  setCollapsed: (v: boolean) => void;
  setMobileOpen: (v: boolean) => void;
  pages: number;
  entities: number;
  dreamCycle: string | null;
  userName: string | null;
  userEmail: string | null;
  /** Real engine-reachability signal — undefined while the first stats load is in flight. */
  brainReachable?: boolean;
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  {
    collapsed,
    mobileOpen,
    setCollapsed,
    setMobileOpen,
    pages,
    entities,
    dreamCycle,
    userName,
    userEmail,
    brainReachable,
  },
  _ref
) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const [openSections, setOpenSections] = useState<DashboardKey[]>(DEFAULT_OPEN_SECTIONS);
  const { t, lang } = useLang();

  const brainStatusLabel =
    brainReachable === true
      ? t("sidebar.active")
      : brainReachable === false
        ? t("sidebar.offline")
        : t("sidebar.checking");

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) {
      return NAV_SECTIONS.filter((section) => section.items.some((item) => !item.comingSoon));
    }
    const q = searchQuery.toLowerCase().trim();
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => t(item.labelKey).toLowerCase().includes(q)),
    })).filter((section) => section.items.length > 0);
  }, [searchQuery, t]);

  const filteredBottomItems = useMemo(() => {
    if (!searchQuery.trim()) return BOTTOM_ITEMS;
    const q = searchQuery.toLowerCase().trim();
    return BOTTOM_ITEMS.filter((item) => t(item.labelKey).toLowerCase().includes(q));
  }, [searchQuery, t]);

  const hasResults = filteredSections.length > 0 || filteredBottomItems.length > 0;
  const accordionSections = useMemo<NavSection[]>(() => {
    const sections = [...filteredSections];
    if (filteredBottomItems.length > 0) {
      sections.push({ ...ADMIN_SECTION, items: filteredBottomItems });
    }
    return sections;
  }, [filteredSections, filteredBottomItems]);

  useEffect(() => {
    const activeSection = findActiveSection(pathname, [...NAV_SECTIONS, ADMIN_SECTION]);
    if (activeSection) {
      setOpenSections((current) =>
        current.includes(activeSection) ? current : [...current, activeSection]
      );
    }
  }, [pathname]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    setOpenSections(accordionSections.map((section) => section.titleKey));
  }, [accordionSections, searchQuery]);

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const q = query.toLowerCase().trim();
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="rounded bg-[var(--brand-primary)]/20 px-0.5 text-[color:var(--ds-text)]">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  const toggleSection = (titleKey: DashboardKey) => {
    setOpenSections((current) =>
      current.includes(titleKey)
        ? current.filter((section) => section !== titleKey)
        : [...current, titleKey]
    );
  };

  return (
    <aside
      className={cn(
        "sidebar-shadow z-50 shrink-0 overflow-hidden border-r border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] transition-[width,transform] duration-[var(--ds-duration-panel)] ease-[var(--ds-ease-panel)] will-change-[width,transform] motion-reduce:transition-none",
        "fixed inset-y-0 left-0 w-64 md:static",
        collapsed ? "md:w-16" : "md:w-64",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const active = document.activeElement;
        if (!(active instanceof HTMLAnchorElement)) return;
        e.preventDefault();
        const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>("a[href]"));
        const idx = links.indexOf(active);
        if (idx === -1) return;
        if (e.key === "ArrowDown") {
          links[(idx + 1) % links.length]?.focus();
        } else {
          links[(idx - 1 + links.length) % links.length]?.focus();
        }
      }}
    >
      {/* Inner wrapper — fixed width, never reflows. Only the outer aside clips. */}
      <div className="flex h-full w-64 flex-col">
        {/* Logo */}
        <div
          className={cn(
            "flex h-16 items-center gap-2.5 border-b border-[color:var(--ds-border)] px-4",
            collapsed && "md:justify-center md:px-0"
          )}
        >
          <button
            onClick={() => setMobileOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-normal)] ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] md:hidden"
            aria-label={t("sidebar.close_menu")}
          >
            <X size={18} />
          </button>
          <Link
            href="/dashboard"
            aria-label="Subsumio Dashboard"
            onClick={() => setMobileOpen(false)}
          >
            <SubsumioMark size={32} />
          </Link>
          <Link
            href="/dashboard"
            className={cn(
              "font-display text-[15px] font-bold tracking-tight text-[color:var(--ds-text)] transition-[opacity] duration-[var(--ds-duration-slow)] ease-[var(--ds-ease-smooth)]",
              collapsed ? "pointer-events-none opacity-0" : "opacity-100"
            )}
            onClick={() => setMobileOpen(false)}
          >
            Subsum<span className="brand-text">•io</span>
          </Link>
        </div>

        <div className="dashboard-scroll-shadow flex-1 overflow-x-hidden overflow-y-auto pt-[env(safe-area-inset-top)] pb-3">
          {/* Brain status — expanded version */}
          <div
            className={cn(
              "mx-3 mt-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 transition-[opacity,height,padding] duration-[var(--ds-duration-slow)] ease-[var(--ds-ease-smooth)]",
              collapsed
                ? "pointer-events-none h-0 overflow-hidden border-0 py-0 opacity-0"
                : "opacity-100"
            )}
            role="status"
            aria-label={`${t("sidebar.brain_status")}: ${brainStatusLabel}, ${pages} pages, ${entities} entities`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[color:var(--ds-text-subtle)]">
                {t("sidebar.brain_status")}
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    brainReachable === true && "bg-[color:var(--ds-success-text)]",
                    brainReachable === false && "bg-[color:var(--ds-danger-text)]",
                    brainReachable === undefined && "bg-[color:var(--ds-text-subtle)]"
                  )}
                  aria-hidden
                />
                <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                  {brainStatusLabel}
                </span>
              </div>
            </div>
            <div className="mt-1 font-mono text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
              {pages} pages · {entities} entities
            </div>
          </div>
          {/* Brain status — collapsed dot */}
          <div
            className={cn(
              "mt-4 hidden items-center justify-center transition-[opacity] duration-300 ease-[var(--ds-ease-smooth)] md:flex",
              collapsed ? "opacity-100" : "pointer-events-none h-0 overflow-hidden opacity-0"
            )}
            title={`${t("sidebar.brain_status")}: ${brainStatusLabel}`}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                brainReachable === true && "animate-pulse bg-[color:var(--ds-success-text)]",
                brainReachable === false && "bg-[color:var(--ds-danger-text)]",
                brainReachable === undefined && "animate-pulse bg-[color:var(--ds-text-subtle)]"
              )}
              role="status"
              aria-label={`${t("sidebar.brain_status")}: ${brainStatusLabel}`}
            />
          </div>

          {/* Sync status */}
          <SyncStatus collapsed={collapsed} />

          {/* Search / Filter */}
          <div
            className={cn(
              "px-3 pt-3 transition-[opacity] duration-300 ease-[var(--ds-ease-smooth)]",
              collapsed ? "pointer-events-none h-0 overflow-hidden pt-0 opacity-0" : "opacity-100"
            )}
          >
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("sidebar.filter_placeholder")}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2.5 pr-3 pl-9 text-sm text-[color:var(--ds-text)] transition-[border-color,box-shadow] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--ds-border-strong)] focus:ring-0 focus:outline-none"
                aria-label={t("sidebar.filter_placeholder")}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-[color:var(--ds-text-subtle)] transition-colors hover:text-[color:var(--ds-text)]"
                  aria-label={t("sidebar.clear_filter")}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Nav */}
          <nav className="px-3 py-4" aria-label={t("sidebar.main_nav")}>
            {!hasResults && !collapsed && (
              <div className="px-3 py-8 text-center">
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("sidebar.no_results")} „{searchQuery}&quot;
                </p>
              </div>
            )}
            <div className={cn("space-y-1", collapsed && "hidden md:block")}>
              {PRIMARY_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActiveHref(pathname, item.href);
                return (
                  <Link
                    key={`primary-${item.href}`}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? t(item.labelKey) : undefined}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? t(item.labelKey) : undefined}
                    className={cn(
                      "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-[background-color,color] duration-200 ease-[var(--ds-ease-smooth)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none",
                      active
                        ? "brand-soft brand-text"
                        : "text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                    )}
                  >
                    <Icon size={17} className="shrink-0" />
                    <span
                      className={cn(
                        "transition-[opacity,transform] duration-[var(--ds-duration-normal)] ease-[var(--ds-ease-panel)]",
                        collapsed
                          ? "pointer-events-none w-0 -translate-x-1 overflow-hidden opacity-0"
                          : "translate-x-0 opacity-100"
                      )}
                    >
                      {highlightMatch(t(item.labelKey), searchQuery)}
                    </span>
                  </Link>
                );
              })}
            </div>

            {/* Collapsed: flat icon list */}
            {collapsed && (
              <div className="mt-4 space-y-1 border-t border-[color:var(--ds-border)] pt-4">
                {accordionSections
                  .flatMap((section) => section.items)
                  .filter((item, index, allItems) => {
                    if (item.comingSoon) return false;
                    if (PRIMARY_ITEMS.some((primary) => primary.href === item.href)) return false;
                    return (
                      allItems.findIndex((candidate) => candidate.href === item.href) === index
                    );
                  })
                  .map((item) => {
                    const Icon = item.icon;
                    const active = isActiveHref(pathname, item.href);
                    return (
                      <Link
                        key={`collapsed-${item.href}`}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        aria-label={t(item.labelKey)}
                        onClick={() => setMobileOpen(false)}
                        title={t(item.labelKey)}
                        className={cn(
                          "relative flex h-10 items-center justify-center rounded-lg text-sm transition-[background-color,color] duration-200 ease-[var(--ds-ease-smooth)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none",
                          active
                            ? "brand-soft brand-text font-semibold"
                            : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                        )}
                      >
                        <Icon size={17} className="shrink-0" />
                      </Link>
                    );
                  })}
              </div>
            )}
            {/* Expanded: accordion sections */}
            {!collapsed && (
              <div className="mt-4 space-y-2">
                {accordionSections.map((section) => {
                  const isOpen = openSections.includes(section.titleKey);
                  const sectionActive = section.items.some((item) =>
                    isActiveHref(pathname, item.href)
                  );
                  const SectionIcon = section.items[0]?.icon ?? FolderOpen;
                  const panelId = sectionDomId(section.titleKey);
                  return (
                    <div
                      key={section.titleKey}
                      className={cn(
                        "rounded-lg border transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ds-ease-smooth)]",
                        section.titleKey === "nav.section.admin"
                          ? "border-[color:var(--ds-border)] bg-transparent"
                          : "border-transparent",
                        isOpen
                          ? "border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] shadow-sm"
                          : sectionActive
                            ? "brand-border brand-soft bg-[color:var(--ds-surface)]"
                            : "hover:bg-[color:var(--ds-hover)]"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSection(section.titleKey)}
                        className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-semibold text-[color:var(--ds-text)] transition-colors hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                      >
                        <SectionIcon
                          size={16}
                          className={cn(
                            "shrink-0 transition-colors",
                            sectionActive || isOpen
                              ? "brand-text"
                              : "text-[color:var(--ds-text-muted)]"
                          )}
                        />
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate",
                            sectionActive || isOpen
                              ? "text-[color:var(--ds-text)]"
                              : "text-[color:var(--ds-text-muted)]"
                          )}
                        >
                          {t(section.titleKey)}
                        </span>
                        {sectionActive && !isOpen && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-primary)]"
                            aria-hidden
                          />
                        )}
                        <ChevronDown
                          size={14}
                          className={cn(
                            "shrink-0 text-[color:var(--ds-text-subtle)] transition-transform duration-[220ms] ease-[var(--ds-ease-smooth)]",
                            isOpen && "rotate-180"
                          )}
                        />
                      </button>
                      <div
                        id={panelId}
                        className={cn(
                          "grid overflow-hidden transition-[grid-template-rows,opacity] duration-[var(--ds-duration-normal)] ease-[var(--ds-ease-panel)] motion-reduce:transition-none",
                          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                        )}
                        aria-hidden={!isOpen}
                        {...(!isOpen ? { inert: true } : {})}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div
                            className="space-y-0.5 px-2 pb-2"
                            role="group"
                            aria-label={t(section.titleKey)}
                          >
                            {section.items.map((item, index) => {
                              const Icon = item.icon;
                              if (item.comingSoon) {
                                return (
                                  <button
                                    key={item.href}
                                    disabled
                                    className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[color:var(--ds-text-subtle)] select-none"
                                    aria-disabled="true"
                                  >
                                    <Icon size={16} className="shrink-0 opacity-50" />
                                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                      <span className="truncate">{t(item.labelKey)}</span>
                                      <span className="rounded border border-[color:var(--ds-border-strong)] px-1 py-0.5 text-xs font-semibold tracking-wide uppercase">
                                        {t("sidebar.coming_soon")}
                                      </span>
                                    </span>
                                  </button>
                                );
                              }
                              const active = isActiveHref(pathname, item.href);
                              return (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  aria-current={active ? "page" : undefined}
                                  onClick={() => setMobileOpen(false)}
                                  title={t(item.labelKey)}
                                  style={{ "--sidebar-item-index": index } as CSSProperties}
                                  className={cn(
                                    "sidebar-item-in relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-[background-color,color,transform] duration-150 ease-[var(--ds-ease-panel)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none active:scale-[0.99]",
                                    active
                                      ? "brand-soft brand-text font-semibold"
                                      : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                                  )}
                                >
                                  <Icon size={16} className="shrink-0" />
                                  <span className="min-w-0 flex-1 truncate">
                                    {highlightMatch(t(item.labelKey), searchQuery)}
                                  </span>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </nav>

          {/* Dream Cycle indicator — compact */}
          <div
            className={cn(
              "mx-3 mt-2 mb-1 flex items-center gap-1.5 rounded-md px-2 py-1 transition-[opacity] duration-300 ease-[var(--ds-ease-smooth)]",
              dreamCycle
                ? "text-[color:var(--ds-success-text)]"
                : "text-[color:var(--ds-warning-text)]",
              collapsed ? "pointer-events-none h-0 overflow-hidden py-0 opacity-0" : "opacity-100"
            )}
            title={
              dreamCycle
                ? `${t("sidebar.dream_last_run")} ${new Date(dreamCycle).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                : t("sidebar.dream_not_scheduled")
            }
          >
            <Zap size={11} className="shrink-0" />
            <span className="text-xs font-medium">{t("sidebar.dream_cycle")}</span>
          </div>

          {/* User profile section */}
          <div className="border-t border-[color:var(--ds-border)] px-3 pt-4 pb-4">
            <Link
              href="/dashboard/settings"
              onClick={() => setMobileOpen(false)}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 transition-[background-color,opacity] duration-300 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)]",
                collapsed ? "pointer-events-none h-0 overflow-hidden py-0 opacity-0" : "opacity-100"
              )}
            >
              <div className="brand-soft brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-full border">
                {userName ? (
                  <span className="brand-text text-xs font-bold uppercase">
                    {userName.slice(0, 2)}
                  </span>
                ) : (
                  <User size={15} className="brand-text" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[color:var(--ds-text)]">
                  {userName ?? t("sidebar.user")}
                </p>
                <p className="mt-0.5 truncate text-xs text-[color:var(--ds-text-subtle)]">
                  {userEmail ?? ""}
                </p>
              </div>
            </Link>
          </div>
        </div>

        <div className="border-t border-[color:var(--ds-border)] px-3 py-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse_aria")}
            aria-expanded={!collapsed}
            className={cn(
              "hidden w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-panel)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-[0.98] md:flex",
              collapsed && "justify-center px-0"
            )}
          >
            {collapsed ? (
              <ChevronRight size={16} />
            ) : (
              <>
                <ChevronLeft size={16} />
                <span>{t("sidebar.collapse")}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
});
