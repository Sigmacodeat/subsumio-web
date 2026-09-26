"use client";

// grounding-exempt: renders copilot plan steps and tool proposals (operational
// metadata: tool id, params, rationale) — no legal analysis or citations.

import { useState, useEffect, useCallback } from "react";
import {
  ListChecks,
  X,
  Loader2,
  Check,
  Circle,
  Clock,
  SkipForward,
  AlertCircle,
  Plus,
  RefreshCw,
  Send,
  ChevronRight,
} from "lucide-react";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import { cn } from "@/lib/utils";

interface PlanStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "skipped" | "blocked";
  estimatedTime?: string;
  notes?: string;
  completedAt?: string;
  suggested_tool?: string;
  suggested_params?: Record<string, unknown>;
  executed_tool?: string;
  executed_at?: string;
}

interface StepProposal {
  stepId: string;
  tool: string | null;
  params: Record<string, unknown>;
  rationale: string;
}

interface PlanningSession {
  id: string;
  title: string;
  goal: string;
  caseSlug?: string;
  status: "drafting" | "active" | "completed" | "abandoned";
  steps: PlanStep[];
  currentStepIndex: number;
  conversationTurns: number;
  createdAt: string;
  updatedAt: string;
}

interface PlanningModePanelProps {
  caseSlug?: string;
  onClose?: () => void;
}

const STEP_ICONS: Record<
  PlanStep["status"],
  { icon: typeof Circle; color: string; spin?: boolean }
> = {
  pending: { icon: Circle, color: "text-[color:var(--ds-text-subtle)]" },
  in_progress: { icon: Loader2, color: "text-[color:var(--ds-info-text)]", spin: true },
  completed: { icon: Check, color: "text-[color:var(--ds-success-text)]" },
  skipped: { icon: SkipForward, color: "text-[color:var(--ds-text-subtle)]" },
  blocked: { icon: AlertCircle, color: "text-[color:var(--ds-danger-text)]" },
};

const _STATUS_LABELS_DE = {
  pending: "Ausstehend",
  in_progress: "In Bearbeitung",
  completed: "Erledigt",
  skipped: "Übersprungen",
  blocked: "Blockiert",
};

/**
 * The parameters a proposed action will run with, in readable size and in
 * full — the user confirms exactly what is shown here, so nothing may be cut
 * off or squeezed into unreadable raw JSON.
 */
export function ProposalParams({ params }: { params: Record<string, unknown> }) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  return (
    <dl className="mt-1 max-h-72 space-y-1 overflow-y-auto rounded bg-[color:var(--ds-surface)] p-1.5 text-xs text-[color:var(--ds-text)]">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="font-medium text-[color:var(--ds-text-muted)]">
            {key.replace(/_/g, " ")}
          </dt>
          <dd className="break-words whitespace-pre-wrap">
            {Array.isArray(value) ? (
              <ul className="list-disc pl-4">
                {value.map((v, i) => (
                  <li key={i}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</li>
                ))}
              </ul>
            ) : typeof value === "object" ? (
              JSON.stringify(value, null, 2)
            ) : (
              String(value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PlanningModePanel({ caseSlug, onClose }: PlanningModePanelProps) {
  const { lang } = useLang();
  const isEn = lang === "en";
  const [plans, setPlans] = useState<PlanningSession[]>([]);
  const [activePlan, setActivePlan] = useState<PlanningSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [goal, setGoal] = useState("");
  const [feedback, setFeedback] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showRefine, setShowRefine] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<StepProposal | null>(null);
  const [proposing, setProposing] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await csrfFetch(`/api/copilot/plan?caseSlug=${caseSlug ?? ""}`, {
        method: "GET",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const activePlans = (data.plans as PlanningSession[]).filter((p) => p.status !== "abandoned");
      setPlans(activePlans);
      if (activePlans.length > 0 && !activePlan) {
        setActivePlan(activePlans[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [caseSlug, activePlan]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const handleCreate = async () => {
    if (!goal.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/copilot/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", goal, caseSlug }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setActivePlan(data.plan);
      setPlans((prev) => [data.plan, ...prev]);
      setGoal("");
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleRefine = async () => {
    if (!activePlan || !feedback.trim()) return;
    setRefining(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/copilot/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refine", planId: activePlan.id, feedback }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setActivePlan(data.plan);
      setPlans((prev) => prev.map((p) => (p.id === data.plan.id ? data.plan : p)));
      setFeedback("");
      setShowRefine(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefining(false);
    }
  };

  const handleStepUpdate = async (stepId: string, status: PlanStep["status"]) => {
    if (!activePlan) return;
    try {
      await csrfFetch("/api/copilot/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: activePlan.id, stepId, status }),
      });
      // Update local state
      const updatedSteps = activePlan.steps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              status,
              completedAt: status === "completed" ? new Date().toISOString() : s.completedAt,
            }
          : s
      );
      const allDone = updatedSteps.every((s) => s.status === "completed" || s.status === "skipped");
      const nextIncomplete = updatedSteps.findIndex(
        (s) => s.status === "pending" || s.status === "in_progress"
      );
      const updated = {
        ...activePlan,
        steps: updatedSteps,
        currentStepIndex: nextIncomplete >= 0 ? nextIncomplete : activePlan.currentStepIndex,
        status: allDone ? ("completed" as const) : activePlan.status,
      };
      setActivePlan(updated);
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch {
      // Non-blocking
    }
  };

  const handlePropose = async (stepId: string) => {
    if (!activePlan) return;
    setProposing(stepId);
    setError(null);
    setProposal(null);
    try {
      const res = await csrfFetch("/api/copilot/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "propose", planId: activePlan.id, stepId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProposal({ stepId, ...data.proposal });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProposing(null);
    }
  };

  const handleExecuteProposal = async () => {
    if (!activePlan || !proposal?.tool) return;
    setExecuting(true);
    setError(null);
    try {
      // Confirmation flow: mutating tools require a server-issued token
      // bound to exactly these params (lib/copilot-confirmation.ts).
      let confirmation: string | undefined;
      const prep = await csrfFetch("/api/copilot/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: proposal.tool,
          params: proposal.params,
          mode: "prepare",
        }),
      });
      if (prep.ok) {
        const prepData = await prep.json();
        confirmation = prepData.confirmation;
      }
      const res = await csrfFetch("/api/copilot/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: proposal.tool,
          params: proposal.params,
          mode: "execute",
          ...(confirmation ? { confirmation } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const summary =
        data.display?.message ??
        data.display?.title ??
        (isEn ? "Tool executed" : "Tool ausgeführt");
      await csrfFetch("/api/copilot/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "executed",
          planId: activePlan.id,
          stepId: proposal.stepId,
          tool: proposal.tool,
          resultSummary: summary,
        }),
      });
      setProposal(null);
      await loadPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  };

  const handleAbandon = async () => {
    if (!activePlan) return;
    try {
      await csrfFetch("/api/copilot/plan", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: activePlan.id }),
      });
      setPlans((prev) => prev.filter((p) => p.id !== activePlan.id));
      setActivePlan(null);
    } catch {
      // Non-blocking
    }
  };

  const completedCount = activePlan?.steps.filter((s) => s.status === "completed").length ?? 0;
  const totalCount = activePlan?.steps.length ?? 0;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-2.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks size={14} className="text-[color:var(--brand-primary)]" />
          <span className="text-xs font-semibold text-[color:var(--ds-text)]">
            {isEn ? "Planning Mode" : "Planungs-Modus"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {activePlan && (
            <button
              onClick={() => setShowRefine((v) => !v)}
              className="rounded p-1 text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              title={isEn ? "Refine plan" : "Plan anpassen"}
            >
              <RefreshCw size={13} />
            </button>
          )}
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="rounded p-1 text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            title={isEn ? "New plan" : "Neuer Plan"}
          >
            <Plus size={14} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={isEn ? "Close" : "Schließen"}
              className="rounded p-1 text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-2 py-1 text-[10px] text-[color:var(--ds-danger-text)]">
          {error}
        </div>
      )}

      {/* Plan selector */}
      {plans.length > 1 && !showCreate && (
        <div className="flex flex-wrap gap-1">
          {plans.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePlan(p)}
              className={cn(
                "rounded border px-2 py-1 text-[11px] transition-[background-color,border-color,color] active:scale-[0.99] motion-reduce:transition-none",
                activePlan?.id === p.id
                  ? "brand-border brand-soft brand-text"
                  : "border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
              )}
            >
              {p.title.slice(0, 30)}
            </button>
          ))}
        </div>
      )}

      {/* Create new plan */}
      {showCreate && (
        <div className="space-y-2 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] p-2">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder={
              isEn
                ? "What do you want to plan? e.g. 'Prepare for the hearing on 2026-08-15'"
                : "Was möchten Sie planen? z.B. 'Vorbereitung der mündlichen Verhandlung am 15.08.2026'"
            }
            rows={2}
            className="w-full rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1.5 text-[11px] text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => setShowCreate(false)}
              className="rounded px-1.5 py-0.5 text-[10px] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            >
              {isEn ? "Cancel" : "Abbrechen"}
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !goal.trim()}
              className="brand-bg flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-white disabled:opacity-50"
            >
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {isEn ? "Create" : "Erstellen"}
            </button>
          </div>
        </div>
      )}

      {/* Refine plan */}
      {showRefine && activePlan && (
        <div className="space-y-2 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] p-2">
          <p className="text-[10px] text-[color:var(--ds-text-muted)]">
            {isEn
              ? "Tell the AI how to adjust the plan:"
              : "Sag der AI, wie der Plan angepasst werden soll:"}
          </p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={
              isEn
                ? "e.g. 'Add a step for evidence collection'"
                : "z.B. 'Füge einen Schritt für Beweissicherung hinzu'"
            }
            rows={2}
            className="w-full rounded border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1.5 text-[11px] text-[color:var(--ds-text)] focus:border-[color:var(--brand-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => setShowRefine(false)}
              className="rounded px-1.5 py-0.5 text-[10px] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
            >
              {isEn ? "Cancel" : "Abbrechen"}
            </button>
            <button
              onClick={handleRefine}
              disabled={refining || !feedback.trim()}
              className="brand-bg flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-white disabled:opacity-50"
            >
              {refining ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {isEn ? "Refine" : "Anpassen"}
            </button>
          </div>
        </div>
      )}

      {/* Active plan display */}
      {loading ? (
        <div className="flex items-center gap-2 py-3" role="status" aria-live="polite">
          <Loader2 size={12} className="animate-spin text-[color:var(--brand-primary)]" />
          <span className="text-[10px] text-[color:var(--ds-text-muted)]">
            {isEn ? "Loading plans..." : "Pläne werden geladen..."}
          </span>
        </div>
      ) : activePlan ? (
        <div className="space-y-2">
          {/* Plan title & progress */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-[color:var(--ds-text)]">
                {activePlan.title}
              </span>
              <span className="text-[9px] text-[color:var(--ds-text-subtle)]">
                {completedCount}/{totalCount}
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-[color:var(--ds-border)]">
              <div
                className="h-full rounded-full bg-[color:var(--ds-success-solid)] transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--ds-duration-normal)] motion-reduce:transition-none"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-1">
            {activePlan.steps.map((step, idx) => {
              const stepIcon = STEP_ICONS[step.status];
              const StepIcon = stepIcon.icon;
              const isCurrent = idx === activePlan.currentStepIndex && step.status !== "completed";
              return (
                <div
                  key={step.id}
                  className={cn(
                    "rounded-md border p-1.5",
                    isCurrent
                      ? "brand-border bg-[color:var(--ds-hover)]"
                      : "border-[color:var(--ds-border)]",
                    step.status === "completed" && "opacity-60"
                  )}
                >
                  <div className="flex items-start gap-1.5">
                    <div className="mt-0.5 shrink-0">
                      <StepIcon
                        size={11}
                        className={cn(stepIcon.color, stepIcon.spin && "animate-spin")}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-medium text-[color:var(--ds-text)]">
                          {idx + 1}. {step.title}
                        </span>
                        {isCurrent && (
                          <ChevronRight
                            size={9}
                            className="shrink-0 text-[color:var(--brand-primary)]"
                          />
                        )}
                      </div>
                      <p className="mt-0.5 text-[9px] leading-relaxed text-[color:var(--ds-text-muted)]">
                        {step.description}
                      </p>
                      {step.estimatedTime && (
                        <span className="mt-0.5 flex items-center gap-0.5 text-[8px] text-[color:var(--ds-text-subtle)]">
                          <Clock size={7} />
                          {step.estimatedTime}
                        </span>
                      )}
                      {/* Action buttons */}
                      {step.status !== "completed" && step.status !== "skipped" && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <button
                            onClick={() => handleStepUpdate(step.id, "completed")}
                            className="flex items-center gap-1 rounded border border-[color:var(--ds-success-border)] bg-[color:var(--ds-success-bg)] px-1.5 py-1 text-[10px] font-medium text-[color:var(--ds-success-text)] hover:bg-[color:var(--ds-success-bg)]"
                          >
                            <Check size={11} />
                            {isEn ? "Done" : "Fertig"}
                          </button>
                          {step.status !== "in_progress" && (
                            <button
                              onClick={() => handleStepUpdate(step.id, "in_progress")}
                              className="flex items-center gap-1 rounded border border-[color:var(--ds-info-border)] bg-[color:var(--ds-info-bg)] px-1.5 py-1 text-[10px] font-medium text-[color:var(--ds-info-text)] hover:bg-[color:var(--ds-info-bg)]"
                            >
                              {isEn ? "Start" : "Starten"}
                            </button>
                          )}
                          <button
                            onClick={() => handleStepUpdate(step.id, "skipped")}
                            className="flex items-center gap-1 rounded border border-[color:var(--ds-border)] px-1.5 py-1 text-[10px] font-medium text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                            aria-label={isEn ? "Skip step" : "Schritt überspringen"}
                          >
                            <SkipForward size={11} />
                          </button>
                          <button
                            onClick={() => handlePropose(step.id)}
                            disabled={proposing === step.id}
                            className="brand-soft brand-text flex items-center gap-1 rounded border border-[color:var(--ds-border)] px-1.5 py-1 text-[10px] font-medium disabled:opacity-50"
                            title={
                              isEn
                                ? "Let Copilot propose a tool for this step"
                                : "Copilot schlägt ein Werkzeug für diesen Schritt vor"
                            }
                          >
                            {proposing === step.id ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <Send size={11} />
                            )}
                            {isEn ? "Run with AI" : "Mit KI ausführen"}
                          </button>
                        </div>
                      )}
                      {/* Tool proposal card (WP-5.24) */}
                      {proposal?.stepId === step.id && (
                        <div className="mt-1.5 rounded-md border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] p-1.5">
                          {proposal.tool ? (
                            <>
                              <p className="text-[10px] font-medium text-[color:var(--ds-text)]">
                                {isEn ? "Proposed action" : "Vorgeschlagene Aktion"}:{" "}
                                <code className="font-[family-name:var(--font-jetbrains)] text-[9px] text-[color:var(--brand-primary)]">
                                  {proposal.tool}
                                </code>
                              </p>
                              {proposal.rationale && (
                                <p className="mt-0.5 text-[9px] text-[color:var(--ds-text-muted)]">
                                  {proposal.rationale}
                                </p>
                              )}
                              {Object.keys(proposal.params).length > 0 && (
                                <ProposalParams params={proposal.params} />
                              )}
                              <div className="mt-1 flex items-center gap-1">
                                <button
                                  onClick={handleExecuteProposal}
                                  disabled={executing}
                                  className="brand-bg flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
                                >
                                  {executing ? (
                                    <Loader2 size={10} className="animate-spin" />
                                  ) : (
                                    <Check size={10} />
                                  )}
                                  {isEn ? "Confirm & run" : "Bestätigen & ausführen"}
                                </button>
                                <button
                                  onClick={() => setProposal(null)}
                                  className="rounded px-1.5 py-0.5 text-[10px] text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                                >
                                  {isEn ? "Dismiss" : "Verwerfen"}
                                </button>
                              </div>
                            </>
                          ) : (
                            <p className="text-[10px] text-[color:var(--ds-text-muted)]">
                              {isEn
                                ? "No tool fits this step — it needs manual work."
                                : "Kein Werkzeug passt — dieser Schritt ist manuell."}
                            </p>
                          )}
                        </div>
                      )}
                      {step.executed_tool && (
                        <span className="mt-0.5 inline-flex items-center gap-0.5 rounded bg-[color:var(--ds-hover)] px-1 py-px font-[family-name:var(--font-jetbrains)] text-[8px] text-[color:var(--ds-text-subtle)]">
                          ⚙ {step.executed_tool}
                        </span>
                      )}
                      {step.status === "completed" && (
                        <button
                          onClick={() => handleStepUpdate(step.id, "pending")}
                          className="mt-1 text-[10px] text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)]"
                        >
                          {isEn ? "Reopen" : "Wieder öffnen"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Plan status footer */}
          <div className="flex items-center justify-between border-t border-[color:var(--ds-border)] pt-1.5">
            <span className="text-[10px] text-[color:var(--ds-text-subtle)]">
              {activePlan.status === "completed"
                ? isEn
                  ? "✓ Plan completed"
                  : "✓ Plan abgeschlossen"
                : `${activePlan.conversationTurns} ${isEn ? "turns" : "Runden"}`}
            </span>
            {activePlan.status !== "completed" && (
              <button
                onClick={handleAbandon}
                className="text-[10px] text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-danger-text)]"
              >
                {isEn ? "Abandon" : "Verwerfen"}
              </button>
            )}
          </div>
        </div>
      ) : !showCreate ? (
        <div className="py-3 text-center">
          <p className="text-[10px] text-[color:var(--ds-text-muted)]">
            {isEn
              ? "No active plans. Click + to create one."
              : "Keine aktiven Pläne. Klicke + um einen zu erstellen."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
