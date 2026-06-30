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
  Loader2,
  AlertCircle,
  Scale,
  User,
  Building2,
  FileText,
  CalendarClock,
  CheckSquare,
  FolderOpen,
  Clock,
  Receipt,
} from "lucide-react";
import { useMatterData, type MatterVitals } from "@/lib/matter-data-context";
import { useRecentMatters } from "@/lib/use-recent-matters";
import { useLang } from "@/lib/use-lang";
import { statusBadgeClasses, type StatusColor } from "@/lib/status-colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRIORITY_COLORS: Record<string, StatusColor> = {
  low: "gray",
  medium: "blue",
  high: "amber",
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

const PRIORITY_LABELS_DE: Record<string, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
};

const PRIORITY_LABELS_EN: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
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
  const encoded = caseSlug.split("/").map(encodeURIComponent).join("/");
  const items = [
    {
      icon: CalendarClock,
      label: lang === "en" ? "Deadlines" : "Fristen",
      value: `${vitals.openDeadlineCount}/${vitals.deadlineCount}`,
      alert: vitals.openDeadlineCount > 0,
      href: `/dashboard/cases/${encoded}/deadlines`,
    },
    {
      icon: CheckSquare,
      label: lang === "en" ? "Tasks" : "Aufgaben",
      value: `${vitals.openTaskCount}/${vitals.taskCount}`,
      alert: vitals.openTaskCount > 0,
      href: `/dashboard/cases/${encoded}/deadlines`,
    },
    {
      icon: FolderOpen,
      label: lang === "en" ? "Docs" : "Doku",
      value: String(vitals.documentCount),
      alert: false,
      href: `/dashboard/cases/${encoded}/documents`,
    },
    {
      icon: Clock,
      label: lang === "en" ? "Hours" : "Std",
      value: vitals.totalHours > 0 ? vitals.totalHours.toFixed(1) : "—",
      alert: false,
      href: `/dashboard/cases/${encoded}/billing`,
    },
    {
      icon: Receipt,
      label: lang === "en" ? "Expenses" : "Auslagen",
      value: vitals.expenseTotal > 0 ? `${vitals.expenseTotal.toFixed(0)}€` : "—",
      alert: false,
      href: `/dashboard/cases/${encoded}/billing`,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[color:var(--ds-border)] px-4 py-2 md:px-6">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-[color:var(--ds-hover)]"
          >
            <Icon
              size={12}
              className={cn(
                "shrink-0",
                item.alert
                  ? "text-[color:var(--ds-warning-text)]"
                  : "text-[color:var(--ds-text-muted)]"
              )}
            />
            <span className="text-[color:var(--ds-text-muted)]">{item.label}:</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                item.alert ? "text-[color:var(--ds-warning-text)]" : "text-[color:var(--ds-text)]"
              )}
            >
              {item.value}
            </span>
          </Link>
        );
      })}
      {vitals.nextDeadlineDate && (
        <div className="flex items-center gap-1.5 rounded-md bg-[color:var(--ds-warning-bg)] px-2 py-0.5 text-xs">
          <CalendarClock size={12} className="shrink-0 text-[color:var(--ds-warning-text)]" />
          <span className="font-medium text-[color:var(--ds-warning-text)]">
            {lang === "en" ? "Next:" : "Nächste:"} {formatDate(vitals.nextDeadlineDate, lang)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string, lang: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ── Phase Progress ─────────────────────────────────────────────────────

interface PhaseDef {
  key: string;
  labelDe: string;
  labelEn: string;
}

const MATTER_PHASES: PhaseDef[] = [
  { key: "intake", labelDe: "Intake", labelEn: "Intake" },
  { key: "evaluation", labelDe: "Prüfung", labelEn: "Evaluation" },
  { key: "investigation", labelDe: "Ermittlung", labelEn: "Investigation" },
  { key: "negotiation", labelDe: "Verhandlung", labelEn: "Negotiation" },
  { key: "litigation", labelDe: "Prozess", labelEn: "Litigation" },
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
  const currentIdx = resolvePhaseIndex(phase);
  if (currentIdx === -1) return null;

  return (
    <div className="flex items-center gap-1.5 border-t border-[color:var(--ds-border)] px-4 py-1.5 md:px-6">
      <span className="text-[11px] font-medium text-[color:var(--ds-text-subtle)]">
        {lang === "en" ? "Phase:" : "Phase:"}
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
                      ? "bg-[color:var(--brand-primary)]"
                      : "bg-[color:var(--ds-border)]"
                  )}
                />
              )}
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
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
  const { lang } = useLang();
  const { togglePin, isPinned } = useRecentMatters();

  if (loading) {
    return (
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 md:px-6">
        <Loader2 size={18} className="animate-spin text-[color:var(--ds-text-muted)]" />
        <span className="text-sm text-[color:var(--ds-text-muted)]">
          {lang === "en" ? "Loading matter…" : "Lade Akte…"}
        </span>
      </div>
    );
  }

  if (error || !matter) {
    return (
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 md:px-6">
        <AlertCircle size={18} className="text-red-500" />
        <span className="text-sm text-red-600">
          {error || (lang === "en" ? "Matter not found" : "Akte nicht gefunden")}
        </span>
        <Link href="/dashboard/cases" className="ml-auto">
          <Button variant="ghost" size="sm">
            <ArrowLeft size={14} className="mr-1.5" />
            {lang === "en" ? "Back to Cases" : "Zurück zu Akten"}
          </Button>
        </Link>
      </div>
    );
  }

  const pinned = isPinned(matter.slug);
  const isArchived = !!matter.archivedAt;
  const statusLabels = lang === "en" ? STATUS_LABELS_EN : STATUS_LABELS_DE;
  const priorityLabels = lang === "en" ? PRIORITY_LABELS_EN : PRIORITY_LABELS_DE;

  return (
    <div className="sticky top-0 z-30 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
      {/* Row 1: Title + Actions */}
      <div className="flex items-start gap-3 px-4 py-3 md:px-6">
        <Link
          href="/dashboard/cases"
          className="mt-0.5 shrink-0 rounded-lg p-1.5 text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
          aria-label={lang === "en" ? "Back to Cases" : "Zurück zu Akten"}
        >
          <ArrowLeft size={18} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold text-[color:var(--ds-text)] md:text-lg">
              {matter.title}
            </h1>
            <span className="shrink-0 font-mono text-xs text-[color:var(--ds-text-muted)]">
              {matter.caseNumber}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge
              variant="default"
              className={cn("text-xs", statusBadgeClasses(STATUS_COLORS[matter.status] || "blue"))}
            >
              {statusLabels[matter.status] || matter.status}
            </Badge>
            <Badge
              variant="default"
              className={cn(
                "text-xs",
                statusBadgeClasses(PRIORITY_COLORS[matter.priority] || "blue")
              )}
            >
              {priorityLabels[matter.priority] || matter.priority}
            </Badge>
            {matter.clientName && (
              <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                <User size={11} className="shrink-0" />
                {matter.clientName}
              </span>
            )}
            {matter.opponentName && (
              <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                <Scale size={11} className="shrink-0" />
                {matter.opponentName}
              </span>
            )}
            {matter.courtName && (
              <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                <Building2 size={11} className="shrink-0" />
                {matter.courtName}
              </span>
            )}
            {matter.legalArea && (
              <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                <FileText size={11} className="shrink-0" />
                {matter.legalArea}
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

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => togglePin(matter.slug)}
            title={
              pinned ? (lang === "en" ? "Unpin" : "Loslösen") : lang === "en" ? "Pin" : "Anheften"
            }
            className="h-8 w-8 p-0"
          >
            {pinned ? <PinOff size={15} /> : <Pin size={15} />}
          </Button>
          {matter.portalEnabled && (
            <Link
              href={`/dashboard/client-portal`}
              title={lang === "en" ? "Client Portal" : "Mandantenportal"}
            >
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Globe size={15} />
              </Button>
            </Link>
          )}
          {isArchived && (
            <Badge
              variant="default"
              className="border-gray-500/20 bg-gray-500/10 text-xs text-gray-500"
            >
              <Archive size={11} className="mr-1" />
              {lang === "en" ? "Archived" : "Archiviert"}
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
