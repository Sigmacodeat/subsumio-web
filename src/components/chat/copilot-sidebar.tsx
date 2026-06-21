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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const desktopChatRef = useRef<ChatPanelHandle>(null);
  const mobileChatRef = useRef<ChatPanelHandle>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Sync `open` prop with mobile drawer — when toggled on mobile, open the drawer
  useEffect(() => {
    if (open && typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileOpen(true);
    } else if (!open) {
      setMobileOpen(false);
    }
  }, [open]);

  // Close mobile drawer on route change — sync with layout state
  useEffect(() => {
    setMobileOpen(false);
    if (open && typeof window !== "undefined" && window.innerWidth < 768) {
      onToggle();
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── G6: Proactive Suggestions — fetch from /api/notifications (unified) ──
  const [proactiveAlerts, setProactiveAlerts] = useState<
    Array<{ label: string; query: string; severity: "urgent" | "warning" }>
  >([]);

  useEffect(() => {
    if (!open && !mobileOpen) return;
    let cancelled = false;

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
          return;
        }

        setProactiveAlerts(
          deadlineNotifs.slice(0, 3).map((n) => {
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
          })
        );
      } catch {
        // Non-blocking — proactive alerts are nice-to-have
        setProactiveAlerts([]);
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
        if (window.innerWidth >= 768) {
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
  }, [onToggle, mobileOpen]);

  // Focus management for mobile drawer
  useEffect(() => {
    if (mobileOpen) {
      requestAnimationFrame(() => closeButtonRef.current?.focus());
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
        router.push(action.href);
      } else if (action.query) {
        // Send query directly to the appropriate ChatPanel via ref
        const ref = desktopChatRef.current ?? mobileChatRef.current;
        ref?.sendMessage(action.query);
      }
    },
    [router]
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={() => {
            setMobileOpen(false);
            if (open) onToggle();
          }}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <div
        ref={drawerRef}
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-md transform transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden",
          mobileOpen ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-label="Brain Copilot"
        aria-modal="true"
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
          {proactiveAlerts.length > 0 && (
            <div className="border-b border-[color:var(--ds-border)] px-3 py-2.5">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                <AlertCircle size={12} />
                Proaktive Hinweise
              </div>
              <div className="space-y-1.5">
                {proactiveAlerts.map((alert, idx) => (
                  <button
                    key={`${alert.label}-${idx}`}
                    onClick={() => {
                      mobileChatRef.current?.sendMessage(alert.query);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-[background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95",
                      alert.severity === "urgent"
                        ? "border-red-200/60 bg-red-50/50 text-red-700 hover:border-red-300 hover:bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/30"
                        : "border-amber-200/60 bg-amber-50/50 text-amber-700 hover:border-amber-300 hover:bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400 dark:hover:bg-amber-950/30"
                    )}
                  >
                    <Clock size={13} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{alert.label}</span>
                    <ChevronRight size={12} className="shrink-0 opacity-50" />
                  </button>
                ))}
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
                {routeContext.quickActions.slice(0, 3).map((action) => {
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
              </div>
            </div>
          )}

          <ChatPanel
            ref={mobileChatRef}
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
        </div>
      </div>

      {/* ── Desktop: Persistent collapsible side panel ── */}
      <aside
        className={cn(
          "relative hidden min-w-0 shrink-0 flex-col overflow-hidden border-l border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] transition-[width] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] md:flex",
          open ? "w-[380px] xl:w-[420px]" : "w-0",
          className
        )}
        aria-label="Brain Copilot Panel"
        aria-hidden={!open}
      >
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
            "flex h-full min-w-0 flex-col overflow-hidden transition-[opacity,transform] delay-75 duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-3 opacity-0"
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
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label="Panel schließen"
                title="Panel schließen"
              >
                <PanelRightClose size={14} />
              </button>
            </div>
          </div>

          {/* Proactive deadline alerts (G6) — premium cards */}
          {proactiveAlerts.length > 0 && (
            <div className="shrink-0 border-b border-[color:var(--ds-border)] px-3 py-2.5">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                <AlertCircle size={12} />
                Proaktive Hinweise
              </div>
              <div className="space-y-1.5">
                {proactiveAlerts.map((alert, idx) => (
                  <button
                    key={`${alert.label}-${idx}`}
                    onClick={() => {
                      const ref = desktopChatRef.current ?? mobileChatRef.current;
                      ref?.sendMessage(alert.query);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition-[background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95",
                      alert.severity === "urgent"
                        ? "border-red-200/60 bg-red-50/50 text-red-700 hover:border-red-300 hover:bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/30"
                        : "border-amber-200/60 bg-amber-50/50 text-amber-700 hover:border-amber-300 hover:bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-400 dark:hover:bg-amber-950/30"
                    )}
                  >
                    <Clock size={13} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{alert.label}</span>
                    <ChevronRight size={12} className="shrink-0 opacity-50" />
                  </button>
                ))}
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
                {routeContext.quickActions.slice(0, 3).map((action) => {
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
              </div>
            </div>
          )}

          {/* Chat panel */}
          <div className="min-h-0 min-w-0 flex-1">
            <ChatPanel
              ref={desktopChatRef}
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
