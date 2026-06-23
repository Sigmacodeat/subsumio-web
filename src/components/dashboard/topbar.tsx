"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import {
  Search,
  Bell,
  User,
  Settings,
  LogOut,
  X,
  ChevronDown,
  Menu,
  Sun,
  Moon,
  Command,
  Check,
  Brain as BrainIcon,
  Loader2,
  CornerDownLeft,
  HelpCircle,
  PanelRightOpen,
  Languages,
} from "lucide-react";
import { useBrainSelector } from "@/lib/use-brain-selector";
import { useBrainStats, usePages, useSearch } from "@/lib/queries/brain";
import { useLogout } from "@/lib/queries/auth";
import { useLang } from "@/lib/use-lang";
import { NetworkStatusBadge } from "@/components/dashboard/sidebar";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { useRealtime } from "@/lib/realtime";
import { csrfFetch } from "@/lib/csrf";
import { cn } from "@/lib/utils";

export type Theme = "light" | "dark";

interface TopbarProps {
  theme: Theme;
  toggleTheme: () => void;
  userName: string | null;
  userEmail: string | null;
  mobileOpen: boolean;
  onMobileMenuOpen: () => void;
  onMobileMenuClose: () => void;
  onGuideOpen: () => void;
  copilotOpen: boolean;
  onCopilotToggle: () => void;
}

export function Topbar({
  theme,
  toggleTheme,
  userName,
  userEmail,
  mobileOpen,
  onMobileMenuOpen,
  onMobileMenuClose,
  onGuideOpen,
  copilotOpen,
  onCopilotToggle,
}: TopbarProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [brainOpen, setBrainOpen] = useState(false);
  const [brainActiveIdx, setBrainActiveIdx] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const brainRef = useRef<HTMLDivElement>(null);
  const { t, lang, setLang } = useLang();
  const { popoverTransition, popoverInitial, popoverAnimate, popoverExit } = useDashboardMotion();

  // Debounce search query for live results
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchResults = useSearch(debouncedQuery, 5, debouncedQuery.length >= 2);

  const searchItems = useMemo(() => searchResults.data ?? [], [searchResults.data]);
  const [searchActiveIdx, setSearchActiveIdx] = useState(0);
  useEffect(() => {
    setSearchActiveIdx(0);
  }, [debouncedQuery]);

  useEffect(() => {
    if (!notifOpen && !userMenuOpen && !brainOpen && !searchOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(target)) setUserMenuOpen(false);
      if (brainRef.current && !brainRef.current.contains(target)) setBrainOpen(false);
      if (searchRef.current && !searchRef.current.contains(target)) setSearchOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setNotifOpen(false);
        setUserMenuOpen(false);
        setBrainOpen(false);
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [notifOpen, userMenuOpen, brainOpen, searchOpen]);

  const statsQuery = useBrainStats();
  const deadlinesQuery = usePages({ type: "legal_deadline", limit: 20 });
  const logoutMutation = useLogout();

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
    lastSyncSignature.current = signature;
    // Single batch request instead of N individual requests
    if (deadlines.length > 0) {
      void csrfFetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deadlines }),
      }).catch(() => {});
    }
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
        });
      } else if (days < 0 && fm.status !== "done") {
        notifs.push({
          id: `dl-${p.slug}`,
          title: t("topbar.notif_deadline_overdue"),
          message: `${p.title} — ${Math.abs(days)} ${t("topbar.notif_days_overdue")}`,
          type: "deadline",
          read: readInlineIds.has(`dl-${p.slug}`),
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

  function logout() {
    logoutMutation.mutate();
  }

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

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 pt-[env(safe-area-inset-top)] md:px-6">
      <div className="flex max-w-xs min-w-0 flex-1 items-center gap-3 md:max-w-sm lg:max-w-md">
        <button
          onClick={mobileOpen ? onMobileMenuClose : onMobileMenuOpen}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none md:hidden"
          aria-label={mobileOpen ? t("topbar.close_menu") : t("topbar.open_menu")}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <div className="group relative hidden flex-1 sm:block" ref={searchRef}>
          <Search
            size={16}
            className="absolute top-1/2 left-3 z-10 -translate-y-1/2 text-[color:var(--ds-text-subtle)]"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchQuery.trim()) {
                if (
                  searchOpen &&
                  searchItems.length > 0 &&
                  searchActiveIdx >= 0 &&
                  searchActiveIdx < searchItems.length
                ) {
                  const item = searchItems[searchActiveIdx];
                  router.push(`/dashboard/brain/${encodeURIComponent(item.slug)}`);
                } else {
                  router.push(`/dashboard/brain?q=${encodeURIComponent(searchQuery.trim())}`);
                }
                setSearchQuery("");
                setSearchOpen(false);
              } else if (e.key === "ArrowDown" && searchOpen && searchItems.length > 0) {
                e.preventDefault();
                setSearchActiveIdx((i) => Math.min(i + 1, searchItems.length - 1));
              } else if (e.key === "ArrowUp" && searchOpen && searchItems.length > 0) {
                e.preventDefault();
                setSearchActiveIdx((i) => Math.max(i - 1, 0));
              }
            }}
            onFocus={(e) => {
              e.target.select();
              if (searchQuery.trim()) setSearchOpen(true);
            }}
            placeholder={t("topbar.search_placeholder")}
            aria-label={t("topbar.search_aria")}
            aria-expanded={searchOpen && searchItems.length > 0}
            aria-controls="topbar-search-results"
            role="combobox"
            autoComplete="off"
            className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] py-3 pr-16 pl-9 text-sm text-[color:var(--ds-text)] transition-[width,border-color,box-shadow] placeholder:text-[color:var(--ds-text-subtle)] focus:w-full focus:max-w-md focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:outline-none"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--ds-text-subtle)] md:flex">
            <Command size={9} />K
          </kbd>
          <AnimatePresence initial={false}>
            {searchOpen && searchQuery.trim().length >= 2 && (
              <motion.div
                id="topbar-search-results"
                className="card-shadow-elevated absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                role="listbox"
                aria-label={t("topbar.search_aria")}
                initial={popoverInitial}
                animate={popoverAnimate}
                exit={popoverExit}
                transition={popoverTransition}
              >
                {searchResults.isLoading ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-xs text-[color:var(--ds-text-muted)]">
                    <Loader2 size={13} className="animate-spin" /> {t("topbar.search_loading")}
                  </div>
                ) : searchItems.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-[color:var(--ds-text-subtle)]">
                    {t("topbar.search_no_results")} „{searchQuery}“
                  </div>
                ) : (
                  <>
                    {searchItems.map((item, i) => (
                      <button
                        key={item.slug}
                        onClick={() => {
                          router.push(
                            `/dashboard/brain?q=${encodeURIComponent(searchQuery.trim())}`
                          );
                          setSearchQuery("");
                          setSearchOpen(false);
                        }}
                        onMouseEnter={() => setSearchActiveIdx(i)}
                        className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors ${i === searchActiveIdx ? "brand-soft brand-text" : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"}`}
                        role="option"
                        aria-selected={i === searchActiveIdx}
                      >
                        <Search size={13} className="mt-0.5 shrink-0 opacity-50" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{item.title}</div>
                          {item.snippet && (
                            <div className="mt-0.5 truncate text-xs text-[color:var(--ds-text-subtle)]">
                              {item.snippet}
                            </div>
                          )}
                        </div>
                        {i === searchActiveIdx && (
                          <CornerDownLeft
                            size={12}
                            className="shrink-0 text-[color:var(--ds-text-subtle)]"
                          />
                        )}
                      </button>
                    ))}
                    <div className="flex items-center justify-between border-t border-[color:var(--ds-border)] px-4 py-2 text-xs text-[color:var(--ds-text-subtle)]">
                      <span>{t("topbar.search_enter_all")}</span>
                      <span>
                        {searchItems.length} {t("topbar.search_hits")}
                      </span>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* Mobile search icon — opens command palette via ⌘K simulation */}
        <button
          onClick={() => {
            // Dispatch ⌘K to trigger command palette
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
          }}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none md:hidden"
          aria-label={t("topbar.search_aria")}
        >
          <Search size={18} />
        </button>
      </div>
      <div className="flex shrink-0 items-center gap-2 max-md:hidden">
        {/* Copilot toggle */}
        <button
          onClick={onCopilotToggle}
          aria-label={copilotOpen ? "Copilot schließen" : "Copilot öffnen"}
          title={copilotOpen ? "Copilot schließen (Cmd+J)" : "Copilot öffnen (Cmd+J)"}
          aria-pressed={copilotOpen}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none",
            copilotOpen
              ? "bg-[color:var(--brand-primary)] text-white shadow-sm"
              : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
          )}
        >
          <PanelRightOpen size={16} />
        </button>
        <button
          onClick={onGuideOpen}
          aria-label={t("guide.open")}
          title={t("guide.open")}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
        >
          <HelpCircle size={16} />
        </button>
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? t("topbar.theme_light") : t("topbar.theme_dark")}
          aria-label={theme === "dark" ? t("topbar.theme_light_aria") : t("topbar.theme_dark_aria")}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <div className="relative max-md:hidden" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            aria-label={
              unreadCount > 0
                ? `${t("topbar.notifications")} — ${unreadCount} ${t("topbar.unread_count")}`
                : t("topbar.notifications")
            }
            aria-expanded={notifOpen}
            aria-haspopup="menu"
            className="relative flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
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
                <div className="max-h-80 space-y-1.5 overflow-y-auto p-2">
                  {notifications.length === 0 ? (
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
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        role="menuitem"
                        tabIndex={0}
                        className={`rounded-lg border p-3 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none ${n.type === "deadline" ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)]" : n.type === "dream" ? "brand-border brand-soft" : n.type === "mention" ? "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)]" : n.type === "reply" ? "border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)]" : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs leading-snug font-medium text-[color:var(--ds-text)]">
                              {n.title}
                            </div>
                            <div className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                              {n.message}
                            </div>
                          </div>
                          {!n.read && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (n.id.startsWith("dl-")) {
                                  // Inline deadline notification — mark locally
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
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="hidden md:block">
          <BrainSelector />
        </div>
        <div className="hidden md:block">
          <NetworkStatusBadge />
        </div>
        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-[background-color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
            aria-label={t("topbar.user_menu")}
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
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
            <ChevronDown size={14} className="hidden text-[color:var(--ds-text-subtle)] md:block" />
          </button>
          <AnimatePresence initial={false}>
            {userMenuOpen && (
              <motion.div
                className="card-shadow-elevated absolute top-12 right-0 z-50 w-56 overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                role="menu"
                aria-label={t("topbar.user_menu")}
                initial={popoverInitial}
                animate={popoverAnimate}
                exit={popoverExit}
                transition={popoverTransition}
              >
                <div className="border-b border-[color:var(--ds-border)] px-4 py-3.5">
                  <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                    {userName ?? t("topbar.user_fallback")}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[color:var(--ds-text-subtle)]">
                    {userEmail ?? ""}
                  </p>
                </div>
                <div className="p-1.5">
                  <Link
                    href="/dashboard/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                    role="menuitem"
                  >
                    <Settings size={15} className="shrink-0" />
                    {t("topbar.settings")}
                  </Link>
                  <button
                    onClick={() => {
                      toggleTheme();
                      setUserMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                    role="menuitem"
                  >
                    {theme === "dark" ? (
                      <Sun size={15} className="shrink-0" />
                    ) : (
                      <Moon size={15} className="shrink-0" />
                    )}
                    {theme === "dark" ? t("topbar.theme_light") : t("topbar.theme_dark")}
                  </button>
                  {/* Language switcher */}
                  <div
                    className="px-3 py-2"
                    role="menuitem"
                    aria-label={t("topbar.language_switch")}
                  >
                    <div className="mb-1.5 flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                      <Languages size={13} className="shrink-0" />
                      {t("topbar.language")}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          setLang("de");
                          setUserMenuOpen(false);
                        }}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[var(--ds-ease-smooth)]",
                          lang === "de"
                            ? "brand-soft brand-text brand-border"
                            : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)] hover:text-[color:var(--ds-text)]"
                        )}
                        aria-pressed={lang === "de"}
                      >
                        DE
                      </button>
                      <button
                        onClick={() => {
                          setLang("en");
                          setUserMenuOpen(false);
                        }}
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[var(--ds-ease-smooth)]",
                          lang === "en"
                            ? "brand-soft brand-text brand-border"
                            : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)] hover:text-[color:var(--ds-text)]"
                        )}
                        aria-pressed={lang === "en"}
                      >
                        EN
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={logout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-danger-bg)] hover:text-[color:var(--ds-danger-text)]"
                    role="menuitem"
                  >
                    <LogOut size={15} className="shrink-0" />
                    {t("topbar.logout")}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
