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
  GitCompare,
  Share2,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutationQueue } from "@/lib/use-mutation";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { useNetworkStatus } from "@/lib/use-offline-sync";
import { useLang } from "@/lib/use-lang";
import { useIsDesktop } from "@/lib/use-media-query";
import type { DashboardKey } from "@/content/dashboard";

type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: DashboardKey;
  comingSoon?: boolean;
};
type NavSection = { titleKey: DashboardKey; items: NavItem[]; colorVar?: string };

// Workflow-ordered, consolidated sidebar. Low-frequency items (opponents,
// contracts, brain) are intentionally NOT here — they stay reachable via the
// sidebar filter + command palette through ALL_NAV_ITEMS / PREFERRED_SECTION_BY_HREF.
export const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: "nav.section.cases_clients",
    colorVar: "--nav-cat-cases",
    items: [
      { href: "/dashboard/contacts", icon: Users, labelKey: "nav.contacts" },
      { href: "/dashboard/kollisionspruefung", icon: Scale, labelKey: "nav.kollisionspruefung" },
    ],
  },
  {
    titleKey: "nav.section.communication",
    colorVar: "--nav-cat-comm",
    items: [
      { href: "/dashboard/bea", icon: Mail, labelKey: "nav.bea" },
      { href: "/dashboard/whatsapp", icon: MessageCircle, labelKey: "nav.whatsapp" },
    ],
  },
  {
    titleKey: "nav.section.documents_drafting",
    colorVar: "--nav-cat-docs",
    items: [
      { href: "/dashboard/vault", icon: FolderOpen, labelKey: "nav.vault" },
      { href: "/dashboard/drafting", icon: PenTool, labelKey: "nav.drafting" },
      {
        href: "/dashboard/portfolio-insights",
        icon: BarChart3,
        labelKey: "nav.portfolio_insights",
      },
      {
        href: "/dashboard/deep-analysis",
        icon: FileSearch,
        labelKey: "nav.deep_analysis",
      },
    ],
  },
  {
    titleKey: "nav.section.research_knowledge",
    colorVar: "--nav-cat-research",
    items: [{ href: "/dashboard/research", icon: Globe, labelKey: "nav.legal_research" }],
  },
  {
    titleKey: "nav.section.operations",
    colorVar: "--nav-cat-ops",
    items: [
      { href: "/dashboard/review-queue", icon: ClipboardCheck, labelKey: "nav.review_queue" },
      { href: "/dashboard/workflows", icon: ClipboardList, labelKey: "nav.workflows" },
      { href: "/dashboard/reports", icon: FileText, labelKey: "nav.reports" },
      { href: "/dashboard/analytics", icon: TrendingUp, labelKey: "nav.analytics" },
      { href: "/dashboard/shared-spaces", icon: Share2, labelKey: "nav.shared_spaces" },
    ],
  },
  {
    titleKey: "nav.section.billing_compliance",
    colorVar: "--nav-cat-billing",
    items: [
      { href: "/dashboard/invoicing", icon: Receipt, labelKey: "nav.invoicing" },
      { href: "/dashboard/compliance", icon: ShieldCheck, labelKey: "nav.compliance" },
    ],
  },
];

export const BOTTOM_ITEMS: NavItem[] = [
  { href: "/dashboard/settings", icon: Settings, labelKey: "nav.settings" },
  { href: "/dashboard/team", icon: UserCog, labelKey: "nav.admin" },
  { href: "/dashboard/audit", icon: ScrollText, labelKey: "nav.audit_log" },
];

const PRIMARY_ITEMS: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "nav.overview" },
  { href: "/dashboard/cases", icon: Briefcase, labelKey: "nav.cases" },
  { href: "/dashboard/deadlines", icon: CalendarClock, labelKey: "nav.deadlines" },
  { href: "/dashboard/intake", icon: Inbox, labelKey: "nav.intake" },
  { href: "/dashboard/chat", icon: MessageSquareText, labelKey: "nav.chat" },
];

const PRIMARY_COLOR_VARS: string[] = [
  "--brand-primary",
  "--nav-cat-cases",
  "--nav-cat-cases",
  "--nav-cat-cases",
  "--nav-cat-comm",
];

const ADMIN_SECTION: NavSection = {
  titleKey: "nav.section.admin",
  colorVar: "--nav-cat-admin",
  items: BOTTOM_ITEMS,
};

export const ALL_NAV_ITEMS: NavItem[] = [
  ...PRIMARY_ITEMS,
  ...NAV_SECTIONS.flatMap((s) => s.items),
  ...BOTTOM_ITEMS,
  { href: "/dashboard/client-portal", icon: UserCircle, labelKey: "nav.client_portal" },
  { href: "/dashboard/opponents", icon: Scale, labelKey: "nav.opponents" },
  { href: "/dashboard/contracts", icon: FileCheck, labelKey: "nav.contracts" },
  { href: "/dashboard/document-requests", icon: FileClock, labelKey: "nav.document_requests" },
  { href: "/dashboard/process-strategy", icon: Gavel, labelKey: "nav.process_strategy" },
  { href: "/dashboard/email-import", icon: FileText, labelKey: "nav.email_import" },
  { href: "/dashboard/upload", icon: FileUp, labelKey: "nav.upload" },
  { href: "/dashboard/analyze", icon: FileSearch, labelKey: "nav.analyze" },
  { href: "/dashboard/clause-library", icon: Library, labelKey: "nav.clause_library" },
  { href: "/dashboard/templates", icon: FileText, labelKey: "nav.templates" },
  { href: "/dashboard/litigation", icon: Gavel, labelKey: "nav.litigation" },
  {
    href: "/dashboard/obligation-tracking",
    icon: ClipboardCheck,
    labelKey: "nav.obligation_tracking",
  },
  { href: "/dashboard/tabular-review", icon: FileSpreadsheet, labelKey: "nav.tabular_review" },
  { href: "/dashboard/translate", icon: Globe, labelKey: "nav.translate" },
  { href: "/dashboard/signature", icon: FileSignature, labelKey: "nav.signature" },
  { href: "/dashboard/rechtsprechung", icon: Landmark, labelKey: "nav.rechtsprechung" },
  { href: "/dashboard/norms", icon: BookOpen, labelKey: "nav.norms" },
  { href: "/dashboard/precedent-search", icon: Search, labelKey: "nav.precedent_search" },
  { href: "/dashboard/brain", icon: Brain, labelKey: "nav.brain" },
  { href: "/dashboard/graph", icon: Network, labelKey: "nav.graph" },
  { href: "/dashboard/sources", icon: Database, labelKey: "nav.sources" },
  { href: "/dashboard/monitoring", icon: Bell, labelKey: "nav.monitoring" },
  { href: "/dashboard/playbooks", icon: ClipboardList, labelKey: "nav.playbooks" },
  { href: "/dashboard/approvals", icon: Gavel, labelKey: "nav.approvals" },
  { href: "/dashboard/cost-calculator", icon: Calculator, labelKey: "nav.cost_calculator" },
  { href: "/dashboard/datev-export", icon: FileSpreadsheet, labelKey: "nav.datev_export" },
  { href: "/dashboard/controlling", icon: BarChart3, labelKey: "nav.controlling" },
  { href: "/dashboard/verfahrensdoku", icon: ClipboardCheck, labelKey: "nav.verfahrensdoku" },
  { href: "/dashboard/compliance/retention", icon: FileClock, labelKey: "nav.retention" },
  { href: "/dashboard/anonymize", icon: EyeOff, labelKey: "nav.anonymize" },
  { href: "/dashboard/data-export", icon: Database, labelKey: "nav.data_export" },
  { href: "/dashboard/assistant", icon: MessageSquareText, labelKey: "nav.assistant" },
  { href: "/dashboard/query", icon: MessageSquareText, labelKey: "nav.query" },
  { href: "/dashboard/chat/analytics", icon: BarChart3, labelKey: "nav.chat_analytics" },
  { href: "/dashboard/chat/compare", icon: GitCompare, labelKey: "nav.chat_compare" },
  { href: "/dashboard/cases", icon: Briefcase, labelKey: "nav.cases" },
  { href: "/dashboard/calendar-export", icon: CalendarClock, labelKey: "nav.calendar_export" },
  { href: "/dashboard/case-scanner", icon: FileSearch, labelKey: "nav.case_scanner" },
  { href: "/dashboard/judgements-sync", icon: Landmark, labelKey: "nav.judgements_sync" },
  { href: "/dashboard/word-addin", icon: FileText, labelKey: "nav.word_addin" },
  { href: "/dashboard/version-history", icon: FileClock, labelKey: "nav.version_history" },
  { href: "/dashboard/import-kanzlei", icon: FileUp, labelKey: "nav.import_kanzlei" },
  { href: "/dashboard/mobile", icon: UserCircle, labelKey: "nav.mobile" },
  { href: "/dashboard/onboarding", icon: Award, labelKey: "nav.onboarding" },
  { href: "/dashboard/experience", icon: Award, labelKey: "nav.experience" },
  { href: "/dashboard/agents", icon: Bot, labelKey: "nav.agents" },
  { href: "/dashboard/connectors", icon: Plug, labelKey: "nav.connectors" },
  { href: "/dashboard/api-keys", icon: ShieldCheck, labelKey: "nav.api_keys" },
  { href: "/dashboard/billing", icon: CreditCard, labelKey: "nav.billing" },
  { href: "/dashboard/settings/kanzlei", icon: Settings, labelKey: "nav.kanzlei" },
  { href: "/dashboard/settings/security", icon: ShieldCheck, labelKey: "nav.security" },
  { href: "/dashboard/settings/scim", icon: Network, labelKey: "nav.scim" },
  { href: "/dashboard/settings/ai-model", icon: Bot, labelKey: "nav.ai_model" },
  {
    href: "/dashboard/whatsapp/templates",
    icon: MessageCircle,
    labelKey: "nav.whatsapp_templates",
  },
  { href: "/dashboard/rag-eval", icon: FileSearch, labelKey: "nav.rag_eval" },
  { href: "/dashboard/portfolio-insights", icon: BarChart3, labelKey: "nav.portfolio_insights" },
  { href: "/dashboard/deep-analysis", icon: FileSearch, labelKey: "nav.deep_analysis" },
  { href: "/dashboard/adoption-analytics", icon: BarChart3, labelKey: "nav.adoption_analytics" },
  { href: "/dashboard/analytics", icon: TrendingUp, labelKey: "nav.analytics" },
  { href: "/dashboard/reports", icon: FileText, labelKey: "nav.reports" },
  { href: "/dashboard/shared-spaces", icon: Share2, labelKey: "nav.shared_spaces" },
];

export const PREFERRED_SECTION_BY_HREF: Array<{ href: string; section: DashboardKey }> = [
  { href: "/dashboard/contacts", section: "nav.section.cases_clients" },
  { href: "/dashboard/opponents", section: "nav.section.cases_clients" },
  { href: "/dashboard/client-portal", section: "nav.section.cases_clients" },
  { href: "/dashboard/document-requests", section: "nav.section.cases_clients" },
  { href: "/dashboard/kollisionspruefung", section: "nav.section.cases_clients" },
  { href: "/dashboard/process-strategy", section: "nav.section.cases_clients" },
  { href: "/dashboard/cases", section: "nav.section.cases_clients" },
  { href: "/dashboard/case-scanner", section: "nav.section.cases_clients" },
  { href: "/dashboard/bea", section: "nav.section.communication" },
  { href: "/dashboard/whatsapp", section: "nav.section.communication" },
  { href: "/dashboard/whatsapp/templates", section: "nav.section.communication" },
  { href: "/dashboard/email-import", section: "nav.section.communication" },
  { href: "/dashboard/upload", section: "nav.section.documents_drafting" },
  { href: "/dashboard/vault", section: "nav.section.documents_drafting" },
  { href: "/dashboard/drafting", section: "nav.section.documents_drafting" },
  { href: "/dashboard/analyze", section: "nav.section.documents_drafting" },
  { href: "/dashboard/contracts", section: "nav.section.documents_drafting" },
  { href: "/dashboard/clause-library", section: "nav.section.documents_drafting" },
  { href: "/dashboard/templates", section: "nav.section.documents_drafting" },
  { href: "/dashboard/litigation", section: "nav.section.documents_drafting" },
  { href: "/dashboard/tabular-review", section: "nav.section.documents_drafting" },
  { href: "/dashboard/obligation-tracking", section: "nav.section.documents_drafting" },
  { href: "/dashboard/translate", section: "nav.section.documents_drafting" },
  { href: "/dashboard/signature", section: "nav.section.documents_drafting" },
  { href: "/dashboard/word-addin", section: "nav.section.documents_drafting" },
  { href: "/dashboard/version-history", section: "nav.section.documents_drafting" },
  { href: "/dashboard/research", section: "nav.section.research_knowledge" },
  { href: "/dashboard/rechtsprechung", section: "nav.section.research_knowledge" },
  { href: "/dashboard/norms", section: "nav.section.research_knowledge" },
  { href: "/dashboard/precedent-search", section: "nav.section.research_knowledge" },
  { href: "/dashboard/brain", section: "nav.section.research_knowledge" },
  { href: "/dashboard/graph", section: "nav.section.research_knowledge" },
  { href: "/dashboard/sources", section: "nav.section.research_knowledge" },
  { href: "/dashboard/monitoring", section: "nav.section.research_knowledge" },
  { href: "/dashboard/playbooks", section: "nav.section.research_knowledge" },
  { href: "/dashboard/judgements-sync", section: "nav.section.research_knowledge" },
  { href: "/dashboard/review-queue", section: "nav.section.operations" },
  { href: "/dashboard/approvals", section: "nav.section.operations" },
  { href: "/dashboard/workflows", section: "nav.section.operations" },
  { href: "/dashboard/reports", section: "nav.section.operations" },
  { href: "/dashboard/invoicing", section: "nav.section.billing_compliance" },
  { href: "/dashboard/cost-calculator", section: "nav.section.billing_compliance" },
  { href: "/dashboard/datev-export", section: "nav.section.billing_compliance" },
  { href: "/dashboard/controlling", section: "nav.section.billing_compliance" },
  { href: "/dashboard/billing", section: "nav.section.admin" },
  { href: "/dashboard/compliance", section: "nav.section.billing_compliance" },
  { href: "/dashboard/compliance/retention", section: "nav.section.billing_compliance" },
  { href: "/dashboard/anonymize", section: "nav.section.billing_compliance" },
  { href: "/dashboard/verfahrensdoku", section: "nav.section.billing_compliance" },
  { href: "/dashboard/data-export", section: "nav.section.billing_compliance" },
  { href: "/dashboard/import-kanzlei", section: "nav.section.admin" },
  { href: "/dashboard/team", section: "nav.section.admin" },
  { href: "/dashboard/experience", section: "nav.section.admin" },
  { href: "/dashboard/agents", section: "nav.section.admin" },
  { href: "/dashboard/connectors", section: "nav.section.admin" },
  { href: "/dashboard/api-keys", section: "nav.section.admin" },
  { href: "/dashboard/audit", section: "nav.section.admin" },
  { href: "/dashboard/settings", section: "nav.section.admin" },
  { href: "/dashboard/settings/kanzlei", section: "nav.section.admin" },
  { href: "/dashboard/settings/security", section: "nav.section.admin" },
  { href: "/dashboard/settings/scim", section: "nav.section.admin" },
  { href: "/dashboard/settings/ai-model", section: "nav.section.admin" },
  { href: "/dashboard/mobile", section: "nav.section.admin" },
  { href: "/dashboard/onboarding", section: "nav.section.admin" },
  { href: "/dashboard/rag-eval", section: "nav.section.admin" },
  { href: "/dashboard/portfolio-insights", section: "nav.section.admin" },
  { href: "/dashboard/deep-analysis", section: "nav.section.documents_drafting" },
  { href: "/dashboard/adoption-analytics", section: "nav.section.admin" },
  { href: "/dashboard/analytics", section: "nav.section.operations" },
  { href: "/dashboard/shared-spaces", section: "nav.section.operations" },
  { href: "/dashboard/chat/analytics", section: "nav.section.admin" },
  { href: "/dashboard/chat/compare", section: "nav.section.admin" },
  { href: "/dashboard/assistant", section: "nav.section.admin" },
  { href: "/dashboard/query", section: "nav.section.admin" },
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
  ref
) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const [openSections, setOpenSections] = useState<DashboardKey[]>([]);
  const [isDesktop, setIsDesktop] = useState(false);
  const isDesktopMQ = useIsDesktop();
  const { t, lang } = useLang();
  const { panelTransition: sidebarPanelTransition } = useDashboardMotion();
  const sidebarShellTransition = sidebarPanelTransition;
  const sidebarWidth = collapsed && isDesktop ? 64 : 220;

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
    const sections = [...NAV_SECTIONS, ADMIN_SECTION];
    return sections
      .map((section) => ({
        ...section,
        items: ALL_NAV_ITEMS.filter((item) => {
          const preferred = PREFERRED_SECTION_BY_HREF.find((entry) => entry.href === item.href);
          const sectionKey = preferred?.section ?? "nav.section.admin";
          return (
            sectionKey === section.titleKey &&
            !item.comingSoon &&
            !PRIMARY_ITEMS.some((primary) => primary.href === item.href) &&
            t(item.labelKey).toLowerCase().includes(q)
          );
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [searchQuery, t]);

  const filteredBottomItems = useMemo(() => {
    if (!searchQuery.trim()) return BOTTOM_ITEMS;
    return [];
  }, [searchQuery]);

  const hasResults = filteredSections.length > 0 || filteredBottomItems.length > 0;
  const accordionSections = useMemo<NavSection[]>(() => {
    const sections = [...filteredSections];
    if (filteredBottomItems.length > 0) {
      sections.push({ ...ADMIN_SECTION, items: filteredBottomItems });
    }
    return sections;
  }, [filteredSections, filteredBottomItems]);

  const activeSection = useMemo(
    () => findActiveSection(pathname, [...NAV_SECTIONS, ADMIN_SECTION]),
    [pathname]
  );

  useEffect(() => {
    setIsDesktop(isDesktopMQ);
  }, [isDesktopMQ]);

  useEffect(() => {
    if (searchQuery.trim()) return;
    setOpenSections(activeSection ? [activeSection] : []);
  }, [activeSection, searchQuery]);

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
    setOpenSections((current) => {
      if (current.includes(titleKey)) {
        return current.filter((section) => section !== titleKey);
      }
      if (searchQuery.trim()) {
        return [...current, titleKey];
      }
      return [titleKey];
    });
  };

  return (
    <motion.aside
      ref={ref}
      data-tour="sidebar"
      initial={false}
      animate={{
        width: sidebarWidth,
      }}
      transition={sidebarShellTransition}
      className={cn(
        "sidebar-shadow z-50 shrink-0 overflow-hidden border-r border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] transition-transform duration-[var(--ds-duration-panel)] ease-[var(--ds-ease-panel)] will-change-[width,transform] motion-reduce:transition-none",
        "fixed inset-y-0 left-0 md:static",
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
      {/* Inner wrapper — width matches collapsed state so justify-center works. */}
      <div
        className={cn(
          "flex h-full flex-col transition-[width] duration-[var(--ds-duration-panel)] ease-[var(--ds-ease-panel)] motion-reduce:transition-none",
          collapsed ? "w-16" : "w-[220px]"
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex h-14 items-center gap-2.5 border-b border-[color:var(--ds-border)] px-4",
            collapsed && "md:w-16 md:justify-center md:px-0"
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
            <SubsumioMark size={28} />
          </Link>
          <Link
            href="/dashboard"
            className={cn(
              "font-display text-[13px] font-bold tracking-tight text-[color:var(--ds-text)] transition-[opacity] duration-[var(--ds-duration-slow)] ease-[var(--ds-ease-smooth)]",
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
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2 pr-3 pl-9 text-[13px] text-[color:var(--ds-text)] transition-[border-color,box-shadow] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--ds-border-strong)] focus:ring-0 focus:outline-none"
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
          <nav
            className={cn("py-4", collapsed ? "px-2" : "px-3")}
            aria-label={t("sidebar.main_nav")}
          >
            {!hasResults && !collapsed && (
              <div className="px-3 py-8 text-center">
                <p className="text-xs text-[color:var(--ds-text-subtle)]">
                  {t("sidebar.no_results")} „{searchQuery}&quot;
                </p>
              </div>
            )}
            <div className={cn("space-y-0.5", collapsed && "hidden md:block")}>
              {PRIMARY_ITEMS.map((item, index) => {
                const Icon = item.icon;
                const active = isActiveHref(pathname, item.href);
                const colorVar = PRIMARY_COLOR_VARS[index] ?? "--nav-cat-cases";
                return (
                  <Link
                    key={`primary-${item.href}`}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? t(item.labelKey) : undefined}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? t(item.labelKey) : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg text-[13px] font-semibold transition-[background-color,color] duration-[120ms] ease-[var(--ds-ease-smooth)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none",
                      collapsed ? "h-9 justify-center px-0" : "h-9 px-3",
                      active
                        ? "brand-soft brand-text shadow-[0_0_12px_-2px_var(--brand-glow)]"
                        : "text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
                    )}
                  >
                    {collapsed && active && (
                      <span
                        className="absolute top-1/2 left-0 h-5 w-[2px] -translate-y-1/2 rounded-r-full"
                        style={{ backgroundColor: `var(${colorVar})` }}
                        aria-hidden
                      />
                    )}
                    <Icon
                      size={collapsed ? 18 : 15}
                      className="shrink-0 transition-[color,opacity] duration-150"
                      strokeWidth={active && collapsed ? 2.25 : 1.75}
                      style={{
                        color: active
                          ? `var(${colorVar})`
                          : `color-mix(in srgb, var(${colorVar}) 55%, var(--ds-text-muted))`,
                      }}
                    />
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

            {/* Collapsed: section-grouped icon list */}
            {collapsed && (
              <div className="mt-3 border-t border-[color:var(--ds-border)] pt-3">
                {accordionSections.map((section, sectionIndex) => {
                  const sectionItems = section.items.filter(
                    (item) => !item.comingSoon && !PRIMARY_ITEMS.some((p) => p.href === item.href)
                  );
                  if (sectionItems.length === 0) return null;
                  return (
                    <div
                      key={`collapsed-section-${section.titleKey}`}
                      className={cn(
                        "space-y-0.5 px-2",
                        sectionIndex > 0 && "mt-3 border-t border-[color:var(--ds-border)]/60 pt-3"
                      )}
                    >
                      {sectionItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActiveHref(pathname, item.href);
                        const catVar = section.colorVar ?? "--nav-cat-ops";
                        return (
                          <Link
                            key={`collapsed-${item.href}`}
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            aria-label={t(item.labelKey)}
                            onClick={() => setMobileOpen(false)}
                            title={t(item.labelKey)}
                            className={cn(
                              "group relative flex h-8 items-center justify-center rounded-lg text-[13px] transition-[background-color,color] duration-[120ms] ease-[var(--ds-ease-smooth)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none",
                              active
                                ? "brand-soft brand-text"
                                : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                            )}
                          >
                            {active && (
                              <span
                                className="absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-r-full"
                                style={{ backgroundColor: `var(${catVar})` }}
                                aria-hidden
                              />
                            )}
                            <Icon
                              size={18}
                              className="shrink-0 transition-[color] duration-150"
                              strokeWidth={active ? 2.25 : 1.75}
                              style={{
                                color: active
                                  ? `var(${catVar})`
                                  : `color-mix(in srgb, var(${catVar}) 55%, var(--ds-text-muted))`,
                              }}
                            />
                          </Link>
                        );
                      })}
                    </div>
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
                  const catVar = section.colorVar ?? "--nav-cat-ops";
                  return (
                    <div
                      key={section.titleKey}
                      className={cn(
                        "rounded-lg border transition-[background-color,border-color,box-shadow,opacity] duration-200 ease-[var(--ds-ease-smooth)]",
                        section.titleKey === "nav.section.admin"
                          ? "border-[color:var(--ds-border)] bg-transparent"
                          : "border-transparent",
                        isOpen
                          ? "border-[color:var(--ds-border-hover)] bg-[color:var(--ds-surface-2)] shadow-sm"
                          : sectionActive
                            ? "brand-border brand-soft bg-[color:var(--ds-surface)]"
                            : "hover:bg-[color:var(--ds-hover)]"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSection(section.titleKey)}
                        className="group flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] font-semibold text-[color:var(--ds-text)] transition-colors hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                      >
                        <SectionIcon
                          size={15}
                          className="shrink-0 transition-[color] duration-150 group-hover:[color:var(--ds-text)]"
                          style={{
                            color:
                              sectionActive || isOpen
                                ? `var(${catVar})`
                                : `color-mix(in srgb, var(${catVar}) 55%, var(--ds-text-muted))`,
                          }}
                        />
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wider uppercase",
                            sectionActive || isOpen
                              ? "text-[color:var(--ds-text)]"
                              : "text-[color:var(--ds-text-subtle)]"
                          )}
                        >
                          {t(section.titleKey)}
                        </span>
                        {sectionActive && !isOpen && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: `var(${catVar})` }}
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
                      <motion.div
                        id={panelId}
                        initial={false}
                        animate={{
                          height: isOpen ? "auto" : 0,
                          opacity: isOpen ? 1 : 0,
                        }}
                        transition={sidebarPanelTransition}
                        className="overflow-hidden"
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
                              const itemCatVar = section.colorVar ?? "--nav-cat-ops";
                              if (item.comingSoon) {
                                return (
                                  <button
                                    key={item.href}
                                    disabled
                                    className="flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[color:var(--ds-text-subtle)] select-none"
                                    aria-disabled="true"
                                  >
                                    <Icon
                                      size={15}
                                      className="shrink-0 opacity-50"
                                      style={{
                                        color: `color-mix(in srgb, var(${itemCatVar}) 45%, var(--ds-text-subtle))`,
                                      }}
                                    />
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
                                    "sidebar-item-in relative flex h-8 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-[background-color,color,transform] duration-[120ms] ease-[var(--ds-ease-panel)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none active:scale-[0.99]",
                                    active
                                      ? "brand-soft brand-text font-semibold shadow-[0_0_10px_-2px_var(--brand-glow)]"
                                      : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                                  )}
                                >
                                  <Icon
                                    size={15}
                                    className="shrink-0 transition-[color] duration-150"
                                    style={{
                                      color: active
                                        ? `var(${itemCatVar})`
                                        : `color-mix(in srgb, var(${itemCatVar}) 55%, var(--ds-text-muted))`,
                                    }}
                                  />
                                  <span className="min-w-0 flex-1 truncate">
                                    {highlightMatch(t(item.labelKey), searchQuery)}
                                  </span>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
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
          <div
            className={cn(
              "border-t border-[color:var(--ds-border)] pt-3 pb-3",
              collapsed ? "px-2" : "px-3"
            )}
          >
            <Link
              href="/dashboard/settings"
              onClick={() => setMobileOpen(false)}
              title={collapsed ? (userName ?? t("sidebar.user")) : undefined}
              className={cn(
                "group flex items-center rounded-lg transition-[background-color,color] duration-[120ms] ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)]",
                collapsed ? "h-9 justify-center px-0" : "gap-3 px-3 py-1.5"
              )}
            >
              <div className="brand-soft brand-border flex h-8 w-8 shrink-0 items-center justify-center rounded-full border">
                {userName ? (
                  <span className="brand-text text-[10px] font-bold uppercase">
                    {userName.slice(0, 2)}
                  </span>
                ) : (
                  <User size={13} className="brand-text" />
                )}
              </div>
              <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
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

        <div
          className={cn(
            "border-t border-[color:var(--ds-border)] py-3",
            collapsed ? "px-2" : "px-3"
          )}
        >
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse_aria")}
            aria-expanded={!collapsed}
            className={cn(
              "hidden w-full items-center gap-3 rounded-lg text-[13px] text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[120ms] ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] md:flex",
              collapsed ? "h-9 justify-center px-0" : "px-3 py-2"
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
    </motion.aside>
  );
});
