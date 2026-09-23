"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import type { DashboardKey } from "@/content/dashboard";

interface FailedTask {
  task_slug: string;
  task_type?: string;
  doc_slug: string;
  doc_title?: string;
  last_error?: string;
  attempts?: number;
}

const TASK_TYPE_KEY: Record<string, DashboardKey> = {
  reconcile_case: "vault.task_type_reconcile_case",
  analyze: "vault.task_type_analyze",
  contradiction: "vault.task_type_contradiction",
};

/**
 * Exhausted post-upload tasks (analysis, contradiction probe, case
 * reconciliation) are invisible without this — a document sits in the vault
 * looking fine while its bookkeeping permanently failed. Inbound-register
 * stamps are excluded on purpose: they already surface in the
 * Posteingangsbuch.
 */
export function FailedTasksBanner() {
  const { t } = useLang();
  const { addToast } = useToast();
  const [tasks, setTasks] = useState<FailedTask[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/post-upload-tasks?status=exhausted")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const list = (data.tasks ?? data.data?.tasks ?? []) as FailedTask[];
        setTasks(list.filter((task) => task.task_type !== "inbound_stamp"));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const retryTask = useCallback(
    async (taskSlug: string) => {
      setRetrying(taskSlug);
      try {
        const res = await csrfFetch("/api/post-upload-tasks/retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_slug: taskSlug }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setTasks((prev) => prev.filter((task) => task.task_slug !== taskSlug));
        addToast({ type: "success", title: t("vault.failed_tasks_retried") });
      } catch {
        addToast({ type: "error", title: t("vault.failed_tasks_retry_failed") });
      } finally {
        setRetrying(null);
      }
    },
    [addToast, t]
  );

  if (tasks.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-xl border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          size={16}
          className="mt-0.5 shrink-0 text-[color:var(--ds-warning-text)]"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium">
            {tasks.length === 1
              ? t("vault.failed_tasks_title_one")
              : t("vault.failed_tasks_title_many").replace("{n}", String(tasks.length))}
          </p>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            {t("vault.failed_tasks_desc")}
          </p>
          <ul className="space-y-1.5">
            {tasks.map((task) => (
              <li key={task.task_slug} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {task.task_type && task.task_type in TASK_TYPE_KEY
                    ? `${t(TASK_TYPE_KEY[task.task_type]!)} — `
                    : ""}
                  {task.doc_title || task.doc_slug}
                  {task.last_error ? (
                    <span className="text-[color:var(--ds-text-subtle)]">
                      {" "}
                      ({task.last_error.slice(0, 80)})
                    </span>
                  ) : null}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={retrying === task.task_slug}
                  onClick={() => void retryTask(task.task_slug)}
                >
                  {retrying === task.task_slug ? (
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <RotateCcw size={13} aria-hidden="true" />
                  )}
                  {t("vault.failed_tasks_retry")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
