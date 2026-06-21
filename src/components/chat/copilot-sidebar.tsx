"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Sparkles,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";
import { useIsMobile } from "@/lib/use-media-query";
import { useResizable } from "@/lib/use-resizable";
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

const QUICK_ACTION_ICONS: Record<QuickAction["icon"], typeof Sparkles> = {
  case: Briefcase,
  deadline: CalendarClock,
  research: Search,
  draft: FileText,
  search: Search,
  generic: ChevronRight,
};

const ROUTE_PATTERNS: Array<{
  pattern: RegExp;
  context: (match: RegExpMatchArray) => RouteContext;
}> = [
  {
    pattern: /^\/dashboard\/cases(?:\/(.+))?$/,
    context: (m) => ({
      type: m[1] ? "case" : "global",
      caseSlug: m[1] ? `cases/${m[1]}` : undefined,
      label: m[1] ? `Akte: ${m[1]}` : "Akten",
      quickActions: m[1]
        ? [
            {
              label: "Fristen dieser Akte prüfen",
              query: `Welche Fristen sind in der Akte ${m[1]} offen?`,
              icon: "deadline",
            },
            {
              label: "Aktenzusammenfassung",
              query: `Fasse den aktuellen Stand der Akte ${m[1]} zusammen.`,
              icon: "case",
            },
            {
              label: "Fehlende Dokumente",
              query: `Welche Dokumente fehlen in der Akte ${m[1]}?`,
              icon: "search",
            },
          ]
        : [
            {
              label: "Alle offenen Fristen",
              query: "Zeige mir alle offenen Fristen across alle Akten.",
              icon: "deadline",
            },
            {
              label: "Akten mit hohem Aufwand",
              query: "Welche Akten haben den höchsten Aufwand in diesem Quartal?",
              icon: "case",
            },
          ],
    }),
  },
  {
    pattern: /^\/dashboard\/deadlines$/,
    context: () => ({
      type: "global",
      label: "Fristen",
      quickActions: [
        {
          label: "Fristen diese Woche",
          query: "Welche Fristen fallen diese Woche an?",
          icon: "deadline",
        },
        {
          label: "Überfällige Fristen",
          query: "Gibt es überfällige Fristen? Welche sind am kritischsten?",
          icon: "deadline",
        },
        {
          label: "Fristenkalendar exportieren",
          href: "/dashboard/calendar-export",
          icon: "generic",
        },
      ],
    }),
  },
  {
    pattern: /^\/dashboard\/research$/,
    context: () => ({
      type: "global",
      label: "Recherche",
      quickActions: [
        {
          label: "Aktuelle Rechtsprechung BGB",
          query: "Was gibt es Neues in der Rechtsprechung zum BGB?",
          icon: "research",
        },
        {
          label: "EuGH Urteile diese Woche",
          query: "Welche EuGH-Urteile wurden diese Woche veröffentlicht?",
          icon: "research",
        },
      ],
    }),
  },
  {
    pattern: /^\/dashboard\/drafting$/,
    context: () => ({
      type: "global",
      label: "Schriftsatz",
      quickActions: [
        {
          label: "Klageentwurf generieren",
          query: "Hilf mir, einen Klageentwurf zu verfassen.",
          icon: "draft",
        },
        {
          label: "Berufungsbegründung",
          query: "Wie strukturiere ich eine Berufungsbegründung?",
          icon: "draft",
        },
      ],
    }),
  },
  {
    pattern: /^\/dashboard\/brain(?:\/(.+))?$/,
    context: (m) => ({
      type: m[1] ? "brain_page" : "global",
      pageSlug: m[1],
      label: m[1] ? `Seite: ${m[1]}` : "Wissensdatenbank",
      quickActions: [
        {
          label: "Wissenslücken identifizieren",
          query: "Welche Wissenslücken gibt es in der Datenbank?",
          icon: "search",
        },
        {
          label: "Letzte Aktualisierungen",
          query: "Was wurden die letzten Änderungen in der Wissensdatenbank?",
          icon: "search",
        },
      ],
    }),
  },
  {
    pattern: /^\/dashboard\/contracts$/,
    context: () => ({
      type: "global",
      label: "Verträge",
      quickActions: [
        {
          label: "Vertragsanalyse",
          query: "Wie analysiere ich einen Vertrag auf Risiken?",
          icon: "case",
        },
        { label: "Klauselbibliothek", href: "/dashboard/clause-library", icon: "generic" },
      ],
    }),
  },
  {
    pattern: /^\/dashboard\/compliance$/,
    context: () => ({
      type: "global",
      label: "Compliance",
      quickActions: [
        {
          label: "DSGVO-Check",
          query: "Was sind die wichtigsten DSGVO-Compliance-Punkte für eine Kanzlei?",
          icon: "research",
        },
        { label: "Aufbewahrungsfristen", href: "/dashboard/compliance/retention", icon: "generic" },
      ],
    }),
  },
];

function resolveRouteContext(pathname: string): RouteContext {
  for (const { pattern, context } of ROUTE_PATTERNS) {
    const match = pathname.match(pattern);
    if (match) return context(match);
  }
  return {
    type: "global",
    label: "Dashboard",
    quickActions: [
      {
        label: "Aktenübersicht",
        query: "Gib mir eine Übersicht über alle aktiven Akten.",
        icon: "case",
      },
      {
        label: "Offene Fristen",
        query: "Welche Fristen sind aktuell am dringendsten?",
        icon: "deadline",
      },
      {
        label: "Kanzlei-Statistiken",
        query: "Wie performt die Kanzlei in diesem Quartal?",
        icon: "search",
      },
    ],
  };
}

export function CopilotSidebar({ open, onToggle, className }: CopilotSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<ChatPanelHandle>(null);
  const quickActionNavRef = useRef(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

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
      onToggle();
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

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
          const title = (n.data?.title as string) ?? (n.data?.caseTitle as string) ?? "Frist";
          const days = n.data?.daysRemaining as number | undefined;

          return {
            label: isOverdue
              ? `⚠️ Überfällig: ${title}${days !== undefined ? ` (${Math.abs(days)}T)` : ""}`
              : `Frist: ${title}${days !== undefined ? ` (in ${days}T)` : ""}`,
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

  const routeContext = useMemo(() => resolveRouteContext(pathname), [pathname]);

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
    () => proactiveAlerts.filter((a, i) => !dismissedAlerts.has(`${a.label}-${i}`)),
    [proactiveAlerts, dismissedAlerts]
  );

  const visibleActions = useMemo(
    () => (actionsExpanded ? routeContext.quickActions : routeContext.quickActions.slice(0, 3)),
    [actionsExpanded, routeContext.quickActions]
  );

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/30 backdrop-blur-sm transition-opacity duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden",
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
          "fixed top-0 right-0 z-50 h-full w-full max-w-md transform transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform md:hidden",
          mobileOpen ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-label="Brain Copilot"
        aria-modal={mobileOpen ? "true" : undefined}
        aria-hidden={!mobileOpen}
        {...(!mobileOpen ? { inert: true } : {})}
      >
        <div className="flex h-full flex-col bg-[color:var(--ds-surface)] pt-[env(safe-area-inset-top)] shadow-2xl">
          {/* Mobile header bar */}
          <div className="flex items-center justify-between border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="brand-soft brand-border flex h-8 w-8 items-center justify-center rounded-lg border">
                <Sparkles size={15} className="brand-text" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[color:var(--ds-text)]">Brain Copilot</p>
                <p className="text-xs text-[color:var(--ds-text-subtle)]">{routeContext.label}</p>
              </div>
            </div>
            <button
              ref={closeButtonRef}
              onClick={() => {
                setMobileOpen(false);
                onToggle();
              }}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-95"
              aria-label="Brain Copilot schließen (Esc)"
            >
              <X size={18} />
            </button>
          </div>

          {/* Proactive deadline alerts (G6) — mobile */}
          {visibleAlerts.length > 0 && (
            <div className="border-b border-[color:var(--ds-border)] px-3 py-2.5">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                <AlertCircle size={12} />
                Proaktive Hinweise
              </div>
              <div className="space-y-1.5">
                {visibleAlerts.map((alert) => {
                  const alertKey = `${alert.label}-${proactiveAlerts.indexOf(alert)}`;
                  return (
                    <div
                      key={alertKey}
                      className={cn(
                        "group/alert flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-[background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95",
                        alert.severity === "urgent"
                          ? "border-red-200/60 bg-red-50/50 text-red-700 hover:border-red-300 hover:bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/30"
                          : "border-amber-200/60 bg-amber-50/50 text-amber-700 hover:border-amber-300 hover:bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400 dark:hover:bg-amber-950/30"
                      )}
                    >
                      <Clock size={13} className="shrink-0" />
                      <button
                        onClick={() => chatRef.current?.sendMessage(alert.query)}
                        className="min-w-0 flex-1 truncate"
                      >
                        {alert.label}
                      </button>
                      <ChevronRight size={12} className="shrink-0 opacity-50" />
                      <button
                        onClick={() => handleDismissAlert(alertKey)}
                        className="shrink-0 text-[color:var(--ds-text-subtle)] opacity-0 transition-opacity group-hover/alert:opacity-100 hover:text-[color:var(--ds-text)]"
                        aria-label="Hinweis ausblenden"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick actions — mobile */}
          {routeContext.quickActions.length > 0 && (
            <div className="border-b border-[color:var(--ds-border)] px-3 py-2.5">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                <Sparkles size={12} className="brand-text" />
                Schnellaktionen
              </div>
              <div className="flex flex-wrap gap-1.5">
                {visibleActions.map((action) => {
                  const Icon = QUICK_ACTION_ICONS[action.icon];
                  return (
                    <button
                      key={action.label}
                      onClick={() => handleQuickAction(action)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-[border-color,background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[var(--brand-primary)]/40 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-1 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none active:scale-95"
                    >
                      <Icon size={12} className="shrink-0 text-[color:var(--ds-text-subtle)]" />
                      {action.label}
                    </button>
                  );
                })}
                {routeContext.quickActions.length > 3 && (
                  <button
                    onClick={() => setActionsExpanded((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[color:var(--ds-text-subtle)] transition-[color,background-color] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                    aria-expanded={actionsExpanded}
                    aria-label={actionsExpanded ? "Weniger anzeigen" : "Mehr anzeigen"}
                  >
                    {actionsExpanded ? (
                      <>
                        <ChevronUp size={12} />
                        Weniger
                      </>
                    ) : (
                      <>
                        <ChevronDown size={12} />+{routeContext.quickActions.length - 3}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

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
            : "transition-[width] duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[width]",
          open ? "" : "w-0",
          className
        )}
        style={open ? { width: panelWidth } : undefined}
        aria-label="Brain Copilot Panel"
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
            aria-label="Panel-Größe ändern (Pfeiltasten zum Anpassen)"
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
              "group absolute top-1/2 -left-3.5 z-30 flex h-14 w-3.5 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-sm transition-[width,background-color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:w-4 hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none active:scale-95",
              !open && "pointer-events-none opacity-0"
            )}
            aria-label="Brain Copilot einklappen"
            title="Brain Copilot einklappen"
          >
            <PanelRightClose
              size={12}
              className="text-[color:var(--ds-text-muted)] transition-colors group-hover:text-[color:var(--ds-text)]"
            />
          </button>

          {/* Panel content — stays mounted during transition for smooth animation */}
          <div
            className={cn(
              "flex h-full min-w-0 flex-col overflow-hidden transition-[opacity] delay-75 duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
              open ? "opacity-100" : "pointer-events-none opacity-0"
            )}
            aria-hidden={!open}
          >
            {/* Context header — premium gradient bar */}
            <div className="relative shrink-0 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
              <div className="brand-bg absolute inset-x-0 top-0 h-0.5 opacity-80" />
              <div className="flex items-center gap-2.5 px-3.5 py-3">
                <div className="brand-soft brand-border flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                  <Sparkles size={15} className="brand-text" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold tracking-wide text-[color:var(--ds-text)] uppercase">
                    Brain Copilot
                  </p>
                  <p className="truncate text-xs text-[color:var(--ds-text-subtle)]">
                    {routeContext.label}
                  </p>
                </div>
                <button
                  onClick={onToggle}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[color:var(--ds-text-subtle)] transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-95"
                  aria-label="Panel schließen"
                  title="Panel schließen"
                >
                  <PanelRightClose size={16} />
                </button>
              </div>
            </div>

            {/* Proactive deadline alerts (G6) — premium cards */}
            {visibleAlerts.length > 0 && (
              <div className="shrink-0 border-b border-[color:var(--ds-border)] px-3 py-2.5">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                  <AlertCircle size={12} />
                  Proaktive Hinweise
                </div>
                <div className="space-y-1.5">
                  {visibleAlerts.map((alert) => {
                    const alertKey = `${alert.label}-${proactiveAlerts.indexOf(alert)}`;
                    return (
                      <div
                        key={alertKey}
                        className={cn(
                          "group/alert flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-[background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95",
                          alert.severity === "urgent"
                            ? "border-red-200/60 bg-red-50/50 text-red-700 hover:border-red-300 hover:bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/30"
                            : "border-amber-200/60 bg-amber-50/50 text-amber-700 hover:border-amber-300 hover:bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400 dark:hover:bg-amber-950/30"
                        )}
                      >
                        <Clock size={13} className="shrink-0" />
                        <button
                          onClick={() => chatRef.current?.sendMessage(alert.query)}
                          className="min-w-0 flex-1 truncate"
                        >
                          {alert.label}
                        </button>
                        <ChevronRight size={12} className="shrink-0 opacity-50" />
                        <button
                          onClick={() => handleDismissAlert(alertKey)}
                          className="shrink-0 text-[color:var(--ds-text-subtle)] opacity-0 transition-opacity group-hover/alert:opacity-100 hover:text-[color:var(--ds-text)]"
                          aria-label="Hinweis ausblenden"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick actions — contextual icon chips */}
            {routeContext.quickActions.length > 0 && (
              <div className="shrink-0 border-b border-[color:var(--ds-border)] px-3 py-2.5">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                  <Sparkles size={12} className="brand-text" />
                  Schnellaktionen
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {visibleActions.map((action) => {
                    const Icon = QUICK_ACTION_ICONS[action.icon];
                    return (
                      <button
                        key={action.label}
                        onClick={() => handleQuickAction(action)}
                        className="group/action inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-[border-color,background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[var(--brand-primary)]/40 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-1 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none active:scale-95"
                      >
                        <Icon
                          size={12}
                          className="group-hover/action:brand-text shrink-0 text-[color:var(--ds-text-subtle)] transition-colors"
                        />
                        {action.label}
                      </button>
                    );
                  })}
                  {routeContext.quickActions.length > 3 && (
                    <button
                      onClick={() => setActionsExpanded((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[color:var(--ds-text-subtle)] transition-[color,background-color] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                      aria-expanded={actionsExpanded}
                      aria-label={actionsExpanded ? "Weniger anzeigen" : "Mehr anzeigen"}
                    >
                      {actionsExpanded ? (
                        <>
                          <ChevronUp size={12} />
                          Weniger
                        </>
                      ) : (
                        <>
                          <ChevronDown size={12} />+{routeContext.quickActions.length - 3}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}

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
          className="group fixed top-1/2 right-0 z-30 hidden -translate-y-1/2 items-center gap-2 rounded-l-xl border border-r-0 border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-4 pr-2 pl-2.5 shadow-md transition-[padding,box-shadow,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:pl-3 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none active:scale-95 md:flex"
          aria-label="Brain Copilot ausklappen"
          title="Brain Copilot ausklappen (Cmd+J)"
        >
          <PanelRightOpen
            size={16}
            className="group-hover:brand-text shrink-0 text-[color:var(--ds-text-muted)] transition-colors"
          />
          <span className="max-w-0 overflow-hidden text-xs font-medium whitespace-nowrap text-[color:var(--ds-text-muted)] opacity-0 transition-[max-width,opacity,color] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:max-w-[100px] group-hover:text-[color:var(--ds-text)] group-hover:opacity-100">
            Copilot
          </span>
        </button>
      )}
    </>
  );
}
