"use client";

import Link from "next/link";
import { Sparkles, Loader2, ArrowRight, FileText } from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { useRundown, useTriggerRundown } from "@/lib/queries/agents";
import { renderMarkdown } from "@/lib/markdown";
import { Button } from "@/components/ui/button";

function isToday(date?: string): boolean {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

export function RundownWidget() {
  const { t } = useLang();
  const rundownQuery = useRundown();
  const triggerMutation = useTriggerRundown();

  const jobs = rundownQuery.data ?? [];
  const latest = jobs[0];
  const isRunning = jobs.some((j) => j.status === "active" || j.status === "waiting");
  const hasToday = latest && isToday(latest.completedAt ?? latest.startedAt);

  // Don't render if no rundown exists and nothing is running — keep dashboard clean
  if (!latest && !triggerMutation.isPending && !isRunning) {
    return (
      <div className="rounded-xl border border-[color:var(--brand-primary)]/20 bg-gradient-to-br from-[color:var(--brand-glow)] to-transparent p-4 shadow-[var(--card-shadow)]">
        <div className="flex items-center gap-3">
          <div className="brand-soft brand-border flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
            <Sparkles size={16} className="brand-text" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("rundown.widget_title")}
            </h3>
            <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
              {t("rundown.widget_empty")}
            </p>
          </div>
          <Button
            size="sm"
            variant="glow"
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending}
          >
            {triggerMutation.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            {t("reports.btn_rundown")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[color:var(--brand-primary)]/20 bg-gradient-to-br from-[color:var(--brand-glow)] to-transparent p-4 shadow-[var(--card-shadow)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="brand-soft brand-border flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
            <Sparkles size={15} className="brand-text" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("rundown.widget_title")}
            </h3>
            {isRunning && (
              <p className="text-xs text-[color:var(--ds-text-subtle)]">
                {t("rundown.widget_loading")}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending || isRunning}
          >
            {triggerMutation.isPending || isRunning ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            {t("reports.btn_rundown")}
          </Button>
          <Link href="/dashboard/reports">
            <Button size="sm" variant="ghost">
              <FileText size={13} />
              {t("rundown.widget_view_all")}
              <ArrowRight size={12} />
            </Button>
          </Link>
        </div>
      </div>

      {latest?.result && hasToday ? (
        <div
          className="prose prose-sm max-w-none text-[color:var(--ds-text-muted)] [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-[color:var(--ds-text)] [&_li]:text-xs [&_li]:leading-relaxed [&_p]:text-xs [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-4"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(latest.result) }}
        />
      ) : latest?.result ? (
        <div
          className="prose prose-sm max-w-none text-[color:var(--ds-text-muted)] [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-[color:var(--ds-text)] [&_li]:text-xs [&_li]:leading-relaxed [&_p]:text-xs [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-4"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(latest.result) }}
        />
      ) : (
        <p className="text-xs text-[color:var(--ds-text-subtle)]">{t("reports.rundown_none")}</p>
      )}
    </div>
  );
}
