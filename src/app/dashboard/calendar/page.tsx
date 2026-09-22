"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PrimaryAction } from "@/components/dashboard/primary-action";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries/auth";
import { useFristen } from "@/lib/queries/legal";
import { useLang } from "@/lib/use-lang";
import { cn, daysUntil, encodeSlugPath, formatDate, formatDaysUntil } from "@/lib/utils";
import {
  describeCalendarConflict,
  findCalendarConflicts,
  toLocalIsoDate,
  type CalendarEntry,
} from "@/lib/calendar-conflicts";
import {
  CalendarEditDialog,
  appointmentToEntry,
  useAppointments,
  type Appointment,
} from "@/components/calendar/calendar-editor";

type ViewMode = "week" | "month";

/** Darstellungsart eines Kalendereintrags — bestimmt Farbe und Bezeichnung. */
type ItemKind = "frist" | "notfrist" | "hearing" | "appointment" | "task";

interface CalItem {
  id: string;
  title: string;
  /** `YYYY-MM-DD` (Ortszeit) */
  date: string;
  time?: string;
  durationMin?: number;
  kind: ItemKind;
  done?: boolean;
  caseTitle?: string;
  location?: string;
  href?: string;
  externalHref?: string;
  appointment?: Appointment;
  source: "fristen" | "kanzlei" | "outlook" | "akte";
}

const KIND_LABEL: Record<ItemKind, string> = {
  frist: "Frist",
  notfrist: "Notfrist",
  hearing: "Verhandlung",
  appointment: "Termin",
  task: "Aufgabe",
};

/** Farbcodierung ausschließlich über Status-Tokens. */
const KIND_STYLE: Record<ItemKind, { chip: string; dot: string }> = {
  frist: {
    chip: "border-l-[color:var(--ds-warning-solid)] bg-[color:var(--ds-warning-bg)] text-[color:var(--ds-warning-text)]",
    dot: "bg-[color:var(--ds-warning-solid)]",
  },
  notfrist: {
    chip: "border-l-[color:var(--ds-danger-solid)] bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] font-medium",
    dot: "bg-[color:var(--ds-danger-solid)]",
  },
  hearing: {
    chip: "border-l-[color:var(--ds-info-solid)] bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]",
    dot: "bg-[color:var(--ds-info-solid)]",
  },
  appointment: {
    chip: "border-l-[color:var(--ds-neutral-text)] bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-text)]",
    dot: "bg-[color:var(--ds-neutral-text)]",
  },
  task: {
    chip: "border-l-[color:var(--ds-border-strong)] bg-transparent text-[color:var(--ds-text-muted)] border border-dashed border-[color:var(--ds-border)]",
    dot: "bg-[color:var(--ds-border-strong)]",
  },
};

const KIND_ORDER: Record<ItemKind, number> = {
  notfrist: 0,
  frist: 1,
  hearing: 2,
  appointment: 3,
  task: 4,
};

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const VIEW_STORAGE_KEY = "subsumio:calendar-view";

function startOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (date.getDay() + 6) % 7; // Montag = 0
  date.setDate(date.getDate() - offset);
  return date;
}

function addDays(d: Date, days: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + days);
  return date;
}

function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric" }).format(d);
}

function weekdayLong(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("de-AT", { weekday: "long" }).format(new Date(y, m - 1, day));
}

function weekdayShort(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("de-AT", { weekday: "short" }).format(new Date(y, m - 1, day));
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Outlook liefert UTC-Zeiten ohne Zonenangabe; im Kalender zählt die Ortszeit. */
function outlookLocal(
  value: { dateTime?: string; timeZone?: string } | undefined
): { date: string; time: string; ms: number } | null {
  if (!value?.dateTime) return null;
  const raw = value.dateTime.replace(/\.\d+$/, "");
  const tz = value.timeZone ?? "UTC";
  const d = tz === "UTC" || tz === "Etc/UTC" ? new Date(`${raw}Z`) : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: toLocalIsoDate(d),
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    ms: d.getTime(),
  };
}

function itemToEntry(item: CalItem): CalendarEntry {
  return {
    id: item.id,
    title: item.title,
    date: item.date,
    time: item.time,
    durationMin: item.durationMin,
    kind: item.kind === "frist" || item.kind === "notfrist" ? "deadline" : "appointment",
    isHearing: item.kind === "hearing",
    done: item.done || item.kind === "task",
  };
}

export default function CalendarPage() {
  const { t } = useLang();
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [presetDate, setPresetDate] = useState<string | undefined>();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "week" || stored === "month") setView(stored);
    } catch {
      /* Ansicht bleibt Standard */
    }
  }, []);

  function changeView(next: ViewMode) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* nicht kritisch */
    }
  }

  const fristenQuery = useFristen();
  const appts = useAppointments();

  // Outlook events come through the connector API, which only firm admins may
  // read (connector.read). Skip the request unless the role allows it.
  const meQuery = useMe();
  const canReadConnectors = meQuery.data?.user?.role === "admin";
  const outlookQuery = useQuery({
    queryKey: ["calendar-outlook"],
    queryFn: () => api.outlook.calendar.list({ maxResults: 100 }),
    staleTime: 60_000,
    retry: false,
    enabled: canReadConnectors,
  });

  const today = toLocalIsoDate(new Date());

  const items = useMemo(() => {
    const list: CalItem[] = [];

    for (const f of fristenQuery.data?.fristen ?? []) {
      const date = String(f.due_date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const isHearing = f.type === "hearing";
      list.push({
        id: `frist:${f.id}`,
        title: f.title,
        date,
        kind: isHearing ? "hearing" : f.is_notfrist ? "notfrist" : "frist",
        done: f.status === "done" || f.status === "completed",
        caseTitle: f.case_title,
        href: f.case_slug
          ? `/dashboard/cases/${encodeSlugPath(f.case_slug)}`
          : "/dashboard/deadlines",
        source: "fristen",
      });
    }

    for (const a of appts.appointments) {
      list.push({
        id: a.slug,
        title: a.title,
        date: a.date,
        time: a.time,
        durationMin: a.duration,
        kind: a.type === "hearing" ? "hearing" : "appointment",
        caseTitle: a.caseTitle,
        location: a.location,
        appointment: a,
        source: "kanzlei",
      });
    }

    for (const page of appts.casePages) {
      const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
      const tasks = Array.isArray(fm.tasks) ? (fm.tasks as Array<Record<string, unknown>>) : [];
      for (const task of tasks) {
        const due = typeof task.dueDate === "string" ? task.dueDate.slice(0, 10) : "";
        if (task.done || !/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;
        list.push({
          id: `task:${page.slug}:${String(task.id ?? task.text)}`,
          title: String(task.text || "Aufgabe"),
          date: due,
          kind: "task",
          caseTitle: page.title,
          href: `/dashboard/cases/${encodeSlugPath(page.slug)}`,
          source: "akte",
        });
      }
    }

    const raw = outlookQuery.data as Record<string, unknown> | undefined;
    const outlookEvents =
      raw && !raw.error ? ((raw.events ?? []) as Array<Record<string, unknown>>) : [];
    for (const evt of outlookEvents) {
      const start = outlookLocal(evt.start as { dateTime?: string; timeZone?: string });
      if (!start) continue;
      const end = outlookLocal(evt.end as { dateTime?: string; timeZone?: string });
      const allDay = evt.isAllDay === true;
      list.push({
        id: `outlook:${String(evt.id ?? start.ms)}`,
        title: String(evt.subject || "Ohne Betreff"),
        date: start.date,
        time: allDay ? undefined : start.time,
        durationMin:
          !allDay && end ? Math.max(15, Math.round((end.ms - start.ms) / 60_000)) : undefined,
        kind: "appointment",
        location: (evt.location as { displayName?: string } | undefined)?.displayName || undefined,
        externalHref: typeof evt.webLink === "string" ? evt.webLink : undefined,
        source: "outlook",
      });
    }

    return list.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.time ?? "").localeCompare(b.time ?? "") ||
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    );
  }, [fristenQuery.data, appts.appointments, appts.casePages, outlookQuery.data]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const item of items) {
      const list = map.get(item.date);
      if (list) list.push(item);
      else map.set(item.date, [item]);
    }
    return map;
  }, [items]);

  const entries = useMemo(() => items.map(itemToEntry), [items]);
  const conflicts = useMemo(() => findCalendarConflicts(entries), [entries]);
  const upcomingConflicts = useMemo(
    () => conflicts.filter((c) => c.date >= today),
    [conflicts, today]
  );
  const conflictIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of conflicts) {
      set.add(c.a.id);
      set.add(c.b.id);
    }
    return set;
  }, [conflicts]);
  const conflictDates = useMemo(() => new Set(conflicts.map((c) => c.date)), [conflicts]);

  // Existing entries for the dialog's overlap warning (appointments + open deadlines).
  const dialogEntries = useMemo(
    () => [
      ...appts.appointments.map(appointmentToEntry),
      ...entries.filter((e) => e.kind === "deadline" && !e.done),
    ],
    [appts.appointments, entries]
  );

  const weekStart = startOfWeek(cursor);
  const periodLabel =
    view === "week"
      ? `KW ${isoWeek(weekStart)} · ${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}`
      : monthLabel(cursor);

  function navigate(direction: -1 | 1) {
    setCursor((d) =>
      view === "week"
        ? addDays(d, 7 * direction)
        : new Date(d.getFullYear(), d.getMonth() + direction, 1)
    );
  }

  function openNew(date?: string) {
    setEditing(null);
    setPresetDate(date ?? today);
    setDialogOpen(true);
  }

  function openItem(item: CalItem) {
    if (item.appointment) {
      setEditing(item.appointment);
      setPresetDate(undefined);
      setDialogOpen(true);
    } else if (item.href) {
      router.push(item.href);
    } else if (item.externalHref) {
      window.open(item.externalHref, "_blank", "noopener,noreferrer");
    }
  }

  const upcoming = useMemo(
    () => items.filter((i) => i.date >= today && !i.done).slice(0, 8),
    [items, today]
  );

  const isLoading = fristenQuery.isLoading || appts.loading;
  const loadFailed = fristenQuery.isError || appts.error;

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("calendar.title")}
        description="Fristen, Verhandlungen und Termine aller Akten in einem Kalender — Überschneidungen werden markiert."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("calendar.title") },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="gap-2 whitespace-nowrap">
              <Link href="/dashboard/calendar-export">
                <Download size={14} aria-hidden="true" />
                Exportieren
              </Link>
            </Button>
            <PrimaryAction onClick={() => openNew()}>{t("calendar.new")}</PrimaryAction>
          </div>
        }
      />

      {loadFailed && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
        >
          <span>
            Ein Teil des Kalenders konnte nicht geladen werden. Fehlende Einträge erscheinen nach
            dem erneuten Laden.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void fristenQuery.refetch();
              void appts.reload();
            }}
            className="shrink-0 gap-1.5 text-[color:var(--ds-danger-text)]"
          >
            <RotateCcw size={13} aria-hidden="true" />
            Erneut laden
          </Button>
        </div>
      )}

      {upcomingConflicts.length > 0 && (
        <section
          aria-labelledby="calendar-conflicts-title"
          className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-4 py-3"
        >
          <h2
            id="calendar-conflicts-title"
            className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-warning-text)]"
          >
            <AlertTriangle size={15} aria-hidden="true" />
            {upcomingConflicts.length === 1
              ? "1 Terminkollision"
              : `${upcomingConflicts.length} Terminkollisionen`}
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-[color:var(--ds-warning-text)]">
            {upcomingConflicts.slice(0, 5).map((c) => (
              <li key={`${c.kind}-${c.a.id}-${c.b.id}`} className="flex gap-2">
                <span className="shrink-0 font-medium tabular-nums">
                  {weekdayShort(c.date)} {formatDate(c.date)}
                </span>
                <span>{describeCalendarConflict(c)}</span>
              </li>
            ))}
            {upcomingConflicts.length > 5 && (
              <li className="text-xs">und {upcomingConflicts.length - 5} weitere</li>
            )}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--ds-shadow-1)]">
        {/* Einzige Werkzeugleiste: Zeitraum, Navigation, Ansicht */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--ds-border)] px-4 py-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={view === "week" ? "Vorherige Woche" : t("calendar.prev_month")}
              onClick={() => navigate(-1)}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCursor(new Date())}>
              {t("calendar.today")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={view === "week" ? "Nächste Woche" : t("calendar.next_month")}
              onClick={() => navigate(1)}
            >
              <ChevronRight size={16} />
            </Button>
            <h2
              className="ml-2 text-base font-semibold text-[color:var(--ds-text)] tabular-nums first-letter:uppercase"
              aria-live="polite"
            >
              {periodLabel}
            </h2>
          </div>
          <div
            role="radiogroup"
            aria-label="Ansicht"
            className="flex items-center rounded-lg border border-[color:var(--ds-border)] p-0.5"
          >
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => changeView(v)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-[background-color,color] duration-[var(--ds-duration-fast)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
                  view === v
                    ? "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)] shadow-[var(--ds-shadow-1)]"
                    : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                )}
              >
                {v === "week" ? t("calendar.week") : t("calendar.month")}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-7 gap-px p-4" aria-busy="true">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-md" />
            ))}
          </div>
        ) : view === "month" ? (
          <MonthGrid
            cursor={cursor}
            today={today}
            itemsByDate={itemsByDate}
            conflictIds={conflictIds}
            conflictDates={conflictDates}
            onOpenItem={openItem}
            onNew={openNew}
            onShowDay={(day) => {
              setCursor(day);
              changeView("week");
            }}
          />
        ) : (
          <WeekList
            weekStart={weekStart}
            today={today}
            itemsByDate={itemsByDate}
            conflictIds={conflictIds}
            onOpenItem={openItem}
            onNew={openNew}
          />
        )}

        <Legend />
      </section>

      {view === "month" && !isLoading && (
        <section aria-labelledby="calendar-upcoming-title" className="space-y-3">
          <h2
            id="calendar-upcoming-title"
            className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase"
          >
            Demnächst
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Keine anstehenden Fristen oder Termine"
              description="Neue Termine legen Sie hier an; Fristen erfassen Sie in der Akte oder unter Fristen."
              actionLabel={t("calendar.new")}
              onAction={() => openNew()}
            />
          ) : (
            <ul className="divide-y divide-[color:var(--ds-border)] overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
              {upcoming.map((item) => (
                <li key={item.id}>
                  <AgendaRow
                    item={item}
                    conflict={conflictIds.has(item.id)}
                    showDate
                    onOpen={() => openItem(item)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <CalendarEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={editing}
        presetDate={presetDate}
        cases={appts.cases}
        existingEntries={dialogEntries}
        onSave={appts.save}
        onDelete={appts.remove}
      />
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[color:var(--ds-border)] px-4 py-2 text-xs text-[color:var(--ds-text-muted)]">
      {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", KIND_STYLE[k].dot)} aria-hidden="true" />
          {KIND_LABEL[k]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <AlertTriangle
          size={12}
          className="text-[color:var(--ds-warning-text)]"
          aria-hidden="true"
        />
        Kollision
      </span>
    </div>
  );
}

function itemAriaLabel(item: CalItem, conflict: boolean): string {
  return [
    KIND_LABEL[item.kind],
    item.time ? `${item.time} Uhr` : null,
    item.title,
    item.caseTitle ? `Akte ${item.caseTitle}` : null,
    item.done ? "erledigt" : null,
    conflict ? "Kollision" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function Chip({
  item,
  conflict,
  onOpen,
}: {
  item: CalItem;
  conflict: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={itemAriaLabel(item, conflict)}
      title={item.title}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded-sm border-l-2 px-1.5 py-0.5 text-left text-[11px] leading-4 transition-[filter] duration-[var(--ds-duration-fast)] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
        KIND_STYLE[item.kind].chip,
        item.done && "line-through opacity-60"
      )}
    >
      {conflict && <AlertTriangle size={10} className="shrink-0" aria-hidden="true" />}
      {item.time && <span className="shrink-0 tabular-nums">{item.time}</span>}
      <span className="truncate">{item.title}</span>
    </button>
  );
}

function MonthGrid({
  cursor,
  today,
  itemsByDate,
  conflictIds,
  conflictDates,
  onOpenItem,
  onNew,
  onShowDay,
}: {
  cursor: Date;
  today: string;
  itemsByDate: Map<string, CalItem[]>;
  conflictIds: Set<string>;
  conflictDates: Set<string>;
  onOpenItem: (item: CalItem) => void;
  onNew: (date: string) => void;
  onShowDay: (day: Date) => void;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const weeks = Math.ceil(((last.getTime() - gridStart.getTime()) / 86_400_000 + 1) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="p-2 sm:p-3">
      <div className="grid grid-cols-7 gap-1 pb-1" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="text-center text-[11px] font-semibold tracking-wide text-[color:var(--ds-text-muted)] uppercase"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const iso = toLocalIsoDate(day);
          const inMonth = day.getMonth() === cursor.getMonth();
          const isToday = iso === today;
          const dayItems = itemsByDate.get(iso) ?? [];
          const hasConflict = conflictDates.has(iso);
          const weekend = day.getDay() === 0 || day.getDay() === 6;
          return (
            <div
              key={iso}
              className={cn(
                "group min-h-[64px] rounded-md border p-1 sm:min-h-[92px]",
                inMonth
                  ? "border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]"
                  : "border-transparent bg-[color:var(--ds-surface-2)]/50",
                weekend && inMonth && "bg-[color:var(--ds-surface-2)]/40",
                isToday && "border-[color:var(--brand-primary)]/60"
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => onNew(iso)}
                  aria-label={`${weekdayLong(iso)}, ${formatDate(iso)}${isToday ? " (heute)" : ""} – Termin anlegen`}
                  className={cn(
                    "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none",
                    isToday
                      ? "bg-[color:var(--brand-solid)] font-semibold text-white hover:bg-[color:var(--brand-solid)]"
                      : inMonth
                        ? "text-[color:var(--ds-text)]"
                        : "text-[color:var(--ds-text-subtle)]"
                  )}
                >
                  {day.getDate()}
                </button>
                {hasConflict && (
                  <AlertTriangle
                    size={12}
                    className="text-[color:var(--ds-warning-text)]"
                    aria-label="Kollision an diesem Tag"
                  />
                )}
              </div>
              {/* Ab sm: Einträge als Chips; am Handy als Punkte (Details in „Demnächst“). */}
              <div className="hidden space-y-0.5 sm:block">
                {dayItems.slice(0, 3).map((item) => (
                  <Chip
                    key={item.id}
                    item={item}
                    conflict={conflictIds.has(item.id)}
                    onOpen={() => onOpenItem(item)}
                  />
                ))}
                {dayItems.length > 3 && (
                  <button
                    type="button"
                    onClick={() => onShowDay(day)}
                    className="px-1.5 text-[11px] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                  >
                    +{dayItems.length - 3} weitere
                  </button>
                )}
              </div>
              {dayItems.length > 0 && (
                <div className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                  {dayItems.slice(0, 4).map((item) => (
                    <span
                      key={item.id}
                      className={cn("h-1.5 w-1.5 rounded-full", KIND_STYLE[item.kind].dot)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekList({
  weekStart,
  today,
  itemsByDate,
  conflictIds,
  onOpenItem,
  onNew,
}: {
  weekStart: Date;
  today: string;
  itemsByDate: Map<string, CalItem[]>;
  conflictIds: Set<string>;
  onOpenItem: (item: CalItem) => void;
  onNew: (date: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => toLocalIsoDate(addDays(weekStart, i)));
  return (
    <ol className="divide-y divide-[color:var(--ds-border)]">
      {days.map((iso) => {
        const dayItems = itemsByDate.get(iso) ?? [];
        const isToday = iso === today;
        return (
          <li
            key={iso}
            className={cn(
              "flex flex-col gap-2 px-4 py-3 sm:flex-row sm:gap-4",
              isToday && "bg-[color:var(--ds-surface-2)]/60"
            )}
          >
            <div className="flex w-full shrink-0 items-center justify-between sm:w-36 sm:flex-col sm:items-start sm:justify-start">
              <div className="text-sm font-medium text-[color:var(--ds-text)] tabular-nums">
                <span className="capitalize">{weekdayShort(iso)}</span> {formatDate(iso)}
              </div>
              {isToday ? (
                <span className="text-xs font-medium text-[color:var(--brand-primary)]">heute</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onNew(iso)}
                  className="text-xs text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                  aria-label={`Termin am ${formatDate(iso)} anlegen`}
                >
                  + Termin
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {dayItems.length === 0 ? (
                <p className="py-1 text-sm text-[color:var(--ds-text-subtle)]">Keine Einträge</p>
              ) : (
                <ul className="space-y-1">
                  {dayItems.map((item) => (
                    <li key={item.id}>
                      <AgendaRow
                        item={item}
                        conflict={conflictIds.has(item.id)}
                        onOpen={() => onOpenItem(item)}
                        compact
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function AgendaRow({
  item,
  conflict,
  onOpen,
  showDate,
  compact,
}: {
  item: CalItem;
  conflict: boolean;
  onOpen: () => void;
  showDate?: boolean;
  compact?: boolean;
}) {
  const isDeadline = item.kind === "frist" || item.kind === "notfrist";
  const days = daysUntil(item.date);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-3 text-left transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none",
        compact ? "rounded-md px-2 py-1.5" : "px-4 py-3"
      )}
    >
      {showDate && (
        <div className="w-24 shrink-0 text-sm tabular-nums">
          <div className="font-medium text-[color:var(--ds-text)]">{formatDate(item.date)}</div>
          <div className="text-xs text-[color:var(--ds-text-muted)]">
            {isDeadline ? formatDaysUntil(days) : weekdayShort(item.date)}
          </div>
        </div>
      )}
      <span
        className={cn("h-2 w-2 shrink-0 rounded-full", KIND_STYLE[item.kind].dot)}
        aria-hidden="true"
      />
      <div className="w-16 shrink-0 text-xs text-[color:var(--ds-text-muted)] tabular-nums">
        {item.time ? `${item.time} Uhr` : KIND_LABEL[item.kind]}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-sm text-[color:var(--ds-text)]",
            item.kind === "notfrist" && "font-medium",
            item.done && "line-through opacity-60"
          )}
        >
          {item.title}
        </div>
        {(item.caseTitle || item.location || item.time) && (
          <div className="truncate text-xs text-[color:var(--ds-text-muted)]">
            {[item.time ? KIND_LABEL[item.kind] : null, item.caseTitle, item.location]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}
      </div>
      {conflict && (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[color:var(--ds-warning-text)]">
          <AlertTriangle size={12} aria-hidden="true" />
          Kollision
        </span>
      )}
    </button>
  );
}
