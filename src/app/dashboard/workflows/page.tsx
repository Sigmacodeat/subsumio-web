"use client";

import { useState, useMemo, useEffect } from "react";
import { useLang } from "@/lib/use-lang";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Pause,
  SkipForward,
  ArrowRight,
  FileText,
  CalendarClock,
  Send,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Info,
  Plus,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { usePages, useCreatePage } from "@/lib/queries/brain";
import { useMe } from "@/lib/queries/auth";
import { useRealtime, ensureRealtime } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import {
  WORKFLOW_TEMPLATES,
  getTemplate,
  buildWorkflowFrontmatter,
  buildWorkflowSlug,
  buildWorkflowTitle,
  getWorkflowProgress,
  getPendingApprovals,
  getStepStatusLabel,
  getWorkflowStatusLabel,
  getActionTypeLabel,
  fmToWorkflowInstance,
  filterWorkflows,
  sortWorkflowsByStartedAt,
  type WorkflowInstance,
  type WorkflowStep,
  type StepStatus,
  type WorkflowStatus,
} from "@/lib/workflow";
import type { ActionType } from "@/lib/approval";

// ── Icons for action types ────────────────────────────────────────────

const actionIcons: Record<ActionType, typeof FileText> = {
  document_finalize: FileText,
  deadline_create: CalendarClock,
  booking_create: BookOpen,
  message_send: Send,
  case_create: Plus,
  case_close: XCircle,
  invoice_create: BookOpen,
  client_message_send: Send,
  document_request_send: FileText,
  deadline_confirm: CalendarClock,
};

const stepStatusIcons: Record<StepStatus, typeof CheckCircle2> = {
  pending: Clock,
  running: Loader2,
  approved: CheckCircle2,
  rejected: XCircle,
  skipped: SkipForward,
};

const stepStatusColors: Record<StepStatus, string> = {
  pending: "text-[color:var(--ds-text-muted)]",
  running: "text-blue-500",
  approved: "text-emerald-600",
  rejected: "text-red-600",
  skipped: "text-[color:var(--ds-text-muted)]",
};

const workflowStatusBadge: Record<
  WorkflowStatus,
  { variant: "default" | "success" | "danger" | "warning" | "info"; icon: typeof Clock }
> = {
  running: { variant: "info", icon: Loader2 },
  completed: { variant: "success", icon: CheckCircle2 },
  failed: { variant: "danger", icon: XCircle },
  paused: { variant: "warning", icon: Pause },
};

// ── Page ──────────────────────────────────────────────────────────────

type FilterKey = "all" | "active" | "completed" | "failed";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "active", label: "Aktiv" },
  { key: "completed", label: "Abgeschlossen" },
  { key: "failed", label: "Fehler" },
];

export default function WorkflowsPage() {
  const { t } = useLang();
  const pagesQuery = usePages({ type: "workflow", limit: 200 });
  const meQuery = useMe();
  const createMutation = useCreatePage();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [caseSlug, setCaseSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // ── Realtime SSE: invalidate workflow list on any workflow event ──
  useEffect(() => {
    ensureRealtime();
  }, []);

  useRealtime("workflow.started", () => {
    queryClient.invalidateQueries({ queryKey: ["brain", "pages"] });
  });
  useRealtime("workflow.step_changed", () => {
    queryClient.invalidateQueries({ queryKey: ["brain", "pages"] });
  });
  useRealtime("workflow.completed", () => {
    queryClient.invalidateQueries({ queryKey: ["brain", "pages"] });
  });
  useRealtime("workflow.failed", () => {
    queryClient.invalidateQueries({ queryKey: ["brain", "pages"] });
  });

  const loading = pagesQuery.isLoading;
  const user = meQuery.data?.user?.email ?? meQuery.data?.user?.name ?? "unbekannt";

  const instances = useMemo<WorkflowInstance[]>(() => {
    const pages = pagesQuery.data;
    if (!Array.isArray(pages)) return [];
    const mapped = pages
      .map((p) => fmToWorkflowInstance(p))
      .filter((w): w is WorkflowInstance => w !== null);
    return sortWorkflowsByStartedAt(mapped);
  }, [pagesQuery.data]);

  const filtered = useMemo(() => filterWorkflows(instances, filter), [instances, filter]);

  const activeCount = instances.filter(
    (w) => w.frontmatter.status === "running" || w.frontmatter.status === "paused"
  ).length;

  async function handleStart(templateId: string) {
    const template = getTemplate(templateId);
    if (!template) return;

    setStarting(true);
    setError(null);
    try {
      const slug = buildWorkflowSlug(templateId);
      const prompt = customPrompt.trim() || template.prompt;
      const fm = buildWorkflowFrontmatter({
        template_id: templateId,
        prompt,
        started_by: user,
        case_slug: caseSlug.trim() || undefined,
      });

      await createMutation.mutateAsync({
        slug,
        title: buildWorkflowTitle(template),
        type: "workflow",
        frontmatter: fm,
      });

      setSelectedTemplate(null);
      setCustomPrompt("");
      setCaseSlug("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Workflow konnte nicht gestartet werden");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Workflows"
        description="Kanzlei-Workflows mit verketteten Aktionen und Vier-Augen-Freigabe"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Workflows" }]}
        actions={
          <button
            onClick={() => setSelectedTemplate("due_diligence")}
            className="brand-bg inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus size={16} />
            Neuer Workflow
          </button>
        }
      />

      {/* Honest framing */}
      <div
        className="brand-border brand-soft/5 flex items-start gap-3 rounded-xl border px-4 py-3"
        role="note"
      >
        <Info size={16} className="brand-text mt-0.5 shrink-0" aria-hidden="true" />
        <p className="brand-text/90 text-xs leading-relaxed">
          Workflows verketten Agenten-Aktionen (Dokumentanalyse, Fristnotierung, Versand) zu
          wiederkehrenden Kanzlei-Prozessen. Jede risikoreiche Aktion benötigt eine
          <strong> menschliche Freigabe</strong> — berufsrechtliche Letztverantwortung +
          EU-AI-Act-Aufsichtspflicht (Annex&nbsp;III).
        </p>
      </div>

      {error && (
        <div
          className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3"
          role="alert"
        >
          <AlertCircle size={16} className="shrink-0 text-red-600" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-600 hover:text-red-700"
          >
            <XCircle size={16} />
          </button>
        </div>
      )}

      {/* Template Gallery (shown when no instances or when explicitly starting) */}
      {(instances.length === 0 || selectedTemplate !== null) && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap size={14} className="brand-text" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
              {instances.length === 0 ? "Workflow-Templates" : "Workflow starten"}
            </h2>
          </div>

          {selectedTemplate ? (
            <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
              {(() => {
                const template = getTemplate(selectedTemplate);
                if (!template) return null;
                return (
                  <>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{template.icon}</span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                          {template.label}
                        </h3>
                        <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                          {template.description}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedTemplate(null);
                          setCustomPrompt("");
                          setCaseSlug("");
                        }}
                        className="text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                      >
                        Abbrechen
                      </button>
                    </div>

                    {/* Steps preview */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {template.steps.map((step, i) => {
                        const Icon = actionIcons[step.action_type];
                        return (
                          <div key={i} className="flex items-center gap-1">
                            {i > 0 && (
                              <ArrowRight size={12} className="text-[color:var(--ds-text-muted)]" />
                            )}
                            <Badge variant="default" className="gap-1 text-xs">
                              <Icon size={10} />
                              {step.label}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>

                    {/* Custom prompt */}
                    <div className="space-y-2">
                      <label
                        htmlFor="wf-prompt"
                        className="text-xs font-medium text-[color:var(--ds-text)]"
                      >
                        Aufgabe (optional anpassen)
                      </label>
                      <textarea
                        id="wf-prompt"
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        rows={3}
                        placeholder={template.prompt}
                        className="focus:brand-border/40 w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none"
                      />
                    </div>

                    {/* Case slug */}
                    <div className="space-y-2">
                      <label
                        htmlFor="wf-case"
                        className="text-xs font-medium text-[color:var(--ds-text)]"
                      >
                        Zugehörige Akte (optional)
                      </label>
                      <input
                        id="wf-case"
                        value={caseSlug}
                        onChange={(e) => setCaseSlug(e.target.value)}
                        placeholder="z.B. cases/2024-001"
                        className="focus:brand-border/40 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-2 font-mono text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none"
                      />
                    </div>

                    <button
                      onClick={() => handleStart(selectedTemplate)}
                      disabled={starting}
                      className="brand-bg inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {starting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Play size={16} />
                      )}
                      {starting ? "Starte..." : "Workflow starten"}
                    </button>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {WORKFLOW_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template.id)}
                  className="hover:brand-border hover:brand-soft/5 space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-left transition-all"
                >
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 text-xl">{template.icon}</span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                        {template.label}
                      </h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                        {template.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
                    <span>{template.steps.length} Schritte</span>
                    <span>·</span>
                    <span>
                      {template.steps
                        .map((s) => getActionTypeLabel(s.action_type))
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .join(", ")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Workflow List */}
      {instances.length > 0 && (
        <section className="space-y-3">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    filter === f.key
                      ? "brand-soft brand-text brand-border border"
                      : "border border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              <span className="text-xs text-[color:var(--ds-text-muted)]">{activeCount} aktiv</span>
            </div>
          </div>

          {loading ? (
            <div
              className="flex items-center justify-center py-20"
              role="status"
              aria-label={t("aria.loading")}
            >
              <Loader2 size={24} className="brand-text animate-spin" aria-hidden="true" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                Keine Workflows in diesem Filter.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((wf) => (
                <WorkflowCard
                  key={wf.slug}
                  instance={wf}
                  expanded={expandedSlug === wf.slug}
                  onToggle={() => setExpandedSlug((prev) => (prev === wf.slug ? null : wf.slug))}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ── WorkflowCard ──────────────────────────────────────────────────────

function WorkflowCard({
  instance,
  expanded,
  onToggle,
}: {
  instance: WorkflowInstance;
  expanded: boolean;
  onToggle: () => void;
}) {
  const fm = instance.frontmatter;
  const progress = getWorkflowProgress(fm.steps);
  const pendingApprovals = getPendingApprovals(fm.steps);
  const template = getTemplate(fm.template_id);
  const statusBadge = workflowStatusBadge[fm.status];
  const StatusIcon = statusBadge.icon;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-[color:var(--ds-surface)] transition-all",
        fm.status === "failed"
          ? "border-red-500/20"
          : fm.status === "completed"
            ? "border-emerald-500/20"
            : "border-[color:var(--ds-border)]"
      )}
    >
      {/* Header row */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-[color:var(--ds-surface-2)]/50"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown size={16} className="shrink-0 text-[color:var(--ds-text-muted)]" />
        ) : (
          <ChevronRight size={16} className="shrink-0 text-[color:var(--ds-text-muted)]" />
        )}

        <span className="shrink-0 text-lg">{template?.icon ?? "⚙️"}</span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
              {template?.label ?? fm.template_id}
            </span>
            <Badge variant={statusBadge.variant} className="gap-1 text-xs">
              <StatusIcon size={10} className={fm.status === "running" ? "animate-spin" : ""} />
              {getWorkflowStatusLabel(fm.status)}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-[color:var(--ds-text-muted)]">
            {fm.prompt || "Keine Beschreibung"}
          </p>
        </div>

        {/* Progress */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <div className="text-xs font-semibold text-[color:var(--ds-text)]">
              {progress.completed}/{progress.total}
            </div>
            <div className="text-xs text-[color:var(--ds-text-muted)]">Schritte</div>
          </div>
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)]">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                fm.status === "failed"
                  ? "bg-red-500"
                  : fm.status === "completed"
                    ? "bg-emerald-500"
                    : "brand-bg"
              )}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="space-y-3 border-t border-[color:var(--ds-border)] p-4">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-[color:var(--ds-text-muted)]">
            <span>
              Gestartet: {fm.started_at ? new Date(fm.started_at).toLocaleString("de-DE") : "—"}
            </span>
            <span>·</span>
            <span>Von: {fm.started_by}</span>
            {fm.case_slug && (
              <>
                <span>·</span>
                <a
                  href={`/dashboard/cases/${encodeURIComponent(fm.case_slug)}`}
                  className="brand-text font-mono hover:underline"
                >
                  {fm.case_slug}
                </a>
              </>
            )}
          </div>

          {/* Steps */}
          <div className="space-y-1.5">
            {fm.steps.map((step, i) => (
              <StepRow key={step.id} step={step} index={i} />
            ))}
          </div>

          {/* Pending approvals link */}
          {pendingApprovals.length > 0 && (
            <a
              href="/dashboard/approvals"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] px-3 py-1.5 text-xs text-amber-700 transition-colors hover:bg-amber-500/[0.08] dark:text-amber-400"
            >
              <Clock size={13} />
              {pendingApprovals.length} Freigabe{pendingApprovals.length > 1 ? "n" : ""} offen — zu
              den Freigaben
            </a>
          )}

          {/* Error display for failed steps */}
          {fm.steps
            .filter((s) => s.error)
            .map((s) => (
              <div
                key={`err-${s.id}`}
                className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2"
              >
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-600" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-red-700 dark:text-red-400">{s.label}</p>
                  <p className="mt-0.5 text-xs text-red-600/80">{s.error}</p>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ── StepRow ───────────────────────────────────────────────────────────

function StepRow({ step, index }: { step: WorkflowStep; index: number }) {
  const Icon = actionIcons[step.action_type];
  const StatusIcon = stepStatusIcons[step.status];
  const statusColor = stepStatusColors[step.status];

  return (
    <div className="flex items-center gap-3 rounded-lg bg-[color:var(--ds-surface-2)]/30 px-3 py-2">
      {/* Step number */}
      <span className="w-5 shrink-0 text-center font-mono text-xs text-[color:var(--ds-text-muted)]">
        {index + 1}
      </span>

      {/* Action icon */}
      <Icon size={14} className="shrink-0 text-[color:var(--ds-text-muted)]" />

      {/* Label + action type */}
      <div className="min-w-0 flex-1">
        <span className="text-sm text-[color:var(--ds-text)]">{step.label}</span>
        <span className="ml-2 text-xs text-[color:var(--ds-text-muted)]">
          {getActionTypeLabel(step.action_type)}
        </span>
      </div>

      {/* Status */}
      <div className={cn("flex shrink-0 items-center gap-1.5", statusColor)}>
        <StatusIcon size={13} className={step.status === "running" ? "animate-spin" : ""} />
        <span className="text-xs">{getStepStatusLabel(step.status)}</span>
      </div>

      {/* Link to agent_action if present */}
      {step.agent_action_slug && (
        <a
          href={`/dashboard/brain/${encodeURIComponent(step.agent_action_slug)}`}
          className="brand-text shrink-0 font-mono text-xs hover:underline"
          title="Agent-Action ansehen"
        >
          →
        </a>
      )}
    </div>
  );
}
