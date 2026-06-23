"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion, type Transition } from "framer-motion";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";

interface MobileTabBarProps {
  onCopilotToggle: () => void;
  copilotOpen: boolean;
  onMobileMenuOpen: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  onGuideOpen: () => void;
}

type IconType = typeof LayoutDashboard;

interface TabItem {
  href: string;
  icon: IconType;
  labelKey: DashboardKey;
}

const TABS: TabItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "nav.overview" },
  { href: "/dashboard/cases", icon: Briefcase, labelKey: "nav.cases" },
  { href: "/dashboard/deadlines", icon: CalendarClock, labelKey: "nav.deadlines" },
  { href: "/dashboard/intake", icon: Inbox, labelKey: "nav.intake" },
];

const MOBILE_SHEET_TRANSITION: Transition = {
  type: "spring",
  stiffness: 430,
  damping: 42,
  mass: 0.82,
};
const MOBILE_SOFT_TRANSITION: Transition = {
  type: "spring",
  stiffness: 560,
  damping: 42,
  mass: 0.64,
};
const MOBILE_REDUCED_TRANSITION: Transition = { duration: 0 };

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
}: MobileTabBarProps) {
  const pathname = usePathname();
  const { t } = useLang();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const sheetTransition = reduceMotion ? MOBILE_REDUCED_TRANSITION : MOBILE_SHEET_TRANSITION;
  const softTransition = reduceMotion ? MOBILE_REDUCED_TRANSITION : MOBILE_SOFT_TRANSITION;

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
      // Only clear if no other overlay is locking scroll
      // (layout manages its own scroll lock for sidebar/copilot/cmd/guide)
      const otherOverlayOpen = document.querySelector('[aria-modal="true"]') !== null;
      if (!otherOverlayOpen) {
        document.body.style.overflow = "";
      }
    }
  }, [moreOpen]);

  const activeTab = TABS.findIndex((tab) => isActive(pathname, tab.href));
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
        <div className="max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
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

          {/* Secondary links */}
          <div className="border-t border-[color:var(--ds-border)] px-3 py-3">
            <div className="grid grid-cols-3 gap-1">
              <MoreSheetLink
                href="/dashboard/chat"
                icon={MessageSquareText}
                label={t("nav.chat")}
              />
              <MoreSheetLink href="/dashboard/brain" icon={Brain} label={t("nav.brain")} />
              <MoreSheetLink href="/dashboard/bea" icon={Mail} label={t("nav.bea")} />
              <MoreSheetLink href="/dashboard/vault" icon={FolderOpen} label={t("nav.vault")} />
              <MoreSheetLink href="/dashboard/upload" icon={Upload} label={t("nav.upload")} />
              <MoreSheetLink href="/dashboard/settings" icon={Settings} label={t("nav.settings")} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Bottom tab bar */}
      <nav
        className="fixed right-0 bottom-0 left-0 z-40 border-t border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Mobile Navigation"
        role="tablist"
        aria-orientation="horizontal"
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
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                aria-label={t(tab.labelKey)}
                role="tab"
                aria-selected={active}
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
            role="tab"
            aria-selected={copilotActive}
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
            role="tab"
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
      className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)]">
        <Icon size={17} />
      </div>
      <span className="text-xs leading-none font-medium">{label}</span>
    </Link>
  );
}
