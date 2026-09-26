"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, CalendarClock, Briefcase, CheckCircle2, RotateCcw, User } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMe } from "@/lib/queries/auth";
import { useTeam } from "@/lib/queries/settings";
import { useLang } from "@/lib/use-lang";
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn, daysUntil, encodeSlugPath, formatDate, formatDaysUntil } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";

type Filter = "all" | "open" | "done" | "mine";

export default function TasksPage() {
  const { t } = useLang();
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("open");
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const { addToast } = useToast();
  const { data: meData } = useMe();
  const { data: teamData } = useTeam();
  const teamMembers = teamData?.members ?? [];
  const currentUserId = meData?.user?.id;

  const {
    data: casePages = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["tasks-cases"],
    // batchListPages paginates past the engine's 200-page cap
    // (api.cases.list()/GET /api/pages does not) — a Kanzlei with more
    // than 200 cases used to silently lose tasks from every case past the
    // 200th, with no error surfaced. See engine-list-cap-and-tombstones.
    queryFn: async () => {
      const { results, errors } = await api.brain.batchListPagesDetailed(["legal_case"], 2000);
      if (errors.length) throw new Error(`batch list failed: ${errors.join(",")}`);
      return results.legal_case ?? [];
    },
  });

  const tasks = useMemo(() => {
    const items: Array<{
      id: string;
      taskId: string;
      text: string;
      done: boolean;
      dueDate?: string;
      assigneeId?: string;
      assigneeName?: string;
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
          taskId: String(task.id ?? ""),
          text: task.text || t("tasks.untitled"),
          done: Boolean(task.done),
          dueDate: typeof task.dueDate === "string" && task.dueDate ? task.dueDate : undefined,
          assigneeId: typeof task.assigneeId === "string" ? task.assigneeId : undefined,
          assigneeName: typeof task.assigneeName === "string" ? task.assigneeName : undefined,
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
    if (filter === "mine") return tasks.filter((t) => !t.done && t.assigneeId === currentUserId);
    return tasks.filter((t) => (filter === "done" ? t.done : !t.done));
  }, [tasks, filter, currentUserId]);

  /**
   * Reassign or toggle a task from the aggregated view, writing straight
   * back to the owning case's tasks[] array — the same read-modify-write
   * shape the matter tab itself uses. Re-reads that one case fresh right
   * before writing (rather than trusting the already-fetched list) to
   * shrink the staleness window; not the full retry-verify loop
   * time-entries got (src/app/api/time/route.ts) since a task checkbox
   * losing a race is a "click it again" problem, not a billing one.
   */
  async function mutateTask(
    caseSlug: string,
    taskId: string,
    mutate: (task: Record<string, unknown>) => Record<string, unknown>
  ) {
    const key = `${caseSlug}:${taskId}`;
    if (busyTask) return;
    setBusyTask(key);
    try {
      const fresh = await api.brain.getPage(caseSlug);
      const freshTasks = Array.isArray(fresh.frontmatter?.tasks)
        ? (fresh.frontmatter.tasks as Array<Record<string, unknown>>)
        : [];
      if (!freshTasks.some((t) => t.id === taskId)) throw new Error("task_not_found");
      const updated = freshTasks.map((t) => (t.id === taskId ? mutate(t) : t));
      await api.brain.updatePage({ slug: caseSlug, frontmatter: { tasks: updated } });
    } catch {
      // Never a silent no-op: the checkbox/assignee would look saved.
      addToast({
        type: "error",
        title: "Aufgabe konnte nicht gespeichert werden",
        description: "Bitte laden Sie die Seite neu und versuchen Sie es erneut.",
      });
    } finally {
      setBusyTask(null);
      await qc.invalidateQueries({ queryKey: ["tasks-cases"] });
    }
  }

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("tasks.title")}
        description="Aufgaben aus allen Akten, mit Zuständigkeit und Fälligkeit. Neue Aufgaben legen Sie in der jeweiligen Akte an."
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
            {(["mine", "all", "open", "done"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-[background-color,border-color,color,box-shadow,transform,opacity] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none",
                  filter === f
                    ? "rounded-md bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text)]"
                    : "text-[color:var(--ds-text-muted)]"
                )}
              >
                {f === "mine" ? "Mir zugewiesen" : t(`tasks.${f}`)}
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
                : filter === "mine"
                  ? "Ihnen sind aktuell keine offenen Aufgaben zugewiesen."
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
                <button
                  onClick={() =>
                    void mutateTask(task.caseSlug, task.taskId, (t) => ({ ...t, done: !t.done }))
                  }
                  aria-label={task.done ? "Als offen markieren" : "Als erledigt markieren"}
                  disabled={busyTask === `${task.caseSlug}:${task.taskId}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--ds-surface-2)] transition-[background-color] hover:bg-[color:var(--ds-surface-hover)]"
                >
                  {task.done ? (
                    <CheckCircle2 size={16} className="text-[color:var(--ds-success-text)]" />
                  ) : (
                    <CheckSquare size={16} className="text-[color:var(--brand-primary)]" />
                  )}
                </button>
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
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--ds-text-subtle)]">
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
                <div className="flex shrink-0 items-center gap-1.5">
                  <User
                    size={12}
                    className="text-[color:var(--ds-text-subtle)]"
                    aria-hidden="true"
                  />
                  <select
                    value={task.assigneeId ?? ""}
                    onChange={(e) => {
                      const assignee = teamMembers.find((m) => m.id === e.target.value);
                      void mutateTask(task.caseSlug, task.taskId, (t) => ({
                        ...t,
                        assigneeId: assignee?.id,
                        assigneeName: assignee?.name || assignee?.email,
                      }));
                    }}
                    aria-label={`Zuständig für „${task.text}"`}
                    className="rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-1.5 py-1 text-xs text-[color:var(--ds-text)]"
                  >
                    <option value="">Nicht zugewiesen</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
