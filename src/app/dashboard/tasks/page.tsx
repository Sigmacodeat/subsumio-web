"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, CalendarClock, Briefcase, CheckCircle2, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn, daysUntil, encodeSlugPath, formatDate, formatDaysUntil } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

type Filter = "all" | "open" | "done";

export default function TasksPage() {
  const { t } = useLang();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("open");

  const {
    data: casePages = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["tasks-cases"],
    queryFn: () => api.cases.list({ limit: 200 }),
  });

  const tasks = useMemo(() => {
    const items: Array<{
      id: string;
      text: string;
      done: boolean;
      dueDate?: string;
      createdAt: string;
      caseSlug: string;
      caseTitle: string;
    }> = [];

    for (const page of casePages) {
      const fm = page.frontmatter ?? {};
      const taskList = Array.isArray(fm.tasks) ? fm.tasks : [];
      for (const task of taskList) {
        items.push({
          id: `${page.slug}-${task.id}`,
          text: task.text || t("tasks.untitled"),
          done: Boolean(task.done),
          dueDate: typeof task.dueDate === "string" && task.dueDate ? task.dueDate : undefined,
          createdAt: task.createdAt || page.created_at,
          caseSlug: page.slug,
          caseTitle: page.title,
        });
      }
    }

    // Offene zuerst; innerhalb davon nach Fälligkeit, Aufgaben ohne Datum zuletzt.
    return items.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [casePages, t]);

  const filteredTasks = useMemo(() => {
    if (filter === "all") return tasks;
    return tasks.filter((t) => (filter === "done" ? t.done : !t.done));
  }, [tasks, filter]);

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("tasks.title")}
        description="Offene Aufgaben aus allen Akten, nach Fälligkeit sortiert. Aufgaben legen Sie in der jeweiligen Akte an und haken sie dort ab."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("tasks.title") },
        ]}
        actions={
          <div
            role="radiogroup"
            aria-label="Aufgaben filtern"
            className="flex items-center rounded-lg border border-[color:var(--ds-border)] p-0.5"
          >
            {(["all", "open", "done"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-[background-color,border-color,color,box-shadow,transform,opacity] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none",
                  filter === f
                    ? "rounded-md bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                    : "text-[color:var(--ds-text-muted)]"
                )}
              >
                {t(`tasks.${f}`)}
              </button>
            ))}
          </div>
        }
      />

      <div>
        {isError ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3 text-sm text-[color:var(--ds-danger-text)]"
          >
            <span>Die Aufgaben konnten nicht geladen werden.</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refetch()}
              className="shrink-0 gap-1.5 text-[color:var(--ds-danger-text)]"
            >
              <RotateCcw size={13} aria-hidden="true" />
              Erneut laden
            </Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title={filter === "done" ? "Keine erledigten Aufgaben" : t("tasks.empty_title")}
            description={
              filter === "done"
                ? "Abgehakte Aufgaben aus Ihren Akten erscheinen hier."
                : "Aufgaben entstehen in der Akte — öffnen Sie eine Akte, um eine Aufgabe anzulegen."
            }
            actionLabel="Zu den Akten"
            onAction={() => router.push("/dashboard/cases")}
          />
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3",
                  task.done && "opacity-60"
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--ds-surface-2)]">
                  {task.done ? (
                    <CheckCircle2 size={16} className="text-[color:var(--ds-success-text)]" />
                  ) : (
                    <CheckSquare size={16} className="text-[color:var(--brand-primary)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm font-medium text-[color:var(--ds-text)]",
                      task.done && "line-through"
                    )}
                  >
                    {task.text}
                    {task.done && <span className="sr-only"> (erledigt)</span>}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-subtle)]">
                    <Link
                      href={`/dashboard/cases/${encodeSlugPath(task.caseSlug)}`}
                      className="inline-flex items-center gap-1 hover:text-[color:var(--ds-text)]"
                    >
                      <Briefcase size={11} />
                      <span className="max-w-[180px] truncate">{task.caseTitle}</span>
                    </Link>
                    {task.dueDate && (
                      <>
                        <span className="h-3 w-px bg-[color:var(--ds-border)]" aria-hidden="true" />
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 tabular-nums",
                            !task.done &&
                              (daysUntil(task.dueDate) ?? 0) < 0 &&
                              "text-[color:var(--ds-danger-text)]"
                          )}
                        >
                          <CalendarClock size={11} aria-hidden="true" />
                          {formatDate(task.dueDate)}
                          {!task.done && ` · ${formatDaysUntil(daysUntil(task.dueDate))}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
