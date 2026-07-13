/**
 * Pipeline Workflow Definitions — T5.1, T5.2, T5.3
 *
 * Each workflow defines which pipeline layers to activate.
 * The modularized pipeline only executes layers listed in the workflow definition.
 *
 * Workflows:
 *   memo           — T5.1: Rechtsfrage → Kurzmemorandum
 *   fristen_report — T5.2: Gerichtsakt → Fristen- und Risikoreport
 *   schriftsatz    — T5.3: Schriftsatzentwurf
 *   full_pipeline  — Legacy: all layers (backward compatibility)
 */

import { LAYER_REGISTRY, getLayerDeclaration } from "./pipeline-registry.ts";

export type WorkflowId = "memo" | "fristen_report" | "schriftsatz" | "full_pipeline";

export interface PipelineWorkflowDef {
  /** Unique workflow identifier */
  id: WorkflowId;
  /** Human-readable label */
  label: string;
  /** Description of the workflow */
  description: string;
  /** Icon for UI */
  icon: string;
  /** Layer IDs to activate (in execution order) */
  layers: string[];
  /** Layer IDs that require human approval before proceeding */
  approvalGates: string[];
  /** Optional feature flag to enable/disable this workflow at runtime */
  featureFlag?: string;
  /** Workflows this workflow depends on (outputs from prior workflows) */
  dependsOn?: WorkflowId[];
  /** Definition of Done criteria */
  dod: string[];
}

// ── Workflow Definitions ──────────────────────────────────────

export const WORKFLOW_DEFS: Record<WorkflowId, PipelineWorkflowDef> = {
  // ── T5.1: Rechtsfrage → Kurzmemorandum ──
  memo: {
    id: "memo",
    label: "Rechtsfrage → Kurzmemorandum",
    description:
      "Beantwortet eine freie Rechtsfrage mit strukturiertem Memo: " +
      "kurze Antwort, ausführliche Begründung mit §-Quellen, Gegenansicht, offene Punkte.",
    icon: "📝",
    layers: [
      // Intake & classification
      "doc-classifier",
      // Jurisdiction & entities (needed for context)
      "on-scanner",
      "entity-extractor",
      // Issues & forensic analysis
      "forensic-analyst",
      // Research: §-retrieval
      "law-matcher",
      // Element matrix: fact gap detection
      "fact-gap-detector",
      // Counterview: opponent simulator
      "opponent-simulator",
      // Claim verification: ensemble critic
      "subsumption-checker",
      "ensemble-critic",
    ],
    approvalGates: ["ensemble-critic"],
    featureFlag: "workflow_memo",
    dod: [
      "Jede wesentliche Aussage hat Quelle (§ oder Judikatur)",
      "Fehlende Fakten und Gegenargumente sind explicit sichtbar",
      "Claim Verification läuft vor Freigabe (Tier-0 + Tier-1)",
      "Keine Freigabe wenn verification_state ≠ VERIFIED or VERIFIED_WITH_WARNINGS",
      "Work Product Receipt wird generiert",
    ],
  },

  // ── T5.2: Gerichtsakt → Fristen- und Risikoreport ──
  fristen_report: {
    id: "fristen_report",
    label: "Gerichtsakt → Fristen- und Risikoreport",
    description:
      "Analysiert einen Gerichtsakt und erstellt einen Fristen-Report mit " +
      "deterministischer Fristberechnung und Risikoanalyse. Anwalt bestätigt kritische Inputs.",
    icon: "📅",
    layers: [
      // Document inventory
      "doc-classifier",
      // Parties & roles
      "on-scanner",
      "entity-extractor",
      // Chronology & forensic analysis
      "forensic-analyst",
      // Service/events → deadline extraction
      "damage-deadline-extractor",
      // Deterministic deadline calculation
      "deadline-validator",
      // Limitation scanner (Verjährung)
      "limitation-scanner",
      // Risk analysis
      "appeal-risk",
      "enforcement-analysis",
      "counterclaim-risk",
      // Cost analysis
      "cost-benefit",
      "cost-award",
      // Claim verification
      "ensemble-critic",
    ],
    approvalGates: ["deadline-validator", "limitation-scanner"],
    featureFlag: "workflow_fristen_report",
    dod: [
      "Startdatum, Fristregel, Kalender, Hemmung/Unterbrechung, Unsicherheit separat traceable",
      "Deterministic deadline calculation (frist-engine, nicht LLM)",
      "Anwalt bestätigt kritische Inputs (approval gate vor deadline-validator)",
      "Work Product Receipt wird generiert",
      "Verjährungs-Scan mit URGENT/WARNUNG/OK Status pro Anspruch",
    ],
  },

  // ── T5.3: Schriftsatzentwurf ──
  schriftsatz: {
    id: "schriftsatz",
    label: "Schriftsatzentwurf",
    description:
      "Erstellt einen Schriftsatzentwurf mit bestätigten Fakten, Template-basiertem Aufbau, " +
      "Quellen, Gegenargumenten und Verification Receipt. Export als DOCX mit klickbaren Quellen.",
    icon: "✍️",
    layers: [
      // Confirmed facts/issues (from prior workflow or manual)
      "forensic-analyst",
      "law-matcher",
      // Template/playbook selection + draft
      "legal-drafter",
      // Source insertion happens within legal-drafter
      // Counterarguments
      "opponent-simulator",
      // Claim verification
      "subsumption-checker",
      "ensemble-critic",
    ],
    approvalGates: ["legal-drafter", "ensemble-critic"],
    featureFlag: "workflow_schriftsatz",
    dependsOn: ["memo", "fristen_report"],
    dod: [
      "Keine ungeprüften Behauptungen im exportierten DOCX",
      "Quellen sind klickbar (Hyperlinks im DOCX)",
      "Verification Receipt wird eingebettet/exportiert",
      "Counter-Arguments sind im Dokument enthalten",
      "Guardrail + Cross-Verify vor DOCX-Export bestanden",
    ],
  },

  // ── Legacy: Full Pipeline (backward compatibility) ──
  full_pipeline: {
    id: "full_pipeline",
    label: "Vollständige Aktenanalyse (Legacy)",
    description:
      "Führt alle 27+ Layer der Mega-Pipeline aus. Entspricht dem bisherigen Verhalten " +
      "ohne Workflow-basierte Layer-Auswahl.",
    icon: "🔧",
    layers: LAYER_REGISTRY.map((l) => l.id),
    approvalGates: [],
    dod: [
      "Alle Layer werden ausgeführt (Legacy-Kompatibilität)",
      "Mandatory layers verwenden on_child_fail: fail",
      "Optional layers verwenden on_child_fail: continue",
    ],
  },
};

// ── Helper Functions ──────────────────────────────────────────

/**
 * Get a workflow definition by ID.
 */
export function getWorkflowDef(id: WorkflowId): PipelineWorkflowDef | undefined {
  return WORKFLOW_DEFS[id];
}

/**
 * Get the list of layer IDs for a workflow.
 */
export function getWorkflowLayers(id: WorkflowId): string[] {
  return WORKFLOW_DEFS[id]?.layers ?? [];
}

/**
 * Get the set of layer IDs for a workflow (for fast lookup).
 */
export function getWorkflowLayerSet(id: WorkflowId): Set<string> {
  return new Set(getWorkflowLayers(id));
}

/**
 * Get the list of approval gate layer IDs for a workflow.
 */
export function getApprovalGates(id: WorkflowId): string[] {
  return WORKFLOW_DEFS[id]?.approvalGates ?? [];
}

/**
 * Check if a layer is an approval gate in the given workflow.
 */
export function isApprovalGate(workflowId: WorkflowId, layerId: string): boolean {
  return getApprovalGates(workflowId).includes(layerId);
}

/**
 * Check if a layer should run in the given workflow.
 */
export function shouldLayerRunInWorkflow(workflowId: WorkflowId, layerId: string): boolean {
  const layers = getWorkflowLayerSet(workflowId);
  return layers.has(layerId);
}

/**
 * Get the layer numbers that should run for a workflow (for backward-compatible shouldRunLayer).
 */
export function getWorkflowLayerNumbers(id: WorkflowId): Set<number> {
  const layerIds = getWorkflowLayers(id);
  const numbers = new Set<number>();
  for (const layerId of layerIds) {
    const decl = getLayerDeclaration(layerId);
    if (decl) numbers.add(decl.layerNumber);
  }
  return numbers;
}

/**
 * List all available workflow IDs.
 */
export function listWorkflowIds(): WorkflowId[] {
  return Object.keys(WORKFLOW_DEFS) as WorkflowId[];
}

/**
 * Validate a workflow definition.
 * Returns list of issues (empty = valid).
 */
export function validateWorkflowDef(id: WorkflowId): string[] {
  const def = WORKFLOW_DEFS[id];
  if (!def) return [`Unknown workflow: ${id}`];
  const issues: string[] = [];
  for (const layerId of def.layers) {
    const layer = getLayerDeclaration(layerId);
    if (!layer) {
      issues.push(`Workflow "${id}" references unknown layer: ${layerId}`);
    }
  }
  for (const gateId of def.approvalGates) {
    if (!def.layers.includes(gateId)) {
      issues.push(`Workflow "${id}" has approval gate "${gateId}" not in layers list`);
    }
  }
  return issues;
}

/**
 * Validate all workflow definitions.
 */
export function validateAllWorkflowDefs(): Array<{ workflow: WorkflowId; issues: string[] }> {
  return listWorkflowIds()
    .map((id) => ({ workflow: id, issues: validateWorkflowDef(id) }))
    .filter((r) => r.issues.length > 0);
}
