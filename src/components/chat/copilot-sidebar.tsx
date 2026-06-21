"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, X, PanelRightClose, PanelRightOpen, AlertCircle, Clock } from "lucide-react";
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

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
      {/* ── Mobile: Floating FAB + Drawer overlay ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className={cn(
          "brand-bg brand-text-on-primary fixed right-6 bottom-6 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-bg)] focus-visible:outline-none md:hidden",
          mobileOpen && "pointer-events-none opacity-0",
          className
        )}
        aria-label="Brain Copilot öffnen (Cmd+J)"
        title="Brain Copilot öffnen (Cmd+J)"
      >
        {!mobileOpen && (
          <span
            className="brand-bg absolute inset-0 animate-ping rounded-full opacity-20"
            aria-hidden
          />
        )}
        <Sparkles size={22} className="relative" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <div
        ref={drawerRef}
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-md transform transition-transform duration-300 ease-out md:hidden",
          mobileOpen ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-label="Brain Copilot"
        aria-modal="true"
      >
        <div className="flex h-full flex-col bg-[color:var(--ds-surface)] shadow-2xl">
          <button
            ref={closeButtonRef}
            onClick={() => setMobileOpen(false)}
            className="absolute top-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            aria-label="Brain Copilot schließen (Esc)"
          >
            <X size={16} />
          </button>

          {/* Proactive deadline alerts (G6) — mobile */}
          {proactiveAlerts.length > 0 && (
            <div className="border-b border-[color:var(--ds-border)] px-3 py-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-subtle)]">
                <AlertCircle size={12} />
                Proaktive Hinweise
              </div>
              <div className="space-y-1">
                {proactiveAlerts.map((alert, idx) => (
                  <button
                    key={`${alert.label}-${idx}`}
                    onClick={() => {
                      mobileChatRef.current?.sendMessage(alert.query);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      alert.severity === "urgent"
                        ? "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
                        : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50"
                    )}
                  >
                    <Clock size={12} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{alert.label}</span>
                  </button>
                ))}
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
          "relative hidden min-w-0 shrink-0 flex-col overflow-hidden border-l border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] transition-all duration-300 ease-in-out md:flex",
          open ? "w-[380px] xl:w-[420px]" : "w-0",
          className
        )}
        aria-label="Brain Copilot Panel"
        aria-hidden={!open}
      >
        {/* Collapse toggle — floats at the border when open */}
        <button
          onClick={onToggle}
          className={cn(
            "absolute top-1/2 -left-3 z-30 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] shadow-sm transition-all hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none",
            !open && "pointer-events-none opacity-0"
          )}
          aria-label="Brain Copilot einklappen"
          title="Brain Copilot einklappen"
        >
          <PanelRightClose size={14} />
        </button>

        {/* Panel content — stays mounted during transition for smooth animation */}
        <div
          className={cn(
            "flex h-full min-w-0 flex-col overflow-hidden transition-opacity duration-200",
            open ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          aria-hidden={!open}
        >
          {/* Context pin bar */}
          <div className="flex items-center gap-2 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2">
            <span className="brand-soft brand-border flex h-6 w-6 shrink-0 items-center justify-center rounded-md border">
              <Sparkles size={13} className="brand-text" />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-[color:var(--ds-text-muted)]">
              {routeContext.label}
            </span>
            <button
              onClick={onToggle}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              aria-label="Panel schließen"
              title="Panel schließen"
            >
              <PanelRightClose size={14} />
            </button>
          </div>

          {/* Proactive deadline alerts (G6) */}
          {proactiveAlerts.length > 0 && (
            <div className="border-b border-[color:var(--ds-border)] px-3 py-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[color:var(--ds-text-subtle)]">
                <AlertCircle size={12} />
                Proaktive Hinweise
              </div>
              <div className="space-y-1">
                {proactiveAlerts.map((alert, idx) => (
                  <button
                    key={`${alert.label}-${idx}`}
                    onClick={() => {
                      const ref = desktopChatRef.current ?? mobileChatRef.current;
                      ref?.sendMessage(alert.query);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      alert.severity === "urgent"
                        ? "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
                        : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50"
                    )}
                  >
                    <Clock size={12} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{alert.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick actions — contextual suggestions */}
          {routeContext.quickActions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-[color:var(--ds-border)] px-3 py-2">
              {routeContext.quickActions.slice(0, 3).map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action)}
                  className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-all hover:border-[var(--brand-primary)] hover:text-[color:var(--ds-text)] focus-visible:ring-1 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                >
                  {action.label}
                </button>
              ))}
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

      {/* Desktop expand button — visible when panel is closed */}
      {!open && (
        <button
          onClick={onToggle}
          className="fixed top-1/2 right-0 z-30 hidden h-12 w-7 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)] shadow-sm transition-all hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none md:flex"
          aria-label="Brain Copilot ausklappen"
          title="Brain Copilot ausklappen (Cmd+J)"
        >
          <PanelRightOpen size={16} />
        </button>
      )}
    </>
  );
}
