"use client";

/**
 * Sections of the Übersicht ("Mein Tag"). One question per section:
 *   Kennzahlen  — how does my day look at a glance?
 *   Agenda      — which deadlines and hearings come next, day by day?
 *   Zu erledigen — what is waiting for me outside the calendar?
 *   Aktive Akten — where did I work last?
 * Nothing here repeats another section; every row links to the place where the
 * work is done.
 */

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  FilePlus,
  FileSignature,
  FileSearch,
  FileText,
  Gavel,
  Inbox,
  Landmark,
  Mail,
  Receipt,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate, formatDaysUntil, parseDateValue } from "@/lib/utils";
import { agendaDayLabel, type Agenda, type AgendaEntry } from "@/lib/overview-agenda";

function encodeSlug(slug: string) {
  return slug.split("/").map(encodeURIComponent).join("/");
}

/* ── Section frame ─────────────────────────────────────────────────── */

export function OverviewSection({
  title,
  description,
  href,
  hrefLabel,
  children,
  className,
  id,
}: {
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--ds-shadow-1)]",
        className
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-[color:var(--ds-border)] px-4 py-3 md:px-5">
        <div className="min-w-0">
          <h2 id={id} className="text-[15px] font-semibold text-[color:var(--ds-text)]">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{description}</p>
          )}
        </div>
        {href && hrefLabel && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-medium whitespace-nowrap text-[color:var(--brand-primary)] hover:underline focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none"
          >
            {hrefLabel}
            <ArrowRight size={12} aria-hidden="true" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

/* ── Kennzahlen ────────────────────────────────────────────────────── */

export interface OverviewKpi {
  label: string;
  value: number;
  hint: string;
  href: string;
  tone?: "neutral" | "danger" | "warning";
}

export function OverviewKpis({ items, loading }: { items: OverviewKpi[]; loading?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-border)] shadow-[var(--ds-shadow-1)] lg:grid-cols-4">
      {items.map((kpi) => {
        const alert = kpi.value > 0 && kpi.tone && kpi.tone !== "neutral";
        return (
          <Link
            key={kpi.label}
            href={kpi.href}
            className="group bg-[color:var(--ds-surface)] px-4 py-3.5 transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none focus-visible:ring-inset md:px-5"
          >
            <span className="block text-xs font-medium text-[color:var(--ds-text-muted)]">
              {kpi.label}
            </span>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-10" />
            ) : (
              <span
                className={cn(
                  "mt-1 block text-2xl font-semibold tabular-nums",
                  alert && kpi.tone === "danger" && "text-[color:var(--ds-danger-text)]",
                  alert && kpi.tone === "warning" && "text-[color:var(--ds-warning-text)]",
                  !alert && "text-[color:var(--ds-text)]"
                )}
              >
                {kpi.value}
              </span>
            )}
            <span className="mt-0.5 block truncate text-[11px] text-[color:var(--ds-text-subtle)]">
              {kpi.hint}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/* ── Agenda ────────────────────────────────────────────────────────── */

function AgendaRow({ entry, showDate = false }: { entry: AgendaEntry; showDate?: boolean }) {
  const overdue = entry.days < 0;
  const kindLabel =
    entry.kind === "vorfrist" ? "Vorfrist" : entry.kind === "hearing" ? "Termin" : "Frist";
  return (
    <li>
      <Link
        href={
          entry.caseSlug ? `/dashboard/cases/${encodeSlug(entry.caseSlug)}` : "/dashboard/deadlines"
        }
        className="group grid grid-cols-[3.25rem_1fr] items-start gap-x-3 gap-y-1 sm:grid-cols-[3.25rem_1fr_auto] px-4 py-2.5 transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none focus-visible:ring-inset md:px-5"
      >
        <span className="pt-0.5 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
          {showDate ? formatDate(entry.date).slice(0, 6) : (entry.time ?? kindLabel)}
        </span>
        <span className="min-w-0">
          <span
            className={cn(
              "block truncate text-sm font-medium text-[color:var(--ds-text)]",
              entry.kind === "vorfrist" && "text-[color:var(--ds-text-muted)]"
            )}
          >
            {entry.kind === "vorfrist" ? `Vorfrist · ${entry.title}` : entry.title}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[color:var(--ds-text-subtle)]">
            {entry.caseNumber ? (
              <>
                <span className="tabular-nums">{entry.caseNumber}</span>
                {entry.caseTitle ? ` · ${entry.caseTitle}` : ""}
              </>
            ) : (
              "Keiner Akte zugeordnet"
            )}
          </span>
        </span>
        <span className="col-start-2 flex flex-wrap items-center gap-2 empty:hidden sm:col-start-auto sm:justify-end sm:pt-0.5">
          <span className="flex items-center gap-1">
            {entry.notfrist && entry.kind !== "vorfrist" && (
              <Badge variant="danger">Notfrist</Badge>
            )}
            {entry.unreviewed && <Badge variant="warning">Ungeprüft</Badge>}
          </span>
          {showDate && (
            <span
              className={cn(
                "min-w-[4.75rem] text-right text-[11px] whitespace-nowrap tabular-nums",
                overdue
                  ? "font-medium text-[color:var(--ds-danger-text)]"
                  : "text-[color:var(--ds-text-subtle)]"
              )}
            >
              {formatDaysUntil(entry.days)}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

export function DeadlineAgenda({
  agenda,
  loading,
  windowDays,
}: {
  agenda: Agenda;
  loading?: boolean;
  windowDays: number;
}) {
  if (loading) {
    return (
      <div className="space-y-3 p-4 md:p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  const empty =
    agenda.overdue.length === 0 && agenda.days.length === 0 && agenda.later.length === 0;
  if (empty) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <CalendarClock size={20} className="text-[color:var(--ds-text-subtle)]" aria-hidden />
        <p className="text-sm font-medium text-[color:var(--ds-text)]">Keine offenen Fristen</p>
        <p className="max-w-sm text-xs text-[color:var(--ds-text-muted)]">
          Sobald Sie eine Frist anlegen oder ein Dokument mit Fristbezug hochladen, erscheint sie
          hier.
        </p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-[color:var(--ds-border)]">
      {agenda.overdue.length > 0 && (
        <div className="bg-[color:var(--ds-danger-bg)]/40">
          <h3 className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-[color:var(--ds-danger-text)] uppercase md:px-5">
            <AlertTriangle size={12} aria-hidden />
            Überfällig
          </h3>
          <ul>
            {agenda.overdue.map((e) => (
              <AgendaRow key={e.key} entry={e} showDate />
            ))}
          </ul>
        </div>
      )}
      {agenda.days.map((day) => (
        <div key={day.iso}>
          <h3 className="flex items-baseline justify-between px-4 pt-3 pb-1 md:px-5">
            <span
              className={cn(
                "text-[11px] font-semibold tracking-wide uppercase",
                day.days <= 1
                  ? "text-[color:var(--brand-primary)]"
                  : "text-[color:var(--ds-text-muted)]"
              )}
            >
              {agendaDayLabel(day)}
            </span>
            <span className="text-[11px] text-[color:var(--ds-text-subtle)] tabular-nums">
              {day.days > 1 ? formatDaysUntil(day.days) : formatDate(day.date)}
            </span>
          </h3>
          <ul>
            {day.entries.map((e) => (
              <AgendaRow key={e.key} entry={e} />
            ))}
          </ul>
        </div>
      ))}
      {agenda.later.length > 0 && (
        <div>
          <h3 className="flex items-baseline justify-between px-4 pt-3 pb-1 md:px-5">
            <span className="text-[11px] font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase">
              {agenda.days.length === 0 && agenda.overdue.length === 0
                ? `In den nächsten ${windowDays} Tagen nichts fällig — danach`
                : "Danach"}
            </span>
          </h3>
          <ul>
            {agenda.later.map((e) => (
              <AgendaRow key={e.key} entry={e} showDate />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Zu erledigen ──────────────────────────────────────────────────── */

export interface AttentionItem {
  key: string;
  label: string;
  hint: string;
  count: number;
  href: string;
  icon: LucideIcon;
  tone: "danger" | "warning" | "neutral";
}

export const ATTENTION_ICONS = {
  inbox: Inbox,
  mail: Mail,
  review: ShieldCheck,
  signature: FileSignature,
  document: FileSearch,
  invoice: Receipt,
  trust: Landmark,
  request: FileText,
} satisfies Record<string, LucideIcon>;

export function AttentionList({ items, loading }: { items: AttentionItem[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  const open = items.filter((i) => i.count > 0);
  if (open.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-[color:var(--ds-text-muted)] md:px-5">
        Nichts offen — Eingänge, Freigaben und Dokumente sind erledigt.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-[color:var(--ds-border)]">
      {open.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.key}>
            <Link
              href={item.href}
              className="group flex items-center gap-3 px-4 py-2.5 transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none focus-visible:ring-inset md:px-5"
            >
              <Icon
                size={15}
                aria-hidden
                className={cn(
                  "shrink-0",
                  item.tone === "danger"
                    ? "text-[color:var(--ds-danger-text)]"
                    : item.tone === "warning"
                      ? "text-[color:var(--ds-warning-text)]"
                      : "text-[color:var(--ds-text-muted)]"
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-[color:var(--ds-text)]">
                  {item.label}
                </span>
                <span className="block truncate text-[11px] text-[color:var(--ds-text-subtle)]">
                  {item.hint}
                </span>
              </span>
              <span className="min-w-6 rounded-md bg-[color:var(--ds-surface-2)] px-1.5 py-0.5 text-center text-xs font-semibold text-[color:var(--ds-text)] tabular-nums">
                {item.count}
              </span>
              <ChevronRight
                size={14}
                aria-hidden
                className="shrink-0 text-[color:var(--ds-text-subtle)] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Aktive Akten ──────────────────────────────────────────────────── */

export interface ActiveMatter {
  slug: string;
  title?: string;
  updated_at?: string;
  frontmatter?: Record<string, unknown>;
}

export function ActiveMatters({
  matters,
  nextDeadlineBySlug,
  loading,
}: {
  matters: ActiveMatter[];
  nextDeadlineBySlug: Map<string, AgendaEntry>;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (matters.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
        <Briefcase size={20} className="text-[color:var(--ds-text-subtle)]" aria-hidden />
        <p className="text-sm text-[color:var(--ds-text-muted)]">Noch keine offene Akte.</p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("subsumio:create-case"))}
          className="text-xs font-medium text-[color:var(--brand-primary)] hover:underline"
        >
          Akte anlegen
        </button>
      </div>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead className="sr-only">
        <tr>
          <th>Aktenzeichen</th>
          <th>Akte</th>
          <th>Nächste Frist</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[color:var(--ds-border)]">
        {matters.map((m) => {
          const fm = m.frontmatter ?? {};
          const next = nextDeadlineBySlug.get(m.slug);
          const area = typeof fm.legal_area === "string" ? fm.legal_area : null;
          const client = typeof fm.client_name === "string" ? fm.client_name : null;
          return (
            <tr
              key={m.slug}
              className="group relative transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)]"
            >
              <td className="w-28 py-2.5 pr-2 pl-4 align-top text-xs whitespace-nowrap text-[color:var(--ds-text-muted)] tabular-nums md:pl-5">
                {typeof fm.case_number === "string" ? fm.case_number : "—"}
              </td>
              <td className="max-w-0 py-2.5 pr-3 align-top">
                <Link
                  href={`/dashboard/cases/${encodeSlug(m.slug)}`}
                  className="block truncate font-medium text-[color:var(--ds-text)] after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[color:var(--ds-ring)] focus-visible:after:ring-inset"
                >
                  {m.title || m.slug.split("/").pop()}
                </Link>
                <span className="block truncate text-xs text-[color:var(--ds-text-subtle)]">
                  {[client, area].filter(Boolean).join(" · ") || "—"}
                </span>
              </td>
              <td className="hidden w-44 py-2.5 pr-4 text-right align-top sm:table-cell md:pr-5">
                {next ? (
                  <>
                    <span className="block text-xs text-[color:var(--ds-text)] tabular-nums">
                      {formatDate(next.date)}
                    </span>
                    <span
                      className={cn(
                        "block text-[11px] tabular-nums",
                        next.days < 0
                          ? "text-[color:var(--ds-danger-text)]"
                          : next.days <= 3
                            ? "text-[color:var(--ds-warning-text)]"
                            : "text-[color:var(--ds-text-subtle)]"
                      )}
                    >
                      {formatDaysUntil(next.days)}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-[color:var(--ds-text-subtle)]">Keine Frist</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Schnellzugriff ────────────────────────────────────────────────── */

export function QuickLinks({ role }: { role?: string }) {
  const r = role ?? "lawyer";
  const items: Array<{
    label: string;
    icon: LucideIcon;
    event?: string;
    href?: string;
    roles?: string[];
  }> = [
    { label: "Frist anlegen", icon: CalendarPlus, event: "subsumio:create-deadline" },
    { label: "Akte anlegen", icon: Briefcase, event: "subsumio:create-case" },
    { label: "Dokument hochladen", icon: Upload, href: "/dashboard/upload" },
    {
      label: "Mandatsannahme",
      icon: FilePlus,
      href: "/dashboard/intake?new=1",
      roles: ["admin", "lawyer"],
    },
    {
      label: "Schriftsatz entwerfen",
      icon: FileText,
      href: "/dashboard/drafting",
      roles: ["admin", "lawyer"],
    },
    {
      label: "Rechtsrecherche",
      icon: Gavel,
      href: "/dashboard/research",
      roles: ["admin", "lawyer"],
    },
  ];
  const cls =
    "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-ring)] focus-visible:outline-none";
  return (
    <ul className="grid grid-cols-2 gap-0.5 p-2 lg:grid-cols-1">
      {items
        .filter((i) => !i.roles || i.roles.includes(r))
        .map(({ label, icon: Icon, event, href }) => (
          <li key={label}>
            {href ? (
              <Link href={href} className={cls}>
                <Icon size={15} aria-hidden className="shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            ) : (
              <button
                type="button"
                className={cls}
                onClick={() => window.dispatchEvent(new CustomEvent(event!))}
              >
                <Icon size={15} aria-hidden className="shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            )}
          </li>
        ))}
    </ul>
  );
}

/** Most recently touched open matters first. */
export function sortByRecent<T extends { updated_at?: string }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      (parseDateValue(b.updated_at)?.getTime() ?? 0) -
      (parseDateValue(a.updated_at)?.getTime() ?? 0)
  );
}
