"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertTriangle, Briefcase, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/dashboard/skeleton";
import { useBrainStats } from "@/lib/queries/brain";
import { useKanzleiCockpitData } from "@/components/dashboard/widget-dashboard";
import { useSidebarBadges } from "@/lib/queries/sidebar-badges";
import { useMe } from "@/lib/queries/auth";
import { useLang } from "@/lib/use-lang";
import { formalNameOf } from "@/lib/person-name";
import type { Lang } from "@/content/site";
import type { BrainStats } from "@/lib/types";
import { SecretaryGateWarning } from "@/components/dashboard/secretary-gate-warning";
import {
  appointmentsToAgendaPages,
  buildAgenda,
  fristenToAgendaPages,
  type AgendaEntry,
} from "@/lib/overview-agenda";
import { useFristen } from "@/lib/queries/legal";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ownOutlookEvents } from "@/lib/calendar/outlook-events";
import {
  ATTENTION_ICONS,
  ActiveMatters,
  AttentionList,
  DeadlineAgenda,
  OverviewKpis,
  OverviewSection,
  QuickLinks,
  sortByRecent,
  countLabel,
  type AttentionItem,
  type OverviewKpi,
} from "@/components/dashboard/overview/overview-sections";

const WidgetBoard = dynamic(
  () => import("@/components/dashboard/widget-board").then((m) => m.WidgetBoard),
  { loading: () => <PageSkeleton /> }
);
const MorningBriefing = dynamic(
  () => import("@/components/dashboard/morning-briefing").then((m) => m.MorningBriefing),
  { ssr: false, loading: () => null }
);

function greetingFor(hour: number, lang: Lang): string {
  if (lang === "en")
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return hour < 12 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
}

const AGENDA_WINDOW_DAYS = 14;
/** Same completeness bound as the calendar (CALENDAR_LIST_MAX). */
const APPOINTMENT_LIST_MAX = 10_000;

/**
 * Calendar appointments for "Fristen & Termine": the firm's appointments
 * (Verhandlungen, Besprechungen) and the user's own Outlook appointments.
 */
function useAgendaAppointments() {
  const me = useMe();
  const query = useQuery({
    queryKey: ["overview", "appointments"],
    queryFn: async () => {
      const batch = await api.brain.batchListPagesDetailed(
        ["appointment", "calendar_event"],
        APPOINTMENT_LIST_MAX
      );
      if (batch.errors.includes("appointment")) throw new Error("appointments unavailable");
      return {
        appointments: batch.results["appointment"] ?? [],
        outlook: batch.results["calendar_event"] ?? [],
      };
    },
    staleTime: 60_000,
  });
  const pages = useMemo(() => {
    if (!query.data) return [];
    const mirrored = new Set(
      query.data.appointments
        .map((p) => (p.frontmatter as Record<string, unknown> | undefined)?.outlook_event_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );
    const outlook = ownOutlookEvents(
      query.data.outlook,
      { id: me.data?.user?.id, email: me.data?.user?.email },
      mirrored
    );
    return appointmentsToAgendaPages(query.data.appointments, outlook);
  }, [query.data, me.data?.user?.id, me.data?.user?.email]);
  return { pages, isError: query.isError, isLoading: query.isLoading };
}

function MyDay({ role }: { role?: string }) {
  const cockpit = useKanzleiCockpitData();
  const badges = useSidebarBadges();
  // Same read model as the Fristen view: Fristenbuch + legal_deadline pages +
  // deadlines embedded in matters. The cockpit's capped legal_deadline list is
  // only the fallback while the read model is unavailable.
  const fristenQuery = useFristen();
  const fristen = fristenQuery.data?.fristen;
  const loading = cockpit.loading || fristenQuery.isLoading;
  // Never pass off a failed or partial read as "nothing due".
  const deadlinesIncomplete =
    fristenQuery.isError || fristenQuery.data?.partial === true || (!fristen && cockpit.degraded);

  const appointments = useAgendaAppointments();
  const agenda = useMemo(
    () =>
      buildAgenda(
        [
          ...(fristen ? fristenToAgendaPages(fristen) : cockpit.deadlines.map((d) => d.page)),
          ...appointments.pages,
        ],
        cockpit.cases,
        { windowDays: AGENDA_WINDOW_DAYS }
      ),
    [fristen, cockpit.deadlines, cockpit.cases, appointments.pages]
  );

  // Next open deadline per matter, for the "Aktive Akten" register.
  const nextDeadlineBySlug = useMemo(() => {
    const map = new Map<string, AgendaEntry>();
    for (const e of [...agenda.overdue, ...agenda.upcoming]) {
      if (e.kind === "vorfrist" || e.appointment || !e.caseSlug) continue;
      if (!map.has(e.caseSlug)) map.set(e.caseSlug, e);
    }
    return map;
  }, [agenda]);

  const allEntries = useMemo(
    () => [...agenda.overdue, ...agenda.days.flatMap((d) => d.entries)],
    [agenda]
  );
  // Deadlines only — an appointment is never counted as a Frist.
  const dueThisWeek = allEntries.filter(
    (e) => e.kind !== "vorfrist" && !e.appointment && e.days >= 0 && e.days <= 7
  ).length;
  const unreviewed = fristen
    ? fristen.filter((f) => f.status !== "done" && f.review_status === "unreviewed").length
    : cockpit.deadlines.filter(
        (d) => String(d.page.frontmatter?.review_status ?? "") === "unreviewed"
      ).length;
  const approvalsCount = badges.data?.["/dashboard/freigaben"]?.count ?? 0;

  const kpis: OverviewKpi[] = [
    {
      label: "Fällig in 7 Tagen",
      value: dueThisWeek,
      hint: "Fristen",
      href: "/dashboard/deadlines",
      tone: "warning",
    },
    {
      label: "Überfällig",
      value: agenda.overdue.length,
      hint: agenda.overdue.length > 0 ? "Sofort prüfen" : "Keine offenen Rückstände",
      href: "/dashboard/deadlines?status=overdue",
      tone: "danger",
    },
    {
      label: "Ungeprüfte Fristen",
      value: unreviewed,
      hint: "Vier-Augen-Prüfung ausstehend",
      href: "/dashboard/deadlines",
      tone: "warning",
    },
    {
      label: "Offene Akten",
      value: cockpit.activeCases.length,
      capped: cockpit.isCapped("legal_case"),
      hint: `${countLabel(cockpit.cases.length, cockpit.isCapped("legal_case"))} Akten gesamt`,
      href: "/dashboard/cases",
    },
  ];

  const myTasks = badges.data?.["/dashboard/tasks"];
  const attention: AttentionItem[] = [
    {
      // Tasks colleagues assigned to me (same number as the sidebar badge).
      key: "tasks",
      label: "Meine Aufgaben",
      hint: "Mir zugewiesen, offen",
      count: myTasks?.count ?? 0,
      capped: myTasks?.degraded === true,
      href: "/dashboard/tasks?filter=mine",
      icon: ATTENTION_ICONS.task,
      tone: "warning",
    },
    {
      key: "inbox",
      label: "Eingänge zuordnen",
      hint: "Neue Anfragen und Zustellungen",
      count: cockpit.inboxItems.length,
      capped: cockpit.isCapped("intake_request"),
      href: "/dashboard/intake",
      icon: ATTENTION_ICONS.inbox,
      tone: "warning",
    },
    {
      // One entry for everything awaiting a decision; same number as the
      // sidebar badge and the Freigaben page (shared server summary).
      key: "reviews",
      label: "Freigaben",
      hint: "KI-Fristen, KI-Aktionen, Mandanteneingaben, Analysen und Zeitvorschläge",
      count: approvalsCount,
      href: "/dashboard/freigaben",
      icon: ATTENTION_ICONS.review,
      tone: "warning",
    },
    {
      key: "signatures",
      label: "Unterschriften ausstehend",
      hint: "Versendete Signaturanfragen",
      count: cockpit.pendingSignatures.length,
      capped: cockpit.isCapped("signature_request"),
      href: "/dashboard/signature",
      icon: ATTENTION_ICONS.signature,
      tone: "neutral",
    },
    {
      key: "unassigned",
      label: "Dokumente ohne Akte",
      hint: "Hochgeladen, aber keiner Akte zugeordnet",
      count: cockpit.unassignedDocs.length,
      capped: cockpit.isCapped("document", "legal_document"),
      href: "/dashboard/vault",
      icon: ATTENTION_ICONS.document,
      tone: "warning",
    },
    {
      key: "gaps",
      label: "Dokumente zu prüfen",
      hint: "Texterkennung oder Auswertung unvollständig",
      count: cockpit.reviewGaps.length,
      capped: cockpit.isCapped("document", "legal_document"),
      href: "/dashboard/vault",
      icon: ATTENTION_ICONS.document,
      tone: "neutral",
    },
    {
      key: "requests",
      label: "Unterlagen angefordert",
      hint: "Beim Mandanten offen",
      count: cockpit.openDocumentRequests.length,
      capped: cockpit.isCapped("document_request"),
      href: "/dashboard/document-requests",
      icon: ATTENTION_ICONS.request,
      tone: "neutral",
    },
    {
      key: "invoices",
      label: "Offene Rechnungen",
      hint: "Entwürfe und unbezahlte Rechnungen",
      count: cockpit.openInvoices.length,
      capped: cockpit.isCapped("invoice"),
      href: "/dashboard/invoicing",
      icon: ATTENTION_ICONS.invoice,
      tone: "neutral",
    },
    {
      key: "trust",
      label: "Treuhand-Abgleich fällig",
      hint: "Quartalsabgleich nach RAO",
      count: cockpit.overdueReconciliations.length,
      href: "/dashboard/trust-accounting",
      icon: ATTENTION_ICONS.trust,
      tone: "danger",
    },
  ];

  const activeMatters = useMemo(
    () => sortByRecent(cockpit.activeCases).slice(0, 6),
    [cockpit.activeCases]
  );

  return (
    <div className="space-y-6">
      {appointments.isError && !deadlinesIncomplete && (
        <div
          role="status"
          className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-2 text-xs text-[color:var(--ds-warning-text)]"
        >
          Kalendertermine konnten nicht geladen werden — Verhandlungen und Besprechungen bitte im
          Kalender prüfen.
        </div>
      )}
      {(deadlinesIncomplete || cockpit.degraded) && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3"
        >
          <AlertTriangle
            size={17}
            className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[color:var(--ds-warning-text)]">
              {deadlinesIncomplete
                ? "Fristen konnten nicht vollständig geladen werden"
                : "Übersicht unvollständig"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              {deadlinesIncomplete
                ? "Zahlen und Agenda können Fristen auslassen. Bitte im Fristenbuch prüfen oder die Seite neu laden."
                : "Einzelne Bereiche konnten nicht geladen werden; die angezeigten Zahlen können zu niedrig sein."}
            </p>
          </div>
        </div>
      )}
      <OverviewKpis items={kpis} loading={loading} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <OverviewSection
            id="overview-agenda"
            title="Fristen & Termine"
            description={`Überfälliges und die nächsten ${AGENDA_WINDOW_DAYS} Tage, nach Tagen geordnet`}
            href="/dashboard/fristenbuch"
            hrefLabel="Fristenbuch"
          >
            <DeadlineAgenda agenda={agenda} loading={loading} windowDays={AGENDA_WINDOW_DAYS} />
          </OverviewSection>

          <OverviewSection
            id="overview-matters"
            title="Aktive Akten"
            description="Zuletzt bearbeitet, mit nächster Frist"
            href="/dashboard/cases"
            hrefLabel="Alle Akten"
          >
            <ActiveMatters
              matters={activeMatters}
              nextDeadlineBySlug={nextDeadlineBySlug}
              loading={loading}
            />
          </OverviewSection>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <OverviewSection id="overview-attention" title="Zu erledigen">
            <AttentionList items={attention} loading={loading} />
          </OverviewSection>

          <MorningBriefing compact />

          <OverviewSection id="overview-quick" title="Schnellzugriff">
            <QuickLinks role={role} />
          </OverviewSection>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [dashboardView, setDashboardView] = useState<"today" | "dashboard">("today");
  const statsQuery = useBrainStats();
  const meQuery = useMe();
  const { t, lang } = useLang();
  const [hour, setHour] = useState<number | null>(null);
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    const now = new Date();
    setHour(now.getHours());
    setDateStr(
      now.toLocaleDateString(lang === "en" ? "en-GB" : "de-AT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    );
  }, [lang]);

  const stats = (statsQuery.data ?? null) as BrainStats | null;
  const isFirstTime =
    !statsQuery.isLoading &&
    !statsQuery.isError &&
    (stats?.total_pages ?? 0) === 0 &&
    (stats?.total_queries ?? 0) === 0;

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("subsumio:dashboard-view");
    } catch {}
    if (stored === "today" || stored === "dashboard") setDashboardView(stored);
  }, []);

  const selectDashboardView = (view: "today" | "dashboard") => {
    setDashboardView(view);
    try {
      localStorage.setItem("subsumio:dashboard-view", view);
    } catch {}
  };

  // APG tabs with automatic activation: Arrow keys / Home / End move focus
  // and activate the tab (the view switch is local state).
  const handleDashboardViewTabKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    view: "today" | "dashboard"
  ) => {
    const order = ["today", "dashboard"] as const;
    const idx = order.indexOf(view);
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % order.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + order.length) % order.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = order.length - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    const next = order[nextIdx];
    selectDashboardView(next);
    document.getElementById(`dashboard-view-tab-${next}`)?.focus();
  };

  const user = meQuery.data?.user;
  const formal = formalNameOf(user?.name ?? null);
  const greeting = hour === null ? "" : greetingFor(hour, lang);
  const role = user?.role;

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p
            className="text-xs font-medium text-[color:var(--ds-text-subtle)]"
            suppressHydrationWarning
          >
            {dateStr || "\u00a0"}
          </p>
          <h1 className="font-display mt-1 text-[1.5rem] leading-tight font-semibold tracking-[-0.01em] text-[color:var(--ds-text)] md:text-2xl">
            {greeting ? (formal ? `${greeting}, ${formal}` : greeting) : "Übersicht"}
          </h1>
        </div>
        <div
          className="flex w-fit shrink-0 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-0.5"
          role="tablist"
          aria-label={t("today.view_selector")}
        >
          {(["today", "dashboard"] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              id={`dashboard-view-tab-${view}`}
              aria-selected={dashboardView === view}
              aria-controls={`dashboard-view-panel-${view}`}
              tabIndex={dashboardView === view ? 0 : -1}
              onClick={() => selectDashboardView(view)}
              onKeyDown={(e) => handleDashboardViewTabKeyDown(e, view)}
              className={
                dashboardView === view
                  ? "rounded-md bg-[color:var(--ds-surface-2)] px-3 py-1.5 text-sm font-medium text-[color:var(--ds-text)] shadow-[var(--ds-shadow-1)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
                  : "rounded-md px-3 py-1.5 text-sm text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
              }
            >
              {view === "today" ? "Mein Tag" : "Kanzlei"}
            </button>
          ))}
        </div>
      </header>

      {isFirstTime && (
        <section className="rounded-xl border border-[color:var(--brand-primary)]/20 bg-[color:var(--brand-glow)] p-4 md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                {t("dashboard.welcome")}
              </h2>
              <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[color:var(--ds-text-muted)]">
                {t("dashboard.welcome_desc")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                data-tour="quick-create"
                onClick={() => window.dispatchEvent(new CustomEvent("subsumio:quick-create"))}
              >
                <Briefcase size={14} /> {t("cockpit.action_case")}
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/dashboard/import-kanzlei">
                  <Upload size={14} /> {t("dashboard.welcome_upload")}
                </Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      <SecretaryGateWarning />

      <div
        role="tabpanel"
        id="dashboard-view-panel-today"
        aria-labelledby="dashboard-view-tab-today"
        hidden={dashboardView !== "today"}
      >
        {dashboardView === "today" && <MyDay role={role} />}
      </div>
      <div
        role="tabpanel"
        id="dashboard-view-panel-dashboard"
        aria-labelledby="dashboard-view-tab-dashboard"
        hidden={dashboardView !== "dashboard"}
      >
        {dashboardView === "dashboard" && <WidgetBoard />}
      </div>
    </div>
  );
}
