"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  CalendarClock,
  MessageSquareText,
  Brain,
  PanelRightOpen,
  Inbox,
  MoreHorizontal,
  X,
  Sun,
  Moon,
  HelpCircle,
  Settings,
  Mail,
  FolderOpen,
  Upload,
  Users,
  Receipt,
  Scale,
  ShieldCheck,
  FileText,
  Plus,
  PenTool,
  FileCheck,
  FileSignature,
  Gavel,
  Globe,
  Landmark,
  BookOpen,
  Network,
  Database,
  ClipboardList,
  ClipboardCheck,
  Share2,
  Calculator,
  FileSpreadsheet,
  EyeOff,
  FileClock,
  CreditCard,
  UserCog,
  ScrollText,
  Bell,
  Plug,
  Bot,
  Library,
  FileSearch,
  TrendingUp,
  MessageCircle,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import type { DashboardKey } from "@/content/dashboard";

interface MobileTabBarProps {
  onCopilotToggle: () => void;
  copilotOpen: boolean;
  onMobileMenuOpen: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  onGuideOpen: () => void;
  industry?: string | null;
}

type IconType = typeof LayoutDashboard;

interface TabItem {
  href: string;
  icon: IconType;
  labelKey: DashboardKey;
}

const LEGAL_TABS: TabItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "nav.overview" },
  { href: "/dashboard/cases", icon: Briefcase, labelKey: "nav.cases" },
  { href: "/dashboard/deadlines", icon: CalendarClock, labelKey: "nav.deadlines" },
  { href: "/dashboard/intake", icon: Inbox, labelKey: "nav.intake" },
];

const TAX_TABS: TabItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "nav.overview" },
  { href: "/dashboard/tax-returns", icon: FileText, labelKey: "nav.tax_returns" },
  { href: "/dashboard/tax-deadlines", icon: CalendarClock, labelKey: "nav.tax_deadlines" },
  { href: "/dashboard/tax-assessments", icon: FileCheck, labelKey: "nav.tax_assessments" },
];

function tabsForIndustry(industry?: string | null): TabItem[] {
  if (industry === "tax") return TAX_TABS;
  return LEGAL_TABS;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileTabBar({
  onCopilotToggle,
  copilotOpen,
  onMobileMenuOpen,
  theme,
  toggleTheme,
  onGuideOpen,
  industry,
}: MobileTabBarProps) {
  const pathname = usePathname();
  const { t } = useLang();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const {
    reduceMotion,
    panelTransition: sheetTransition,
    tapTransition: softTransition,
  } = useDashboardMotion();

  useEffect(() => {
    if (!moreOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [moreOpen]);

  // Close more-sheet on route change
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Body scroll lock when more-sheet is open
  useEffect(() => {
    if (moreOpen) {
      document.body.style.overflow = "hidden";
    } else {
      // Only clear if no other overlay is locking scroll.
      // Layout sets data-overlay="open" when sidebar/copilot/cmd/guide is active.
      if (document.body.dataset.overlay !== "open") {
        document.body.style.overflow = "";
      }
    }
  }, [moreOpen]);

  const tabs = tabsForIndustry(industry);
  const activeTab = tabs.findIndex((tab) => isActive(pathname, tab.href));
  const copilotActive = copilotOpen;

  return (
    <>
      {/* More-sheet overlay */}
      <motion.div
        className={cn(
          "fixed inset-0 z-50 bg-black/30 md:hidden",
          !moreOpen && "pointer-events-none"
        )}
        initial={false}
        animate={{
          opacity: moreOpen ? 1 : 0,
          backdropFilter: moreOpen && !reduceMotion ? "blur(8px)" : "blur(0px)",
        }}
        transition={sheetTransition}
        onClick={() => setMoreOpen(false)}
        aria-hidden
      />

      {/* More-sheet — slides up from bottom */}
      <motion.div
        ref={moreRef}
        className={cn(
          "fixed right-0 bottom-0 left-0 z-50 md:hidden",
          !moreOpen && "pointer-events-none"
        )}
        initial={false}
        animate={{
          y: moreOpen ? 0 : "100%",
          opacity: moreOpen ? 1 : 0.98,
        }}
        transition={sheetTransition}
        role="dialog"
        aria-label="Mehr Aktionen"
        aria-modal={moreOpen ? "true" : undefined}
        aria-hidden={!moreOpen}
        tabIndex={-1}
        style={!moreOpen ? { pointerEvents: "none" } : undefined}
      >
        <div className="max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
          {/* Grab handle */}
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="h-1 w-10 rounded-full bg-[color:var(--ds-border)]" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-1 pb-3">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">Mehr</h3>
            <button
              onClick={() => setMoreOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              aria-label="Schließen"
            >
              <X size={18} />
            </button>
          </div>

          {/* Action grid */}
          <div className="grid grid-cols-4 gap-1 px-3 pb-3">
            <MoreSheetButton
              icon={PanelRightOpen}
              label="Copilot"
              active={copilotActive}
              onClick={() => {
                onCopilotToggle();
                setMoreOpen(false);
              }}
            />
            <MoreSheetButton
              icon={theme === "dark" ? Sun : Moon}
              label={theme === "dark" ? "Hell" : "Dunkel"}
              onClick={() => {
                toggleTheme();
                setMoreOpen(false);
              }}
            />
            <MoreSheetButton
              icon={HelpCircle}
              label="Guide"
              onClick={() => {
                onGuideOpen();
                setMoreOpen(false);
              }}
            />
            <MoreSheetButton
              icon={LayoutDashboard}
              label="Menü"
              onClick={() => {
                onMobileMenuOpen();
                setMoreOpen(false);
              }}
            />
          </div>

          {/* Quick Create row */}
          <div className="border-b border-[color:var(--ds-border)] px-3 py-3">
            <div className="grid grid-cols-4 gap-1">
              <MoreSheetButton
                icon={Plus}
                label={t("topbar.create_case")}
                onClick={() => {
                  window.dispatchEvent(new Event("subsumio:create-case"));
                  setMoreOpen(false);
                }}
              />
              <MoreSheetButton
                icon={CalendarClock}
                label={t("topbar.create_deadline")}
                onClick={() => {
                  window.dispatchEvent(new Event("subsumio:create-deadline"));
                  setMoreOpen(false);
                }}
              />
              <MoreSheetButton
                icon={Receipt}
                label={t("topbar.create_invoice")}
                onClick={() => {
                  window.dispatchEvent(new Event("subsumio:create-invoice"));
                  setMoreOpen(false);
                }}
              />
              <MoreSheetButton
                icon={FileSignature}
                label={t("topbar.create_signature")}
                onClick={() => {
                  window.dispatchEvent(new Event("subsumio:create-signature"));
                  setMoreOpen(false);
                }}
              />
            </div>
          </div>

          {/* Categorized navigation */}
          <div className="max-h-[50vh] overflow-y-auto px-3 py-3">
            {/* Cases & Clients */}
            <MoreSheetSection title={t("nav.section.cases_clients")}>
              <MoreSheetLink href="/dashboard/contacts" icon={Users} label={t("nav.contacts")} />
              <MoreSheetLink href="/dashboard/opponents" icon={Scale} label={t("nav.opponents")} />
              <MoreSheetLink
                href="/dashboard/kollisionspruefung"
                icon={Scale}
                label={t("nav.kollisionspruefung")}
              />
              <MoreSheetLink
                href="/dashboard/client-portal"
                icon={UserCircle}
                label={t("nav.client_portal")}
              />
              <MoreSheetLink
                href="/dashboard/document-requests"
                icon={FileClock}
                label={t("nav.document_requests")}
              />
            </MoreSheetSection>

            {/* Communication */}
            <MoreSheetSection title={t("nav.section.communication")}>
              <MoreSheetLink
                href="/dashboard/chat"
                icon={MessageSquareText}
                label={t("nav.chat")}
              />
              <MoreSheetLink href="/dashboard/bea" icon={Mail} label={t("nav.bea")} />
              <MoreSheetLink
                href="/dashboard/whatsapp"
                icon={MessageCircle}
                label={t("nav.whatsapp")}
              />
            </MoreSheetSection>

            {/* Documents & Drafting */}
            <MoreSheetSection title={t("nav.section.documents_drafting")}>
              <MoreSheetLink href="/dashboard/vault" icon={FolderOpen} label={t("nav.vault")} />
              <MoreSheetLink href="/dashboard/upload" icon={Upload} label={t("nav.upload")} />
              <MoreSheetLink href="/dashboard/drafting" icon={PenTool} label={t("nav.drafting")} />
              <MoreSheetLink
                href="/dashboard/contracts"
                icon={FileCheck}
                label={t("nav.contracts")}
              />
              <MoreSheetLink
                href="/dashboard/clause-library"
                icon={Library}
                label={t("nav.clause_library")}
              />
              <MoreSheetLink
                href="/dashboard/signature"
                icon={FileSignature}
                label={t("nav.signature")}
              />
              <MoreSheetLink
                href="/dashboard/litigation"
                icon={Gavel}
                label={t("nav.litigation")}
              />
              <MoreSheetLink
                href="/dashboard/deep-analysis"
                icon={FileSearch}
                label={t("nav.deep_analysis")}
              />
            </MoreSheetSection>

            {/* Research & Knowledge */}
            <MoreSheetSection title={t("nav.section.research_knowledge")}>
              <MoreSheetLink
                href="/dashboard/research"
                icon={Globe}
                label={t("nav.legal_research")}
              />
              <MoreSheetLink
                href="/dashboard/rechtsprechung"
                icon={Landmark}
                label={t("nav.rechtsprechung")}
              />
              <MoreSheetLink href="/dashboard/norms" icon={BookOpen} label={t("nav.norms")} />
              <MoreSheetLink href="/dashboard/brain" icon={Brain} label={t("nav.brain")} />
              <MoreSheetLink href="/dashboard/graph" icon={Network} label={t("nav.graph")} />
              <MoreSheetLink href="/dashboard/sources" icon={Database} label={t("nav.sources")} />
            </MoreSheetSection>

            {/* Operations */}
            <MoreSheetSection title={t("nav.section.operations")}>
              <MoreSheetLink
                href="/dashboard/review-queue"
                icon={ClipboardCheck}
                label={t("nav.review_queue")}
              />
              <MoreSheetLink
                href="/dashboard/workflows"
                icon={ClipboardList}
                label={t("nav.workflows")}
              />
              <MoreSheetLink href="/dashboard/reports" icon={FileText} label={t("nav.reports")} />
              <MoreSheetLink
                href="/dashboard/analytics"
                icon={TrendingUp}
                label={t("nav.analytics")}
              />
              <MoreSheetLink
                href="/dashboard/shared-spaces"
                icon={Share2}
                label={t("nav.shared_spaces")}
              />
            </MoreSheetSection>

            {/* Billing & Compliance */}
            <MoreSheetSection title={t("nav.section.billing_compliance")}>
              <MoreSheetLink
                href="/dashboard/invoicing"
                icon={Receipt}
                label={t("nav.invoicing")}
              />
              <MoreSheetLink
                href="/dashboard/cost-calculator"
                icon={Calculator}
                label={t("nav.cost_calculator")}
              />
              <MoreSheetLink
                href="/dashboard/datev-export"
                icon={FileSpreadsheet}
                label={t("nav.datev_export")}
              />
              <MoreSheetLink
                href="/dashboard/compliance"
                icon={ShieldCheck}
                label={t("nav.compliance")}
              />
              <MoreSheetLink href="/dashboard/anonymize" icon={EyeOff} label={t("nav.anonymize")} />
              <MoreSheetLink
                href="/dashboard/verfahrensdoku"
                icon={ClipboardCheck}
                label={t("nav.verfahrensdoku")}
              />
            </MoreSheetSection>

            {/* Admin */}
            <MoreSheetSection title={t("nav.section.admin")}>
              <MoreSheetLink href="/dashboard/settings" icon={Settings} label={t("nav.settings")} />
              <MoreSheetLink href="/dashboard/team" icon={UserCog} label={t("nav.admin")} />
              <MoreSheetLink href="/dashboard/audit" icon={ScrollText} label={t("nav.audit_log")} />
              <MoreSheetLink href="/dashboard/billing" icon={CreditCard} label={t("nav.billing")} />
              <MoreSheetLink href="/dashboard/connectors" icon={Plug} label={t("nav.connectors")} />
              <MoreSheetLink href="/dashboard/agents" icon={Bot} label={t("nav.agents")} />
              <MoreSheetLink
                href="/dashboard/api-keys"
                icon={ShieldCheck}
                label={t("nav.api_keys")}
              />
              <MoreSheetLink href="/dashboard/monitoring" icon={Bell} label={t("nav.monitoring")} />
            </MoreSheetSection>
          </div>
        </div>
      </motion.div>

      {/* Bottom tab bar */}
      <nav
        className="fixed right-0 bottom-0 left-0 z-40 border-t border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Mobile Navigation"
      >
        {/* Active indicator bar */}
        <div className="relative h-1">
          <div
            className="brand-bg absolute top-0 h-1 transition-[width,left] duration-300 ease-[var(--ds-ease-smooth)]"
            style={{
              width: `${100 / 6}%`,
              left: `${(activeTab >= 0 ? activeTab : 0) * (100 / 6)}%`,
              opacity: activeTab >= 0 ? 1 : 0,
            }}
          />
        </div>

        <div className="flex items-stretch justify-around">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                aria-label={t(tab.labelKey)}
                onClick={() => {
                  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                    navigator.vibrate(10);
                  }
                }}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-[color,transform] duration-200 ease-[var(--ds-ease-smooth)]",
                  active
                    ? "brand-text"
                    : "text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text-muted)]"
                )}
              >
                <Icon size={22} className="shrink-0" strokeWidth={active ? 2.5 : 2} />
                <span className="text-xs leading-none font-medium">{t(tab.labelKey)}</span>
              </Link>
            );
          })}

          {/* Copilot tab */}
          <motion.button
            onClick={onCopilotToggle}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            transition={softTransition}
            aria-label="Copilot"
            aria-pressed={copilotActive}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-[color,transform] duration-200 ease-[var(--ds-ease-smooth)]",
              copilotActive
                ? "text-[color:var(--brand-primary)]"
                : "text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text-muted)]"
            )}
          >
            <div className="relative">
              <PanelRightOpen
                size={22}
                className="shrink-0"
                strokeWidth={copilotActive ? 2.5 : 2}
              />
              {copilotActive && (
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-[color:var(--brand-primary)]" />
              )}
            </div>
            <span className="text-xs leading-none font-medium">Copilot</span>
          </motion.button>

          {/* More tab — opens more-sheet */}
          <motion.button
            onClick={() => {
              if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                navigator.vibrate(8);
              }
              setMoreOpen(true);
            }}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            transition={softTransition}
            aria-label="Mehr Aktionen"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-[color,transform] duration-200 ease-[var(--ds-ease-smooth)]",
              moreOpen
                ? "brand-text"
                : "text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text-muted)]"
            )}
          >
            <MoreHorizontal size={22} className="shrink-0" strokeWidth={moreOpen ? 2.5 : 2} />
            <span className="text-xs leading-none font-medium">Mehr</span>
          </motion.button>
        </div>
      </nav>
    </>
  );
}

function MoreSheetButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: IconType;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)]",
        active
          ? "brand-soft brand-text"
          : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--ds-surface-2)]">
        <Icon size={20} />
      </div>
      <span className="text-xs leading-none font-medium">{label}</span>
    </motion.button>
  );
}

function MoreSheetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h4 className="mb-2 px-1 text-[11px] font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
        {title}
      </h4>
      <div className="grid grid-cols-4 gap-1">{children}</div>
    </div>
  );
}

function MoreSheetLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: IconType;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)]">
        <Icon size={15} />
      </div>
      <span className="line-clamp-1 text-center text-[10px] leading-tight font-medium">
        {label}
      </span>
    </Link>
  );
}
