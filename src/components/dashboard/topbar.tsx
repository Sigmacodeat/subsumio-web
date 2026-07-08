"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import {
  Search,
  Bell,
  Settings,
  X,
  ChevronDown,
  Sun,
  Moon,
  Command,
  Check,
  Brain as BrainIcon,
  HelpCircle,
  PanelRightOpen,
  Plus,
  Briefcase,
  CalendarClock,
  Receipt,
  FileSignature,
  FileCheck,
  Library,
  PenTool,
  FileUp,
  Clock,
  Users,
  CheckSquare,
  MessageSquare,
  MoreHorizontal,
} from "lucide-react";
import { useBrainSelector } from "@/lib/use-brain-selector";
import { useBrainStats, usePages } from "@/lib/queries/brain";
import { useLang } from "@/lib/use-lang";
import { NetworkStatusBadge } from "@/components/dashboard/sidebar";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { useRealtime } from "@/lib/realtime";
import { csrfFetch } from "@/lib/csrf";
import { cn } from "@/lib/utils";
import { MatterSwitcher } from "@/components/dashboard/matter-switcher";
import { tracking } from "@/lib/tracking";

export type Theme = "light" | "dark";

interface TopbarProps {
  theme: Theme;
  toggleTheme: () => void;
  mobileOpen: boolean;
  onMobileMenuOpen: () => void;
  onMobileMenuClose: () => void;
  onGuideOpen: () => void;
  copilotOpen: boolean;
  onCopilotToggle: () => void;
  onCmdOpen: () => void;
}

export function Topbar({
  theme,
  toggleTheme,
  mobileOpen,
  onMobileMenuOpen,
  onMobileMenuClose,
  onGuideOpen,
  copilotOpen,
  onCopilotToggle,
  onCmdOpen,
}: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [notifOpen, setNotifOpen] = useState(false);
  const [brainOpen, setBrainOpen] = useState(false);
  const [brainActiveIdx, setBrainActiveIdx] = useState(0);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [utilitiesOpen, setUtilitiesOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<
    "all" | "deadline" | "mention" | "system"
  >("all");
  const notifRef = useRef<HTMLDivElement>(null);
  const brainRef = useRef<HTMLDivElement>(null);
  const quickCreateRef = useRef<HTMLDivElement>(null);
  const utilitiesRef = useRef<HTMLDivElement>(null);
  const { t } = useLang();
  const { popoverTransition, popoverInitial, popoverAnimate, popoverExit } = useDashboardMotion();

  useEffect(() => {
    const openNotifications = () => {
      setNotifOpen(true);
      setBrainOpen(false);
      setQuickCreateOpen(false);
      setUtilitiesOpen(false);
    };
    window.addEventListener("subsumio:open-notifications", openNotifications);
    return () => window.removeEventListener("subsumio:open-notifications", openNotifications);
  }, []);

  useEffect(() => {
    if (!notifOpen && !brainOpen && !quickCreateOpen && !utilitiesOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (brainRef.current && !brainRef.current.contains(target)) setBrainOpen(false);
      if (quickCreateRef.current && !quickCreateRef.current.contains(target))
        setQuickCreateOpen(false);
      if (utilitiesRef.current && !utilitiesRef.current.contains(target)) setUtilitiesOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNotifOpen(false);
        setBrainOpen(false);
        setQuickCreateOpen(false);
        setUtilitiesOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [notifOpen, brainOpen, quickCreateOpen, utilitiesOpen]);

  const statsQuery = useBrainStats();
  const deadlinesQuery = usePages({ type: "legal_deadline", limit: 20 });

  // API-based notifications (mentions, replies, system, deadline)
  const [apiNotifications, setApiNotifications] = useState<
    Array<{
      id: string;
      title: string;
      message: string;
      type: "deadline" | "dream" | "system" | "mention" | "reply";
      read: boolean;
      caseSlug?: string;
    }>
  >([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [readInlineIds, setReadInlineIds] = useState<Set<string>>(new Set());

  const fetchNotifications = async () => {
    try {
      const res = await csrfFetch("/api/notifications?unread=true&limit=20");
      if (res.ok) {
        const data = await res.json();
        const mapped = (data.notifications || []).map(
          (n: { id: string; type: string; data: Record<string, unknown>; createdAt: string }) => {
            if (n.type === "deadline") {
              const title = (n.data?.title as string) ?? "Frist";
              const days = n.data?.daysRemaining as number | undefined;
              const isOverdue = (n.data?.isOverdue as boolean) ?? false;
              const caseSlug = n.data?.caseSlug as string | undefined;
              return {
                id: n.id,
                title: isOverdue ? "Frist abgelaufen" : "Fristenwarnung",
                message: `${title}${days !== undefined ? (isOverdue ? ` — ${Math.abs(days)}T überfällig` : ` — in ${days}T`) : ""}`,
                type: "deadline" as const,
                read: false,
                caseSlug,
              };
            }
            return {
              id: n.id,
              title: n.type === "mention" ? "Erwähnung" : n.type === "reply" ? "Antwort" : "System",
              message: String(n.data?.message ?? ""),
              type: (n.type === "mention" || n.type === "reply" ? n.type : "system") as
                | "mention"
                | "reply"
                | "system",
              read: false,
              caseSlug: undefined as string | undefined,
            };
          }
        );
        setApiNotifications(mapped);
      }
    } catch {
      // silently skip — notifications are non-critical
    }
  };

  const markAllRead = async () => {
    setLoadingNotifs(true);
    try {
      await csrfFetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setApiNotifications([]);
      // Also mark all inline deadline notifications as read
      setReadInlineIds((prev) => {
        const next = new Set(prev);
        for (const n of notifications) {
          if (n.id.startsWith("dl-")) next.add(n.id);
        }
        return next;
      });
    } catch {
      // non-critical
    } finally {
      setLoadingNotifs(false);
    }
  };

  useEffect(() => {
    void fetchNotifications();
    const interval = setInterval(() => void fetchNotifications(), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Listen for realtime notification events
  useRealtime("notification.created", () => void fetchNotifications());
  useRealtime("comment.added", () => void fetchNotifications());

  // ── Sync: persist detected deadline alerts to /api/notifications ──
  // This ensures both the Topbar bell AND the Copilot Sidebar see the same alerts
  const lastSyncSignature = useRef("");
  const notificationSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!deadlinesQuery.data || !Array.isArray(deadlinesQuery.data)) return;
    const now = new Date();
    const deadlines: Array<{
      caseSlug: string;
      caseTitle: string;
      deadlineDate: string;
      daysRemaining: number;
      isOverdue: boolean;
    }> = [];
    for (const p of deadlinesQuery.data) {
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      const dueStr = (fm.due_date || fm.date || p.created_at) as string | number | undefined;
      if (!dueStr || fm.status === "done") continue;
      const due = new Date(dueStr);
      const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      // Only persist if deadline is within 3 days or overdue
      if (days > 3 && days >= 0) continue;
      const isOverdue = days < 0;
      deadlines.push({
        caseSlug: p.slug,
        caseTitle: p.title,
        deadlineDate: String(dueStr),
        daysRemaining: days,
        isOverdue,
      });
    }
    // Skip if nothing changed since last sync
    const signature = deadlines.map((d) => `${d.caseSlug}:${d.deadlineDate}`).join("|");
    if (signature === lastSyncSignature.current) return;
    if (notificationSyncTimer.current) clearTimeout(notificationSyncTimer.current);
    notificationSyncTimer.current = setTimeout(() => {
      lastSyncSignature.current = signature;
      if (deadlines.length > 0) {
        void csrfFetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deadlines }),
        }).catch((err) =>
          console.warn(
            "[topbar] Failed to sync deadline notifications:",
            err instanceof Error ? err.message : err
          )
        );
      }
    }, 500);
    return () => {
      if (notificationSyncTimer.current) clearTimeout(notificationSyncTimer.current);
    };
  }, [deadlinesQuery.data]);

  const notifications = useMemo(() => {
    const pages = deadlinesQuery.data;
    const stats = statsQuery.data;
    if (!Array.isArray(pages)) return apiNotifications;
    const now = new Date();
    // Collect case slugs already covered by API deadline notifications to avoid duplicates
    const apiDeadlineSlugs = new Set(
      apiNotifications.filter((n) => n.type === "deadline" && n.caseSlug).map((n) => n.caseSlug!)
    );
    const notifs: Array<{
      id: string;
      title: string;
      message: string;
      type: "deadline" | "dream" | "system" | "mention" | "reply";
      read: boolean;
      caseSlug?: string;
    }> = [...apiNotifications];
    for (const p of pages) {
      // Skip if already covered by API notification
      if (apiDeadlineSlugs.has(p.slug)) continue;
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      const dueStr = (fm.due_date || fm.date || p.created_at) as string | number | undefined;
      const due = dueStr ? new Date(dueStr) : new Date();
      const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (days <= 3 && days >= 0 && fm.status !== "done") {
        notifs.push({
          id: `dl-${p.slug}`,
          title: t("topbar.notif_deadline_soon"),
          message: `${p.title} — ${days} ${t("topbar.notif_days")}`,
          type: "deadline",
          read: readInlineIds.has(`dl-${p.slug}`),
          caseSlug: p.slug,
        });
      } else if (days < 0 && fm.status !== "done") {
        notifs.push({
          id: `dl-${p.slug}`,
          title: t("topbar.notif_deadline_overdue"),
          message: `${p.title} — ${Math.abs(days)} ${t("topbar.notif_days_overdue")}`,
          type: "deadline",
          read: readInlineIds.has(`dl-${p.slug}`),
          caseSlug: p.slug,
        });
      }
    }
    const dcStr = stats?.dream_cycle_last;
    if (dcStr && typeof dcStr === "string") {
      const dc = new Date(dcStr);
      const hours = (now.getTime() - dc.getTime()) / (1000 * 60 * 60);
      if (hours > 24) {
        notifs.push({
          id: "dream",
          title: "Dream Cycle",
          message: `${t("topbar.notif_dream_last")} ${Math.round(hours)} ${t("topbar.notif_dream_hours")}`,
          type: "dream",
          read: false,
        });
      }
    }
    return notifs;
  }, [deadlinesQuery.data, statsQuery.data, t, apiNotifications, readInlineIds]);

  const { brains, activeBrain, selectBrain, loading: brainLoading } = useBrainSelector();

  const selectBrainIdx = useCallback(
    (idx: number) => {
      const b = brains[idx];
      if (b) {
        selectBrain(b);
        setBrainOpen(false);
      }
    },
    [brains, selectBrain]
  );

  function BrainSelector() {
    if (brainLoading || brains.length <= 1) return null;
    return (
      <div className="relative" ref={brainRef}>
        <button
          onClick={() => {
            setBrainOpen((o) => !o);
            setBrainActiveIdx(brains.findIndex((b) => b.slug === activeBrain?.slug));
          }}
          className="flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-2 text-xs text-[color:var(--ds-text-muted)] transition-[background-color,color,border-color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
          aria-label={t("topbar.brain_selector_aria")}
          aria-expanded={brainOpen}
          aria-haspopup="listbox"
        >
          <BrainIcon size={13} className="brand-text shrink-0" />
          <span className="max-w-[100px] truncate">{activeBrain?.name ?? "—"}</span>
          <ChevronDown
            size={11}
            className={`shrink-0 transition-transform ${brainOpen ? "rotate-180" : ""}`}
          />
        </button>
        <AnimatePresence initial={false}>
          {brainOpen && (
            <motion.div
              className="card-shadow-elevated absolute top-9 right-0 z-50 w-56 overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1"
              role="listbox"
              aria-label={t("topbar.brain_selector_aria")}
              initial={popoverInitial}
              animate={popoverAnimate}
              exit={popoverExit}
              transition={popoverTransition}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setBrainActiveIdx((i) => Math.min(i + 1, brains.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setBrainActiveIdx((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  selectBrainIdx(brainActiveIdx);
                }
              }}
            >
              {brains.map((b, i) => (
                <button
                  key={b.slug}
                  onClick={() => selectBrainIdx(i)}
                  onMouseEnter={() => setBrainActiveIdx(i)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${i === brainActiveIdx ? "brand-soft brand-text" : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"}`}
                  role="option"
                  aria-selected={b.slug === activeBrain?.slug}
                >
                  <BrainIcon size={14} className="shrink-0" />
                  <span className="flex-1 truncate">{b.name}</span>
                  {b.slug === activeBrain?.slug && <Check size={13} className="shrink-0" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filteredNotifications = notifications.filter((notification) => {
    if (notificationFilter === "all") return true;
    if (notificationFilter === "mention") {
      return notification.type === "mention" || notification.type === "reply";
    }
    if (notificationFilter === "system") {
      return notification.type === "system" || notification.type === "dream";
    }
    return notification.type === "deadline";
  });

  return (
    <header
      data-tour="topbar"
      className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 pt-[env(safe-area-inset-top)] shadow-[0_1px_3px_-1px_rgba(0,0,0,0.04)] md:h-12 md:px-6 lg:px-8"
    >
      <div className="flex max-w-xs min-w-0 flex-1 items-center gap-3 md:max-w-sm lg:max-w-lg">
        <button
          onClick={() => {
            if (mobileOpen) onMobileMenuClose();
            else onMobileMenuOpen();
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
          }}
          className="group flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none active:scale-90 md:hidden"
          aria-label={mobileOpen ? t("topbar.close_menu") : t("topbar.open_menu")}
          aria-expanded={mobileOpen}
        >
          <span className="relative flex h-4 w-4 items-center justify-center">
            <span
              className={`absolute h-0.5 w-4 rounded-full bg-current transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                mobileOpen ? "top-1/2 -translate-y-1/2 rotate-45" : "top-[2px]"
              }`}
            />
            <span
              className={`absolute h-0.5 w-4 rounded-full bg-current transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                mobileOpen ? "top-1/2 -translate-y-1/2 opacity-0" : "top-1/2 -translate-y-1/2"
              }`}
            />
            <span
              className={`absolute h-0.5 w-4 rounded-full bg-current transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                mobileOpen ? "top-1/2 -translate-y-1/2 -rotate-45" : "bottom-[2px]"
              }`}
            />
          </span>
        </button>
        {/* Palette trigger — a button styled as a search field so Tab focus
            doesn't open the palette involuntarily (only click/Enter/Space). */}
        <button
          type="button"
          data-tour="command-palette-hint"
          onClick={onCmdOpen}
          aria-label={t("topbar.search_aria")}
          aria-haspopup="dialog"
          className="group relative hidden min-w-0 flex-1 cursor-pointer rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-1.5 pr-16 pl-9 text-left text-[13px] text-[color:var(--ds-text-subtle)] transition-[border-color,box-shadow] hover:border-[color:var(--ds-border-strong)] focus-visible:border-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none sm:block"
        >
          <Search
            size={16}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
          />
          <span className="block truncate">{t("topbar.search_placeholder")}</span>
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--ds-text-subtle)] md:flex">
            <Command size={9} />K
          </kbd>
        </button>
        {/* Mobile search icon — opens command palette */}
        <button
          onClick={onCmdOpen}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none md:hidden"
          aria-label={t("topbar.search_aria")}
        >
          <Search size={18} />
        </button>
      </div>
      {/* Right controls — one group so gaps stay consistent instead of
          justify-between scattering switcher/bell/actions unevenly. */}
      <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
        {/* Matter Switcher — quick switch between pinned/recent matters */}
        <div className="hidden shrink-0 sm:block">
          <MatterSwitcher />
        </div>
        {/* Notification bell — visible on all screen sizes */}
        <div className="relative shrink-0" ref={notifRef}>
          <button
            onClick={() => {
              if (!notifOpen) tracking.notifications.bellClicked();
              setNotifOpen(!notifOpen);
            }}
            aria-label={
              unreadCount > 0
                ? `${t("topbar.notifications")} — ${unreadCount} ${t("topbar.unread_count")}`
                : t("topbar.notifications")
            }
            aria-expanded={notifOpen}
            aria-haspopup="menu"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[color:var(--ds-danger-text)] px-1 text-xs leading-none font-bold text-white ring-2 ring-[var(--ds-surface)]"
                aria-hidden
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <AnimatePresence initial={false}>
            {notifOpen && (
              <motion.div
                className="card-shadow-elevated absolute top-12 right-0 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                role="menu"
                aria-label={t("topbar.notifications")}
                initial={popoverInitial}
                animate={popoverAnimate}
                exit={popoverExit}
                transition={popoverTransition}
              >
                <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] px-4 py-3.5">
                  <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                    {t("topbar.notifications")}
                  </span>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        disabled={loadingNotifs}
                        className="brand-text text-xs transition-opacity hover:opacity-80 disabled:opacity-50"
                      >
                        {t("topbar.mark_all_read")}
                      </button>
                    )}
                    <button
                      onClick={() => setNotifOpen(false)}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                      aria-label={t("topbar.close")}
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
                <div
                  className="flex gap-1 border-b border-[color:var(--ds-border)] p-2"
                  role="tablist"
                >
                  {(
                    [
                      ["all", t("topbar.filter_all")],
                      ["deadline", t("topbar.filter_deadlines")],
                      ["mention", t("topbar.filter_mentions")],
                      ["system", t("topbar.filter_system")],
                    ] as const
                  ).map(([filter, label]) => (
                    <button
                      key={filter}
                      type="button"
                      role="tab"
                      aria-selected={notificationFilter === filter}
                      onClick={() => setNotificationFilter(filter)}
                      className={cn(
                        "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                        notificationFilter === filter
                          ? "brand-soft brand-text"
                          : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="max-h-80 space-y-1.5 overflow-y-auto p-2">
                  {filteredNotifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Bell
                        size={20}
                        className="mb-3 text-[color:var(--ds-border-strong)]"
                        aria-hidden
                      />
                      <p className="text-xs text-[color:var(--ds-text-muted)]">
                        {t("topbar.no_notifications")}
                      </p>
                    </div>
                  ) : (
                    filteredNotifications.map((n) => {
                      const notifHref = n.caseSlug
                        ? `/dashboard/cases/${encodeURIComponent(n.caseSlug)}?tab=deadlines`
                        : null;
                      // Row is a plain div; the navigate action and the mark-read
                      // action are sibling buttons (no nested interactive controls).
                      return (
                        <div
                          key={n.id}
                          className={`flex items-start gap-2 rounded-lg border p-3 ${n.type === "deadline" ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]" : n.type === "dream" ? "brand-border brand-soft" : n.type === "mention" ? "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)]" : n.type === "reply" ? "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)]" : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"}`}
                        >
                          {notifHref ? (
                            <button
                              type="button"
                              onClick={() => {
                                router.push(notifHref);
                                setNotifOpen(false);
                              }}
                              className="min-w-0 flex-1 cursor-pointer rounded-md text-left transition-colors hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                            >
                              <div className="text-xs leading-snug font-medium text-[color:var(--ds-text)]">
                                {n.title}
                              </div>
                              <div className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                                {n.message}
                              </div>
                            </button>
                          ) : (
                            <div className="min-w-0 flex-1">
                              <div className="text-xs leading-snug font-medium text-[color:var(--ds-text)]">
                                {n.title}
                              </div>
                              <div className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                                {n.message}
                              </div>
                            </div>
                          )}
                          {!n.read && (
                            <button
                              type="button"
                              onClick={async () => {
                                if (n.id.startsWith("dl-")) {
                                  setReadInlineIds((prev) => new Set(prev).add(n.id));
                                  return;
                                }
                                try {
                                  await csrfFetch("/api/notifications", {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ id: n.id }),
                                  });
                                  setApiNotifications((prev) =>
                                    prev.map((item) =>
                                      item.id === n.id ? { ...item, read: true } : item
                                    )
                                  );
                                } catch {}
                              }}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[color:var(--ds-text-subtle)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                              aria-label={t("topbar.mark_read")}
                            >
                              <Check size={12} />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex items-center gap-1 border-t border-[color:var(--ds-border)] p-2">
                  <button
                    onClick={() => {
                      router.push("/dashboard/notifications");
                      setNotifOpen(false);
                    }}
                    className="brand-text flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-opacity hover:opacity-80"
                  >
                    <Bell size={12} />
                    {t("topbar.all_notifications")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      router.push("/dashboard/settings/notifications");
                      setNotifOpen(false);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                    aria-label={t("topbar.notification_settings")}
                    title={t("topbar.notification_settings")}
                  >
                    <Settings size={14} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 items-center gap-1 max-md:hidden md:gap-1.5">
          {/* Quick-Create */}
          <div ref={quickCreateRef} className="relative">
            <button
              onClick={() => setQuickCreateOpen((v) => !v)}
              aria-label={t("topbar.quick_create")}
              title={t("topbar.quick_create")}
              aria-expanded={quickCreateOpen}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none",
                quickCreateOpen
                  ? "brand-soft brand-text"
                  : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              )}
            >
              <Plus size={16} strokeWidth={2.5} />
              <span className="hidden lg:inline">{t("topbar.quick_create")}</span>
            </button>
            <AnimatePresence initial={false}>
              {quickCreateOpen && (
                <motion.div
                  className="card-shadow-elevated absolute top-12 right-0 z-50 w-56 overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                  role="menu"
                  aria-label={t("topbar.quick_create")}
                  initial={popoverInitial}
                  animate={popoverAnimate}
                  exit={popoverExit}
                  transition={popoverTransition}
                >
                  <div className="border-b border-[color:var(--ds-border)] px-4 py-2.5">
                    <span className="text-xs font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                      {t("topbar.quick_create")}
                    </span>
                  </div>
                  <div className="p-1.5">
                    {/* Matter-scoped actions — only when inside a matter */}
                    {pathname?.startsWith("/dashboard/cases/") &&
                      (() => {
                        const matterSlug = decodeURIComponent(
                          pathname.replace("/dashboard/cases/", "").split("/")[0] || ""
                        );
                        if (!matterSlug) return null;
                        const matterItems = [
                          {
                            icon: CalendarClock,
                            label: t("quickcreate.add_deadline"),
                            event: "subsumio:create-deadline",
                            detail: { caseSlug: matterSlug },
                          },
                          {
                            icon: CheckSquare,
                            label: t("quickcreate.add_task"),
                            event: "subsumio:create-task",
                            detail: { caseSlug: matterSlug },
                          },
                          {
                            icon: FileUp,
                            label: t("quickcreate.upload_document"),
                            event: "subsumio:upload-document",
                            detail: { caseSlug: matterSlug },
                          },
                          {
                            icon: Clock,
                            label: t("quickcreate.log_time"),
                            event: "subsumio:log-time",
                            detail: { caseSlug: matterSlug },
                          },
                          {
                            icon: Receipt,
                            label: t("quickcreate.create_invoice"),
                            event: "subsumio:create-invoice",
                            detail: { caseSlug: matterSlug },
                          },
                          {
                            icon: FileSignature,
                            label: t("quickcreate.request_signature"),
                            event: "subsumio:create-signature",
                            detail: { caseSlug: matterSlug },
                          },
                          {
                            icon: FileCheck,
                            label: t("quickcreate.create_contract"),
                            event: "subsumio:create-contract",
                            detail: { caseSlug: matterSlug },
                          },
                          {
                            icon: Library,
                            label: t("quickcreate.add_clause"),
                            event: "subsumio:create-clause",
                            detail: { caseSlug: matterSlug },
                          },
                          {
                            icon: Users,
                            label: t("quickcreate.add_contact"),
                            event: "subsumio:create-contact",
                            detail: { caseSlug: matterSlug },
                          },
                          {
                            icon: MessageSquare,
                            label: t("quickcreate.add_communication"),
                            event: "subsumio:create-communication",
                            detail: { caseSlug: matterSlug },
                          },
                        ];
                        return (
                          <>
                            <div className="mb-1 px-3 pt-1 text-xs font-semibold tracking-wider text-[color:var(--brand-primary)] uppercase">
                              {t("quickcreate.this_matter")}
                            </div>
                            {matterItems.map((item) => {
                              const Icon = item.icon;
                              return (
                                <button
                                  key={item.label}
                                  onClick={() => {
                                    setQuickCreateOpen(false);
                                    window.dispatchEvent(
                                      new CustomEvent(item.event, { detail: item.detail })
                                    );
                                  }}
                                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                                  role="menuitem"
                                >
                                  <Icon size={15} className="shrink-0" />
                                  {item.label}
                                </button>
                              );
                            })}
                            <div className="my-1.5 border-t border-[color:var(--ds-border)]" />
                            <div className="mb-1 px-3 pt-1 text-xs font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
                              {t("quickcreate.general")}
                            </div>
                          </>
                        );
                      })()}
                    {[
                      {
                        icon: Briefcase,
                        label: t("topbar.create_case"),
                        event: "subsumio:create-case",
                      },
                      {
                        icon: CalendarClock,
                        label: t("topbar.create_deadline"),
                        event: "subsumio:create-deadline",
                      },
                      {
                        icon: Receipt,
                        label: t("topbar.create_invoice"),
                        event: "subsumio:create-invoice",
                      },
                      {
                        icon: FileSignature,
                        label: t("topbar.create_signature"),
                        event: "subsumio:create-signature",
                      },
                      {
                        icon: FileCheck,
                        label: t("topbar.create_contract"),
                        event: "subsumio:create-contract",
                      },
                      {
                        icon: Library,
                        label: t("topbar.create_clause"),
                        event: "subsumio:create-clause",
                      },
                      {
                        icon: PenTool,
                        label: t("topbar.create_draft"),
                        href: "/dashboard/drafting",
                      },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.label}
                          onClick={() => {
                            setQuickCreateOpen(false);
                            if (item.event) {
                              window.dispatchEvent(new Event(item.event));
                            } else if (item.href) {
                              router.push(item.href);
                            }
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                          role="menuitem"
                        >
                          <Icon size={15} className="shrink-0" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* Divider — separates the primary create action from the
              utility/status icons that follow. */}
          <span className="mx-0.5 h-5 w-px shrink-0 bg-[color:var(--ds-border)]" aria-hidden />
          <div ref={utilitiesRef} className="relative">
            <button
              type="button"
              onClick={() => setUtilitiesOpen((open) => !open)}
              aria-label={t("topbar.utilities")}
              title={t("topbar.utilities")}
              aria-haspopup="menu"
              aria-expanded={utilitiesOpen}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none",
                utilitiesOpen && "brand-soft brand-text"
              )}
            >
              <MoreHorizontal size={16} aria-hidden />
            </button>
            <AnimatePresence initial={false}>
              {utilitiesOpen && (
                <motion.div
                  role="menu"
                  aria-label={t("topbar.utilities")}
                  className="card-shadow-elevated absolute top-12 right-0 z-50 w-52 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1.5"
                  initial={popoverInitial}
                  animate={popoverAnimate}
                  exit={popoverExit}
                  transition={popoverTransition}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUtilitiesOpen(false);
                      onGuideOpen();
                    }}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                  >
                    <HelpCircle size={16} aria-hidden />
                    {t("guide.open")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUtilitiesOpen(false);
                      toggleTheme();
                    }}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                  >
                    {theme === "dark" ? (
                      <Sun size={16} aria-hidden />
                    ) : (
                      <Moon size={16} aria-hidden />
                    )}
                    {theme === "dark" ? t("topbar.theme_light") : t("topbar.theme_dark")}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="hidden md:block">
            <BrainSelector />
          </div>
          <NetworkStatusBadge />
          {/* The right-docked panel control is intentionally the final item. */}
          <span className="mx-0.5 h-5 w-px shrink-0 bg-[color:var(--ds-border)]" aria-hidden />
          <button
            type="button"
            onClick={onCopilotToggle}
            data-tour="copilot-toggle"
            aria-label={copilotOpen ? t("copilot.collapse") : t("copilot.expand")}
            title={copilotOpen ? t("copilot.collapse") + " (Cmd+J)" : t("copilot.expand_hint")}
            aria-expanded={copilotOpen}
            aria-controls="brain-copilot-panel"
            aria-hidden={copilotOpen}
            tabIndex={copilotOpen ? -1 : 0}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none",
              copilotOpen
                ? "pointer-events-none invisible"
                : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            )}
          >
            <PanelRightOpen size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
