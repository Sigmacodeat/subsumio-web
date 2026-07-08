"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquareText,
  X,
  PanelRightClose,
  PanelRightOpen,
  Clock,
  Briefcase,
  CalendarClock,
  Search,
  FileText,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Circle,
  Loader2,
  Maximize2,
  History,
  Mail,
  ShieldAlert,
  Inbox,
  Plus,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";
import { useMediaQuery } from "@/lib/use-media-query";
import { useResizable } from "@/lib/use-resizable";
import { useLang, type TFunc } from "@/lib/use-lang";
import type { Lang } from "@/content/site";
import { ChatPanel, type ChatPanelHandle } from "@/components/chat/chat-panel";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { useMotionValue, useTransform } from "framer-motion";
import type { ChatContextType } from "@/components/chat/chat-types";
import { api } from "@/lib/api";
import { caseFrontmatter } from "@/lib/legal-types";
import { caseSlugFromDashboardPath } from "@/lib/matter-route-path";
import { listSessions } from "@/components/chat/chat-session-store";
import type { ChatSession } from "@/components/chat/chat-types";

interface CopilotSidebarProps {
  open: boolean;
  onToggle: () => void;
  className?: string;
}

// ── Matter Context Card ──────────────────────────────────────────────

interface MatterContextInfo {
  title: string;
  caseNumber: string;
  status: string;
  openDeadlines: number;
  totalDeadlines: number;
  openTasks: number;
  totalTasks: number;
  documentCount: number;
  nextDeadlineDate?: string;
}

function MatterContextCard({ info, lang }: { info: MatterContextInfo; lang: Lang }) {
  const { t } = useLang();
  const isEn = lang === "en";
  return (
    <div className="shrink-0 border-b border-[color:var(--ds-border)] px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[color:var(--ds-surface-2)]">
          <Briefcase size={12} className="text-[color:var(--brand-primary)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] leading-tight font-medium text-[color:var(--ds-text)]">
            {info.title}
          </div>
          <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-subtle)]">
            <span className="font-mono">{info.caseNumber}</span>
            <span className="h-3 w-px bg-[color:var(--ds-border)]" />
            <span className="tabular-nums">
              {info.openDeadlines}/{info.totalDeadlines} {t("copilot.matter_deadlines")}
            </span>
            <span className="tabular-nums">
              {info.openTasks}/{info.totalTasks} {t("copilot.matter_tasks")}
            </span>
          </div>
        </div>
        {info.nextDeadlineDate && (
          <div className="shrink-0 rounded-md bg-[color:var(--ds-warning-bg)] px-2 py-1 text-xs font-medium text-[color:var(--ds-warning-text)]">
            {new Date(info.nextDeadlineDate).toLocaleDateString(isEn ? "en-GB" : "de-DE", {
              day: "2-digit",
              month: "short",
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface ProactiveAlertsProps {
  alerts: ProactiveAlert[];
  onQuery: (query: string) => void;
  onDismiss: (key: string) => void;
  t: TFunc;
  className?: string;
}

function SessionHistoryButton({
  open,
  sessions,
  onToggle,
  onSelect,
  t,
  lang,
}: {
  open: boolean;
  sessions: ChatSession[];
  onToggle: () => void;
  onSelect: (id: string) => void;
  t: TFunc;
  lang: Lang;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--ds-text-muted)] transition-[background-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
        aria-label={t("copilot.history")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <History size={13} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-9 right-0 z-50 w-64 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-1.5 shadow-xl"
          role="menu"
        >
          {sessions.length === 0 ? (
            <p className="px-2 py-3 text-xs text-[color:var(--ds-text-muted)]">
              {t("copilot.history_empty")}
            </p>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onSelect(session.id)}
                className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-[color:var(--ds-hover)]"
                role="menuitem"
              >
                <span className="w-full truncate text-xs font-medium text-[color:var(--ds-text)]">
                  {session.title}
                </span>
                <span className="text-[11px] text-[color:var(--ds-text-subtle)]">
                  {new Date(session.updatedAt).toLocaleDateString(
                    lang === "en" ? "en-GB" : "de-DE"
                  )}
                </span>
              </button>
            ))
          )}
        </motion.div>
      )}
    </div>
  );
}

interface ProactiveAlert {
  label: string;
  query: string;
  severity: "urgent" | "warning" | "info";
  icon: "deadline" | "mail" | "approval" | "conflict" | "intake" | "document";
}

const ALERT_ICONS: Record<ProactiveAlert["icon"], typeof Clock> = {
  deadline: Clock,
  mail: Mail,
  approval: CheckSquare,
  conflict: ShieldAlert,
  intake: Inbox,
  document: FileText,
};

function ProactiveAlerts({ alerts, onQuery, onDismiss, t, className }: ProactiveAlertsProps) {
  if (alerts.length === 0) return null;
  return (
    <div className={cn("shrink-0 border-b border-[color:var(--ds-border)] px-3 py-2", className)}>
      <div className="space-y-1">
        {alerts.map((alert) => {
          const alertKey = `${alert.label}-${alert.query}`;
          const Icon = ALERT_ICONS[alert.icon];
          return (
            <button
              key={alertKey}
              onClick={() => onQuery(alert.query)}
              className={cn(
                "group/alert flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-[background-color,border-color] duration-200 ease-[var(--ds-ease-smooth)]",
                alert.severity === "urgent"
                  ? "border-l-2 border-l-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] hover:bg-[color:var(--ds-danger-bg-hover)]"
                  : alert.severity === "warning"
                    ? "border-l-2 border-l-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)] hover:bg-[color:var(--ds-warning-bg-hover)]"
                    : "border-l-2 border-l-[color:var(--brand-primary)] bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
              )}
            >
              <Icon size={11} className="shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{alert.label}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(alertKey);
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover/alert:opacity-100 hover:bg-[color:var(--ds-hover)]"
                aria-label={t("copilot.dismiss_hint")}
                role="button"
                tabIndex={0}
              >
                <X size={10} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CopilotSidebar({ open, onToggle, className }: CopilotSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  // "Compact" mode renders the Copilot as an overlay drawer instead of a docked
  // side panel. Applies below lg (1024px) so the panel never squeezes the main
  // content on tablet / split-screen widths (kept named isMobile to avoid churn).
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const { t, lang } = useLang();
  const { reduceMotion, panelTransition, tapTransition: softTransition } = useDashboardMotion();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<ChatPanelHandle>(null);
  const onToggleRef = useRef(onToggle);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Swipe-to-close: track horizontal drag progress (0 = open, 1 = fully swiped away)
  const swipeX = useMotionValue(0);
  const swipeOpacity = useTransform(swipeX, [0, 0.5, 1], [1, 0.6, 0]);
  const swipeScale = useTransform(swipeX, [0, 1], [1, 0.96]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recentSessions, setRecentSessions] = useState<ChatSession[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [matterContextInfo, setMatterContextInfo] = useState<MatterContextInfo | null>(null);

  // Keep onToggle ref current to avoid stale closure in route-change effect
  useEffect(() => {
    onToggleRef.current = onToggle;
  }, [onToggle]);

  // Fetch matter context info when on a matter page
  useEffect(() => {
    if (!pathname?.startsWith("/dashboard/cases/")) {
      setMatterContextInfo(null);
      return;
    }
    const slug = caseSlugFromDashboardPath(pathname);
    if (!slug) {
      setMatterContextInfo(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const page = await api.brain.getPage(slug);
        if (cancelled || !page) return;
        const fm = caseFrontmatter(page);
        const deadlines = fm.deadlines || [];
        const tasks = fm.tasks || [];
        const documents = fm.documents || [];
        const openDeadlines = deadlines.filter((d) => d.status !== "done");
        const openTasks = tasks.filter((t) => !t.done);
        const nextDeadline = openDeadlines
          .map((d) => d.due_date || "")
          .filter(Boolean)
          .sort()[0];
        setMatterContextInfo({
          title: page.title || slug,
          caseNumber: fm.case_number || slug,
          status: fm.status || "open",
          openDeadlines: openDeadlines.length,
          totalDeadlines: deadlines.length,
          openTasks: openTasks.length,
          totalTasks: tasks.length,
          documentCount: documents.length,
          nextDeadlineDate: nextDeadline || undefined,
        });
      } catch {
        if (!cancelled) setMatterContextInfo(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const {
    width: panelWidth,
    isResizing,
    handleMouseDown: handleResizeStart,
    setWidth: setPanelWidth,
  } = useResizable({
    minWidth: 280,
    maxWidth: 560,
    initialWidth: typeof window !== "undefined" && window.innerWidth < 1024 ? 300 : 360,
    storageKey: "subsumio-copilot-width",
    side: "right",
  });

  // Re-evaluate panel width on orientation change (portrait ↔ landscape)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOrientationChange = () => {
      const maxW = window.innerWidth < 1024 ? 300 : 360;
      setPanelWidth((w) => {
        if (w <= maxW) return w;
        return Math.min(w, maxW);
      });
    };
    window.addEventListener("orientationchange", handleOrientationChange);
    return () => window.removeEventListener("orientationchange", handleOrientationChange);
  }, [setPanelWidth]);

  // Sync `open` prop with mobile drawer — when toggled on mobile, open the drawer
  useEffect(() => {
    if (open && isMobile) {
      setMobileOpen(true);
    } else if (!open) {
      setMobileOpen(false);
    }
  }, [open, isMobile]);

  // Reset swipe progress when drawer closes
  useEffect(() => {
    if (!mobileOpen) swipeX.set(0);
  }, [mobileOpen, swipeX]);

  // ── G6: Proactive Suggestions — fetch from /api/notifications (unified) ──
  const [proactiveAlerts, setProactiveAlerts] = useState<ProactiveAlert[]>([]);
  const alertsCacheRef = useRef<{ data: typeof proactiveAlerts; ts: number } | null>(null);
  const ALERTS_TTL_MS = 60_000;

  useEffect(() => {
    if (!open && !mobileOpen) return;
    let cancelled = false;

    // Use cached alerts if fresh
    if (alertsCacheRef.current && Date.now() - alertsCacheRef.current.ts < ALERTS_TTL_MS) {
      setProactiveAlerts(alertsCacheRef.current.data);
      return;
    }

    (async () => {
      try {
        const res = await csrfFetch("/api/notifications?unread=true&limit=10");
        if (cancelled || !res.ok) return;
        const data = await res.json();
        const notifs: Array<{
          id: string;
          type: string;
          data: Record<string, unknown>;
          createdAt: string;
        }> = data.notifications ?? [];

        const supportedTypes = new Set([
          "deadline",
          "deadline_alert",
          "deadline_overdue",
          "bea_incoming",
          "document_processed",
          "approval_needed",
          "conflict_alert",
          "intake_received",
        ]);
        const deadlineNotifs = notifs.filter((n) => supportedTypes.has(n.type));

        if (deadlineNotifs.length === 0) {
          setProactiveAlerts([]);
          alertsCacheRef.current = { data: [], ts: Date.now() };
          return;
        }

        const alerts = deadlineNotifs
          .slice(0, 3)
          .map((n) => {
            const isDeadline = n.type.startsWith("deadline");
            const isOverdue =
              n.type === "deadline_overdue" ||
              (n.data?.daysRemaining !== undefined && (n.data.daysRemaining as number) < 0);
            const title =
              (n.data?.title as string) ??
              (n.data?.caseTitle as string) ??
              t("copilot.alert.deadline");
            const days = n.data?.daysRemaining as number | undefined;

            const isEn = lang === "en";
            if (!isDeadline) {
              const config: Record<
                string,
                {
                  icon: ProactiveAlert["icon"];
                  severity: ProactiveAlert["severity"];
                  label: string;
                  query: string;
                }
              > = {
                bea_incoming: {
                  icon: "mail",
                  severity: "info",
                  label: `${t("copilot.alert.bea")}: ${title}`,
                  query: isEn
                    ? `Summarize the new beA message "${title}" and identify required actions.`
                    : `Fasse die neue beA-Nachricht „${title}“ zusammen und nenne erforderliche Schritte.`,
                },
                document_processed: {
                  icon: "document",
                  severity: "info",
                  label: `${t("copilot.alert.document")}: ${title}`,
                  query: isEn
                    ? `Summarize the processed document "${title}" and flag important findings.`
                    : `Fasse das analysierte Dokument „${title}“ zusammen und markiere wichtige Erkenntnisse.`,
                },
                approval_needed: {
                  icon: "approval",
                  severity: "warning",
                  label: `${t("copilot.alert.approval")}: ${title}`,
                  query: isEn
                    ? `What needs to be reviewed before approving "${title}"?`
                    : `Was muss vor der Freigabe von „${title}“ geprüft werden?`,
                },
                conflict_alert: {
                  icon: "conflict",
                  severity: "urgent",
                  label: `${t("copilot.alert.conflict")}: ${title}`,
                  query: isEn
                    ? `Explain the conflict alert "${title}" and recommend next steps.`
                    : `Erläutere den Konflikthinweis „${title}“ und empfehle nächste Schritte.`,
                },
                intake_received: {
                  icon: "intake",
                  severity: "info",
                  label: `${t("copilot.alert.intake")}: ${title}`,
                  query: isEn
                    ? `Review the new intake "${title}" and list the next steps.`
                    : `Prüfe die neue Mandatsanfrage „${title}“ und liste die nächsten Schritte auf.`,
                },
              };
              return config[n.type];
            }
            return {
              label: isOverdue
                ? `${t("copilot.alert.overdue_prefix")} ${title}${days !== undefined ? ` (${Math.abs(days)}${isEn ? "d" : "T"})` : ""}`
                : `${t("copilot.alert.deadline_prefix")} ${title}${days !== undefined ? ` (in ${days}${isEn ? "d" : "T"})` : ""}`,
              query: isOverdue
                ? isEn
                  ? `The deadline "${title}" is overdue. What do I need to do?`
                  : `Die Frist "${title}" ist überfällig. Was muss ich tun?`
                : isEn
                  ? `What are the details for deadline "${title}"?`
                  : `Welche Details gibt es zur Frist "${title}"?`,
              severity: isOverdue ? ("urgent" as const) : ("warning" as const),
              icon: "deadline" as const,
            };
          })
          .filter((alert): alert is ProactiveAlert => Boolean(alert));
        setProactiveAlerts(alerts);
        alertsCacheRef.current = { data: alerts, ts: Date.now() };
      } catch {
        // Non-blocking — proactive alerts are nice-to-have
        setProactiveAlerts([]);
        alertsCacheRef.current = { data: [], ts: Date.now() };
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, mobileOpen, pathname, t, lang]);

  const routeContext: { type: ChatContextType; caseSlug?: string; pageSlug?: string } =
    useMemo(() => {
      // Derive context from pathname
      const caseSlug = caseSlugFromDashboardPath(pathname);
      return {
        type: (caseSlug ? "case" : "global") as ChatContextType,
        caseSlug,
        pageSlug: undefined,
      };
    }, [pathname]);

  // Keyboard shortcut: Cmd+J toggles on desktop, opens on mobile
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        if (!isMobile) {
          if (!open) {
            onToggle();
          }
        } else {
          setMobileOpen((v) => !v);
          onToggle();
        }
      }
      if (e.key === "Escape") {
        if (mobileOpen) {
          setMobileOpen(false);
          if (open) onToggle();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onToggle, mobileOpen, isMobile, open]);

  // Blur active element when desktop sidebar closes — prevents focus from
  // remaining inside an inert/aria-hidden subtree (WAI-ARIA violation).
  useEffect(() => {
    if (!open && !isMobile) {
      const active = document.activeElement as HTMLElement | null;
      if (active && active.closest("[inert]")) {
        active.blur();
      }
    }
  }, [open, isMobile]);

  // Focus management for mobile drawer
  const prevFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (mobileOpen) {
      prevFocusRef.current = document.activeElement as HTMLElement;
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    } else {
      prevFocusRef.current?.focus?.();
      prevFocusRef.current = null;
    }
  }, [mobileOpen]);

  // Focus trap within mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;
    function handleTabKey(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = drawer.querySelectorAll<HTMLElement>(
        'button, a, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleTabKey);
    return () => {
      document.removeEventListener("keydown", handleTabKey);
    };
  }, [mobileOpen]);

  useEffect(() => {
    const handleExternalSend = (event: Event) => {
      const query = (event as CustomEvent<{ query?: string }>).detail?.query?.trim();
      if (!query) return;
      window.setTimeout(() => chatRef.current?.sendMessage(query), 0);
    };
    window.addEventListener("subsumio:copilot:send", handleExternalSend);
    return () => window.removeEventListener("subsumio:copilot:send", handleExternalSend);
  }, []);

  const handleToggleHistory = useCallback(async () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next) setRecentSessions((await listSessions()).slice(0, 5));
  }, [historyOpen]);

  // Panel → fullscreen handoff: carry the running session into /dashboard/chat
  const handleOpenFullscreen = useCallback(() => {
    const sessionId = chatRef.current?.getActiveSessionId();
    router.push(
      sessionId ? `/dashboard/chat?session=${encodeURIComponent(sessionId)}` : "/dashboard/chat"
    );
  }, [router]);

  const handleDismissAlert = useCallback((alertKey: string) => {
    setDismissedAlerts((prev) => {
      const next = new Set(prev);
      next.add(alertKey);
      return next;
    });
  }, []);

  const visibleAlerts = useMemo(
    () => proactiveAlerts.filter((a) => !dismissedAlerts.has(`${a.label}-${a.query}`)),
    [proactiveAlerts, dismissedAlerts]
  );
  return (
    <>
      {/* Mobile overlay */}
      <motion.div
        initial={false}
        animate={{
          opacity: mobileOpen ? 1 : 0,
          backdropFilter: mobileOpen && !reduceMotion ? "blur(8px)" : "blur(0px)",
        }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "fixed inset-0 z-50 bg-black/30 lg:hidden",
          mobileOpen ? "" : "pointer-events-none"
        )}
        onClick={() => {
          setMobileOpen(false);
          if (open) onToggle();
        }}
        aria-hidden="true"
      />

      {/* Mobile drawer */}
      <motion.div
        ref={drawerRef}
        initial={false}
        animate={{ x: mobileOpen ? 0 : "100%" }}
        transition={panelTransition}
        drag={mobileOpen && !reduceMotion ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.6 }}
        onDrag={(_, info) => {
          const drawerWidth = drawerRef.current?.offsetWidth ?? 390;
          swipeX.set(Math.max(0, Math.min(1, info.offset.x / drawerWidth)));
        }}
        onDragEnd={(_, info) => {
          swipeX.set(0);
          if (info.offset.x > 120 || info.velocity.x > 500) {
            setMobileOpen(false);
            if (open) onToggle();
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              navigator.vibrate(8);
            }
          }
        }}
        style={
          mobileOpen && !reduceMotion ? { opacity: swipeOpacity, scale: swipeScale } : undefined
        }
        className="fixed top-0 right-0 z-50 h-full w-full max-w-md will-change-transform lg:hidden"
        role="dialog"
        aria-label={t("copilot.title")}
        aria-modal={mobileOpen ? "true" : undefined}
        {...(!mobileOpen ? { inert: true } : {})}
      >
        <div className="flex h-full flex-col bg-[color:var(--ds-surface)] pt-[env(safe-area-inset-top)] pb-[calc(3.75rem+env(safe-area-inset-bottom))] shadow-2xl">
          {/* Swipe handle — visual affordance for swipe-to-close */}
          {mobileOpen && !reduceMotion && (
            <div
              className="absolute top-1/2 left-0 z-10 flex h-12 w-1.5 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-r-full bg-[color:var(--ds-border-strong)] opacity-40"
              aria-hidden="true"
            />
          )}
          {/* Mobile header bar — compact single-row */}
          <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2">
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 rounded-md px-2 py-1">
                <MessageSquareText size={13} className="text-[color:var(--brand-primary)]" />
                <span className="text-xs font-medium text-[color:var(--ds-text)]">
                  {t("copilot.chat")}
                </span>
                {isStreaming && (
                  <span
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--brand-primary)]"
                    aria-label={t("copilot.thinking")}
                  />
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <SessionHistoryButton
                open={historyOpen}
                sessions={recentSessions}
                onToggle={handleToggleHistory}
                onSelect={(id) => {
                  void chatRef.current?.loadSession(id);
                  setHistoryOpen(false);
                }}
                t={t}
                lang={lang}
              />
              <button
                onClick={handleOpenFullscreen}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label={t("copilot.open_fullscreen")}
                title={t("copilot.open_fullscreen")}
              >
                <Maximize2 size={14} />
              </button>
              <button
                ref={closeButtonRef}
                onClick={() => {
                  setMobileOpen(false);
                  onToggle();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label={t("copilot.close_esc")}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Matter context card — mobile */}
          {matterContextInfo && <MatterContextCard info={matterContextInfo} lang={lang} />}

          {/* Proactive deadline alerts (G6) — mobile */}
          <ProactiveAlerts
            alerts={visibleAlerts}
            onQuery={(q) => {
              chatRef.current?.sendMessage(q);
            }}
            onDismiss={handleDismissAlert}
            t={t}
          />

          {/* Chat — mobile */}
          <ChatPanel
            ref={chatRef}
            context={routeContext}
            className="h-full rounded-none border-0"
            placeholder={
              routeContext.caseSlug ? t("chat.placeholder_case") : t("chat.placeholder_global")
            }
            onStreamingChange={setIsStreaming}
          />
        </div>
      </motion.div>

      {/* ── Desktop: Persistent collapsible side panel ── */}
      <motion.aside
        data-tour="copilot-panel"
        initial={false}
        animate={{
          width: open ? panelWidth : 0,
          opacity: open ? 1 : 0,
        }}
        transition={panelTransition}
        className={cn(
          "dashboard-panel-surface fixed inset-y-0 right-0 z-40 hidden min-w-0 overflow-hidden border-l border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] pt-[env(safe-area-inset-top)] lg:relative lg:inset-auto lg:block lg:shrink-0",
          isResizing ? "transition-none" : "will-change-[width,opacity]",
          className
        )}
        aria-label={t("copilot.title")}
        {...(!open ? { inert: true } : {})}
      >
        {/* Resize handle — drag to resize panel width */}
        {open && (
          <div
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                setPanelWidth((w) => {
                  const nw = Math.max(280, w - 24);
                  try {
                    localStorage.setItem("subsumio-copilot-width", String(nw));
                  } catch {}
                  return nw;
                });
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                setPanelWidth((w) => {
                  const nw = Math.min(560, w + 24);
                  try {
                    localStorage.setItem("subsumio-copilot-width", String(nw));
                  } catch {}
                  return nw;
                });
              }
            }}
            className={cn(
              "absolute top-0 left-0 z-40 h-full w-1.5 cursor-col-resize transition-[width,background-color] duration-150 select-none focus-visible:bg-[var(--brand-primary)] focus-visible:outline-none",
              isResizing
                ? "w-2 bg-[var(--brand-primary)]"
                : "bg-transparent hover:w-2 hover:bg-[color:var(--ds-border-strong)]"
            )}
            role="separator"
            aria-orientation="vertical"
            aria-label={t("copilot.resize")}
            tabIndex={0}
            aria-valuenow={panelWidth}
            aria-valuemin={280}
            aria-valuemax={560}
          />
        )}
        {/* Inner wrapper — fixed width matches panel, never reflows. Only outer aside clips. */}
        <motion.div
          initial={false}
          animate={{ opacity: open ? 1 : 0.92 }}
          transition={softTransition}
          className={cn(
            "flex h-full flex-col",
            isResizing ? "transition-none" : "will-change-opacity"
          )}
          style={{ width: panelWidth }}
        >
          {/* Collapse toggle — premium vertical tab */}
          <button
            onClick={onToggle}
            className={cn(
              "group absolute top-1/2 -left-6 z-30 flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-sm transition-[width,background-color,opacity] duration-[var(--ds-duration-normal)] ease-[var(--ds-ease-smooth)] hover:w-7 hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none",
              !open && "pointer-events-none opacity-0"
            )}
            aria-label={t("copilot.collapse")}
            title={t("copilot.collapse")}
          >
            <PanelRightClose
              size={12}
              className="text-[color:var(--ds-text-muted)] transition-colors group-hover:text-[color:var(--ds-text)]"
            />
          </button>

          {/* Panel content — stays mounted during transition for smooth animation */}
          <motion.div
            initial={false}
            animate={{
              opacity: open ? 1 : 0,
              x: open ? 0 : 12,
            }}
            transition={softTransition}
            className={cn(
              "flex h-full min-w-0 flex-col overflow-hidden",
              open ? "" : "pointer-events-none"
            )}
            {...(!open ? { inert: true } : {})}
          >
            {/* Context header — compact single-row */}
            <div className="relative shrink-0 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 rounded-md px-2 py-1">
                  <MessageSquareText size={12} className="text-[color:var(--brand-primary)]" />
                  <span className="text-xs font-medium text-[color:var(--ds-text)]">
                    {t("copilot.chat")}
                  </span>
                  {isStreaming && (
                    <span
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--brand-primary)]"
                      aria-label={t("copilot.thinking")}
                    />
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  <SessionHistoryButton
                    open={historyOpen}
                    sessions={recentSessions}
                    onToggle={handleToggleHistory}
                    onSelect={(id) => {
                      void chatRef.current?.loadSession(id);
                      setHistoryOpen(false);
                    }}
                    t={t}
                    lang={lang}
                  />
                  <button
                    onClick={handleOpenFullscreen}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--ds-text-muted)] transition-[background-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                    aria-label={t("copilot.open_fullscreen")}
                    title={t("copilot.open_fullscreen")}
                  >
                    <Maximize2 size={13} />
                  </button>
                  <button
                    onClick={onToggle}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--ds-text-muted)] transition-[background-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                    aria-label={t("copilot.close_panel")}
                    title={t("copilot.close_panel")}
                  >
                    <PanelRightClose size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Matter context card — desktop */}
            {matterContextInfo && <MatterContextCard info={matterContextInfo} lang={lang} />}

            {/* Proactive deadline alerts (G6) */}
            <ProactiveAlerts
              alerts={visibleAlerts}
              onQuery={(q) => {
                chatRef.current?.sendMessage(q);
              }}
              onDismiss={handleDismissAlert}
              t={t}
            />

            {/* Chat panel — desktop */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ChatPanel
                ref={chatRef}
                context={routeContext}
                className="h-full rounded-none border-0"
                placeholder={
                  routeContext.caseSlug ? t("chat.placeholder_case") : t("chat.placeholder_global")
                }
                onStreamingChange={setIsStreaming}
              />
            </div>
          </motion.div>
        </motion.div>
      </motion.aside>

      {/* Desktop expand button — premium vertical tab with hover label */}
      <motion.button
        onClick={onToggle}
        initial={false}
        animate={{
          x: open ? panelWidth + 20 : 0,
          opacity: open ? 0 : 1,
          scale: open ? 0.96 : 1,
        }}
        whileHover={reduceMotion || open ? undefined : { x: -2, scale: 1.015 }}
        whileTap={reduceMotion || open ? undefined : { scale: 0.965 }}
        transition={softTransition}
        className={cn(
          "group fixed top-1/2 right-0 z-30 hidden -translate-y-1/2 items-center gap-2 rounded-l-xl border border-r-0 border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-4 pr-2 pl-2.5 shadow-md transition-[padding,box-shadow] duration-[var(--ds-duration-normal)] ease-[var(--ds-ease-panel)] hover:pl-3 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none lg:flex",
          open && "pointer-events-none"
        )}
        aria-label={t("copilot.expand")}
        title={t("copilot.expand_hint")}
        aria-hidden={open}
        tabIndex={open ? -1 : 0}
      >
        <PanelRightOpen
          size={16}
          className="group-hover:brand-text shrink-0 text-[color:var(--ds-text-muted)] transition-colors"
        />
        <span className="max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap text-[color:var(--ds-text-muted)] opacity-0 transition-[max-width,opacity,color] duration-[var(--ds-duration-slow)] ease-[var(--ds-ease-smooth)] group-hover:max-w-[100px] group-hover:text-[color:var(--ds-text)] group-hover:opacity-100">
          {t("copilot.copilot")}
        </span>
      </motion.button>
    </>
  );
}
