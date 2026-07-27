"use client";

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
  in_progress: { icon: Loader2, color: "text-blue-600", spin: true },
  completed: { icon: Check, color: "text-emerald-600" },
  skipped: { icon: SkipForward, color: "text-[color:var(--ds-text-subtle)]" },
  blocked: { icon: AlertCircle, color: "text-red-600" },
};

const STATUS_LABELS_DE = {
  pending: "Ausstehend",
  in_progress: "In Bearbeitung",
  completed: "Erledigt",
  skipped: "Übersprungen",
  blocked: "Blockiert",
};

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
              onClick={onClose}
              className="rounded p-1 text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-500/20 bg-red-500/5 px-2 py-1 text-[10px] text-red-600">
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
                "rounded border px-2 py-1 text-[11px] transition-colors",
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
                : "Was möchtest du planen? z.B. 'Vorbereitung der mündlichen Verhandlung am 15.08.2026'"
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
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
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
                        <div className="mt-1 flex items-center gap-1">
                          <button
                            onClick={() => handleStepUpdate(step.id, "completed")}
                            className="flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-1 text-[10px] font-medium text-emerald-600 hover:bg-emerald-500/20"
                          >
                            <Check size={11} />
                            {isEn ? "Done" : "Fertig"}
                          </button>
                          {step.status !== "in_progress" && (
                            <button
                              onClick={() => handleStepUpdate(step.id, "in_progress")}
                              className="flex items-center gap-1 rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-1 text-[10px] font-medium text-blue-600 hover:bg-blue-500/20"
                            >
                              {isEn ? "Start" : "Starten"}
                            </button>
                          )}
                          <button
                            onClick={() => handleStepUpdate(step.id, "skipped")}
                            className="flex items-center gap-1 rounded border border-[color:var(--ds-border)] px-1.5 py-1 text-[10px] font-medium text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
                          >
                            <SkipForward size={11} />
                          </button>
                        </div>
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
                className="text-[10px] text-[color:var(--ds-text-subtle)] hover:text-red-600"
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
