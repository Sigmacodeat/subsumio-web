"use client";

import { useState, useMemo, forwardRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  BookOpen,
  Network,
  Upload,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  Bell,
  User,
  Users,
  CreditCard,
  X,
  Briefcase,
  CalendarClock,
  Scale,
  ShieldAlert,
  Landmark,
  Plug,
  PenTool,
  Swords,
  UserCircle,
  ShieldCheck,
  FileSpreadsheet,
  ScrollText,
  Bot,
  FileText,
  Mail,
  RefreshCw,
  FileSignature,
  EyeOff,
  Table2,
  Gavel,
  CloudOff,
  BarChart3,
  Archive,
  Building2,
  Shield,
  Key,
  FolderOpen,
  Sparkles,
  Globe,
  Search,
  ClipboardList,
  Cpu,
  FileSearch,
  Radar,
  Languages,
  ListChecks,
  Library,
  CheckSquare,
  History,
  Database,
  Workflow,
  Inbox,
  FileClock,
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

export const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: "nav.section.cockpit",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, labelKey: "nav.overview" },
      { href: "/dashboard/intake", icon: Inbox, labelKey: "nav.intake" },
      { href: "/dashboard/deadlines", icon: CalendarClock, labelKey: "nav.deadlines" },
      { href: "/dashboard/cases", icon: Briefcase, labelKey: "nav.cases" },
      { href: "/dashboard/approvals", icon: Gavel, labelKey: "nav.approvals" },
      { href: "/dashboard/review-queue", icon: CheckSquare, labelKey: "nav.review_queue" },
      { href: "/dashboard/workflows", icon: Workflow, labelKey: "nav.workflows" },
    ],
  },
  {
    titleKey: "nav.section.cases_clients",
    items: [
      { href: "/dashboard/cases", icon: Briefcase, labelKey: "nav.cases" },
      { href: "/dashboard/contacts", icon: Users, labelKey: "nav.contacts" },
      { href: "/dashboard/client-portal", icon: UserCircle, labelKey: "nav.client_portal" },
      { href: "/dashboard/opponents", icon: Swords, labelKey: "nav.opponents" },
      { href: "/dashboard/contracts", icon: ShieldCheck, labelKey: "nav.contracts" },
      { href: "/dashboard/vault", icon: FolderOpen, labelKey: "nav.vault" },
      { href: "/dashboard/document-requests", icon: FileClock, labelKey: "nav.document_requests" },
      { href: "/dashboard/playbooks", icon: ClipboardList, labelKey: "nav.playbooks" },
    ],
  },
  {
    titleKey: "nav.section.inbox_deadlines",
    items: [
      { href: "/dashboard/bea", icon: Mail, labelKey: "nav.bea" },
      { href: "/dashboard/email-import", icon: Mail, labelKey: "nav.email_import" },
      { href: "/dashboard/whatsapp", icon: MessageSquare, labelKey: "nav.whatsapp" },
      { href: "/dashboard/intake", icon: Inbox, labelKey: "nav.intake" },
      { href: "/dashboard/deadlines", icon: CalendarClock, labelKey: "nav.deadlines" },
      { href: "/dashboard/calendar-export", icon: CalendarClock, labelKey: "nav.calendar_export" },
      { href: "/dashboard/case-scanner", icon: Radar, labelKey: "nav.case_scanner" },
      {
        href: "/dashboard/kollisionspruefung",
        icon: ShieldAlert,
        labelKey: "nav.kollisionspruefung",
      },
    ],
  },
  {
    titleKey: "nav.section.documents_drafting",
    items: [
      { href: "/dashboard/upload", icon: Upload, labelKey: "nav.upload" },
      { href: "/dashboard/vault", icon: FolderOpen, labelKey: "nav.vault" },
      { href: "/dashboard/drafting", icon: PenTool, labelKey: "nav.drafting" },
      { href: "/dashboard/analyze", icon: FileSearch, labelKey: "nav.analyze" },
      { href: "/dashboard/tabular-review", icon: Table2, labelKey: "nav.tabular_review" },
      { href: "/dashboard/clause-library", icon: Library, labelKey: "nav.clause_library" },
      { href: "/dashboard/signature", icon: FileSignature, labelKey: "nav.signature" },
      { href: "/dashboard/word-addin", icon: FileText, labelKey: "nav.word_addin" },
      { href: "/dashboard/translate", icon: Languages, labelKey: "nav.translate" },
      { href: "/dashboard/version-history", icon: History, labelKey: "nav.version_history" },
    ],
  },
  {
    titleKey: "nav.section.research_knowledge",
    items: [
      { href: "/dashboard/research", icon: Globe, labelKey: "nav.legal_research" },
      { href: "/dashboard/precedent-search", icon: Search, labelKey: "nav.precedent_search" },
      { href: "/dashboard/rechtsprechung", icon: Landmark, labelKey: "nav.rechtsprechung" },
      { href: "/dashboard/norms", icon: BookOpen, labelKey: "nav.norms" },
      { href: "/dashboard/judgements-sync", icon: RefreshCw, labelKey: "nav.judgements_sync" },
      {
        href: "/dashboard/obligation-tracking",
        icon: ListChecks,
        labelKey: "nav.obligation_tracking",
      },
      { href: "/dashboard/monitoring", icon: Bell, labelKey: "nav.monitoring" },
      { href: "/dashboard/query", icon: MessageSquare, labelKey: "nav.query" },
      { href: "/dashboard/brain", icon: BookOpen, labelKey: "nav.brain" },
      { href: "/dashboard/graph", icon: Network, labelKey: "nav.graph" },
      { href: "/dashboard/sources", icon: Database, labelKey: "nav.sources" },
    ],
  },
  {
    titleKey: "nav.section.billing_compliance",
    items: [
      { href: "/dashboard/cost-calculator", icon: Scale, labelKey: "nav.cost_calculator" },
      { href: "/dashboard/invoicing", icon: FileText, labelKey: "nav.invoicing" },
      { href: "/dashboard/datev-export", icon: FileSpreadsheet, labelKey: "nav.datev_export" },
      { href: "/dashboard/controlling", icon: BarChart3, labelKey: "nav.controlling" },
      { href: "/dashboard/compliance", icon: ShieldCheck, labelKey: "nav.compliance" },
      { href: "/dashboard/compliance/retention", icon: CalendarClock, labelKey: "nav.retention" },
      { href: "/dashboard/anonymize", icon: EyeOff, labelKey: "nav.anonymize" },
      { href: "/dashboard/verfahrensdoku", icon: ScrollText, labelKey: "nav.verfahrensdoku" },
      { href: "/dashboard/data-export", icon: Archive, labelKey: "nav.data_export" },
      { href: "/dashboard/import-kanzlei", icon: FileSpreadsheet, labelKey: "nav.import_kanzlei" },
    ],
  },
  {
    titleKey: "nav.section.industries",
    items: [
      {
        href: "/dashboard/consulting",
        icon: Building2,
        labelKey: "nav.consulting",
        comingSoon: true,
      },
      { href: "/dashboard/insurance", icon: Shield, labelKey: "nav.insurance", comingSoon: true },
      { href: "/dashboard/medical", icon: FileText, labelKey: "nav.medical", comingSoon: true },
      {
        href: "/dashboard/realestate",
        icon: Landmark,
        labelKey: "nav.realestate",
        comingSoon: true,
      },
      { href: "/dashboard/recruiting", icon: Users, labelKey: "nav.recruiting", comingSoon: true },
      { href: "/dashboard/tax", icon: FileSpreadsheet, labelKey: "nav.tax", comingSoon: true },
      { href: "/dashboard/vc", icon: Network, labelKey: "nav.vc", comingSoon: true },
    ],
  },
];

export const BOTTOM_ITEMS: NavItem[] = [
  { href: "/dashboard/team", icon: Users, labelKey: "nav.team" },
  { href: "/dashboard/assistant", icon: Bot, labelKey: "nav.assistant" },
  { href: "/dashboard/agents", icon: Sparkles, labelKey: "nav.agents" },
  { href: "/dashboard/connectors", icon: Plug, labelKey: "nav.connectors" },
  { href: "/dashboard/audit", icon: ScrollText, labelKey: "nav.audit_log" },
  { href: "/dashboard/rag-eval", icon: BarChart3, labelKey: "nav.rag_eval" },
  { href: "/dashboard/api-keys", icon: Key, labelKey: "nav.api_keys" },
  { href: "/dashboard/billing", icon: CreditCard, labelKey: "nav.billing" },
  { href: "/dashboard/settings", icon: Settings, labelKey: "nav.settings" },
  { href: "/dashboard/settings/ai-model", icon: Cpu, labelKey: "nav.ai_model" },
  { href: "/dashboard/settings/kanzlei", icon: Building2, labelKey: "nav.kanzlei" },
  { href: "/dashboard/settings/security", icon: Shield, labelKey: "nav.security" },
];

function SyncStatus({ collapsed }: { collapsed: boolean }) {
  const { pendingCount, syncing, syncPending } = useMutationQueue();
  const { t } = useLang();
  if (collapsed || pendingCount === 0) return null;
  return (
    <div className="mx-3 mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-amber-600">
          {pendingCount} {t("sidebar.changes_pending")}
        </span>
        <button
          onClick={() => void syncPending()}
          disabled={syncing}
          className="brand-text text-xs transition-all disabled:opacity-50"
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
      className="flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-2 py-1 text-xs font-medium text-red-600"
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
  },
  _ref
) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useLang();

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

  return (
    <aside
      className={cn(
        "sidebar-shadow z-50 flex shrink-0 flex-col border-r border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] transition-all duration-200",
        "fixed inset-y-0 left-0 md:static",
        collapsed ? "md:w-16" : "md:w-64",
        mobileOpen ? "w-64 translate-x-0" : "-translate-x-full md:translate-x-0",
        "w-64"
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
      {/* Logo */}
      <div
        className={cn(
          "flex h-16 items-center gap-2.5 border-b border-[color:var(--ds-border)] px-4",
          collapsed && "md:justify-center md:px-0"
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-all hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] md:hidden"
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
        {!collapsed && (
          <Link
            href="/dashboard"
            className="font-display text-[15px] font-bold tracking-tight text-[color:var(--ds-text)]"
            onClick={() => setMobileOpen(false)}
          >
            Subsum<span className="brand-text">•io</span>
          </Link>
        )}
      </div>

      <div className="flex-1 overflow-x-hidden overflow-y-auto pb-3">
        {/* Brain status */}
        {!collapsed && (
          <div
            className="mx-3 mt-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2.5"
            role="status"
            aria-label={`${t("sidebar.brain_status")}: ${t("sidebar.active")}, ${pages} pages, ${entities} entities`}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                {t("sidebar.brain_status")}
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
                  aria-hidden
                />
                <span className="text-xs font-medium text-emerald-600">{t("sidebar.active")}</span>
              </div>
            </div>
            <div className="font-mono text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
              {pages} pages · {entities} entities
            </div>
          </div>
        )}
        {collapsed && (
          <div
            className="mt-4 hidden items-center justify-center md:flex"
            title={`${t("sidebar.brain_status")}: ${t("sidebar.active")}`}
          >
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"
              role="status"
              aria-label={`${t("sidebar.brain_status")}: ${t("sidebar.active")}`}
            />
          </div>
        )}

        {/* Sync status */}
        <SyncStatus collapsed={collapsed} />

        {/* Search / Filter */}
        {!collapsed && (
          <div className="px-3 pt-3">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("sidebar.filter_placeholder")}
                className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-2 pr-3 pl-8 text-xs text-[color:var(--ds-text)] transition-all placeholder:text-[color:var(--ds-text-subtle)] focus:border-transparent focus:ring-2 focus:ring-[var(--brand-primary)] focus:outline-none"
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
        )}

        {/* Nav */}
        <nav className="px-3 py-4" aria-label={t("sidebar.main_nav")}>
          {!hasResults && !collapsed && (
            <div className="px-3 py-8 text-center">
              <p className="text-xs text-[color:var(--ds-text-subtle)]">
                {t("sidebar.no_results")} „{searchQuery}&quot;
              </p>
            </div>
          )}
          {filteredSections.map((section) => (
            <div key={section.titleKey} className="mb-5">
              {!collapsed && (
                <div className="mb-2 px-3">
                  <span className="text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
                    {t(section.titleKey)}
                  </span>
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  if (item.comingSoon) {
                    return (
                      <button
                        key={item.href}
                        disabled
                        className={cn(
                          "flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[color:var(--ds-text-subtle)] select-none",
                          collapsed && "justify-center px-0"
                        )}
                        title={
                          collapsed
                            ? `${t(item.labelKey)} — ${t("sidebar.coming_soon")}`
                            : undefined
                        }
                        aria-disabled="true"
                      >
                        <Icon size={17} className="shrink-0 opacity-50" />
                        {!collapsed && (
                          <span className="flex flex-1 items-center justify-between">
                            {t(item.labelKey)}
                            <span className="rounded border border-[color:var(--ds-border-strong)] px-1 py-0.5 text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                              {t("sidebar.coming_soon")}
                            </span>
                          </span>
                        )}
                      </button>
                    );
                  }
                  const active =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      aria-label={collapsed ? t(item.labelKey) : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none",
                        collapsed && "justify-center px-0",
                        active
                          ? "brand-soft brand-text hover:brand-soft-strong border-l-2 border-[var(--brand-primary)]"
                          : "hover:brand-text text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
                      )}
                      title={collapsed ? t(item.labelKey) : undefined}
                    >
                      <Icon size={17} className="shrink-0" />
                      {!collapsed && highlightMatch(t(item.labelKey), searchQuery)}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Dream Cycle indicator */}
        {!collapsed && (
          <div
            className={cn(
              "mx-3 mt-2 mb-4 rounded-xl border px-3 py-3",
              dreamCycle
                ? "border-emerald-500/20 bg-emerald-500/[0.06]"
                : "border-amber-500/20 bg-amber-500/[0.06]"
            )}
          >
            <div className="flex items-center gap-2">
              <Zap
                size={12}
                className={cn("shrink-0", dreamCycle ? "text-emerald-700" : "text-amber-700")}
              />
              <span
                className={cn(
                  "text-xs font-semibold",
                  dreamCycle ? "text-emerald-700" : "text-amber-700"
                )}
              >
                {t("sidebar.dream_cycle")}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-snug text-[color:var(--ds-text-muted)]">
              {dreamCycle
                ? `${t("sidebar.dream_last_run")} ${new Date(dreamCycle).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                : t("sidebar.dream_not_scheduled")}
            </p>
          </div>
        )}

        {/* Bottom — Verwaltung + User Profile */}
        <div className="space-y-0.5 border-t border-[color:var(--ds-border)] px-3 pt-4 pb-4">
          {!collapsed && (
            <div className="mb-2 px-3">
              <span className="text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
                {t("nav.section.admin")}
              </span>
            </div>
          )}
          {filteredBottomItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? t(item.labelKey) : undefined}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none",
                  collapsed && "justify-center px-0",
                  active
                    ? "brand-soft brand-text hover:brand-soft-strong border-l-2 border-[var(--brand-primary)]"
                    : "hover:brand-text text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
                )}
                title={collapsed ? t(item.labelKey) : undefined}
              >
                <Icon size={17} className="shrink-0" />
                {!collapsed && highlightMatch(t(item.labelKey), searchQuery)}
              </Link>
            );
          })}

          {/* User profile section */}
          {!collapsed && (
            <div className="mt-4 border-t border-[color:var(--ds-border)] pt-4">
              <Link
                href="/dashboard/settings"
                onClick={() => setMobileOpen(false)}
                className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:bg-[color:var(--ds-hover)]"
              >
                <div className="brand-soft brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-full border">
                  <User size={15} className="brand-text" />
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
          )}
        </div>
      </div>

      <div className="border-t border-[color:var(--ds-border)] px-3 py-3">
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse_aria")}
          aria-expanded={!collapsed}
          className={cn(
            "hidden w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[color:var(--ds-text-muted)] transition-all duration-150 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] md:flex",
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
    </aside>
  );
});
