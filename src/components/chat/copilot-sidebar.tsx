"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  X,
  PanelRightClose,
  Clock,
  Briefcase,
  FileText,
  CheckSquare,
  Maximize2,
  Mail,
  ShieldAlert,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";
import { useMediaQuery } from "@/lib/use-media-query";
import { useResizable } from "@/lib/use-resizable";
import { useLang, type TFunc } from "@/lib/use-lang";
import type { Lang } from "@/content/site";
import { ChatPanel, type ChatPanelHandle } from "@/components/chat/chat-panel";
import { BrainAvatar } from "@/components/chat/brain-avatar";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { useMotionValue, useTransform } from "framer-motion";
import type { ChatContextType } from "@/components/chat/chat-types";
import { api } from "@/lib/api";
import { caseFrontmatter } from "@/lib/legal-types";
import { caseSlugFromDashboardPath } from "@/lib/matter-route-path";

// ── Dashboard-Seiten-Kontext-Map ─────────────────────────────────────
// Bildet bekannte Dashboard-Routen auf einen lesbaren Seitentitel ab.
// Dieser Titel wird in den System-Prompt injiziert.

const PAGE_CONTEXT_MAP: Record<string, { de: string; en: string }> = {
  "/dashboard/deadlines": { de: "Fristen-Übersicht", en: "Deadlines" },
  "/dashboard/tasks": { de: "Aufgaben", en: "Tasks" },
  "/dashboard/calendar": { de: "Kalender", en: "Calendar" },
  "/dashboard/documents": { de: "Dokumente", en: "Documents" },
  "/dashboard/clients": { de: "Mandanten", en: "Clients" },
  "/dashboard/billing": { de: "Abrechnung", en: "Billing" },
  "/dashboard/time-tracking": { de: "Zeiterfassung", en: "Time Tracking" },
  "/dashboard/cases": { de: "Akten-Übersicht", en: "Cases" },
  "/dashboard/intake": { de: "Mandatsaufnahme", en: "Intake" },
  "/dashboard/settings": { de: "Einstellungen", en: "Settings" },
  "/dashboard/analytics": { de: "Analysen", en: "Analytics" },
  "/dashboard/litigation": { de: "Prozessführung", en: "Litigation" },
  "/dashboard/litigation-analytics": { de: "Prozess-Analysen", en: "Litigation Analytics" },
  "/dashboard/review-sets": { de: "Review Sets", en: "Review Sets" },
  "/dashboard/trust-accounting": { de: "Fremdgeld", en: "Trust Accounting" },
  "/dashboard/compliance": { de: "Compliance", en: "Compliance" },
  "/dashboard/bea": { de: "beA-Postfach", en: "beA Inbox" },
  "/dashboard/email": { de: "E-Mail", en: "Email" },
  "/dashboard/chat": { de: "KI-Assistent", en: "AI Assistant" },
  "/dashboard/knowledge": { de: "Wissensbasis", en: "Knowledge Base" },
  "/dashboard/tax-returns": { de: "Steuererklärungen", en: "Tax Returns" },
  "/dashboard/tax-clients": { de: "Steuer-Mandanten", en: "Tax Clients" },
  "/dashboard/tax-deadlines": { de: "Steuerfristen", en: "Tax Deadlines" },
  "/dashboard/elster": { de: "ELSTER", en: "ELSTER" },
};

const PAGE_EXAMPLE_QUERIES: Record<string, { de: string[]; en: string[] }> = {
  "/dashboard/deadlines": {
    de: [
      "Welche Fristen laufen diese Woche ab?",
      "Zeige mir alle überfälligen Fristen",
      "Welche kritischen Fristen habe ich nächsten Monat?",
      "Erstelle eine Frist für die Klage Müller vs. Schulz",
    ],
    en: [
      "Which deadlines expire this week?",
      "Show me all overdue deadlines",
      "What critical deadlines do I have next month?",
      "Create a deadline for the Müller vs. Schulz case",
    ],
  },
  "/dashboard/tasks": {
    de: [
      "Welche Aufgaben sind heute fällig?",
      "Zeige mir alle offenen Aufgaben nach Priorität",
      "Erstelle eine Aufgabe für die Vertragsprüfung",
      "Welche Aufgaben sind dieser Woche überfällig?",
    ],
    en: [
      "Which tasks are due today?",
      "Show me all open tasks by priority",
      "Create a task for contract review",
      "Which tasks are overdue this week?",
    ],
  },
  "/dashboard/documents": {
    de: [
      "Fasse das zuletzt hochgeladene Dokument zusammen",
      "Welche Fristen enthält dieses Dokument?",
      "Analysiere den Vertrag auf Haftungsklauseln",
      "Extrahiere alle Vertragsparteien aus dem Dokument",
    ],
    en: [
      "Summarize the last uploaded document",
      "What deadlines does this document contain?",
      "Analyze the contract for liability clauses",
      "Extract all parties from the document",
    ],
  },
  "/dashboard/billing": {
    de: [
      "Welche Rechnungen sind noch offen?",
      "Berechne das RVG-Honorar für einen Streitwert von 50.000€",
      "Zeige mir die Zeiterfassung dieser Woche",
      "Erstelle eine Honorarrechnung für Mandant Müller",
    ],
    en: [
      "Which invoices are still open?",
      "Calculate the fee for a dispute value of €50,000",
      "Show me this week's time tracking",
      "Create an invoice for client Müller",
    ],
  },
  "/dashboard/clients": {
    de: [
      "Zeige mir alle aktiven Mandate",
      "Prüfe Interessenskonflikt für neuen Mandanten",
      "Welche Mandate haben kritische Fristen?",
      "Erstelle eine neue Mandatsaufnahme",
    ],
    en: [
      "Show me all active matters",
      "Check conflict of interest for new client",
      "Which matters have critical deadlines?",
      "Create a new client intake",
    ],
  },
  "/dashboard/bea": {
    de: [
      "Fasse die neuesten beA-Nachrichten zusammen",
      "Welche beA-Eingaben erfordern sofortiges Handeln?",
      "Erstelle eine Antwort auf die letzte beA-Nachricht",
      "Extrahiere Fristen aus der letzten beA-Nachricht",
    ],
    en: [
      "Summarize the latest beA messages",
      "Which beA messages require immediate action?",
      "Draft a reply to the last beA message",
      "Extract deadlines from the last beA message",
    ],
  },
  "/dashboard/litigation": {
    de: [
      "Welche Verfahren sind in der Beweisaufnahme?",
      "Zeige den aktuellen Status des Verfahrens Müller",
      "Welche Fristen hat das Verfahren nächste Woche?",
      "Erstelle einen Schriftsatz-Entwurf",
    ],
    en: [
      "Which proceedings are in the evidence phase?",
      "Show the current status of the Müller case",
      "What deadlines does the proceeding have next week?",
      "Create a brief draft",
    ],
  },
};

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
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onDismiss(alertKey);
                  }
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
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [matterContextInfo, setMatterContextInfo] = useState<MatterContextInfo | null>(null);

  // AP2: Live dashboard snapshot — fetched once when panel opens, cached 60s
  const [dashboardSnapshot, setDashboardSnapshot] = useState<{
    criticalDeadlines: number;
    overdueDeadlines: number;
    inboxItems: number;
    activeCases: number;
    pendingReviews: number;
    followUpsToday: number;
  } | null>(null);
  const snapshotCacheRef = useRef<{ data: typeof dashboardSnapshot; ts: number } | null>(null);
  const SNAPSHOT_TTL_MS = 60_000;

  useEffect(() => {
    if (!open && !mobileOpen) return;
    if (snapshotCacheRef.current && Date.now() - snapshotCacheRef.current.ts < SNAPSHOT_TTL_MS) {
      setDashboardSnapshot(snapshotCacheRef.current.data);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await csrfFetch("/api/dashboard/briefing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: lang }),
        });
        if (cancelled || !res.ok) return;
        const json = await res.json();
        const data = json.data ?? null;
        if (!data) return;
        const snapshot = {
          criticalDeadlines: data.criticalDeadlines ?? 0,
          overdueDeadlines: data.overdueDeadlines ?? 0,
          inboxItems: data.inboxItems ?? 0,
          activeCases: data.activeCases ?? 0,
          pendingReviews: data.pendingReviews ?? 0,
          followUpsToday: data.followUpsToday ?? 0,
        };
        if (!cancelled) {
          setDashboardSnapshot(snapshot);
          snapshotCacheRef.current = { data: snapshot, ts: Date.now() };
        }
      } catch {
        // Non-blocking — snapshot enrichment is nice-to-have
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mobileOpen, lang]);

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
    initialWidth: typeof window !== "undefined" && window.innerWidth < 1024 ? 300 : 400,
    storageKey: "subsumio-copilot-width",
    side: "right",
  });

  // Re-evaluate panel width on orientation change (portrait ↔ landscape)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOrientationChange = () => {
      const maxW = window.innerWidth < 1024 ? 300 : 400;
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

  const routeContext: {
    type: ChatContextType;
    caseSlug?: string;
    pageSlug?: string;
    pageLabel?: string;
  } = useMemo(() => {
    const caseSlug = caseSlugFromDashboardPath(pathname);
    // Exact match first, then prefix match for nested routes
    const pageEntry =
      PAGE_CONTEXT_MAP[pathname ?? ""] ??
      Object.entries(PAGE_CONTEXT_MAP).find(([key]) => pathname?.startsWith(key + "/"))?.[1];
    const baseLabel = pageEntry ? pageEntry[lang === "en" ? "en" : "de"] : undefined;

    // AP2: Append live dashboard snapshot numbers to the page label so the
    // system prompt is aware of the current state (critical deadlines, inbox, etc.)
    let pageLabel = baseLabel;
    if (dashboardSnapshot && !caseSlug) {
      const isEn = lang === "en";
      const parts: string[] = [];
      if (dashboardSnapshot.overdueDeadlines > 0) {
        parts.push(
          isEn
            ? `${dashboardSnapshot.overdueDeadlines} overdue deadline(s)`
            : `${dashboardSnapshot.overdueDeadlines} überfällige Frist(en)`
        );
      } else if (dashboardSnapshot.criticalDeadlines > 0) {
        parts.push(
          isEn
            ? `${dashboardSnapshot.criticalDeadlines} critical deadline(s)`
            : `${dashboardSnapshot.criticalDeadlines} kritische Frist(en)`
        );
      }
      if (dashboardSnapshot.inboxItems > 0) {
        parts.push(
          isEn
            ? `${dashboardSnapshot.inboxItems} inbox item(s)`
            : `${dashboardSnapshot.inboxItems} Eingang/Eingänge`
        );
      }
      if (dashboardSnapshot.pendingReviews > 0) {
        parts.push(
          isEn
            ? `${dashboardSnapshot.pendingReviews} pending review(s)`
            : `${dashboardSnapshot.pendingReviews} offene Freigabe(n)`
        );
      }
      if (dashboardSnapshot.followUpsToday > 0) {
        parts.push(
          isEn
            ? `${dashboardSnapshot.followUpsToday} follow-up(s) today`
            : `${dashboardSnapshot.followUpsToday} Wiedervorlage(n) heute`
        );
      }
      if (parts.length > 0) {
        const prefix = baseLabel ?? (isEn ? "Dashboard" : "Dashboard");
        pageLabel = `${prefix} · ${parts.join(" · ")} · ${isEn ? `${dashboardSnapshot.activeCases} active case(s)` : `${dashboardSnapshot.activeCases} aktive Akte(n)`}`;
      }
    }

    return {
      type: (caseSlug ? "case" : "global") as ChatContextType,
      caseSlug,
      pageSlug: undefined,
      pageLabel,
    };
  }, [pathname, lang, dashboardSnapshot]);

  const pageExampleQueries = useMemo(() => {
    if (!pathname) return undefined;
    const entry =
      PAGE_EXAMPLE_QUERIES[pathname] ??
      Object.entries(PAGE_EXAMPLE_QUERIES).find(([key]) => pathname.startsWith(key + "/"))?.[1];
    return entry ? entry[lang === "en" ? "en" : "de"] : undefined;
  }, [pathname, lang]);

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
            <div className="flex items-center gap-2">
              <BrainAvatar
                thinking={isStreaming}
                size="sm"
                title={isStreaming ? t("copilot.thinking") : "Subsumio Copilot"}
              />
              <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">Copilot</span>
            </div>
            <div className="flex items-center gap-0.5">
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
            exampleQueries={pageExampleQueries}
          />
        </div>
      </motion.div>

      {/* ── Desktop: Persistent collapsible side panel ── */}
      <motion.aside
        id="brain-copilot-panel"
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
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- WAI-ARIA separator/slider pattern: keyboard support is provided via onKeyDown + aria-valuenow/-min/-max below, not a plain non-interactive element.
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
                exampleQueries={pageExampleQueries}
                headerActions={
                  <>
                    <button
                      type="button"
                      onClick={handleOpenFullscreen}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                      aria-label={t("copilot.open_fullscreen")}
                      title={t("copilot.open_fullscreen")}
                    >
                      <Maximize2 size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={onToggle}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                      aria-label={t("copilot.close_panel")}
                      title={t("copilot.close_panel")}
                    >
                      <PanelRightClose size={15} aria-hidden />
                    </button>
                  </>
                }
              />
            </div>
          </motion.div>
        </motion.div>
      </motion.aside>
    </>
  );
}
