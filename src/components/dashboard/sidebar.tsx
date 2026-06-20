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
  Smartphone,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutationQueue } from "@/lib/use-mutation";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { useNetworkStatus } from "@/lib/use-offline-sync";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

type NavItem = { href: string; icon: typeof LayoutDashboard; labelKey: DashboardKey; comingSoon?: boolean };
type NavSection = { titleKey: DashboardKey; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: "nav.section.brain",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, labelKey: "nav.overview" },
      { href: "/dashboard/assistant", icon: Bot, labelKey: "nav.assistant" },
      { href: "/dashboard/query", icon: MessageSquare, labelKey: "nav.query" },
      { href: "/dashboard/agents", icon: Sparkles, labelKey: "nav.agents" },
      { href: "/dashboard/approvals", icon: Gavel, labelKey: "nav.approvals" },
      { href: "/dashboard/brain", icon: BookOpen, labelKey: "nav.brain" },
      { href: "/dashboard/graph", icon: Network, labelKey: "nav.graph" },
      { href: "/dashboard/upload", icon: Upload, labelKey: "nav.upload" },
      { href: "/dashboard/rag-eval", icon: BarChart3, labelKey: "nav.rag_eval" },
    ],
  },
  {
    titleKey: "nav.section.cases_deadlines",
    items: [
      { href: "/dashboard/cases", icon: Briefcase, labelKey: "nav.cases" },
      { href: "/dashboard/contacts", icon: Users, labelKey: "nav.contacts" },
      { href: "/dashboard/contracts", icon: ShieldCheck, labelKey: "nav.contracts" },
      { href: "/dashboard/playbooks", icon: ClipboardList, labelKey: "nav.vault" },
      { href: "/dashboard/vault", icon: FolderOpen, labelKey: "nav.vault" },
      { href: "/dashboard/deadlines", icon: CalendarClock, labelKey: "nav.deadlines" },
      { href: "/dashboard/opponents", icon: Swords, labelKey: "nav.opponents" },
      { href: "/dashboard/client-portal", icon: UserCircle, labelKey: "nav.client_portal" },
    ],
  },
  {
    titleKey: "nav.section.research",
    items: [
      { href: "/dashboard/research", icon: Globe, labelKey: "nav.legal_research" },
      { href: "/dashboard/analyze", icon: FileSearch, labelKey: "nav.analyze" },
      { href: "/dashboard/precedent-search", icon: Search, labelKey: "nav.precedent_search" },
      { href: "/dashboard/translate", icon: Languages, labelKey: "nav.translate" },
      { href: "/dashboard/rechtsprechung", icon: Landmark, labelKey: "nav.rechtsprechung" },
      { href: "/dashboard/norms", icon: BookOpen, labelKey: "nav.norms" },
      { href: "/dashboard/judgements-sync", icon: RefreshCw, labelKey: "nav.judgements_sync" },
      { href: "/dashboard/kollisionspruefung", icon: ShieldAlert, labelKey: "nav.kollisionspruefung" },
      { href: "/dashboard/tabular-review", icon: Table2, labelKey: "nav.tabular_review" },
      { href: "/dashboard/obligation-tracking", icon: ListChecks, labelKey: "nav.obligation_tracking" },
      { href: "/dashboard/case-scanner", icon: Radar, labelKey: "nav.case_scanner" },
      { href: "/dashboard/clause-library", icon: Library, labelKey: "nav.clause_library" },
      { href: "/dashboard/review-queue", icon: CheckSquare, labelKey: "nav.review_queue" },
      { href: "/dashboard/version-history", icon: History, labelKey: "nav.version_history" },
      { href: "/dashboard/monitoring", icon: Bell, labelKey: "nav.monitoring" },
    ],
  },
  {
    titleKey: "nav.section.drafts_billing",
    items: [
      { href: "/dashboard/drafting", icon: PenTool, labelKey: "nav.drafting" },
      { href: "/dashboard/cost-calculator", icon: Scale, labelKey: "nav.cost_calculator" },
      { href: "/dashboard/invoicing", icon: FileText, labelKey: "nav.invoicing" },
      { href: "/dashboard/datev-export", icon: FileSpreadsheet, labelKey: "nav.datev_export" },
      { href: "/dashboard/signature", icon: FileSignature, labelKey: "nav.signature" },
    ],
  },
  {
    titleKey: "nav.section.data_integration",
    items: [
      { href: "/dashboard/connectors", icon: Plug, labelKey: "nav.connectors" },
      { href: "/dashboard/whatsapp", icon: MessageSquare, labelKey: "nav.whatsapp" },
      { href: "/dashboard/import-kanzlei", icon: FileSpreadsheet, labelKey: "nav.import_kanzlei" },
      { href: "/dashboard/bea", icon: Mail, labelKey: "nav.bea" },
      { href: "/dashboard/email-import", icon: Mail, labelKey: "nav.email_import" },
      { href: "/dashboard/calendar-export", icon: CalendarClock, labelKey: "nav.calendar_export" },
      { href: "/dashboard/compliance", icon: ShieldCheck, labelKey: "nav.compliance" },
      { href: "/dashboard/compliance/retention", icon: CalendarClock, labelKey: "nav.retention" },
      { href: "/dashboard/anonymize", icon: EyeOff, labelKey: "nav.anonymize" },
      { href: "/dashboard/word-addin", icon: FileText, labelKey: "nav.word_addin" },
      { href: "/dashboard/verfahrensdoku", icon: ScrollText, labelKey: "nav.verfahrensdoku" },
      { href: "/dashboard/data-export", icon: Archive, labelKey: "nav.data_export" },
    ],
  },
  {
    titleKey: "nav.section.industries",
    items: [
      { href: "/dashboard/consulting", icon: Building2, labelKey: "nav.consulting", comingSoon: true },
      { href: "/dashboard/insurance", icon: Shield, labelKey: "nav.insurance", comingSoon: true },
      { href: "/dashboard/medical", icon: FileText, labelKey: "nav.medical", comingSoon: true },
      { href: "/dashboard/realestate", icon: Landmark, labelKey: "nav.realestate", comingSoon: true },
      { href: "/dashboard/recruiting", icon: Users, labelKey: "nav.recruiting", comingSoon: true },
      { href: "/dashboard/tax", icon: FileSpreadsheet, labelKey: "nav.tax", comingSoon: true },
      { href: "/dashboard/vc", icon: Network, labelKey: "nav.vc", comingSoon: true },
    ],
  },
];

export const BOTTOM_ITEMS: NavItem[] = [
  { href: "/dashboard/team", icon: Users, labelKey: "nav.team" },
  { href: "/dashboard/controlling", icon: BarChart3, labelKey: "nav.controlling" },
  { href: "/dashboard/audit", icon: ScrollText, labelKey: "nav.audit_log" },
  { href: "/dashboard/api-keys", icon: Key, labelKey: "nav.api_keys" },
  { href: "/dashboard/billing", icon: CreditCard, labelKey: "nav.billing" },
  { href: "/dashboard/mobile", icon: Smartphone, labelKey: "nav.mobile" },
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
    <div className="mx-3 mt-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
      <div className="flex items-center justify-between">
        <span className="text-xs text-amber-600 font-medium">{pendingCount} {t("sidebar.changes_pending")}</span>
        <button
          onClick={() => void syncPending()}
          disabled={syncing}
          className="text-xs brand-text disabled:opacity-50 transition-all"
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
    <div role="status" aria-live="polite" className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-red-500/20 bg-red-500/5 text-red-600 text-xs font-medium" title={t("sidebar.offline_tooltip")}>
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

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar({
  collapsed,
  mobileOpen,
  setCollapsed,
  setMobileOpen,
  pages,
  entities,
  dreamCycle,
  userName,
  userEmail,
}, ref) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useLang();

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return NAV_SECTIONS;
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
        <mark className="bg-[var(--brand-primary)]/20 text-[color:var(--ds-text)] rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] sidebar-shadow transition-all duration-200 shrink-0 z-50",
        "fixed inset-y-0 left-0 md:static",
        collapsed ? "md:w-16" : "md:w-64",
        mobileOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0",
        "w-64"
      )}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const active = document.activeElement;
        if (!(active instanceof HTMLAnchorElement)) return;
        e.preventDefault();
        const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>('a[href]'));
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
      <div className={cn(
        "flex items-center gap-2.5 border-b border-[color:var(--ds-border)] h-16 px-4",
        collapsed && "md:justify-center md:px-0"
      )}>
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden w-11 h-11 rounded-lg flex items-center justify-center text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all"
          aria-label={t("sidebar.close_menu")}
        >
          <X size={18} />
        </button>
        <Link href="/dashboard" aria-label="Subsumio Dashboard" onClick={() => setMobileOpen(false)}>
          <SubsumioMark size={32} />
        </Link>
        {!collapsed && (
          <Link href="/dashboard" className="font-display text-base font-bold text-[color:var(--ds-text)] tracking-tight" onClick={() => setMobileOpen(false)}>
            Subsum<span className="brand-text">•io</span>
          </Link>
        )}
      </div>

      {/* Brain status */}
      {!collapsed && (
        <div
          className="mx-3 mt-4 px-3 py-2.5 rounded-xl bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)]"
          role="status"
          aria-label={`${t("sidebar.brain_status")}: ${t("sidebar.active")}, ${pages} pages, ${entities} entities`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">{t("sidebar.brain_status")}</span>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
              <span className="text-xs font-medium text-emerald-600">{t("sidebar.active")}</span>
            </div>
          </div>
          <div className="text-xs text-[color:var(--ds-text-subtle)] font-mono tabular-nums">{pages} pages · {entities} entities</div>
        </div>
      )}
      {collapsed && (
        <div className="hidden md:flex items-center justify-center mt-4" title={`${t("sidebar.brain_status")}: ${t("sidebar.active")}`}>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-label={`${t("sidebar.brain_status")}: ${t("sidebar.active")}`} />
        </div>
      )}

      {/* Sync status */}
      <SyncStatus collapsed={collapsed} />

      {/* Search / Filter */}
      {!collapsed && (
        <div className="px-3 pt-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-subtle)] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("sidebar.filter_placeholder")}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:border-transparent transition-all"
              aria-label={t("sidebar.filter_placeholder")}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)] transition-colors"
                aria-label={t("sidebar.filter_placeholder")}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto" aria-label={t("sidebar.main_nav")}>
        {!hasResults && !collapsed && (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-[color:var(--ds-text-subtle)]">{t("sidebar.no_results")} „{searchQuery}&quot;</p>
          </div>
        )}
        {filteredSections.map((section) => (
          <div key={section.titleKey} className="mb-5">
            {!collapsed && (
              <div className="px-3 mb-2">
                <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--ds-text-subtle)] font-semibold">{t(section.titleKey)}</span>
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
                        "flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[color:var(--ds-text-subtle)] cursor-not-allowed select-none",
                        collapsed && "justify-center px-0"
                      )}
                      title={collapsed ? `${t(item.labelKey)} — ${t("sidebar.coming_soon")}` : undefined}
                      aria-disabled="true"
                    >
                      <Icon size={17} className="shrink-0 opacity-50" />
                      {!collapsed && (
                        <span className="flex items-center justify-between flex-1">
                          {t(item.labelKey)}
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-subtle)] border border-[color:var(--ds-border-strong)] rounded px-1 py-0.5">{t("sidebar.coming_soon")}</span>
                        </span>
                      )}
                    </button>
                  );
                }
                const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? t(item.labelKey) : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] transition-all duration-150",
                      collapsed && "justify-center px-0",
                      active
                        ? "brand-soft brand-text border-l-2 border-[var(--brand-primary)] hover:brand-soft-strong"
                        : "text-[color:var(--ds-text-muted)] hover:brand-text hover:bg-[color:var(--ds-hover)]"
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
        <div className={cn(
          "mx-3 mt-2 mb-4 px-3 py-3 rounded-xl border",
          dreamCycle ? "border-emerald-500/20 bg-emerald-500/[0.06]" : "border-amber-500/20 bg-amber-500/[0.06]"
        )}>
          <div className="flex items-center gap-2">
            <Zap size={12} className={cn("shrink-0", dreamCycle ? "text-emerald-700" : "text-amber-700")} />
            <span className={cn("text-xs font-semibold", dreamCycle ? "text-emerald-700" : "text-amber-700")}>{t("sidebar.dream_cycle")}</span>
          </div>
          <p className="text-[11px] text-[color:var(--ds-text-muted)] mt-1.5 leading-snug">
            {dreamCycle
              ? `${t("sidebar.dream_last_run")} ${new Date(dreamCycle).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
              : t("sidebar.dream_not_scheduled")}
          </p>
        </div>
      )}

      {/* Bottom — Verwaltung + User Profile */}
      <div className="px-3 pb-4 space-y-0.5 border-t border-[color:var(--ds-border)] pt-4">
        {!collapsed && (
          <div className="px-3 mb-2">
            <span className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--ds-text-subtle)] font-semibold">{t("nav.section.admin")}</span>
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
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] transition-all duration-150",
                collapsed && "justify-center px-0",
                active
                  ? "brand-soft brand-text border-l-2 border-[var(--brand-primary)] hover:brand-soft-strong"
                  : "text-[color:var(--ds-text-muted)] hover:brand-text hover:bg-[color:var(--ds-hover)]"
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
          <div className="mt-4 pt-4 border-t border-[color:var(--ds-border)]">
            <Link
              href="/dashboard/settings"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[color:var(--ds-hover)] transition-all group"
            >
              <div className="w-9 h-9 rounded-full brand-soft border brand-border flex items-center justify-center shrink-0">
                <User size={15} className="brand-text" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[color:var(--ds-text)] truncate">{userName ?? t("sidebar.user")}</p>
                <p className="text-[11px] text-[color:var(--ds-text-subtle)] truncate mt-0.5">{userEmail ?? ""}</p>
              </div>
            </Link>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse_aria")}
          aria-expanded={!collapsed}
          className={cn(
            "hidden md:flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all duration-150 mt-2",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>{t("sidebar.collapse")}</span></>}
        </button>
      </div>
    </aside>
  );
});
