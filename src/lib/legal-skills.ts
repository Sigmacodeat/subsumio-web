/**
 * Legal Skills — Versionierte Kanzlei-Workflows.
 *
 * P0-SKILL-001: Modelliert Kanzlei-Workflows als versionierte Legal-Skills
 * mit check-resolvable (Reachability/MECE/DRY) als CI-Gate.
 */

// ── Types ─────────────────────────────────────────────────────────────

export type SkillCategory =
  | "intake"
  | "deadline"
  | "drafting"
  | "review"
  | "filing"
  | "conflict_check"
  | "billing"
  | "correspondence"
  | "discovery"
  | "trial_prep"
  | "settlement"
  | "compliance";

export type SkillStatus = "active" | "deprecated" | "draft";

export interface LegalSkill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  version: string;
  status: SkillStatus;
  steps: SkillStep[];
  inputs: SkillInput[];
  outputs: SkillOutput[];
  prerequisites: string[];
  dependencies: string[];
  created_at: string;
  updated_at: string;
  author: string;
}

export interface SkillStep {
  id: string;
  name: string;
  description: string;
  action: string;
  inputs: string[];
  outputs: string[];
  next_steps: string[];
  optional?: boolean;
  timeout_seconds?: number;
}

export interface SkillInput {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "document" | "case_slug" | "party";
  required: boolean;
  description: string;
  default?: unknown;
}

export interface SkillOutput {
  name: string;
  type: "document" | "invoice" | "deadline" | "notification" | "report" | "case_update";
  description: string;
}

// ── Resolvability Check ───────────────────────────────────────────────

export interface ResolvabilityResult {
  resolvable: boolean;
  errors: ResolvabilityError[];
  warnings: ResolvabilityWarning[];
  stats: {
    total_steps: number;
    reachable_steps: number;
    unreachable_steps: number;
    mece_violations: number;
    dry_violations: number;
  };
}

export interface ResolvabilityError {
  type: "unreachable" | "missing_input" | "circular_dependency" | "broken_next_step" | "missing_output";
  step_id: string;
  message: string;
}

export interface ResolvabilityWarning {
  type: "optional_step_no_fallback" | "unused_output" | "duplicate_step_name" | "no_prerequisites";
  step_id: string;
  message: string;
}

// ── Skill Registry ────────────────────────────────────────────────────

export class SkillRegistry {
  private skills = new Map<string, LegalSkill>();

  register(skill: LegalSkill): void {
    this.skills.set(skill.id, skill);
  }

  get(id: string): LegalSkill | undefined {
    return this.skills.get(id);
  }

  getAll(): LegalSkill[] {
    return Array.from(this.skills.values());
  }

  getByCategory(category: SkillCategory): LegalSkill[] {
    return this.getAll().filter((s) => s.category === category);
  }

  getActive(): LegalSkill[] {
    return this.getAll().filter((s) => s.status === "active");
  }

  getVersion(id: string): string | undefined {
    return this.skills.get(id)?.version;
  }

  checkResolvable(skill: LegalSkill): ResolvabilityResult {
    return checkResolvability(skill);
  }

  checkAll(): { skill_id: string; result: ResolvabilityResult }[] {
    return this.getAll().map((skill) => ({
      skill_id: skill.id,
      result: checkResolvability(skill),
    }));
  }
}

// ── Check Resolvability (CI Gate) ─────────────────────────────────────

export function checkResolvability(skill: LegalSkill): ResolvabilityResult {
  const errors: ResolvabilityError[] = [];
  const warnings: ResolvabilityWarning[] = [];

  const stepIds = new Set(skill.steps.map((s) => s.id));
  const stepMap = new Map(skill.steps.map((s) => [s.id, s]));
  const inputNames = new Set(skill.inputs.map((i) => i.name));
  const outputNames = new Set(skill.outputs.map((o) => o.name));

  // 1. Reachability: every step must be reachable from prerequisites or first step
  const reachable = new Set<string>();
  const queue: string[] = [];

  // Start from steps that have no prerequisites or are first
  for (const step of skill.steps) {
    if (skill.prerequisites.includes(step.id) || step.next_steps.length === 0) {
      // Entry points: steps referenced in prerequisites OR terminal steps
    }
  }

  // Find entry points: steps not referenced by any other step's next_steps
  const referencedByNext = new Set<string>();
  for (const step of skill.steps) {
    for (const next of step.next_steps) {
      referencedByNext.add(next);
    }
  }
  for (const step of skill.steps) {
    if (!referencedByNext.has(step.id)) {
      queue.push(step.id);
    }
  }

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (reachable.has(currentId)) continue;
    reachable.add(currentId);
    const step = stepMap.get(currentId);
    if (step) {
      for (const next of step.next_steps) {
        if (!reachable.has(next)) {
          queue.push(next);
        }
      }
    }
  }

  for (const step of skill.steps) {
    if (!reachable.has(step.id)) {
      errors.push({
        type: "unreachable",
        step_id: step.id,
        message: `Step "${step.id}" is unreachable from any entry point`,
      });
    }
  }

  // 2. Broken next_steps: references to non-existent step IDs
  for (const step of skill.steps) {
    for (const next of step.next_steps) {
      if (!stepIds.has(next)) {
        errors.push({
          type: "broken_next_step",
          step_id: step.id,
          message: `Step "${step.id}" references non-existent next_step "${next}"`,
        });
      }
    }
  }

  // 3. Missing inputs: step inputs must be declared in skill inputs or produced by prior steps
  const producedOutputs = new Set<string>();
  for (const step of skill.steps) {
    for (const input of step.inputs) {
      if (!inputNames.has(input) && !producedOutputs.has(input)) {
        errors.push({
          type: "missing_input",
          step_id: step.id,
          message: `Step "${step.id}" requires input "${input}" which is not declared or produced`,
        });
      }
    }
    for (const output of step.outputs) {
      producedOutputs.add(output);
    }
  }

  // 4. Circular dependency detection
  const visited = new Set<string>();
  const inStack = new Set<string>();
  for (const step of skill.steps) {
    if (detectCycle(step.id, stepMap, visited, inStack)) {
      errors.push({
        type: "circular_dependency",
        step_id: step.id,
        message: `Circular dependency detected starting from step "${step.id}"`,
      });
    }
  }

  // 5. MECE: no two steps should have the same name (DRY violation)
  const nameCount = new Map<string, number>();
  for (const step of skill.steps) {
    nameCount.set(step.name, (nameCount.get(step.name) ?? 0) + 1);
  }
  for (const [name, count] of nameCount) {
    if (count > 1) {
      const step = skill.steps.find((s) => s.name === name);
      warnings.push({
        type: "duplicate_step_name",
        step_id: step?.id ?? "",
        message: `Step name "${name}" appears ${count} times (DRY violation)`,
      });
    }
  }

  // 6. Unused outputs: outputs declared but not in skill outputs
  for (const output of producedOutputs) {
    if (!outputNames.has(output)) {
      const step = skill.steps.find((s) => s.outputs.includes(output));
      warnings.push({
        type: "unused_output",
        step_id: step?.id ?? "",
        message: `Output "${output}" is produced but not declared in skill outputs`,
      });
    }
  }

  // 7. Optional steps with no fallback
  for (const step of skill.steps) {
    if (step.optional && step.next_steps.length === 0) {
      warnings.push({
        type: "optional_step_no_fallback",
        step_id: step.id,
        message: `Optional step "${step.id}" has no next_steps (no fallback path)`,
      });
    }
  }

  // 8. No prerequisites
  if (skill.prerequisites.length === 0 && skill.steps.length > 1) {
    warnings.push({
      type: "no_prerequisites",
      step_id: "",
      message: "Skill has multiple steps but no prerequisites declared",
    });
  }

  const unreachableCount = errors.filter((e) => e.type === "unreachable").length;
  const meceViolations = warnings.filter((w) => w.type === "duplicate_step_name").length;
  const dryViolations = warnings.filter((w) => w.type === "duplicate_step_name" || w.type === "unused_output").length;

  return {
    resolvable: errors.length === 0,
    errors,
    warnings,
    stats: {
      total_steps: skill.steps.length,
      reachable_steps: skill.steps.length - unreachableCount,
      unreachable_steps: unreachableCount,
      mece_violations: meceViolations,
      dry_violations: dryViolations,
    },
  };
}

function detectCycle(
  stepId: string,
  stepMap: Map<string, SkillStep>,
  visited: Set<string>,
  inStack: Set<string>,
): boolean {
  if (inStack.has(stepId)) return true;
  if (visited.has(stepId)) return false;

  visited.add(stepId);
  inStack.add(stepId);

  const step = stepMap.get(stepId);
  if (step) {
    for (const next of step.next_steps) {
      if (detectCycle(next, stepMap, visited, inStack)) return true;
    }
  }

  inStack.delete(stepId);
  return false;
}

// ── Default Legal Skills ──────────────────────────────────────────────

export const DEFAULT_LEGAL_SKILLS: LegalSkill[] = [
  {
    id: "skill-intake-mandat",
    name: "Mandatsannahme",
    description: "Standardisierte Mandatsannahme mit Konfliktprüfung und Vollmacht",
    category: "intake",
    version: "1.0.0",
    status: "active",
    author: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    prerequisites: [],
    dependencies: [],
    inputs: [
      { name: "client_name", type: "string", required: true, description: "Name des Mandanten" },
      { name: "case_description", type: "string", required: true, description: "Kurze Beschreibung des Falls" },
      { name: "case_slug", type: "case_slug", required: true, description: "Akten-Slug" },
    ],
    outputs: [
      { name: "mandate_document", type: "document", description: "Mandatsvereinbarung" },
      { name: "power_of_attorney", type: "document", description: "Vollmacht" },
    ],
    steps: [
      {
        id: "step-1",
        name: "Konfliktprüfung",
        description: "Prüfe auf Interessenkonflikte",
        action: "conflict_check",
        inputs: ["client_name"],
        outputs: ["conflict_clear"],
        next_steps: ["step-2"],
      },
      {
        id: "step-2",
        name: "Mandatsvereinbarung",
        description: "Erstelle Mandatsvereinbarung",
        action: "generate_document",
        inputs: ["client_name", "case_description"],
        outputs: ["mandate_document"],
        next_steps: ["step-3"],
      },
      {
        id: "step-3",
        name: "Vollmacht",
        description: "Erstelle Vollmacht",
        action: "generate_document",
        inputs: ["client_name", "case_slug"],
        outputs: ["power_of_attorney"],
        next_steps: [],
      },
    ],
  },
  {
    id: "skill-deadline-monitoring",
    name: "Fristenüberwachung",
    description: "Überwacht Fristen und warnt vor Ablauf",
    category: "deadline",
    version: "1.1.0",
    status: "active",
    author: "system",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    prerequisites: [],
    dependencies: [],
    inputs: [
      { name: "case_slug", type: "case_slug", required: true, description: "Akten-Slug" },
    ],
    outputs: [
      { name: "deadline_report", type: "report", description: "Fristen-Report" },
      { name: "notification", type: "notification", description: "Warn-Notification" },
    ],
    steps: [
      {
        id: "step-1",
        name: "Fristen abrufen",
        description: "Alle Fristen der Akte abrufen",
        action: "fetch_deadlines",
        inputs: ["case_slug"],
        outputs: ["deadlines"],
        next_steps: ["step-2"],
      },
      {
        id: "step-2",
        name: "Fristen bewerten",
        description: "Fristen nach Dringlichkeit bewerten",
        action: "evaluate_deadlines",
        inputs: ["deadlines"],
        outputs: ["deadline_report"],
        next_steps: ["step-3"],
      },
      {
        id: "step-3",
        name: "Benachrichtigung",
        description: "Bei kritischen Fristen benachrichtigen",
        action: "send_notification",
        inputs: ["deadline_report"],
        outputs: ["notification"],
        next_steps: [],
      },
    ],
  },
];
