"use client";

import { useMemo, useState } from "react";
import { CheckSquare, Square, CalendarClock, Briefcase, Loader2, CheckCircle2 } from "lucide-react";
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

type Filter = "all" | "open" | "done";

export default function TasksPage() {
  const { t } = useLang();
  const [filter, setFilter] = useState<Filter>("open");

  const { data: casePages = [], isLoading } = useQuery({
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
          dueDate: task.dueDate,
          createdAt: task.createdAt || page.created_at,
          caseSlug: page.slug,
          caseTitle: page.title,
        });
      }
    }

    return items.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (!a.dueDate || !b.dueDate) return 0;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [casePages, t]);

  const filteredTasks = useMemo(() => {
    if (filter === "all") return tasks;
    return tasks.filter((t) => (filter === "done" ? t.done : !t.done));
  }, [tasks, filter]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t("tasks.title")}
        description={t("tasks.description")}
        actions={
          <div className="flex items-center rounded-lg border border-[color:var(--ds-border)] p-0.5">
            {(["all", "open", "done"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2 py-1 text-xs font-medium transition-all",
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

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center text-[color:var(--ds-text-muted)]">
            <CheckSquare size={40} className="mb-3 opacity-40" />
            <p className="font-medium text-[color:var(--ds-text)]">{t("tasks.empty_title")}</p>
            <p className="text-sm">{t("tasks.empty_desc")}</p>
          </div>
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
                        <span className="h-3 w-px bg-[color:var(--ds-border)]" />
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock size={11} />
                          {formatDate(task.dueDate)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {task.done ? (
                  <Badge variant="success">{t("tasks.done")}</Badge>
                ) : (
                  <Badge variant="accent">{t("tasks.open")}</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
  });
}
