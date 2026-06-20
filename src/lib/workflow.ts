/**
 * Workflow Engine — Kanzlei-Workflows als verkettete Agenten-Aktionen.
 *
 * Ein Workflow ist eine Brain-Page (type="workflow") mit einer Liste von
 * Steps. Jeder Step referenziert ein ActionType aus approval.ts und
 * durchläuft den Status pending → running → approved/rejected.
 *
 * Templates sind vorgefertigte Kanzlei-Workflows (Due Diligence,
 * Vertrags-Review, etc.), die aus der Gallery gestartet werden.
 *
 * Architektur: Thin Client — diese Lib definiert Types, Templates und
 * Helper. Die eigentliche Ausführung erfolgt über Brain-Pages.
 */

import type { ActionType } from "@/lib/approval";
import { ACTION_LABELS } from "@/lib/approval";

// ── Types ─────────────────────────────────────────────────────────────

export type WorkflowStatus = "running" | "completed" | "failed" | "paused";

export type StepStatus =
  | "pending"
  | "running"
  | "approved"
  | "rejected"
  | "skipped";

export interface WorkflowStep {
  id: string;
  label: string;
  action_type: ActionType;
  status: StepStatus;
  agent_action_slug?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
}

export interface WorkflowFrontmatter {
  type: "workflow";
  template_id: string;
  status: WorkflowStatus;
  prompt: string;
  case_slug?: string;
  steps: WorkflowStep[];
  started_at: string;
  completed_at?: string;
  started_by: string;
}

export interface WorkflowInstance {
  slug: string;
  title: string;
  frontmatter: WorkflowFrontmatter;
}

// ── Templates ─────────────────────────────────────────────────────────

export interface WorkflowTemplate {
  id: string;
  label: string;
  description: string;
  icon: string;
  prompt: string;
  steps: Array<{
    label: string;
    action_type: ActionType;
  }>;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "due_diligence",
    label: "Due Diligence",
    description: "Risikoprüfung aller Verträge und Dokumente einer Akte",
    icon: "🔍",
    prompt:
      "Führe eine Due Diligence Prüfung durch. Identifiziere Risiken, Haftungsklauseln, fehlende Standardklauseln und bewerte den Gesamtrisiko-Score.",
    steps: [
      { label: "Dokumente sammeln", action_type: "document_finalize" },
      { label: "Risiken identifizieren", action_type: "document_finalize" },
      { label: "Bericht erstellen", action_type: "document_finalize" },
    ],
  },
  {
    id: "contract_review",
    label: "Vertrags-Review",
    description: "Klauselmatrix, rote Flaggen und Änderungsvorschläge",
    icon: "📋",
    prompt:
      "Analysiere alle Verträge nach deutschem Recht. Erstelle eine Klauselmatrix, identifiziere rote Flaggen, und empfehle konkrete Änderungen.",
    steps: [
      { label: "Verträge analysieren", action_type: "document_finalize" },
      { label: "Klauselmatrix erstellen", action_type: "document_finalize" },
      { label: "Änderungen vorschlagen", action_type: "document_finalize" },
    ],
  },
  {
    id: "litigation_prep",
    label: "Litigation Prep",
    description: "Sachverhalt, Gesetze, Präzedenzfälle, Beweisstrategie",
    icon: "⚖️",
    prompt:
      "Bereite die Litigation vor. Analysiere den Sachverhalt, identifiziere relevante Gesetze und Präzedenzfälle, erstelle eine Chancen-Risiko-Bewertung.",
    steps: [
      { label: "Sachverhalt analysieren", action_type: "document_finalize" },
      { label: "Rechtslage prüfen", action_type: "document_finalize" },
      { label: "Fristen notieren", action_type: "deadline_create" },
      { label: "Beweisstrategie erstellen", action_type: "document_finalize" },
    ],
  },
  {
    id: "compliance_check",
    label: "Compliance-Check",
    description: "DSGVO, GwG, GoBD — Handlungsbedarf mit Priorisierung",
    icon: "✅",
    prompt:
      "Führe einen vollständigen Compliance-Check durch. Prüfe DSGVO-Konformität, GwG-Vorgaben, GOBD-Anforderungen, und identifiziere Handlungsbedarf.",
    steps: [
      { label: "DSGVO prüfen", action_type: "document_finalize" },
      { label: "GwG prüfen", action_type: "document_finalize" },
      { label: "GoBD prüfen", action_type: "document_finalize" },
      { label: "Bericht versenden", action_type: "message_send" },
    ],
  },
  {
    id: "fristen_management",
    label: "Fristen-Management",
    description: "Alle Fristen einer Akte erfassen und bestätigen",
    icon: "📅",
    prompt:
      "Erfasse alle Fristen aus den Dokumenten dieser Akte. Notiere gerichtliche Fristen und fordere Fristbestätigungen an.",
    steps: [
      { label: "Fristen aus Dokumenten extrahieren", action_type: "document_finalize" },
      { label: "Gerichtliche Fristen notieren", action_type: "deadline_create" },
      { label: "Fristbestätigungen anfordern", action_type: "message_send" },
    ],
  },
];

export function getTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

// ── Helpers ───────────────────────────────────────────────────────────

export function buildWorkflowSteps(
  template: WorkflowTemplate,
): WorkflowStep[] {
  return template.steps.map((step, i) => ({
    id: `step-${i + 1}`,
    label: step.label,
    action_type: step.action_type,
    status: "pending" as StepStatus,
  }));
}

export function buildWorkflowFrontmatter(params: {
  template_id: string;
  prompt: string;
  started_by: string;
  case_slug?: string;
  at?: Date;
}): Record<string, unknown> {
  const template = getTemplate(params.template_id);
  if (!template) {
    throw new Error(`Unknown workflow template: ${params.template_id}`);
  }

  const fm: WorkflowFrontmatter = {
    type: "workflow",
    template_id: params.template_id,
    status: "running",
    prompt: params.prompt,
    case_slug: params.case_slug,
    steps: buildWorkflowSteps(template),
    started_at: (params.at ?? new Date()).toISOString(),
    started_by: params.started_by,
  };

  return { ...fm };
}

export function buildWorkflowSlug(templateId: string, at?: Date): string {
  const date = at ?? new Date();
  const stamp = date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `workflows/${templateId}-${stamp}`;
}

export function buildWorkflowTitle(template: WorkflowTemplate): string {
  return `${template.icon} ${template.label}`;
}

export function getWorkflowProgress(steps: WorkflowStep[]): {
  completed: number;
  total: number;
  percentage: number;
} {
  const total = steps.length;
  const completed = steps.filter(
    (s) => s.status === "approved" || s.status === "skipped",
  ).length;
  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

export function getActiveStep(steps: WorkflowStep[]): WorkflowStep | null {
  return steps.find((s) => s.status === "running") ?? null;
}

export function getPendingApprovals(steps: WorkflowStep[]): WorkflowStep[] {
  return steps.filter(
    (s) => s.status === "running" && s.agent_action_slug !== undefined,
  );
}

export function inferWorkflowStatus(steps: WorkflowStep[]): WorkflowStatus {
  const hasFailed = steps.some((s) => s.status === "rejected");
  if (hasFailed) return "failed";

  const allDone = steps.every(
    (s) => s.status === "approved" || s.status === "skipped",
  );
  if (allDone) return "completed";

  const hasRunning = steps.some((s) => s.status === "running");
  if (hasRunning) return "running";

  return "paused";
}

export type IdempotencyResult =
  | { ok: true; steps: WorkflowStep[] }
  | { ok: false; reason: string; step: WorkflowStep };

export function isTerminalStepStatus(status: StepStatus): boolean {
  return status === "approved" || status === "rejected" || status === "skipped";
}

export function canAdvanceStep(step: WorkflowStep, newStatus: StepStatus): boolean {
  if (isTerminalStepStatus(step.status)) return false;
  if (step.status === newStatus) return false;
  if (step.status === "pending" && newStatus === "pending") return false;
  return true;
}

export function advanceStep(
  steps: WorkflowStep[],
  stepId: string,
  newStatus: StepStatus,
  extra?: { agent_action_slug?: string; error?: string },
): WorkflowStep[] {
  return steps.map((s) => {
    if (s.id !== stepId) return s;
    const now = new Date().toISOString();
    return {
      ...s,
      status: newStatus,
      agent_action_slug: extra?.agent_action_slug ?? s.agent_action_slug,
      error: extra?.error ?? s.error,
      started_at: newStatus === "running" ? now : s.started_at,
      completed_at:
        newStatus === "approved" || newStatus === "rejected"
          ? now
          : s.completed_at,
    };
  });
}

export function advanceStepIdempotent(
  steps: WorkflowStep[],
  stepId: string,
  newStatus: StepStatus,
  extra?: { agent_action_slug?: string; error?: string },
): IdempotencyResult {
  const step = steps.find((s) => s.id === stepId);
  if (!step) {
    return { ok: false, reason: `Step '${stepId}' not found`, step: { id: stepId, label: "", action_type: "document_finalize", status: "pending" } };
  }
  if (isTerminalStepStatus(step.status)) {
    return { ok: false, reason: `Step '${stepId}' is already in terminal status '${step.status}'`, step };
  }
  if (step.status === newStatus) {
    return { ok: false, reason: `Step '${stepId}' is already '${newStatus}'`, step };
  }
  return { ok: true, steps: advanceStep(steps, stepId, newStatus, extra) };
}

export function getStepStatusLabel(status: StepStatus): string {
  const labels: Record<StepStatus, string> = {
    pending: "Wartet",
    running: "Läuft",
    approved: "Freigegeben",
    rejected: "Abgelehnt",
    skipped: "Übersprungen",
  };
  return labels[status];
}

export function getWorkflowStatusLabel(status: WorkflowStatus): string {
  const labels: Record<WorkflowStatus, string> = {
    running: "Läuft",
    completed: "Abgeschlossen",
    failed: "Fehlgeschlagen",
    paused: "Pausiert",
  };
  return labels[status];
}

export function getActionTypeLabel(actionType: ActionType): string {
  return ACTION_LABELS[actionType] ?? actionType;
}

export function fmToWorkflowInstance(page: {
  slug: string;
  title: string;
  frontmatter?: Record<string, unknown>;
}): WorkflowInstance | null {
  const fm = (page.frontmatter ?? {}) as Partial<WorkflowFrontmatter>;
  if (fm.type !== "workflow") return null;

  return {
    slug: page.slug,
    title: page.title,
    frontmatter: {
      type: "workflow",
      template_id: fm.template_id ?? "custom",
      status: fm.status ?? "running",
      prompt: fm.prompt ?? "",
      case_slug: fm.case_slug,
      steps: Array.isArray(fm.steps) ? (fm.steps as WorkflowStep[]) : [],
      started_at: fm.started_at ?? new Date().toISOString(),
      completed_at: fm.completed_at,
      started_by: fm.started_by ?? "—",
    },
  };
}

export function filterWorkflows(
  instances: WorkflowInstance[],
  filter: "all" | "active" | "completed" | "failed",
): WorkflowInstance[] {
  switch (filter) {
    case "active":
      return instances.filter((w) => w.frontmatter.status === "running" || w.frontmatter.status === "paused");
    case "completed":
      return instances.filter((w) => w.frontmatter.status === "completed");
    case "failed":
      return instances.filter((w) => w.frontmatter.status === "failed");
    default:
      return instances;
  }
}

export function sortWorkflowsByStartedAt(
  instances: WorkflowInstance[],
  direction?: "asc" | "desc",
): WorkflowInstance[] {
  const dir = direction ?? "desc";
  return [...instances].sort((a, b) => {
    const cmp = (a.frontmatter.started_at ?? "").localeCompare(b.frontmatter.started_at ?? "");
    return dir === "desc" ? -cmp : cmp;
  });
}

// ── SSE Event Helpers ──────────────────────────────────────────────────

export type WorkflowEventType = "started" | "step_changed" | "completed" | "failed";

export interface WorkflowEvent {
  event: WorkflowEventType;
  at: string;
  data: Record<string, unknown>;
}

export function buildWorkflowEvent(
  event: WorkflowEventType,
  data: Record<string, unknown>,
): WorkflowEvent {
  return {
    event,
    at: new Date().toISOString(),
    data,
  };
}
