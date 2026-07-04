"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  List,
  Briefcase,
  CheckSquare,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import { cn, encodeSlugPath } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import type { BrainPage } from "@/lib/types";

type ViewMode = "week" | "month";

export default function CalendarPage() {
  const { t } = useLang();
  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  const { data: deadlinePages = [], isLoading: deadlinesLoading } = useQuery({
    queryKey: ["calendar-deadlines"],
    queryFn: () => api.deadlines.list({ limit: 200 }),
  });

  const { data: casePages = [], isLoading: casesLoading } = useQuery({
    queryKey: ["calendar-cases"],
    queryFn: () => api.cases.list({ limit: 200 }),
  });

  const events = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      date: string;
      type: "deadline" | "task" | "case";
      status?: string;
      href?: string;
      urgency?: string;
    }> = [];

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

    return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [deadlinePages, casePages]);

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

  const isLoading = deadlinesLoading || casesLoading;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("calendar.title")}
        description={t("calendar.description")}
        actions={
          <div className="flex items-center gap-2">
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
                          {event.type === "deadline" ? t("calendar.deadline") : t("calendar.task")}
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
    </div>
  );
}

function EventIcon({ type, urgency }: { type: string; urgency?: string }) {
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
