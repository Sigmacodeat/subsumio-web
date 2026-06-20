"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { useBrainSelector } from "@/lib/use-brain-selector";
import { useBrainStats, usePages, useSearch } from "@/lib/queries/brain";
import { useLogout } from "@/lib/queries/auth";
import { useLang } from "@/lib/use-lang";
import { NetworkStatusBadge } from "@/components/dashboard/sidebar";
import { useRealtime } from "@/lib/realtime";
import { csrfFetch } from "@/lib/csrf";

export type Theme = "light" | "dark";

interface TopbarProps {
  theme: Theme;
  toggleTheme: () => void;
  userName: string | null;
  userEmail: string | null;
  mobileOpen: boolean;
  onMobileMenuOpen: () => void;
  onMobileMenuClose: () => void;
}

export function Topbar({ theme, toggleTheme, userName, userEmail, mobileOpen, onMobileMenuOpen, onMobileMenuClose }: TopbarProps) {
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
  const { t } = useLang();

  // Debounce search query for live results
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchResults = useSearch(debouncedQuery, 5, debouncedQuery.length >= 2);

  const searchItems = useMemo(() => searchResults.data ?? [], [searchResults.data]);
  const [searchActiveIdx, setSearchActiveIdx] = useState(0);
  useEffect(() => { setSearchActiveIdx(0); }, [debouncedQuery]);

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

  // API-based notifications (mentions, replies, system)
  const [apiNotifications, setApiNotifications] = useState<Array<{ id: string; title: string; message: string; type: "deadline" | "dream" | "system" | "mention" | "reply"; read: boolean }>>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  const fetchNotifications = async () => {
    try {
      const res = await csrfFetch("/api/notifications?unread=true&limit=20");
      if (res.ok) {
        const data = await res.json();
        const mapped = (data.notifications || []).map((n: { id: string; type: string; data: Record<string, unknown>; createdAt: string }) => ({
          id: n.id,
          title: n.type === "mention" ? "Erwähnung" : n.type === "reply" ? "Antwort" : "System",
          message: String(n.data?.message ?? ""),
          type: (n.type === "mention" || n.type === "reply" ? n.type : "system") as "mention" | "reply" | "system",
          read: false,
        }));
        setApiNotifications(mapped);
      }
    } catch {
      // silently skip — notifications are non-critical
    }
  };

  const markAllRead = async () => {
    setLoadingNotifs(true);
    try {
      await csrfFetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAll: true }) });
      setApiNotifications([]);
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

  const notifications = useMemo(() => {
    const pages = deadlinesQuery.data;
    const stats = statsQuery.data;
    if (!Array.isArray(pages)) return apiNotifications;
    const now = new Date();
    const notifs: Array<{ id: string; title: string; message: string; type: "deadline" | "dream" | "system" | "mention" | "reply"; read: boolean }> = [...apiNotifications];
    for (const p of pages) {
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      const dueStr = (fm.due_date || fm.date || p.created_at) as string | number | undefined;
      const due = dueStr ? new Date(dueStr) : new Date();
      const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (days <= 3 && days >= 0 && fm.status !== "done") {
        notifs.push({ id: `dl-${p.slug}`, title: t("topbar.notif_deadline_soon"), message: `${p.title} — ${days} ${t("topbar.notif_days")}`, type: "deadline", read: false });
      } else if (days < 0 && fm.status !== "done") {
        notifs.push({ id: `dl-${p.slug}`, title: t("topbar.notif_deadline_overdue"), message: `${p.title} — ${Math.abs(days)} ${t("topbar.notif_days_overdue")}`, type: "deadline", read: false });
      }
    }
    const dcStr = stats?.dream_cycle_last;
    if (dcStr && typeof dcStr === "string") {
      const dc = new Date(dcStr);
      const hours = (now.getTime() - dc.getTime()) / (1000 * 60 * 60);
      if (hours > 24) {
        notifs.push({ id: "dream", title: "Dream Cycle", message: `${t("topbar.notif_dream_last")} ${Math.round(hours)} ${t("topbar.notif_dream_hours")}`, type: "dream", read: false });
      }
    }
    return notifs;
  }, [deadlinesQuery.data, statsQuery.data, t, apiNotifications]);

  function logout() {
    logoutMutation.mutate();
  }

  const { brains, activeBrain, selectBrain, loading: brainLoading } = useBrainSelector();

  const selectBrainIdx = useCallback((idx: number) => {
    const b = brains[idx];
    if (b) { selectBrain(b); setBrainOpen(false); }
  }, [brains, selectBrain]);

  function BrainSelector() {
    if (brainLoading || brains.length <= 1) return null;
    return (
      <div className="relative" ref={brainRef}>
        <button
          onClick={() => { setBrainOpen((o) => !o); setBrainActiveIdx(brains.findIndex((b) => b.slug === activeBrain?.slug)); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)]"
          aria-label={t("topbar.brain_selector_aria")}
          aria-expanded={brainOpen}
          aria-haspopup="listbox"
        >
          <BrainIcon size={13} className="shrink-0 brand-text" />
          <span className="max-w-[100px] truncate">{activeBrain?.name ?? "—"}</span>
          <ChevronDown size={11} className={`shrink-0 transition-transform ${brainOpen ? "rotate-180" : ""}`} />
        </button>
        {brainOpen && (
          <div className="absolute right-0 top-9 w-56 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] card-shadow-elevated z-50 overflow-hidden p-1" role="listbox" aria-label={t("topbar.brain_selector_aria")}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setBrainActiveIdx((i) => Math.min(i + 1, brains.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setBrainActiveIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); selectBrainIdx(brainActiveIdx); }
            }}
          >
            {brains.map((b, i) => (
              <button
                key={b.slug}
                onClick={() => selectBrainIdx(i)}
                onMouseEnter={() => setBrainActiveIdx(i)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${i === brainActiveIdx ? "brand-soft brand-text" : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"}`}
                role="option"
                aria-selected={b.slug === activeBrain?.slug}
              >
                <BrainIcon size={14} className="shrink-0" />
                <span className="flex-1 truncate">{b.name}</span>
                {b.slug === activeBrain?.slug && <Check size={13} className="shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="h-16 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-3 flex-1 max-w-lg">
        <button
          onClick={mobileOpen ? onMobileMenuClose : onMobileMenuOpen}
          className="md:hidden w-11 h-11 rounded-lg flex items-center justify-center text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)]"
          aria-label={mobileOpen ? t("topbar.close_menu") : t("topbar.open_menu")}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <div className="relative flex-1 group hidden sm:block" ref={searchRef}>
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-subtle)] z-10" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchQuery.trim()) {
                if (searchOpen && searchItems.length > 0 && searchActiveIdx >= 0 && searchActiveIdx < searchItems.length) {
                  router.push(`/dashboard/brain?q=${encodeURIComponent(searchQuery.trim())}`);
                  setSearchQuery("");
                  setSearchOpen(false);
                } else {
                  router.push(`/dashboard/brain?q=${encodeURIComponent(searchQuery.trim())}`);
                  setSearchQuery("");
                  setSearchOpen(false);
                }
              } else if (e.key === "ArrowDown" && searchOpen && searchItems.length > 0) {
                e.preventDefault();
                setSearchActiveIdx((i) => Math.min(i + 1, searchItems.length - 1));
              } else if (e.key === "ArrowUp" && searchOpen && searchItems.length > 0) {
                e.preventDefault();
                setSearchActiveIdx((i) => Math.max(i - 1, 0));
              }
            }}
            onFocus={(e) => { e.target.select(); if (searchQuery.trim()) setSearchOpen(true); }}
            placeholder={t("topbar.search_placeholder")}
            aria-label={t("topbar.search_aria")}
            aria-expanded={searchOpen && searchItems.length > 0}
            aria-controls="topbar-search-results"
            role="combobox"
            autoComplete="off"
            className="w-full bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] rounded-lg pl-9 pr-16 py-2.5 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:border-[color:var(--brand-primary)] transition-all"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[10px] font-mono text-[color:var(--ds-text-subtle)] pointer-events-none">
            <Command size={9} />K
          </kbd>
          {searchOpen && searchQuery.trim().length >= 2 && (
            <div id="topbar-search-results" className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] card-shadow-elevated z-50 overflow-hidden" role="listbox" aria-label={t("topbar.search_aria")}>
              {searchResults.isLoading ? (
                <div className="flex items-center gap-2 px-4 py-3 text-xs text-[color:var(--ds-text-muted)]">
                  <Loader2 size={13} className="animate-spin" /> Suche…
                </div>
              ) : searchItems.length === 0 ? (
                <div className="px-4 py-3 text-xs text-[color:var(--ds-text-subtle)]">Keine Treffer für „{searchQuery}“</div>
              ) : (
                <>
                  {searchItems.map((item, i) => (
                    <button
                      key={item.slug}
                      onClick={() => {
                        router.push(`/dashboard/brain?q=${encodeURIComponent(searchQuery.trim())}`);
                        setSearchQuery("");
                        setSearchOpen(false);
                      }}
                      onMouseEnter={() => setSearchActiveIdx(i)}
                      className={`w-full flex items-start gap-2.5 px-4 py-2.5 text-left transition-colors ${i === searchActiveIdx ? "brand-soft brand-text" : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"}`}
                      role="option"
                      aria-selected={i === searchActiveIdx}
                    >
                      <Search size={13} className="shrink-0 mt-0.5 opacity-50" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{item.title}</div>
                        {item.snippet && <div className="text-xs text-[color:var(--ds-text-subtle)] truncate mt-0.5">{item.snippet}</div>}
                      </div>
                      {i === searchActiveIdx && <CornerDownLeft size={12} className="shrink-0 text-[color:var(--ds-text-subtle)]" />}
                    </button>
                  ))}
                  <div className="border-t border-[color:var(--ds-border)] px-4 py-2 text-[10px] text-[color:var(--ds-text-subtle)] flex items-center justify-between">
                    <span>↵ für alle Ergebnisse</span>
                    <span>{searchItems.length} Treffer</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {/* Mobile search icon — opens command palette via ⌘K simulation */}
        <button
          onClick={() => {
            // Dispatch ⌘K to trigger command palette
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
          }}
          className="sm:hidden w-11 h-11 rounded-lg flex items-center justify-center text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)]"
          aria-label={t("topbar.search_aria")}
        >
          <Search size={18} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? t("topbar.theme_light") : t("topbar.theme_dark")}
          aria-label={theme === "dark" ? t("topbar.theme_light_aria") : t("topbar.theme_dark_aria")}
          className="w-11 h-11 rounded-lg flex items-center justify-center text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)]"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            aria-label={unreadCount > 0 ? `${t("topbar.notifications")} — ${unreadCount} ${t("topbar.unread_count")}` : t("topbar.notifications")}
            aria-expanded={notifOpen}
            aria-haspopup="menu"
            className="w-11 h-11 rounded-lg flex items-center justify-center text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)] relative"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 ring-2 ring-[var(--ds-surface)] text-[9px] font-bold text-white flex items-center justify-center leading-none" aria-hidden>
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
                       <div className="absolute right-0 top-12 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] card-shadow-elevated z-50 overflow-hidden" role="menu" aria-label={t("topbar.notifications")}>
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-[color:var(--ds-border)]">
                <span className="text-sm font-semibold text-[color:var(--ds-text)]">{t("topbar.notifications")}</span>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      disabled={loadingNotifs}
                      className="text-[11px] text-[color:var(--brand-primary)] hover:opacity-80 transition-opacity disabled:opacity-50"
                    >
                      {t("topbar.mark_all_read")}
                    </button>
                  )}
                  <button onClick={() => setNotifOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-colors" aria-label={t("topbar.close")}><X size={14} /></button>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto p-2 space-y-1.5">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Bell size={20} className="text-[color:var(--ds-border-strong)] mb-3" aria-hidden />
                    <p className="text-xs text-[color:var(--ds-text-muted)]">{t("topbar.no_notifications")}</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className={`rounded-lg border p-3 ${n.type === "deadline" ? "border-amber-500/20 bg-amber-500/5" : n.type === "dream" ? "brand-border brand-soft" : n.type === "mention" ? "border-blue-500/20 bg-blue-500/5" : n.type === "reply" ? "border-purple-500/20 bg-purple-500/5" : "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-[color:var(--ds-text)] leading-snug">{n.title}</div>
                          <div className="text-[11px] text-[color:var(--ds-text-muted)] mt-1 leading-relaxed">{n.message}</div>
                        </div>
                        {!n.read && (
                          <button
                            onClick={async () => {
                              try {
                                await csrfFetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id }) });
                                setApiNotifications((prev) => prev.map((item) => item.id === n.id ? { ...item, read: true } : item));
                              } catch {}
                            }}
                            className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all"
                            aria-label="Als gelesen markieren"
                          >
                            <Check size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <div className="hidden md:block">
          <BrainSelector />
        </div>
        <div className="hidden md:block">
          <NetworkStatusBadge />
        </div>
        {/* User menu */}
        <div className="relative ml-1" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-[color:var(--ds-hover)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-surface)]"
            aria-label={t("topbar.user_menu")}
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
          >
            <div className="w-9 h-9 rounded-full brand-soft border brand-border flex items-center justify-center shrink-0">
              <User size={15} className="brand-text" />
            </div>
            <ChevronDown size={14} className="text-[color:var(--ds-text-subtle)] hidden md:block" />
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 top-12 w-56 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] card-shadow-elevated z-50 overflow-hidden" role="menu" aria-label={t("topbar.user_menu")}>
              <div className="px-4 py-3.5 border-b border-[color:var(--ds-border)]">
                <p className="text-sm font-medium text-[color:var(--ds-text)] truncate">{userName ?? t("topbar.user_fallback")}</p>
                <p className="text-xs text-[color:var(--ds-text-subtle)] truncate mt-0.5">{userEmail ?? ""}</p>
              </div>
              <div className="p-1.5">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all"
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
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all"
                  role="menuitem"
                >
                  {theme === "dark" ? <Sun size={15} className="shrink-0" /> : <Moon size={15} className="shrink-0" />}
                  {theme === "dark" ? t("topbar.theme_light") : t("topbar.theme_dark")}
                </button>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-[color:var(--ds-text-muted)] hover:text-red-600 hover:bg-red-500/10 transition-all"
                  role="menuitem"
                >
                  <LogOut size={15} className="shrink-0" />
                  {t("topbar.logout")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
