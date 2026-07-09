"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  List,
  CheckSquare,
  Plus,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import { useToast } from "@/components/ui/toast";
import { cn, encodeSlugPath } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { CalendarInUiEditor } from "@/components/calendar/calendar-editor";

type ViewMode = "week" | "month";

type CalendarEventType = "deadline" | "task" | "case" | "outlook";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  type: CalendarEventType;
  status?: string;
  href?: string;
  urgency?: string;
  location?: string;
  outlookId?: string;
  webLink?: string;
}

export default function CalendarPage() {
  const { t } = useLang();
  const { addToast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showOutlookDialog, setShowOutlookDialog] = useState(false);

  const { data: deadlinePages = [], isLoading: deadlinesLoading } = useQuery({
    queryKey: ["calendar-deadlines"],
    queryFn: () => api.deadlines.list({ limit: 200 }),
  });

  const { data: casePages = [], isLoading: casesLoading } = useQuery({
    queryKey: ["calendar-cases"],
    queryFn: () => api.cases.list({ limit: 200 }),
  });

  const { data: outlookData, isLoading: outlookLoading } = useQuery({
    queryKey: ["calendar-outlook"],
    queryFn: () => api.outlook.calendar.list({ maxResults: 100 }),
    staleTime: 60_000,
    retry: false,
  });

  const outlookEvents = useMemo(() => {
    const raw = outlookData as Record<string, unknown> | undefined;
    if (!raw || raw.error) return [];
    const events = (raw.events ?? []) as Array<Record<string, unknown>>;
    return events;
  }, [outlookData]);

  const createOutlookEventMutation = useMutation({
    mutationFn: api.outlook.calendar.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-outlook"] });
      addToast({ type: "success", title: "Outlook-Termin erstellt" });
      setShowOutlookDialog(false);
    },
    onError: (e) => {
      addToast({ type: "error", title: e instanceof Error ? e.message : "Fehler beim Erstellen" });
    },
  });

  const events = useMemo(() => {
    const items: CalendarEvent[] = [];

    for (const page of deadlinePages) {
      const fm = page.frontmatter ?? {};
      const due = (fm.due_date ?? fm.date ?? fm.deadline_date ?? "") as string;
      if (due) {
        items.push({
          id: page.slug,
          title: page.title,
          date: due,
          type: "deadline",
          status: String(fm.status ?? "open"),
          href: `/dashboard/cases/${encodeSlugPath(page.slug)}`,
          urgency: String(fm.urgency ?? computeUrgency(due)),
        });
      }
    }

    for (const page of casePages) {
      const fm = page.frontmatter ?? {};
      const deadlines = Array.isArray(fm.deadlines) ? fm.deadlines : [];
      for (const d of deadlines) {
        if (d.date) {
          items.push({
            id: `${page.slug}-${d.label}`,
            title: `${d.label}: ${page.title}`,
            date: d.date,
            type: "deadline",
            href: `/dashboard/cases/${encodeSlugPath(page.slug)}`,
            urgency: d.urgency ?? computeUrgency(d.date),
          });
        }
      }
      const tasks = Array.isArray(fm.tasks) ? fm.tasks : [];
      for (const task of tasks) {
        if (!task.done && task.dueDate) {
          items.push({
            id: `${page.slug}-task-${task.id}`,
            title: task.text,
            date: task.dueDate,
            type: "task",
            href: `/dashboard/cases/${encodeSlugPath(page.slug)}`,
          });
        }
      }
    }

    // Outlook calendar events
    for (const evt of outlookEvents) {
      const start = (evt.start as { dateTime?: string })?.dateTime;
      const end = (evt.end as { dateTime?: string })?.dateTime;
      if (!start) continue;
      items.push({
        id: String(evt.id ?? `outlook-${Date.now()}`),
        title: String(evt.subject ?? "(Kein Betreff)"),
        date: start,
        endDate: end,
        type: "outlook",
        location: (evt.location as { displayName?: string })?.displayName,
        webLink: String(evt.webLink ?? ""),
        outlookId: String(evt.id ?? ""),
      });
    }

    return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [deadlinePages, casePages, outlookEvents]);

  const visibleEvents = useMemo(() => {
    const start = startOfWeek(currentDate);
    const end = view === "week" ? addDays(start, 7) : endOfMonth(currentDate);
    return events.filter((e) => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    });
  }, [events, currentDate, view]);

  const navigate = (direction: "prev" | "next" | "today") => {
    if (direction === "today") {
      setCurrentDate(new Date());
      return;
    }
    const delta = view === "week" ? 7 : 1;
    const multiplier = direction === "prev" ? -1 : 1;
    setCurrentDate((d) => addDays(d, delta * multiplier));
  };

  const isLoading = deadlinesLoading || casesLoading || outlookLoading;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("calendar.title")}
        description={t("calendar.description")}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setShowOutlookDialog(!showOutlookDialog)}
            >
              <Plus size={14} />
              Outlook-Termin
            </Button>
            <div className="flex items-center rounded-lg border border-[color:var(--ds-border)] p-0.5">
              <button
                onClick={() => setView("week")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-all",
                  view === "week"
                    ? "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                    : "text-[color:var(--ds-text-muted)]"
                )}
              >
                <CalendarIcon size={13} />
                {t("calendar.week")}
              </button>
              <button
                onClick={() => setView("month")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-all",
                  view === "month"
                    ? "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                    : "text-[color:var(--ds-text-muted)]"
                )}
              >
                <List size={13} />
                {t("calendar.month")}
              </button>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => navigate("prev")}>
                <ChevronLeft size={16} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate("today")}>
                {t("calendar.today")}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigate("next")}>
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : visibleEvents.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center text-[color:var(--ds-text-muted)]">
            <CalendarClock size={40} className="mb-3 opacity-40" />
            <p className="font-medium text-[color:var(--ds-text)]">{t("calendar.empty_title")}</p>
            <p className="text-sm">{t("calendar.empty_desc")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {groupByDate(visibleEvents).map(([date, group]) => (
              <div
                key={date}
                className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                    {formatDate(date)}
                  </span>
                  {isToday(date) && (
                    <Badge variant="accent" className="text-[10px]">
                      {t("calendar.today")}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5">
                  {group.map((event) => (
                    <Link
                      key={event.id}
                      href={event.href ?? "#"}
                      className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-[color:var(--ds-hover)]"
                    >
                      <EventIcon type={event.type} urgency={event.urgency} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[color:var(--ds-text)]">
                          {event.title}
                        </p>
                        <p className="text-xs text-[color:var(--ds-text-subtle)]">
                          {event.type === "deadline"
                            ? t("calendar.deadline")
                            : event.type === "outlook"
                              ? "Outlook"
                              : t("calendar.task")}
                          {event.location ? ` · ${event.location}` : ""}
                        </p>
                      </div>
                      <UrgencyBadge urgency={event.urgency} />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outlook event creation dialog */}
      {showOutlookDialog && (
        <OutlookEventDialog
          onSubmit={(input) => void createOutlookEventMutation.mutateAsync(input)}
          onCancel={() => setShowOutlookDialog(false)}
          isPending={createOutlookEventMutation.isPending}
        />
      )}

      {/* In-UI appointment editor */}
      <div className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
        <h2 className="mb-4 text-sm font-semibold text-[color:var(--ds-text)]">
          {t("calendar.new")}
        </h2>
        <CalendarInUiEditor />
      </div>
    </div>
  );
}

function OutlookEventDialog({
  onSubmit,
  onCancel,
  isPending,
}: {
  onSubmit: (input: {
    subject: string;
    start: string;
    end: string;
    location?: string;
    body?: string;
  }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [subject, setSubject] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [body, setBody] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !startDate) return;
    const start = `${startDate}T${startTime}:00`;
    const end = `${startDate}T${endTime}:00`;
    onSubmit({
      subject: subject.trim(),
      start,
      end,
      location: location.trim() || undefined,
      body: body.trim() || undefined,
    });
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] p-4"
      onSubmit={handleSubmit}
    >
      <h2 className="text-sm font-semibold text-[color:var(--ds-info-text)]">Outlook-Termin erstellen</h2>
      <div className="space-y-1">
        <Label htmlFor="outlook-subject" className="text-xs text-[color:var(--ds-text-muted)]">
          Betreff
        </Label>
        <Input
          id="outlook-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Termin mit Mandant Müller"
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="outlook-date" className="text-xs text-[color:var(--ds-text-muted)]">
            Datum
          </Label>
          <Input
            id="outlook-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="outlook-start" className="text-xs text-[color:var(--ds-text-muted)]">
            Start
          </Label>
          <Input
            id="outlook-start"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="outlook-end" className="text-xs text-[color:var(--ds-text-muted)]">
            Ende
          </Label>
          <Input
            id="outlook-end"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="outlook-location" className="text-xs text-[color:var(--ds-text-muted)]">
          Ort (optional)
        </Label>
        <Input
          id="outlook-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Kanzlei, Konferenzraum 1"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="outlook-body" className="text-xs text-[color:var(--ds-text-muted)]">
          Beschreibung (optional)
        </Label>
        <textarea
          id="outlook-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--ds-info-border)] focus:outline-none"
          placeholder="Agenda, Notizen…"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={isPending || !subject.trim() || !startDate}
          className="gap-2 bg-[color:var(--ds-info-solid)] text-sm text-white hover:bg-[color:var(--ds-info-solid)]"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Erstellen
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function EventIcon({ type, urgency }: { type: string; urgency?: string }) {
  if (type === "outlook") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[color:var(--ds-info-bg)]">
        <CalendarIcon size={14} className="text-[color:var(--ds-info-text)]" />
      </div>
    );
  }
  if (type === "task") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[color:var(--ds-surface-2)]">
        <CheckSquare size={14} className="text-[color:var(--brand-primary)]" />
      </div>
    );
  }
  const isOverdue = urgency === "overdue";
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[color:var(--ds-surface-2)]">
      {isOverdue ? (
        <AlertTriangle size={14} className="text-[color:var(--ds-danger-text)]" />
      ) : (
        <Clock size={14} className="text-[color:var(--ds-warning-text)]" />
      )}
    </div>
  );
}

function UrgencyBadge({ urgency }: { urgency?: string }) {
  if (!urgency || urgency === "upcoming") return null;
  if (urgency === "overdue") {
    return <Badge variant="danger">{urgency}</Badge>;
  }
  if (urgency === "critical") {
    return <Badge variant="warning">{urgency}</Badge>;
  }
  return <Badge variant="info">{urgency}</Badge>;
}

function computeUrgency(date: string): string {
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return "overdue";
  if (diff <= 3) return "critical";
  if (diff <= 7) return "warning";
  return "upcoming";
}

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function addDays(d: Date, days: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + days);
  return date;
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}

function isToday(date: string): boolean {
  const d = new Date(date);
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("de-DE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function groupByDate<T extends { date: string }>(items: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.date.split("T")[0];
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}
