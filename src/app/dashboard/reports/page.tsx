"use client";

import { useState, useMemo } from "react";
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/lib/markdown";
import { Button } from "@/components/ui/button";
import {
  FileText,
  ClipboardCheck,
  CalendarCheck,
  Search,
  PenTool,
  Cpu,
  Bot,
  Loader2,
  RotateCcw,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Zap,
  Sparkles,
  X,
  Eye,
} from "lucide-react";
import {
  useAgents,
  useRundown,
  useTriggerRundown,
  useReplayAgent,
  type AgentJob,
  type AgentRole,
  type AgentStatus,
} from "@/lib/queries/agents";
import type { TFunc } from "@/content/dashboard";

// ── Role icon mapping ──────────────────────────────────────────
const ROLE_ICONS: Record<AgentRole, typeof Bot> = {
  planning: CalendarCheck,
  review: ClipboardCheck,
  summary: FileText,
  research: Search,
  draft: PenTool,
  supervisor: Cpu,
  custom: Bot,
};

function roleLabel(role: AgentRole, t: TFunc): string {
  const map: Record<AgentRole, string> = {
    planning: t("reports.role_planning"),
    review: t("reports.role_review"),
    summary: t("reports.role_summary"),
    research: t("reports.role_research"),
    draft: t("reports.role_draft"),
    supervisor: t("reports.role_supervisor"),
    custom: t("reports.role_custom"),
  };
  return map[role];
}

// ── Status helpers ─────────────────────────────────────────────
function statusIcon(status: AgentStatus) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={14} className="text-emerald-600" />;
    case "active":
      return <Loader2 size={14} className="animate-spin text-blue-600" />;
    case "waiting":
      return <Clock size={14} className="text-amber-600" />;
    case "failed":
      return <XCircle size={14} className="text-red-600" />;
    case "paused":
      return <Clock size={14} className="text-gray-400" />;
    case "partial_success":
      return <AlertCircle size={14} className="text-amber-500" />;
    case "needs_review":
      return <AlertCircle size={14} className="text-orange-500" />;
    case "monitoring":
      return <Activity size={14} className="text-blue-400" />;
  }
}

function statusLabel(status: AgentStatus, t: TFunc): string {
  const map: Record<string, string> = {
    completed: t("agents.status_completed"),
    active: t("agents.status_active"),
    waiting: t("agents.status_waiting"),
    failed: t("agents.status_failed"),
    paused: t("agents.status_paused"),
    partial_success: t("reports.status_partial_success"),
    needs_review: t("reports.status_needs_review"),
    monitoring: t("reports.status_monitoring"),
  };
  return map[status] ?? status;
}

function statusColor(status: AgentStatus): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500";
    case "active":
      return "bg-blue-500 animate-pulse";
    case "waiting":
      return "bg-amber-500";
    case "failed":
      return "bg-red-500";
    case "paused":
      return "bg-gray-500";
    case "partial_success":
      return "bg-amber-400";
    case "needs_review":
      return "bg-orange-500";
    case "monitoring":
      return "bg-blue-400";
  }
}

// ── Duration helper ────────────────────────────────────────────
function formatDuration(start: string | undefined, end: string | undefined, t: TFunc): string {
  if (!start) return "—";
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const diffMin = Math.round((endMs - startMs) / 60000);
  if (diffMin < 1) return t("reports.duration_now");
  if (diffMin < 60) return `${diffMin} ${t("reports.duration_min")}`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)
    return `${diffH} ${t("reports.duration_h")} ${diffMin % 60} ${t("reports.duration_min")}`;
  const diffDays = Math.floor(diffH / 24);
  return `${diffDays} ${t("reports.duration_days")}`;
}

function timeAgo(date?: string, t?: TFunc): string {
  if (!date) return "—";
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return t?.("reports.duration_now") ?? "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffDays = Math.floor(diffH / 24);
  return `${diffDays}d`;
}

// ── Stats Bar ──────────────────────────────────────────────────
function StatsBar({ jobs, t }: { jobs: AgentJob[]; t: TFunc }) {
  const total = jobs.length;
  const completed = jobs.filter((j) => j.status === "completed").length;
  const active = jobs.filter((j) => j.status === "active" || j.status === "waiting").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const totalCost = jobs.reduce((sum, j) => sum + (j.cost ?? 0), 0);

  const stats = [
    {
      label: t("reports.total_jobs"),
      value: String(total),
      icon: FileText,
      color: "text-[color:var(--ds-text)]",
    },
    {
      label: t("reports.success_rate"),
      value: `${successRate}%`,
      icon: TrendingUp,
      color: "text-emerald-600",
    },
    {
      label: t("reports.active_now"),
      value: String(active),
      icon: Activity,
      color: "text-blue-600",
    },
    {
      label: t("reports.total_cost"),
      value: `$${totalCost.toFixed(2)}`,
      icon: Zap,
      color: "text-[color:var(--ds-text-muted)]",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.label}
            className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 shadow-[var(--card-shadow)]"
          >
            <div className="flex items-center gap-2">
              <Icon size={15} className={s.color} />
              <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                {s.label}
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-[color:var(--ds-text)] tabular-nums">
              {s.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Rundown Panel ──────────────────────────────────────────────
function RundownPanel({ t }: { t: TFunc }) {
  const rundownQuery = useRundown();
  const triggerMutation = useTriggerRundown();
  const jobs = rundownQuery.data ?? [];
  const latest = jobs[0];
  const isRunning = jobs.some((j) => j.status === "active" || j.status === "waiting");

  return (
    <div className="rounded-xl border border-[color:var(--brand-primary)]/20 bg-gradient-to-br from-[color:var(--brand-glow)] to-transparent p-5 shadow-[var(--card-shadow)] md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="brand-soft brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
            <Sparkles size={18} className="brand-text" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[color:var(--ds-text)]">
              {t("reports.rundown_title")}
            </h2>
            <p className="mt-0.5 text-sm text-[color:var(--ds-text-muted)]">
              {t("reports.rundown_desc")}
            </p>
            <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
              {isRunning ? t("reports.rundown_running") : t("reports.rundown_auto")}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="glow"
          onClick={() => triggerMutation.mutate()}
          disabled={triggerMutation.isPending || isRunning}
        >
          {triggerMutation.isPending || isRunning ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {triggerMutation.isPending || isRunning
            ? t("reports.btn_rundown_loading")
            : t("reports.btn_rundown")}
        </Button>
      </div>

      {/* Latest Rundown Result */}
      {latest && (
        <div className="mt-4 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4">
          <div className="mb-2 flex items-center gap-2">
            {statusIcon(latest.status)}
            <span className="text-sm font-semibold text-[color:var(--ds-text)]">
              {t("reports.rundown_latest")}
            </span>
            <span className="ml-auto text-xs text-[color:var(--ds-text-subtle)]">
              {timeAgo(latest.completedAt ?? latest.startedAt, t)}
            </span>
          </div>
          {latest.result ? (
            <div
              className="prose prose-sm max-w-none text-[color:var(--ds-text-muted)] [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-semibold [&_h3]:text-[color:var(--ds-text)] [&_li]:text-sm [&_li]:leading-relaxed [&_p]:text-sm [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-4"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(latest.result) }}
            />
          ) : (
            <p className="text-sm text-[color:var(--ds-text-subtle)]">
              {t("reports.rundown_none")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Report Row ─────────────────────────────────────────────────
function ReportRow({
  job,
  t,
  onReplay,
  onView,
  replaying,
}: {
  job: AgentJob;
  t: TFunc;
  onReplay: (id: number) => void;
  onView: (job: AgentJob) => void;
  replaying: boolean;
}) {
  const Icon = ROLE_ICONS[job.role] ?? Bot;
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-3 border-b border-[color:var(--ds-border)] px-4 py-3 last:border-b-0 hover:bg-[color:var(--ds-hover)]">
      {/* Role icon */}
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
        <Icon size={15} className="text-[color:var(--ds-text-muted)]" />
      </div>

      {/* Agent name + prompt */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[color:var(--ds-text)]">
            {roleLabel(job.role, t)}
          </span>
          <span className="font-mono text-xs text-[color:var(--ds-text-subtle)]">#{job.id}</span>
          {job.isRundown && (
            <span className="brand-soft brand-text brand-border rounded-full border px-1.5 py-0.5 text-xs font-semibold">
              Rundown
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-[color:var(--ds-text-muted)]">
          {job.result
            ? job.result
                .replace(/[#*\n]/g, " ")
                .trim()
                .slice(0, 120)
            : job.prompt.slice(0, 120)}
        </p>
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5">
        {statusIcon(job.status)}
        <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
          {statusLabel(job.status, t)}
        </span>
      </div>

      {/* Duration */}
      <span className="text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
        {formatDuration(job.startedAt, job.completedAt, t)}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {job.result && (
          <button
            onClick={() => onView(job)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            title={t("reports.btn_view")}
          >
            <Eye size={12} />
          </button>
        )}
        {(job.status === "completed" ||
          job.status === "failed" ||
          job.status === "partial_success") && (
          <button
            onClick={() => onReplay(job.id)}
            disabled={replaying}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] disabled:opacity-50"
            title={t("reports.btn_replay")}
          >
            {replaying ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Job Detail Modal ───────────────────────────────────────────
function JobDetailModal({ job, t, onClose }: { job: AgentJob; t: TFunc; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--ds-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            {statusIcon(job.status)}
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {roleLabel(job.role, t)}{" "}
              <span className="font-mono text-[color:var(--ds-text-subtle)]">#{job.id}</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--ds-text-muted)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Metadata bar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-5 py-2.5">
          <span className="flex items-center gap-1.5 text-xs text-[color:var(--ds-text-muted)]">
            {statusIcon(job.status)}
            {statusLabel(job.status, t)}
          </span>
          {job.model && (
            <span className="font-mono text-xs text-[color:var(--ds-text-muted)]">{job.model}</span>
          )}
          {job.tokens && (
            <span className="text-xs text-[color:var(--ds-text-muted)]">
              {job.tokens.input.toLocaleString()} in · {job.tokens.output.toLocaleString()} out
              {job.tokens.cache > 0 && ` · ${job.tokens.cache.toLocaleString()} cache`}
            </span>
          )}
          {job.cost !== undefined && job.cost > 0 && (
            <span className="text-xs text-[color:var(--ds-text-muted)]">
              ${job.cost.toFixed(4)}
            </span>
          )}
          <span className="ml-auto text-xs text-[color:var(--ds-text-subtle)]">
            {formatDuration(job.startedAt, job.completedAt, t)}
          </span>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {job.result ? (
            <div
              className="prose prose-sm max-w-none text-[color:var(--ds-text-muted)] [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-semibold [&_h3]:text-[color:var(--ds-text)] [&_li]:text-sm [&_li]:leading-relaxed [&_p]:text-sm [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-4"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(job.result) }}
            />
          ) : (
            <p className="text-sm text-[color:var(--ds-text-subtle)]">
              {job.status === "active" || job.status === "waiting"
                ? t("rundown.widget_loading")
                : t("reports.rundown_none")}
            </p>
          )}

          {/* Prompt (collapsible) */}
          <details className="mt-4 border-t border-[color:var(--ds-border)] pt-3">
            <summary className="cursor-pointer text-xs font-semibold tracking-wider text-[color:var(--ds-text-muted)] uppercase">
              Prompt
            </summary>
            <pre className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-[color:var(--ds-surface-2)] p-3 text-xs whitespace-pre-wrap text-[color:var(--ds-text-muted)]">
              {job.prompt}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}

// ── By Agent Group ─────────────────────────────────────────────
function ByAgentView({ jobs, t }: { jobs: AgentJob[]; t: TFunc }) {
  const grouped = useMemo(() => {
    const map = new Map<AgentRole, AgentJob[]>();
    for (const job of jobs) {
      const list = map.get(job.role) ?? [];
      list.push(job);
      map.set(job.role, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [jobs]);

  if (grouped.length === 0) {
    return <EmptyState t={t} variant="all" />;
  }

  return (
    <div className="space-y-4">
      {grouped.map(([role, roleJobs]) => {
        const Icon = ROLE_ICONS[role] ?? Bot;
        const completed = roleJobs.filter((j) => j.status === "completed").length;
        return (
          <div
            key={role}
            className="overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--card-shadow)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[color:var(--ds-border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <Icon size={16} className="text-[color:var(--ds-text-muted)]" />
                <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  {roleLabel(role, t)}
                </h3>
                <span className="rounded-full bg-[color:var(--ds-border)] px-2 py-0.5 text-xs text-[color:var(--ds-text-muted)]">
                  {roleJobs.length}
                </span>
              </div>
              <span className="text-xs text-[color:var(--ds-text-subtle)]">
                {completed}/{roleJobs.length} {t("agents.status_completed")}
              </span>
            </div>
            <div>
              {roleJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-3 border-b border-[color:var(--ds-border)] px-4 py-2.5 last:border-b-0"
                >
                  <div className={`h-2 w-2 shrink-0 rounded-full ${statusColor(job.status)}`} />
                  <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--ds-text)]">
                    {job.prompt}
                  </span>
                  <span className="text-xs text-[color:var(--ds-text-subtle)] tabular-nums">
                    {timeAgo(job.completedAt ?? job.startedAt, t)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────
function EmptyState({ t, variant }: { t: TFunc; variant: "all" | "failed" }) {
  return (
    <div className="py-16 text-center">
      <Bot size={32} className="mx-auto mb-3 text-[color:var(--ds-border)]" />
      <p className="text-sm text-[color:var(--ds-text-muted)]">
        {variant === "failed" ? t("reports.empty_failed") : t("reports.empty")}
      </p>
      {variant === "all" && (
        <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">{t("reports.empty_hint")}</p>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function ReportsPage() {
  const { t } = useLang();
  const [tab, setTab] = useState<"all" | "by_agent" | "recent" | "failed">("all");
  const agentsQuery = useAgents();
  const replayMutation = useReplayAgent();
  const [replayingId, setReplayingId] = useState<number | null>(null);
  const [viewJob, setViewJob] = useState<AgentJob | null>(null);

  const jobs = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);

  const filteredJobs = useMemo(() => {
    const sorted = [...jobs].sort((a, b) => {
      const aDate = new Date(a.completedAt ?? a.startedAt ?? 0).getTime();
      const bDate = new Date(b.completedAt ?? b.startedAt ?? 0).getTime();
      return bDate - aDate;
    });

    if (tab === "failed") return sorted.filter((j) => j.status === "failed");
    if (tab === "recent") return sorted.slice(0, 20);
    return sorted;
  }, [jobs, tab]);

  const tabs = [
    { id: "all" as const, label: t("reports.tab_all"), icon: FileText },
    { id: "by_agent" as const, label: t("reports.tab_by_agent"), icon: Cpu },
    { id: "recent" as const, label: t("reports.tab_recent"), icon: Activity },
    { id: "failed" as const, label: t("reports.tab_failed"), icon: AlertCircle },
  ];

  async function handleReplay(id: number) {
    setReplayingId(id);
    await replayMutation.mutateAsync(id);
    setReplayingId(null);
    agentsQuery.refetch();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[color:var(--ds-text)]">{t("reports.title")}</h1>
        <p className="mt-1 text-sm text-[color:var(--ds-text-muted)]">{t("reports.subtitle")}</p>
      </div>

      {/* Stats */}
      <StatsBar jobs={jobs} t={t} />

      {/* Rundown Panel */}
      <RundownPanel t={t} />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[color:var(--ds-border)]">
        {tabs.map((tabItem) => {
          const Icon = tabItem.icon;
          return (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-[border-color,color] duration-150",
                tab === tabItem.id
                  ? "brand-text border-[color:var(--brand-primary)]"
                  : "border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              )}
            >
              <Icon size={15} />
              {tabItem.label}
              {tabItem.id === "failed" && jobs.some((j) => j.status === "failed") && (
                <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-xs font-semibold text-red-600">
                  {jobs.filter((j) => j.status === "failed").length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {agentsQuery.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="brand-text animate-spin" />
        </div>
      ) : tab === "by_agent" ? (
        <ByAgentView jobs={jobs} t={t} />
      ) : filteredJobs.length === 0 ? (
        <EmptyState t={t} variant={tab === "failed" ? "failed" : "all"} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-[var(--card-shadow)]">
          {/* Column headers */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-3 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-4 py-2">
            <span className="w-8 text-xs font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
              {t("reports.col_agent")}
            </span>
            <span className="text-xs font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
              {t("reports.col_result")}
            </span>
            <span className="text-xs font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
              {t("reports.col_status")}
            </span>
            <span className="text-xs font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
              {t("reports.col_duration")}
            </span>
            <span className="w-7 text-xs font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
              {t("reports.col_actions")}
            </span>
          </div>
          {filteredJobs.map((job) => (
            <ReportRow
              key={job.id}
              job={job}
              t={t}
              onReplay={handleReplay}
              onView={setViewJob}
              replaying={replayingId === job.id}
            />
          ))}
        </div>
      )}

      {/* Job Detail Modal */}
      {viewJob && <JobDetailModal job={viewJob} t={t} onClose={() => setViewJob(null)} />}
    </div>
  );
}
