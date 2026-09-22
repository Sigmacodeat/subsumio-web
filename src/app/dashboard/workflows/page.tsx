"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
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
  Plus,
  Settings2,
  Zap,
  Search,
  ListChecks,
  Scale,
  ShieldCheck,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { usePages, useCreatePage } from "@/lib/queries/brain";
import { useMe } from "@/lib/queries/auth";
import { useRealtime, ensureRealtime } from "@/lib/realtime";
import { cn, encodeSlugPath, formatDateTime } from "@/lib/utils";
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
  time_entry_approval: Clock,
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
  running: "text-[color:var(--ds-info-text)]",
  approved: "text-[color:var(--ds-success-text)]",
  rejected: "text-[color:var(--ds-danger-text)]",
  skipped: "text-[color:var(--ds-text-muted)]",
};

const workflowStatusBadge: Record<
  WorkflowStatus,
  { variant: "default" | "success" | "danger" | "warning" | "info"; icon: typeof Clock }
> = {
  draft: { variant: "default", icon: Clock },
  running: { variant: "info", icon: Loader2 },
  completed: { variant: "success", icon: CheckCircle2 },
  failed: { variant: "danger", icon: XCircle },
  paused: { variant: "warning", icon: Pause },
};
const FALLBACK_STATUS_BADGE = workflowStatusBadge.draft;

// Symbole statt Emojis; anwaltliche Bezeichnungen statt der englischen Vorlagennamen.
const TEMPLATE_ICONS: Record<string, typeof FileText> = {
  due_diligence: Search,
  contract_review: ListChecks,
  litigation_prep: Scale,
  compliance_check: ShieldCheck,
  fristen_management: CalendarClock,
};
const TEMPLATE_LABELS: Record<string, string> = {
  due_diligence: "Due-Diligence-Prüfung",
  contract_review: "Vertragsprüfung",
  litigation_prep: "Prozessvorbereitung",
  compliance_check: "Compliance-Prüfung",
  fristen_management: "Fristenerfassung",
};
const STEP_LABELS: Record<string, string> = {
  "GoBD prüfen": "Aufbewahrungspflichten (BAO) prüfen",
};

function templateLabel(id: string, fallback?: string): string {
  return TEMPLATE_LABELS[id] ?? fallback ?? "Ablauf";
}
function stepLabel(label: string): string {
  return STEP_LABELS[label] ?? label;
}

// ── Page ──────────────────────────────────────────────────────────────

type FilterKey = "all" | "active" | "completed" | "failed";

export default function WorkflowsPage() {
  const { t } = useLang();
  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all", label: t("workflows.filter_all") },
    { key: "active", label: t("workflows.status_active") },
    { key: "completed", label: t("workflows.filter_completed") },
    { key: "failed", label: t("workflows.status_failed") },
  ];
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
  const [showPicker, setShowPicker] = useState(false);

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
  const user = meQuery.data?.user?.name ?? meQuery.data?.user?.email ?? "unbekannt";

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
      console.error("[workflows] start failed:", e instanceof Error ? e.message : String(e));
      setError("Der Ablauf konnte nicht gestartet werden. Bitte versuchen Sie es erneut.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="ds-page space-y-6 p-4 md:p-6 lg:p-8" data-tour="workflows-page">
      <div data-tour="workflows-intro">
        <PageHeader
          title={t("workflows.title")}
          description={t("workflows.desc")}
          breadcrumbs={[
            { label: t("breadcrumb.dashboard"), href: "/dashboard" },
            { label: t("workflows.breadcrumb") },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" className="gap-2 whitespace-nowrap" asChild>
                <Link href="/dashboard/workflows/builder">
                  <Settings2 size={16} aria-hidden="true" />
                  {t("workflows.builder.open")}
                </Link>
              </Button>
              <Button
                className="whitespace-nowrap"
                onClick={() => {
                  // Opens the template picker; the user chooses the kind of Ablauf.
                  setSelectedTemplate(null);
                  setShowPicker(true);
                }}
              >
                <Plus size={16} aria-hidden="true" />
                {t("workflows.new")}
              </Button>
            </div>
          }
        />
      </div>

      {error && (
        <div
          className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-3"
          role="alert"
        >
          <AlertCircle size={16} className="shrink-0 text-[color:var(--ds-danger-text)]" />
          <p className="text-sm text-[color:var(--ds-danger-text)]">{error}</p>
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto text-[color:var(--ds-danger-text)] hover:text-[color:var(--ds-danger-text)]"
            onClick={() => setError(null)}
            aria-label="Meldung schließen"
          >
            <X size={16} />
          </Button>
        </div>
      )}

      {/* Template Gallery (shown when no instances or when explicitly starting) */}
      {loading && <PageSkeleton rows={4} className="p-0" />}

      {!loading && pagesQuery.isError && (
        <EmptyState
          icon={AlertCircle}
          title="Abläufe konnten nicht geladen werden"
          description="Die Verbindung ist gerade gestört. Bitte versuchen Sie es in einigen Minuten erneut."
          actionLabel="Erneut laden"
          onAction={() => pagesQuery.refetch()}
        />
      )}

      {!loading &&
        !pagesQuery.isError &&
        (instances.length === 0 || selectedTemplate !== null || showPicker) && (
          <section className="space-y-3" data-tour="workflows-templates">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-semibold tracking-wide text-[color:var(--ds-text-subtle)] uppercase">
                  {t("workflows.templates")}
                </h2>
                {instances.length === 0 && (
                  <p className="mt-1 text-xs text-[color:var(--ds-text-muted)]">
                    Wählen Sie eine Vorlage. Jeder Schritt bleibt nachvollziehbar; Versand und
                    Fristeintrag laufen über Ihre Freigabe.
                  </p>
                )}
              </div>
              {showPicker && !selectedTemplate && instances.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setShowPicker(false)}>
                  {t("workflows.cancel")}
                </Button>
              )}
            </div>

            {selectedTemplate ? (
              <div className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-5">
                {(() => {
                  const template = getTemplate(selectedTemplate);
                  if (!template) return null;
                  return (
                    <>
                      <div className="flex items-start gap-3">
                        {(() => {
                          const TIcon = TEMPLATE_ICONS[template.id] ?? Zap;
                          return (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]">
                              <TIcon size={16} aria-hidden="true" />
                            </span>
                          );
                        })()}
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                            {templateLabel(template.id, template.label)}
                          </h3>
                          <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                            {template.description}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedTemplate(null);
                            setShowPicker(false);
                            setCustomPrompt("");
                            setCaseSlug("");
                          }}
                        >
                          {t("workflows.cancel")}
                        </Button>
                      </div>

                      {/* Steps preview */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {template.steps.map((step, i) => {
                          const Icon = actionIcons[step.action_type];
                          return (
                            <div key={i} className="flex items-center gap-1">
                              {i > 0 && (
                                <ArrowRight
                                  size={12}
                                  className="text-[color:var(--ds-text-muted)]"
                                />
                              )}
                              <Badge variant="default" className="gap-1 text-xs">
                                <Icon size={10} aria-hidden="true" />
                                {stepLabel(step.label)}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>

                      {/* Custom prompt */}
                      <div className="space-y-2">
                        <Label
                          htmlFor="wf-prompt"
                          className="text-xs font-medium text-[color:var(--ds-text)]"
                        >
                          {t("workflows.task_label")}
                        </Label>
                        <textarea
                          id="wf-prompt"
                          value={customPrompt}
                          onChange={(e) => setCustomPrompt(e.target.value)}
                          rows={3}
                          placeholder="Optional: besondere Hinweise für diesen Ablauf, z. B. Schwerpunkte oder Ausnahmen"
                          className="focus:brand-border/40 w-full resize-y rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-sm leading-relaxed text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
                        />
                      </div>

                      {/* Case slug */}
                      <div className="space-y-2">
                        <Label
                          htmlFor="wf-case"
                          className="text-xs font-medium text-[color:var(--ds-text)]"
                        >
                          {t("workflows.case_label")}
                        </Label>
                        <Input
                          id="wf-case"
                          value={caseSlug}
                          onChange={(e) => setCaseSlug(e.target.value)}
                          placeholder="Aktenzeichen oder Aktenkennung, z. B. legal/cases/2026-001"
                        />
                      </div>

                      <Button
                        onClick={async () => {
                          await handleStart(selectedTemplate);
                          setShowPicker(false);
                        }}
                        disabled={starting}
                      >
                        {starting ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Play size={16} />
                        )}
                        {starting ? t("workflows.starting") : t("workflows.start_button")}
                      </Button>
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
                    className="space-y-2 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-left transition-[background-color,border-color] duration-[var(--ds-duration-fast)] hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                  >
                    <div className="flex items-start gap-3">
                      {(() => {
                        const TIcon = TEMPLATE_ICONS[template.id] ?? Zap;
                        return (
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)]">
                            <TIcon size={15} aria-hidden="true" />
                          </span>
                        );
                      })()}
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                          {templateLabel(template.id, template.label)}
                        </h3>
                        <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                          {template.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pl-11 text-xs text-[color:var(--ds-text-muted)]">
                      <span className="min-w-0 leading-relaxed">
                        {template.steps.length} Schritte:{" "}
                        {template.steps.map((st) => stepLabel(st.label)).join(" → ")}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

      {/* Workflow List */}
      {!loading && instances.length > 0 && (
        <section className="space-y-3" data-tour="workflows-list">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-[var(--ds-duration-fast)] motion-reduce:transition-none",
                    filter === f.key
                      ? "brand-soft brand-text brand-border border"
                      : "border border-transparent text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {activeCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--ds-info-solid)]" />
                <span className="text-xs text-[color:var(--ds-text-muted)]">
                  {activeCount} {activeCount === 1 ? "Ablauf läuft" : "Abläufe laufen"}
                </span>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[color:var(--ds-border-strong)] py-10 text-center">
              <p className="text-sm text-[color:var(--ds-text-muted)]">
                Keine Abläufe mit diesem Status.
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
  const { t } = useLang();
  const fm = instance.frontmatter;
  const progress = getWorkflowProgress(fm.steps);
  const pendingApprovals = getPendingApprovals(fm.steps);
  const template = getTemplate(fm.template_id);
  // Seeded/legacy pages may carry a status the badge map does not know;
  // never let a data value crash the whole page.
  const statusBadge = workflowStatusBadge[fm.status] ?? FALLBACK_STATUS_BADGE;
  const StatusIcon = statusBadge.icon;
  const TIcon = TEMPLATE_ICONS[fm.template_id] ?? Zap;
  // The stored prompt is an instruction to the assistant; show the template's
  // description unless the user wrote their own task.
  const summary = template?.description || fm.prompt || t("workflows.empty_description");
  const customPrompt = template && fm.prompt && fm.prompt !== template.prompt ? fm.prompt : null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-[color:var(--ds-surface)] transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
        fm.status === "failed"
          ? "border-[color:var(--ds-danger-border)]"
          : fm.status === "completed"
            ? "border-[color:var(--ds-success-border)]"
            : "border-[color:var(--ds-border)]"
      )}
    >
      {/* Header row */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left transition-[background-color] duration-[var(--ds-duration-fast)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown size={16} className="shrink-0 text-[color:var(--ds-text-muted)]" />
        ) : (
          <ChevronRight size={16} className="shrink-0 text-[color:var(--ds-text-muted)]" />
        )}

        <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)] sm:flex">
          <TIcon size={15} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-[color:var(--ds-text)]">
              {templateLabel(fm.template_id, template?.label)}
            </span>
            <Badge variant={statusBadge.variant} className="gap-1 text-xs">
              <StatusIcon size={10} className={fm.status === "running" ? "animate-spin" : ""} />
              {getWorkflowStatusLabel(fm.status)}
            </Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-[color:var(--ds-text-muted)]">{summary}</p>
        </div>

        {/* Progress */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <div className="text-xs font-semibold whitespace-nowrap text-[color:var(--ds-text)] tabular-nums">
              {progress.completed} von {progress.total}
            </div>
            <div className="text-xs text-[color:var(--ds-text-muted)]">Schritten</div>
          </div>
          <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[color:var(--ds-surface-2)] sm:block">
            <div
              className={cn(
                "h-full rounded-full transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ds-duration-normal)] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                fm.status === "failed"
                  ? "bg-[color:var(--ds-danger-solid)]"
                  : fm.status === "completed"
                    ? "bg-[color:var(--ds-success-solid)]"
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
            <span className="tabular-nums">Gestartet: {formatDateTime(fm.started_at)}</span>
            {fm.started_by && (
              <>
                <span aria-hidden="true">·</span>
                <span>von {fm.started_by}</span>
              </>
            )}
            {fm.case_slug && (
              <>
                <span aria-hidden="true">·</span>
                <Link
                  href={`/dashboard/cases/${encodeSlugPath(fm.case_slug)}`}
                  className="brand-text hover:underline"
                >
                  Zur Akte
                </Link>
              </>
            )}
          </div>

          {customPrompt && (
            <p className="text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              <span className="font-medium text-[color:var(--ds-text)]">Aufgabe: </span>
              {customPrompt}
            </p>
          )}

          {/* Steps */}
          <div className="space-y-1.5">
            {fm.steps.map((step, i) => (
              <StepRow key={step.id} step={step} index={i} />
            ))}
          </div>

          {/* Pending approvals link */}
          {pendingApprovals.length > 0 && (
            <Link
              href="/dashboard/approvals"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-warning-border)] bg-[color:var(--ds-warning-bg)] px-3 py-1.5 text-xs text-[color:var(--ds-warning-text)] transition-[background-color] duration-[var(--ds-duration-fast)] hover:opacity-90 motion-reduce:transition-none"
            >
              <Clock size={13} aria-hidden="true" />
              {pendingApprovals.length} {pendingApprovals.length > 1 ? "Freigaben" : "Freigabe"}{" "}
              offen — zu den Freigaben
            </Link>
          )}

          {/* Error display for failed steps */}
          {fm.steps
            .filter((s) => s.error)
            .map((s) => (
              <div
                key={`err-${s.id}`}
                className="flex items-start gap-2 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2"
              >
                <AlertCircle
                  size={14}
                  className="mt-0.5 shrink-0 text-[color:var(--ds-danger-text)]"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[color:var(--ds-danger-text)]">
                    {stepLabel(s.label)}: Schritt nicht abgeschlossen
                  </p>
                  <p className="mt-0.5 text-xs text-[color:var(--ds-danger-text)]">
                    Bitte prüfen Sie den Schritt und starten Sie den Ablauf bei Bedarf neu.
                  </p>
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
      <span className="w-5 shrink-0 text-center text-xs text-[color:var(--ds-text-muted)] tabular-nums">
        {index + 1}
      </span>

      {/* Action icon */}
      <Icon size={14} className="shrink-0 text-[color:var(--ds-text-muted)]" aria-hidden="true" />

      {/* Label + action type */}
      <div className="min-w-0 flex-1">
        <span className="text-sm text-[color:var(--ds-text)]">{stepLabel(step.label)}</span>
      </div>

      {/* Status */}
      <div className={cn("flex shrink-0 items-center gap-1.5", statusColor)}>
        <StatusIcon size={13} className={step.status === "running" ? "animate-spin" : ""} />
        <span className="text-xs">{getStepStatusLabel(step.status)}</span>
      </div>

      {/* Link to agent_action if present */}
      {step.agent_action_slug && (
        <Link
          href={`/dashboard/brain/${encodeURIComponent(step.agent_action_slug)}`}
          className="brand-text shrink-0 text-xs whitespace-nowrap hover:underline"
        >
          Ergebnis ansehen
        </Link>
      )}
    </div>
  );
}
