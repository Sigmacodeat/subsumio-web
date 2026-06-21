"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquareText,
  X,
  PanelRightClose,
  PanelRightOpen,
  AlertCircle,
  Clock,
  Briefcase,
  CalendarClock,
  Search,
  FileText,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";
import { useIsMobile } from "@/lib/use-media-query";
import { useResizable } from "@/lib/use-resizable";
import { useLang, type TFunc } from "@/lib/use-lang";
import { ChatPanel, type ChatPanelHandle } from "@/components/chat/chat-panel";
import type { ChatContextType } from "@/components/chat/chat-types";

interface CopilotSidebarProps {
  open: boolean;
  onToggle: () => void;
  className?: string;
}

interface RouteContext {
  type: ChatContextType;
  caseSlug?: string;
  pageSlug?: string;
  label: string;
  quickActions: QuickAction[];
}

interface QuickAction {
  label: string;
  query?: string;
  href?: string;
  icon: "case" | "deadline" | "research" | "draft" | "search" | "generic";
}

const QUICK_ACTION_ICONS: Record<QuickAction["icon"], typeof MessageSquareText> = {
  case: Briefcase,
  deadline: CalendarClock,
  research: Search,
  draft: FileText,
  search: Search,
  generic: ChevronRight,
};

const ROUTE_PATTERNS: Array<{
  pattern: RegExp;
  context: (match: RegExpMatchArray, t: TFunc) => RouteContext;
}> = [
  {
    pattern: /^\/dashboard\/cases(?:\/(.+))?$/,
    context: (m, t) => ({
      type: m[1] ? "case" : "global",
      caseSlug: m[1] ? `cases/${m[1]}` : undefined,
      label: m[1] ? `${t("copilot.ctx.case_prefix")} ${m[1]}` : t("copilot.ctx.cases"),
      quickActions: m[1]
        ? [
            {
              label: t("copilot.qa.case_deadlines"),
              query: `Welche Fristen sind in der Akte ${m[1]} offen?`,
              icon: "deadline",
            },
            {
              label: t("copilot.qa.case_summary"),
              query: `Fasse den aktuellen Stand der Akte ${m[1]} zusammen.`,
              icon: "case",
            },
            {
              label: t("copilot.qa.case_missing_docs"),
              query: `Welche Dokumente fehlen in der Akte ${m[1]}?`,
              icon: "search",
            },
          ]
        : [
            {
              label: t("copilot.qa.open_deadlines"),
              query: "Zeige mir alle offenen Fristen across alle Akten.",
              icon: "deadline",
            },
            {
              label: t("copilot.qa.high_effort_cases"),
              query: "Welche Akten haben den höchsten Aufwand in diesem Quartal?",
              icon: "case",
            },
          ],
    }),
  },
  {
    pattern: /^\/dashboard\/deadlines$/,
    context: (_m, t) => ({
      type: "global",
      label: t("copilot.ctx.deadlines"),
      quickActions: [
        {
          label: t("copilot.qa.deadlines_this_week"),
          query: "Welche Fristen fallen diese Woche an?",
          icon: "deadline",
        },
        {
          label: t("copilot.qa.deadlines_overdue"),
          query: "Gibt es überfällige Fristen? Welche sind am kritischsten?",
          icon: "deadline",
        },
        {
          label: t("copilot.qa.deadline_export"),
          href: "/dashboard/calendar-export",
          icon: "generic",
        },
      ],
    }),
  },
  {
    pattern: /^\/dashboard\/research$/,
    context: (_m, t) => ({
      type: "global",
      label: t("copilot.ctx.research"),
      quickActions: [
        {
          label: t("copilot.qa.research_bgb"),
          query: "Was gibt es Neues in der Rechtsprechung zum BGB?",
          icon: "research",
        },
        {
          label: t("copilot.qa.research_eugh"),
          query: "Welche EuGH-Urteile wurden diese Woche veröffentlicht?",
          icon: "research",
        },
      ],
    }),
  },
  {
    pattern: /^\/dashboard\/drafting$/,
    context: (_m, t) => ({
      type: "global",
      label: t("copilot.ctx.drafting"),
      quickActions: [
        {
          label: t("copilot.qa.draft_klage"),
          query: "Hilf mir, einen Klageentwurf zu verfassen.",
          icon: "draft",
        },
        {
          label: t("copilot.qa.draft_berufung"),
          query: "Wie strukturiere ich eine Berufungsbegründung?",
          icon: "draft",
        },
      ],
    }),
  },
  {
    pattern: /^\/dashboard\/brain(?:\/(.+))?$/,
    context: (m, t) => ({
      type: m[1] ? "brain_page" : "global",
      pageSlug: m[1],
      label: m[1] ? `${t("copilot.ctx.page_prefix")} ${m[1]}` : t("copilot.ctx.brain"),
      quickActions: [
        {
          label: t("copilot.qa.brain_gaps"),
          query: "Welche Wissenslücken gibt es in der Datenbank?",
          icon: "search",
        },
        {
          label: t("copilot.qa.brain_updates"),
          query: "Was wurden die letzten Änderungen in der Wissensdatenbank?",
          icon: "search",
        },
      ],
    }),
  },
  {
    pattern: /^\/dashboard\/contracts$/,
    context: (_m, t) => ({
      type: "global",
      label: t("copilot.ctx.contracts"),
      quickActions: [
        {
          label: t("copilot.qa.contract_analysis"),
          query: "Wie analysiere ich einen Vertrag auf Risiken?",
          icon: "case",
        },
        {
          label: t("copilot.qa.clause_library"),
          href: "/dashboard/clause-library",
          icon: "generic",
        },
      ],
    }),
  },
  {
    pattern: /^\/dashboard\/compliance$/,
    context: (_m, t) => ({
      type: "global",
      label: t("copilot.ctx.compliance"),
      quickActions: [
        {
          label: t("copilot.qa.gdpr_check"),
          query: "Was sind die wichtigsten DSGVO-Compliance-Punkte für eine Kanzlei?",
          icon: "research",
        },
        {
          label: t("copilot.qa.retention_periods"),
          href: "/dashboard/compliance/retention",
          icon: "generic",
        },
      ],
    }),
  },
];

function resolveRouteContext(pathname: string, t: TFunc): RouteContext {
  for (const { pattern, context } of ROUTE_PATTERNS) {
    const match = pathname.match(pattern);
    if (match) return context(match, t);
  }
  return {
    type: "global",
    label: t("copilot.ctx.dashboard"),
    quickActions: [
      {
        label: t("copilot.qa.case_overview"),
        query: "Gib mir eine Übersicht über alle aktiven Akten.",
        icon: "case",
      },
      {
        label: t("copilot.qa.open_deadlines_urgent"),
        query: "Welche Fristen sind aktuell am dringendsten?",
        icon: "deadline",
      },
      {
        label: t("copilot.qa.firm_stats"),
        query: "Wie performt die Kanzlei in diesem Quartal?",
        icon: "search",
      },
    ],
  };
}

interface ProactiveAlertsProps {
  alerts: Array<{ label: string; query: string; severity: "urgent" | "warning" }>;
  onQuery: (query: string) => void;
  onDismiss: (key: string) => void;
  t: TFunc;
  className?: string;
}

function ProactiveAlerts({ alerts, onQuery, onDismiss, t, className }: ProactiveAlertsProps) {
  if (alerts.length === 0) return null;
  return (
    <div className={cn("shrink-0 border-b border-[color:var(--ds-border)] px-3 py-2", className)}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
        <AlertCircle size={10} />
        {t("copilot.proactive_hints")}
      </div>
      <div className="space-y-1">
        {alerts.map((alert) => {
          const alertKey = `${alert.label}-${alert.query}`;
          return (
            <div
              key={alertKey}
              className={cn(
                "group/alert flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition-[background-color,border-color] duration-200 ease-[var(--ds-ease-smooth)]",
                alert.severity === "urgent"
                  ? "border-l-2 border-red-200/60 border-l-red-500 bg-red-50/40 text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:border-l-red-400 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/30"
                  : "border-l-2 border-amber-200/60 border-l-amber-500 bg-amber-50/40 text-amber-700 hover:bg-amber-50 dark:border-amber-900/40 dark:border-l-amber-400 dark:bg-amber-950/20 dark:text-amber-400 dark:hover:bg-amber-950/30"
              )}
            >
              <Clock size={11} className="shrink-0" />
              <button onClick={() => onQuery(alert.query)} className="min-w-0 flex-1 truncate">
                {alert.label}
              </button>
              <button
                onClick={() => onDismiss(alertKey)}
                className="shrink-0 text-[color:var(--ds-text-subtle)] opacity-0 transition-opacity group-hover/alert:opacity-100 hover:text-[color:var(--ds-text)]"
                aria-label={t("copilot.dismiss_hint")}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface QuickActionsChipsProps {
  actions: QuickAction[];
  onAction: (action: QuickAction) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  t: TFunc;
  variant?: "mobile" | "desktop";
}

function QuickActionsChips({
  actions,
  onAction,
  expanded,
  onToggleExpanded,
  t,
  variant = "desktop",
}: QuickActionsChipsProps) {
  if (actions.length === 0) return null;
  const visibleActions = expanded ? actions : actions.slice(0, 3);
  const isDesktop = variant === "desktop";
  return (
    <div
      className={cn(
        "shrink-0 border-b border-[color:var(--ds-border)]",
        isDesktop ? "px-3.5 py-3" : "px-3 py-2.5"
      )}
    >
      <div
        className={cn(
          "mb-2 flex items-center gap-1.5 font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase",
          isDesktop ? "text-[11px]" : "text-xs"
        )}
      >
        <Zap size={isDesktop ? 11 : 12} className="text-[color:var(--brand-secondary)]" />
        {t("copilot.quick_actions")}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {visibleActions.map((action) => {
          const Icon = QUICK_ACTION_ICONS[action.icon];
          return (
            <button
              key={action.label}
              onClick={() => onAction(action)}
              className="group/action flex items-center gap-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-2 text-left text-xs text-[color:var(--ds-text-muted)] shadow-sm transition-[border-color,background-color,color,box-shadow] duration-200 ease-[var(--ds-ease-smooth)] hover:border-[var(--brand-primary)]/40 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] hover:shadow-md focus-visible:ring-1 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
            >
              <span className="group-hover/action:brand-soft flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)] transition-colors">
                <Icon
                  size={13}
                  className="group-hover/action:brand-text shrink-0 text-[color:var(--ds-text-subtle)] transition-colors"
                />
              </span>
              <span className="min-w-0 flex-1 truncate">{action.label}</span>
            </button>
          );
        })}
        {actions.length > 3 && (
          <button
            onClick={onToggleExpanded}
            className="col-span-2 inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[color:var(--ds-text-subtle)] transition-[color,background-color] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            aria-expanded={expanded}
            aria-label={expanded ? t("copilot.show_less_aria") : t("copilot.show_more_aria")}
          >
            {expanded ? (
              <>
                <ChevronUp size={12} />
                {t("copilot.show_less")}
              </>
            ) : (
              <>
                <ChevronDown size={12} />+{actions.length - 3}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function CopilotSidebar({ open, onToggle, className }: CopilotSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const { t } = useLang();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<ChatPanelHandle>(null);
  const quickActionNavRef = useRef(false);
  const onToggleRef = useRef(onToggle);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  // Keep onToggle ref current to avoid stale closure in route-change effect
  useEffect(() => {
    onToggleRef.current = onToggle;
  }, [onToggle]);

  const {
    width: panelWidth,
    isResizing,
    handleMouseDown: handleResizeStart,
    setWidth: setPanelWidth,
  } = useResizable({
    minWidth: 320,
    maxWidth: 600,
    initialWidth: 380,
    storageKey: "subsumio-copilot-width",
    side: "right",
  });

  // Sync `open` prop with mobile drawer — when toggled on mobile, open the drawer
  useEffect(() => {
    if (open && isMobile) {
      setMobileOpen(true);
    } else if (!open) {
      setMobileOpen(false);
    }
  }, [open, isMobile]);

  // Close mobile drawer on route change — but not if a quick action triggered the navigation
  useEffect(() => {
    if (quickActionNavRef.current) {
      quickActionNavRef.current = false;
      return;
    }
    setMobileOpen(false);
    if (open && isMobile) {
      onToggleRef.current();
    }
  }, [pathname, open, isMobile]);

  // ── G6: Proactive Suggestions — fetch from /api/notifications (unified) ──
  const [proactiveAlerts, setProactiveAlerts] = useState<
    Array<{ label: string; query: string; severity: "urgent" | "warning" }>
  >([]);
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

        // Filter for deadline-related notifications
        const deadlineNotifs = notifs.filter(
          (n) =>
            n.type === "deadline" || n.type === "deadline_alert" || n.type === "deadline_overdue"
        );

        if (deadlineNotifs.length === 0) {
          setProactiveAlerts([]);
          alertsCacheRef.current = { data: [], ts: Date.now() };
          return;
        }

        const alerts = deadlineNotifs.slice(0, 3).map((n) => {
          const isOverdue =
            n.type === "deadline_overdue" ||
            (n.data?.daysRemaining !== undefined && (n.data.daysRemaining as number) < 0);
          const title =
            (n.data?.title as string) ??
            (n.data?.caseTitle as string) ??
            t("copilot.alert.deadline");
          const days = n.data?.daysRemaining as number | undefined;

          return {
            label: isOverdue
              ? `${t("copilot.alert.overdue_prefix")} ${title}${days !== undefined ? ` (${Math.abs(days)}T)` : ""}`
              : `${t("copilot.alert.deadline_prefix")} ${title}${days !== undefined ? ` (in ${days}T)` : ""}`,
            query: isOverdue
              ? `Die Frist "${title}" ist überfällig. Was muss ich tun?`
              : `Welche Details gibt es zur Frist "${title}"?`,
            severity: isOverdue ? ("urgent" as const) : ("warning" as const),
          };
        });
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
  }, [open, mobileOpen, pathname]);

  const routeContext = useMemo(() => resolveRouteContext(pathname, t), [pathname, t]);

  // Keyboard shortcut: Cmd+J toggles on desktop, opens on mobile
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        if (!isMobile) {
          onToggle();
        } else {
          setMobileOpen((v) => !v);
          onToggle();
        }
      }
      if (e.key === "Escape") {
        if (mobileOpen) setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onToggle, mobileOpen, isMobile]);

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
    return () => document.removeEventListener("keydown", handleTabKey);
  }, [mobileOpen]);

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      if (action.href) {
        quickActionNavRef.current = true;
        router.push(action.href);
      } else if (action.query) {
        chatRef.current?.sendMessage(action.query);
      }
    },
    [router]
  );

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
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/30 backdrop-blur-sm transition-opacity duration-[var(--ds-duration-smooth)] ease-[var(--ds-ease-smooth)] motion-reduce:transition-none md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => {
          setMobileOpen(false);
          if (open) onToggle();
        }}
        aria-hidden="true"
      />

      {/* Mobile drawer */}
      <div
        ref={drawerRef}
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-md transform transition-transform duration-[var(--ds-duration-smooth)] ease-[var(--ds-ease-smooth)] will-change-transform motion-reduce:transition-none md:hidden",
          mobileOpen ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-label={t("copilot.title")}
        aria-modal={mobileOpen ? "true" : undefined}
        aria-hidden={!mobileOpen}
        {...(!mobileOpen ? { inert: true } : {})}
      >
        <div className="flex h-full flex-col bg-[color:var(--ds-surface)] pt-[env(safe-area-inset-top)] shadow-2xl">
          {/* Mobile header bar */}
          <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                aria-hidden
              >
                <MessageSquareText size={15} className="text-[color:var(--ds-text-muted)]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--ds-text-subtle)]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--brand-secondary)]" />
                  <span className="truncate">{routeContext.label}</span>
                </div>
                <p className="font-display text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">
                  {t("copilot.title")}
                </p>
              </div>
            </div>
            <button
              ref={closeButtonRef}
              onClick={() => {
                setMobileOpen(false);
                onToggle();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-normal)] ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              aria-label={t("copilot.close_esc")}
            >
              <X size={18} />
            </button>
          </div>

          {/* Proactive deadline alerts (G6) — mobile */}
          <ProactiveAlerts
            alerts={visibleAlerts}
            onQuery={(q) => chatRef.current?.sendMessage(q)}
            onDismiss={handleDismissAlert}
            t={t}
          />

          {/* Quick actions — mobile */}
          <QuickActionsChips
            actions={routeContext.quickActions}
            onAction={handleQuickAction}
            expanded={actionsExpanded}
            onToggleExpanded={() => setActionsExpanded((v) => !v)}
            t={t}
            variant="mobile"
          />

          {isMobile && (
            <ChatPanel
              ref={chatRef}
              context={{
                type: routeContext.type,
                caseSlug: routeContext.caseSlug,
                pageSlug: routeContext.pageSlug,
              }}
              className="h-full rounded-none border-0"
              features={{
                brainStatus: true,
                tokenWidget: true,
                sessionHistory: true,
              }}
            />
          )}
        </div>
      </div>

      {/* ── Desktop: Persistent collapsible side panel ── */}
      <aside
        className={cn(
          "relative hidden min-w-0 shrink-0 overflow-hidden border-l border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] md:block",
          isResizing
            ? "transition-none"
            : "transition-[width] duration-[var(--ds-duration-smooth)] ease-[var(--ds-ease-smooth)] will-change-[width] motion-reduce:transition-none",
          open ? "" : "w-0",
          className
        )}
        style={open ? { width: panelWidth } : undefined}
        aria-label={t("copilot.title")}
        aria-hidden={!open}
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
                  const nw = Math.max(320, w - 24);
                  try {
                    localStorage.setItem("subsumio-copilot-width", String(nw));
                  } catch {}
                  return nw;
                });
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                setPanelWidth((w) => {
                  const nw = Math.min(600, w + 24);
                  try {
                    localStorage.setItem("subsumio-copilot-width", String(nw));
                  } catch {}
                  return nw;
                });
              }
            }}
            className={cn(
              "absolute top-0 left-0 z-40 h-full w-1 cursor-col-resize transition-[width,background-color] duration-150 select-none focus-visible:bg-[var(--brand-primary)] focus-visible:outline-none",
              isResizing
                ? "w-1.5 bg-[var(--brand-primary)]"
                : "bg-transparent hover:w-1.5 hover:bg-[color:var(--ds-border-strong)]"
            )}
            role="separator"
            aria-orientation="vertical"
            aria-label={t("copilot.resize")}
            tabIndex={0}
            aria-valuenow={panelWidth}
            aria-valuemin={320}
            aria-valuemax={600}
          />
        )}
        {/* Inner wrapper — fixed width matches panel, never reflows. Only outer aside clips. */}
        <div className="flex h-full flex-col" style={{ width: panelWidth }}>
          {/* Collapse toggle — premium vertical tab */}
          <button
            onClick={onToggle}
            className={cn(
              "group absolute top-1/2 -left-3.5 z-30 flex h-14 w-3.5 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-sm transition-[width,background-color] duration-[var(--ds-duration-normal)] ease-[var(--ds-ease-smooth)] hover:w-4 hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none",
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
          <div
            className={cn(
              "flex h-full min-w-0 flex-col overflow-hidden transition-[opacity] delay-75 duration-[var(--ds-duration-slow)] ease-[var(--ds-ease-smooth)] motion-reduce:transition-none",
              open ? "opacity-100" : "pointer-events-none opacity-0"
            )}
            aria-hidden={!open}
          >
            {/* Context header — compact agency bar */}
            <div className="relative shrink-0 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
              <div className="absolute inset-x-0 top-0 h-[2px] bg-[color:var(--brand-primary)] opacity-90" />
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                  aria-hidden
                >
                  <MessageSquareText size={15} className="text-[color:var(--ds-text-muted)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-[color:var(--ds-text-subtle)]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--brand-secondary)]" />
                    <span className="truncate">{routeContext.label}</span>
                  </div>
                  <p className="font-display text-[13px] font-semibold tracking-tight text-[color:var(--ds-text)]">
                    {t("copilot.title")}
                  </p>
                </div>
                <button
                  onClick={onToggle}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-[var(--ds-duration-normal)] ease-[var(--ds-ease-smooth)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                  aria-label={t("copilot.close_panel")}
                  title={t("copilot.close_panel")}
                >
                  <PanelRightClose size={15} />
                </button>
              </div>
            </div>

            {/* Proactive deadline alerts (G6) — premium cards */}
            <ProactiveAlerts
              alerts={visibleAlerts}
              onQuery={(q) => chatRef.current?.sendMessage(q)}
              onDismiss={handleDismissAlert}
              t={t}
            />

            {/* Quick actions — contextual icon chips */}
            <QuickActionsChips
              actions={routeContext.quickActions}
              onAction={handleQuickAction}
              expanded={actionsExpanded}
              onToggleExpanded={() => setActionsExpanded((v) => !v)}
              t={t}
              variant="desktop"
            />

            {/* Chat panel — desktop only, single instance */}
            <div className="min-h-0 min-w-0 flex-1">
              {!isMobile && (
                <ChatPanel
                  ref={chatRef}
                  context={{
                    type: routeContext.type,
                    caseSlug: routeContext.caseSlug,
                    pageSlug: routeContext.pageSlug,
                  }}
                  className="h-full rounded-none border-0"
                  features={{
                    brainStatus: true,
                    tokenWidget: true,
                    sessionHistory: true,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Desktop expand button — premium vertical tab with hover label */}
      {!open && (
        <button
          onClick={onToggle}
          className="group fixed top-1/2 right-0 z-30 hidden -translate-y-1/2 items-center gap-2 rounded-l-xl border border-r-0 border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-4 pr-2 pl-2.5 shadow-md transition-[padding,box-shadow] duration-[var(--ds-duration-slow)] ease-[var(--ds-ease-smooth)] hover:pl-3 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none md:flex"
          aria-label={t("copilot.expand")}
          title={t("copilot.expand_hint")}
        >
          <PanelRightOpen
            size={16}
            className="group-hover:brand-text shrink-0 text-[color:var(--ds-text-muted)] transition-colors"
          />
          <span className="max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap text-[color:var(--ds-text-muted)] opacity-0 transition-[max-width,opacity,color] duration-[var(--ds-duration-slow)] ease-[var(--ds-ease-smooth)] group-hover:max-w-[100px] group-hover:text-[color:var(--ds-text)] group-hover:opacity-100">
            {t("copilot.copilot")}
          </span>
        </button>
      )}
    </>
  );
}
