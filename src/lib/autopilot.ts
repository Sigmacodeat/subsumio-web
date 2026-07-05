/**
 * Autopilot Policy Engine
 * ========================
 * Defines automated task policies that chain supervisor jobs
 * based on triggers (new intake, deadline approaching, case status change).
 *
 * The autopilot runs via cron and checks policies against current state.
 * When a policy matches, it submits a supervisor job with the appropriate
 * prompt and specialist configuration.
 */

export type AutopilotTrigger =
  | "new_intake"
  | "deadline_approaching"
  | "case_status_change"
  | "document_uploaded"
  | "frist_detected"
  | "rundown_stale";

export type AutopilotAction =
  | "generate_rundown"
  | "draft_response"
  | "summarize_document"
  | "check_frist"
  | "escalate_to_human"
  | "create_task";

export interface AutoPilotPolicy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: AutopilotTrigger;
  action: AutopilotAction;
  /** Conditions that must be met for the policy to fire */
  conditions: {
    /** Hours before deadline to trigger (for deadline_approaching) */
    deadlineHoursBefore?: number;
    /** Case statuses that trigger (for case_status_change) */
    caseStatuses?: string[];
    /** Intake sources that trigger (for new_intake) */
    intakeSources?: string[];
    /** Legal areas that trigger */
    legalAreas?: string[];
    /** Minimum urgency level for triage-triggered policies */
    minUrgency?: "low" | "medium" | "high" | "critical";
  };
  /** Supervisor job configuration */
  jobConfig: {
    prompt: string;
    forceSpecialists?: string[];
    skipCritic?: boolean;
    /** Priority for the generated job */
    priority?: "low" | "normal" | "high" | "urgent";
  };
  /** Rate limiting: max executions per hour */
  maxExecutionsPerHour: number;
  /** Hard upper estimate used by the nightly budget guard. */
  estimatedCostCents: number;
  created_at: string;
  updated_at: string;
}

export interface AutopilotExecution {
  id: string;
  policyId: string;
  policyName: string;
  trigger: AutopilotTrigger;
  action: AutopilotAction;
  jobId?: number;
  caseSlug?: string;
  intakeSlug?: string;
  executedAt: string;
  status: "submitted" | "failed" | "skipped";
  error?: string;
}

export function createPolicy(input: {
  name: string;
  description: string;
  trigger: AutopilotTrigger;
  action: AutopilotAction;
  conditions?: AutoPilotPolicy["conditions"];
  jobConfig: AutoPilotPolicy["jobConfig"];
  maxExecutionsPerHour?: number;
  estimatedCostCents?: number;
}): AutoPilotPolicy {
  const now = new Date().toISOString();
  return {
    id: `policy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: input.name,
    description: input.description,
    enabled: true,
    trigger: input.trigger,
    action: input.action,
    conditions: input.conditions ?? {},
    jobConfig: input.jobConfig,
    maxExecutionsPerHour: input.maxExecutionsPerHour ?? 5,
    estimatedCostCents: input.estimatedCostCents ?? 5,
    created_at: now,
    updated_at: now,
  };
}

export interface AutopilotBudget {
  capCents: number;
  spentCents: number;
}

/** Reserve a job before submitting it. A rejected reservation never overspends. */
export function reserveAutopilotBudget(
  budget: AutopilotBudget,
  estimatedCostCents: number
): { allowed: boolean; budget: AutopilotBudget } {
  const cost = Math.max(0, Math.ceil(estimatedCostCents));
  if (budget.spentCents + cost > budget.capCents) return { allowed: false, budget };
  return { allowed: true, budget: { ...budget, spentCents: budget.spentCents + cost } };
}

/** Every autonomous AI result must be reviewable and can never be finalized by the cron. */
export function buildApprovalGatedJob(
  policy: AutoPilotPolicy,
  prompt: string,
  budgetRemainingCents: number
): Record<string, unknown> {
  return {
    prompt,
    name: `autopilot:${policy.id}`,
    force_specialists: policy.jobConfig.forceSpecialists,
    skip_critic: policy.jobConfig.skipCritic,
    priority: policy.jobConfig.priority,
    budget_remaining_cents: Math.max(0, budgetRemainingCents),
    output_type: "agent_action",
    approval_required: true,
    approval_status: "pending",
    may_finalize: false,
  };
}

export function shouldPolicyFire(
  policy: AutoPilotPolicy,
  context: {
    trigger: AutopilotTrigger;
    urgency?: string;
    legalArea?: string;
    intakeSource?: string;
    caseStatus?: string;
    deadlineHours?: number;
  }
): boolean {
  if (!policy.enabled) return false;
  if (policy.trigger !== context.trigger) return false;

  const c = policy.conditions;

  if (c.minUrgency && context.urgency) {
    const urgencyOrder = { low: 0, medium: 1, high: 2, critical: 3 };
    if (
      (urgencyOrder[context.urgency as keyof typeof urgencyOrder] ?? 0) <
      (urgencyOrder[c.minUrgency] ?? 0)
    ) {
      return false;
    }
  }

  if (c.legalAreas?.length && context.legalArea) {
    if (!c.legalAreas.includes(context.legalArea)) return false;
  }

  if (c.intakeSources?.length && context.intakeSource) {
    if (!c.intakeSources.includes(context.intakeSource)) return false;
  }

  if (c.caseStatuses?.length && context.caseStatus) {
    if (!c.caseStatuses.includes(context.caseStatus)) return false;
  }

  if (c.deadlineHoursBefore !== undefined && context.deadlineHours !== undefined) {
    if (context.deadlineHours > c.deadlineHoursBefore) return false;
  }

  return true;
}

export function buildPromptForPolicy(
  policy: AutoPilotPolicy,
  context: { caseSlug?: string; intakeSlug?: string; deadlineDate?: string; summary?: string }
): string {
  const parts: string[] = [policy.jobConfig.prompt];

  if (context.caseSlug) {
    parts.push(`Aktenzeichen: ${context.caseSlug}`);
  }
  if (context.intakeSlug) {
    parts.push(`Eingang: ${context.intakeSlug}`);
  }
  if (context.deadlineDate) {
    parts.push(`Frist: ${context.deadlineDate}`);
  }
  if (context.summary) {
    parts.push(`Zusammenfassung: ${context.summary}`);
  }

  return parts.join("\n");
}

export const DEFAULT_POLICIES: AutoPilotPolicy[] = [
  createPolicy({
    name: "Auto-Rundown bei neuem Eingang",
    description: "Generiert automatisch einen Rundown für neue kritische Eingänge",
    trigger: "new_intake",
    action: "generate_rundown",
    conditions: {
      minUrgency: "high",
    },
    jobConfig: {
      prompt:
        "Erstelle einen Rundown für diesen neuen Eingang. Priorisiere Aufgaben nach Dringlichkeit.",
      forceSpecialists: ["planning"],
      skipCritic: true,
      priority: "high",
    },
    maxExecutionsPerHour: 10,
  }),
  createPolicy({
    name: "Frist-Warnung 48h",
    description: "Prüft Fristen 48 Stunden vor Ablauf und eskaliert bei Bedarf",
    trigger: "deadline_approaching",
    action: "check_frist",
    conditions: {
      deadlineHoursBefore: 48,
    },
    jobConfig: {
      prompt: "Prüfe diese Frist und erstelle eine Handlungsanweisung für den Anwalt.",
      forceSpecialists: ["planning", "review"],
      skipCritic: true,
      priority: "urgent",
    },
    maxExecutionsPerHour: 20,
  }),
  createPolicy({
    name: "Dokument-Zusammenfassung bei Upload",
    description: "Fasst neue Dokumente automatisch zusammen",
    trigger: "document_uploaded",
    action: "summarize_document",
    jobConfig: {
      prompt: "Fasse dieses Dokument zusammen und extrahiere relevante rechtliche Informationen.",
      forceSpecialists: ["summary"],
      skipCritic: true,
      priority: "low",
    },
    maxExecutionsPerHour: 15,
  }),
  createPolicy({
    name: "Stale-Rundown Check",
    description: "Prüft auf veraltete Rundown-Items, die älter als 24h sind",
    trigger: "rundown_stale",
    action: "generate_rundown",
    jobConfig: {
      prompt: "Aktualisiere den Rundown. Prüfe auf offene Aufgaben und aktualisiere deren Status.",
      forceSpecialists: ["planning"],
      skipCritic: true,
      priority: "normal",
    },
    maxExecutionsPerHour: 3,
  }),
];
