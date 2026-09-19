"use client";

/**
 * MatterHeader — sticky header bar shown above all matter sub-pages.
 * Displays case title, status badge, priority, and key vitals at-a-glance.
 * Includes back-to-cases navigation and matter actions (pin, portal, archive).
 */

import Link from "next/link";
import {
  ArrowLeft,
  Pin,
  PinOff,
  Globe,
  Archive,
  AlertCircle,
  Scale,
  User,
  Building2,
  CalendarClock,
  CheckSquare,
  FolderOpen,
  Clock,
  Receipt,
  Upload,
  Plus,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import { useMatterData, type MatterVitals } from "@/lib/matter-data-context";
import { useRecentMatters } from "@/lib/use-recent-matters";
import { useLang } from "@/lib/use-lang";
import { Skeleton } from "@/components/ui/skeleton";
import { statusBadgeClasses, type StatusColor } from "@/lib/status-colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, daysUntil, formatDate, formatDaysUntil, formatEur } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PRIORITY_COLORS: Record<string, StatusColor> = {
  low: "gray",
  medium: "blue",
  high: "amber",
  urgent: "red",
  critical: "red",
};

const STATUS_COLORS: Record<string, StatusColor> = {
  open: "blue",
  pending: "amber",
  settled: "emerald",
  won: "emerald",
  lost: "red",
  appealed: "violet",
  dormant: "gray",
  archived: "gray",
};

/** Only priorities that deserve attention get a badge; "Mittel" on every matter is noise. */
const PRIORITY_FLAGGED = new Set(["high", "urgent", "critical"]);

const PRIORITY_LABELS_DE: Record<string, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  urgent: "Dringend",
  critical: "Kritisch",
};

const PRIORITY_LABELS_EN: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
  critical: "Critical",
};

const STATUS_LABELS_DE: Record<string, string> = {
  open: "Offen",
  pending: "Anhängig",
  settled: "Erledigt",
  won: "Gewonnen",
  lost: "Verloren",
  appealed: "Berufung",
  dormant: "Ruhend",
  archived: "Archiviert",
};

const STATUS_LABELS_EN: Record<string, string> = {
  open: "Open",
  pending: "Pending",
  settled: "Settled",
  won: "Won",
  lost: "Lost",
  appealed: "Appealed",
  dormant: "Dormant",
  archived: "Archived",
};

const ACTIONS = [
  { event: "subsumio:upload-document", icon: Upload, labelDe: "Dokument", labelEn: "Document" },
  { event: "subsumio:create-deadline", icon: CalendarClock, labelDe: "Frist", labelEn: "Deadline" },
  { event: "subsumio:create-task", icon: CheckSquare, labelDe: "Aufgabe", labelEn: "Task" },
  { event: "subsumio:log-time", icon: Clock, labelDe: "Zeit", labelEn: "Time" },
] as const;

// ── Vitals Bar ────────────────────────────────────────────────────────

function VitalsBar({
  vitals,
  caseSlug,
  lang,
}: {
  vitals: MatterVitals;
  caseSlug: string;
  lang: string;
}) {
  const en = lang === "en";
  const encoded = caseSlug.split("/").map(encodeURIComponent).join("/");
  const items = [
    {
      icon: CalendarClock,
      label: en ? "Open deadlines" : "Offene Fristen",
      value: String(vitals.openDeadlineCount),
      href: `/dashboard/cases/${encoded}/deadlines`,
    },
    {
      icon: CheckSquare,
      label: en ? "Open tasks" : "Offene Aufgaben",
      value: String(vitals.openTaskCount),
      href: `/dashboard/cases/${encoded}/deadlines`,
    },
    {
      icon: FolderOpen,
      label: en ? "Documents" : "Dokumente",
      value: String(vitals.documentCount),
      href: `/dashboard/cases/${encoded}/documents`,
    },
    {
      icon: Clock,
      label: en ? "Hours" : "Stunden",
      value:
        vitals.totalHours > 0
          ? vitals.totalHours.toLocaleString(en ? "en-GB" : "de-AT", {
              maximumFractionDigits: 2,
            })
          : "—",
      href: `/dashboard/cases/${encoded}/billing`,
    },
    {
      icon: Receipt,
      label: en ? "Expenses" : "Auslagen",
      value: vitals.expenseTotal > 0 ? formatEur(vitals.expenseTotal, lang) : "—",
      href: `/dashboard/cases/${encoded}/billing`,
    },
  ];

  const days = vitals.nextDeadlineDate ? daysUntil(vitals.nextDeadlineDate) : null;
  const tone =
    days === null
      ? ""
      : days <= 3
        ? "border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
        : days <= 7
          ? "border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]"
          : "border-[color:var(--ds-border)] text-[color:var(--ds-text)]";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[color:var(--ds-border)] px-4 py-2 md:px-6">
      {vitals.nextDeadlineDate && days !== null && (
        <Link
          href={`/dashboard/cases/${encoded}/deadlines`}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs tabular-nums focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none",
            tone
          )}
        >
          <CalendarClock size={12} className="shrink-0" aria-hidden="true" />
          <span>{en ? "Next deadline" : "Nächste Frist"}</span>
          <span className="font-semibold">{formatDate(vitals.nextDeadlineDate)}</span>
          <span>· {formatDaysUntil(days)}</span>
        </Link>
      )}
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs whitespace-nowrap transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
          >
            <Icon
              size={12}
              className="shrink-0 text-[color:var(--ds-text-subtle)]"
              aria-hidden="true"
            />
            <span className="text-[color:var(--ds-text-muted)]">{item.label}</span>
            <span className="font-semibold text-[color:var(--ds-text)] tabular-nums">
              {item.value}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ── Phase Progress ─────────────────────────────────────────────────────

interface PhaseDef {
  key: string;
  labelDe: string;
  labelEn: string;
}

const MATTER_PHASES: PhaseDef[] = [
  { key: "intake", labelDe: "Mandatsaufnahme", labelEn: "Intake" },
  { key: "evaluation", labelDe: "Prüfung", labelEn: "Evaluation" },
  { key: "investigation", labelDe: "Ermittlung", labelEn: "Investigation" },
  { key: "negotiation", labelDe: "Außergerichtlich", labelEn: "Negotiation" },
  { key: "litigation", labelDe: "Verfahren", labelEn: "Litigation" },
  { key: "trial", labelDe: "Verhandlung", labelEn: "Trial" },
  { key: "settlement", labelDe: "Vergleich", labelEn: "Settlement" },
  { key: "closed", labelDe: "Abgeschlossen", labelEn: "Closed" },
];

function resolvePhaseIndex(phase: string | undefined): number {
  if (!phase) return -1;
  const normalized = phase.toLowerCase().trim();
  // Exact key match first
  const exact = MATTER_PHASES.findIndex((p) => p.key === normalized);
  if (exact !== -1) return exact;
  // Partial key match (phase contains key or vice versa)
  const partial = MATTER_PHASES.findIndex(
    (p) => normalized.includes(p.key) || p.key.includes(normalized)
  );
  return partial;
}

function PhaseProgress({ phase, lang }: { phase?: string; lang: string }) {
  const { t } = useLang();
  const currentIdx = resolvePhaseIndex(phase);
  if (currentIdx === -1) return null;

  return (
    <div className="flex items-center gap-1.5 border-t border-[color:var(--ds-border)] px-4 py-1.5 md:px-6">
      <span className="text-xs font-medium text-[color:var(--ds-text-subtle)]">
        {t("matterheader.phase")}
      </span>
      <div className="flex items-center gap-0.5">
        {MATTER_PHASES.map((p, idx) => {
          const isCurrent = idx === currentIdx;
          const isPast = idx < currentIdx;
          const label = lang === "en" ? p.labelEn : p.labelDe;
          return (
            <div key={p.key} className="flex items-center gap-0.5">
              {idx > 0 && (
                <div
                  className={cn(
                    "h-0.5 w-3 rounded-full",
                    idx <= currentIdx
                      ? "bg-[color:var(--brand-solid)]"
                      : "bg-[color:var(--ds-border)]"
                  )}
                />
              )}
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
                  isCurrent
                    ? "brand-soft brand-text"
                    : isPast
                      ? "text-[color:var(--ds-text-muted)]"
                      : "text-[color:var(--ds-text-subtle)]"
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export function MatterHeader() {
  const { matter, loading, error } = useMatterData();
  const { t, lang } = useLang();
  const { togglePin, isPinned } = useRecentMatters();

  if (loading) {
    return (
      <div
        className="sticky top-0 z-30 flex items-center gap-3 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 md:px-6"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">{t("matterheader.loading")}</span>
        <Skeleton className="h-5 w-64 max-w-[60%]" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  if (error || !matter) {
    // Engine error strings are codes ("not_found not found"), not lawyer copy.
    const errorCopy =
      error && !/not[_ ]found/i.test(error)
        ? t("matterheader.load_failed")
        : t("matterheader.not_found");
    return (
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 md:px-6">
        <AlertCircle size={18} className="text-[color:var(--ds-danger-text)]" />
        <span className="text-sm text-[color:var(--ds-danger-text)]">{errorCopy}</span>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/cases" className="ml-auto">
            <ArrowLeft size={14} className="mr-1.5" />
            {t("matterheader.back_to_cases")}
          </Link>
        </Button>
      </div>
    );
  }

  const pinned = isPinned(matter.slug);
  const isArchived = !!matter.archivedAt;
  const statusLabels = lang === "en" ? STATUS_LABELS_EN : STATUS_LABELS_DE;
  const priorityLabels = lang === "en" ? PRIORITY_LABELS_EN : PRIORITY_LABELS_DE;
  const en = lang === "en";

  return (
    <div className="sticky top-0 z-30 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
      {/* Row 1: Title + Actions */}
      <div className="flex items-start gap-3 px-4 py-3 md:px-6">
        <Link
          href="/dashboard/cases"
          className="mt-0.5 shrink-0 rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
          aria-label={t("matterheader.back_to_cases")}
        >
          <ArrowLeft size={18} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
            <h1 className="font-display line-clamp-2 text-base font-semibold text-[color:var(--ds-text)] sm:truncate md:text-lg">
              {matter.title}
            </h1>
            <span className="shrink-0 font-mono text-xs text-[color:var(--ds-text-muted)] tabular-nums">
              {matter.caseNumber}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--ds-text-muted)]">
            {/* Status/priority only when they say something beyond the default */}
            {matter.status !== "open" && (
              <Badge
                variant="default"
                className={cn(
                  "text-xs",
                  statusBadgeClasses(STATUS_COLORS[matter.status] || "gray")
                )}
              >
                {statusLabels[matter.status] || matter.status}
              </Badge>
            )}
            {PRIORITY_FLAGGED.has(matter.priority) && (
              <Badge
                variant="default"
                className={cn(
                  "text-xs",
                  statusBadgeClasses(PRIORITY_COLORS[matter.priority] || "amber")
                )}
              >
                {priorityLabels[matter.priority] || matter.priority}
              </Badge>
            )}
            {(matter.clientName || matter.opponentName) && (
              <span className="flex min-w-0 items-center gap-1">
                <User size={11} className="shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {matter.clientName || (en ? "Client missing" : "Mandant fehlt")}
                  {matter.opponentName ? (
                    <>
                      <span className="text-[color:var(--ds-text-subtle)]"> ./. </span>
                      {matter.opponentName}
                    </>
                  ) : null}
                </span>
              </span>
            )}
            {matter.courtName && (
              <span className="flex items-center gap-1">
                <Building2 size={11} className="shrink-0" aria-hidden="true" />
                {matter.courtName}
              </span>
            )}
            {matter.legalArea && (
              <span className="flex items-center gap-1">
                <Scale size={11} className="shrink-0" aria-hidden="true" />
                {matter.legalArea}
                {matter.jurisdiction && matter.jurisdiction !== "at" ? (
                  <span className="text-[color:var(--ds-text-subtle)]">
                    · {matter.jurisdiction.toUpperCase()}
                  </span>
                ) : null}
              </span>
            )}
            {matter.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="default"
                className="border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-xs text-[color:var(--ds-text-muted)]"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Actions: one "Hinzufügen" menu instead of four buttons, plus pin/portal */}
        <div className="flex shrink-0 items-center gap-1">
          {!isArchived && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 gap-1.5 whitespace-nowrap"
                  aria-label={en ? "Add to this matter" : "Zu dieser Akte hinzufügen"}
                >
                  <Plus size={14} aria-hidden="true" />
                  <span className="hidden sm:inline">{en ? "Add" : "Hinzufügen"}</span>
                  <ChevronDown size={12} aria-hidden="true" className="hidden sm:inline" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {ACTIONS.map(({ event, icon: Icon, labelDe, labelEn }) => (
                  <DropdownMenuItem
                    key={event}
                    onSelect={() =>
                      window.dispatchEvent(
                        new CustomEvent(event, { detail: { caseSlug: matter.slug } })
                      )
                    }
                  >
                    <Icon size={14} aria-hidden="true" />
                    {en ? labelEn : labelDe}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => togglePin(matter.slug)}
            title={pinned ? t("matterheader.unpin") : t("matterheader.pin")}
            aria-label={pinned ? t("matterheader.unpin") : t("matterheader.pin")}
            aria-pressed={pinned}
            className="h-8 w-8 p-0"
          >
            {pinned ? <PinOff size={15} /> : <Pin size={15} />}
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
            <Link
              href={`/dashboard/matter-access?case=${encodeURIComponent(matter.slug)}`}
              title={en ? "Access & sharing" : "Zugriff & Freigaben"}
              aria-label={en ? "Access & sharing" : "Zugriff & Freigaben"}
            >
              <ShieldCheck size={15} />
            </Link>
          </Button>
          {matter.portalEnabled && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
              <Link
                href={`/dashboard/client-portal`}
                title={t("matterheader.client_portal")}
                aria-label={t("matterheader.client_portal")}
              >
                <Globe size={15} />
              </Link>
            </Button>
          )}
          {isArchived && (
            <Badge
              variant="default"
              className="border-[color:var(--ds-neutral-border)] bg-[color:var(--ds-neutral-bg)] text-xs text-[color:var(--ds-neutral-text)]"
            >
              <Archive size={11} className="mr-1" />
              {t("matterheader.archived")}
            </Badge>
          )}
        </div>
      </div>

      {/* Row 2: Vitals Bar — key counts at-a-glance */}
      {matter.vitals && <VitalsBar vitals={matter.vitals} caseSlug={matter.slug} lang={lang} />}

      {/* Row 3: Phase Progress */}
      <PhaseProgress phase={matter.phase} lang={lang} />
    </div>
  );
}
