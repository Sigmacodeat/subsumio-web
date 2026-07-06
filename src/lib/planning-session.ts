/**
 * Multi-Turn Planning Mode — Structured planning conversations with the Copilot.
 *
 * Enables the AI to break down complex legal tasks into steps, track progress,
 * and allow the user to modify the plan iteratively across multiple turns.
 *
 * Planning sessions are persisted as brain pages with type "copilot_plan".
 */

import { api } from "@/lib/api";

export type PlanStepStatus = "pending" | "in_progress" | "completed" | "skipped" | "blocked";

export interface PlanStep {
  id: string;
  title: string;
  description: string;
  status: PlanStepStatus;
  estimatedTime?: string;
  dependencies?: string[];
  notes?: string;
  completedAt?: string;
}

export type PlanStatus = "drafting" | "active" | "completed" | "abandoned";

export interface PlanningSession {
  id: string;
  title: string;
  goal: string;
  caseSlug?: string;
  status: PlanStatus;
  steps: PlanStep[];
  currentStepIndex: number;
  conversationTurns: number;
  createdAt: string;
  updatedAt: string;
}

const PLAN_SLUG_PREFIX = "copilot/plan";

function generateId(): string {
  return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateStepId(): string {
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const PLAN_SYSTEM_PROMPT = `Du bist ein Planungs-Assistent für Anwälte. Der Nutzer möchte einen komplexen rechtlichen Aufgaben planen.

ZIEL: {goal}

BESTEHENDE SCHRITTE:
{existing_steps}

Erstelle oder aktualisiere einen strukturierten Plan. Gib NUR JSON zurück:

{{
  "title": "Kurzer Titel für den Plan",
  "steps": [
    {{
      "title": "Schritt-Titel",
      "description": "Was in diesem Schritt getan werden muss",
      "estimatedTime": "z.B. '30 Min' oder '2 Tage'"
    }}
  ]
}}

Regeln:
- 3-10 Schritte, je nach Komplexität
- Schritte sollten sequenziell oder parallel sein
- Jeder Schritt sollte klar umsetzbar sein
- Berücksichtige rechtliche Fristen und Abhängigkeiten
- Wenn Schritte bereits existieren, behalte sie bei oder aktualisiere sie`;

export async function createPlan(opts: {
  goal: string;
  caseSlug?: string;
  existingSteps?: PlanStep[];
}): Promise<PlanningSession> {
  const id = generateId();
  const now = new Date().toISOString();

  const existingStepsStr =
    opts.existingSteps && opts.existingSteps.length > 0
      ? opts.existingSteps
          .map((s, i) => `${i + 1}. [${s.status}] ${s.title}: ${s.description}`)
          .join("\n")
      : "(Keine)";

  const prompt = PLAN_SYSTEM_PROMPT.replace("{goal}", opts.goal).replace(
    "{existing_steps}",
    existingStepsStr
  );

  const result = await api.query.think(prompt, {
    mode: "balanced",
    queryMode: "deep_matter",
  });

  let steps: PlanStep[] = [];
  let title = `Plan: ${opts.goal.slice(0, 50)}`;

  try {
    let jsonStr = result.answer.trim();
    const jsonMatch = result.answer.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr) as {
      title?: string;
      steps?: Array<{ title: string; description: string; estimatedTime?: string }>;
    };

    if (parsed.title) title = parsed.title;
    if (parsed.steps) {
      steps = parsed.steps.slice(0, 10).map((s) => ({
        id: generateStepId(),
        title: s.title,
        description: s.description,
        status: "pending" as const,
        estimatedTime: s.estimatedTime,
      }));
    }
  } catch {
    // Fallback: create a single step with the raw response
    steps = [
      {
        id: generateStepId(),
        title: "Plan erstellen",
        description: result.answer.slice(0, 500),
        status: "pending",
      },
    ];
  }

  const session: PlanningSession = {
    id,
    title,
    goal: opts.goal,
    caseSlug: opts.caseSlug,
    status: "active",
    steps,
    currentStepIndex: 0,
    conversationTurns: 1,
    createdAt: now,
    updatedAt: now,
  };

  // Persist
  const slug = `${PLAN_SLUG_PREFIX}/${id}`;
  await api.brain.createPage({
    slug,
    title: `Plan: ${title}`,
    type: "copilot_plan",
    content: session.goal,
    frontmatter: {
      type: "copilot_plan",
      plan_id: id,
      title,
      goal: session.goal,
      case_slug: session.caseSlug,
      status: session.status,
      steps: session.steps,
      current_step_index: session.currentStepIndex,
      conversation_turns: session.conversationTurns,
      created_at: now,
      updated_at: now,
    },
  });

  return session;
}

export async function loadPlan(planId: string): Promise<PlanningSession | null> {
  const slug = `${PLAN_SLUG_PREFIX}/${planId}`;
  const page = await api.brain.getPage(slug);
  if (!page) return null;

  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  return {
    id: String(fm.plan_id ?? planId),
    title: String(fm.title ?? page.title ?? ""),
    goal: String(fm.goal ?? page.content ?? ""),
    caseSlug: fm.case_slug as string | undefined,
    status: (fm.status as PlanStatus) ?? "active",
    steps: (fm.steps as PlanStep[]) ?? [],
    currentStepIndex: Number(fm.current_step_index ?? 0),
    conversationTurns: Number(fm.conversation_turns ?? 0),
    createdAt: String(fm.created_at ?? new Date().toISOString()),
    updatedAt: String(fm.updated_at ?? new Date().toISOString()),
  };
}

export async function listPlans(opts?: {
  caseSlug?: string;
  status?: PlanStatus;
}): Promise<PlanningSession[]> {
  const pages = await api.brain.listPages({ type: "copilot_plan", limit: 50 });
  let plans = (
    pages as unknown as Array<{
      slug: string;
      frontmatter: Record<string, unknown>;
      content: string;
    }>
  ).map((p) => {
    const fm = p.frontmatter;
    return {
      id: String(fm.plan_id ?? p.slug.split("/").pop() ?? ""),
      title: String(fm.title ?? ""),
      goal: String(fm.goal ?? p.content ?? ""),
      caseSlug: fm.case_slug as string | undefined,
      status: (fm.status as PlanStatus) ?? "active",
      steps: (fm.steps as PlanStep[]) ?? [],
      currentStepIndex: Number(fm.current_step_index ?? 0),
      conversationTurns: Number(fm.conversation_turns ?? 0),
      createdAt: String(fm.created_at ?? new Date().toISOString()),
      updatedAt: String(fm.updated_at ?? new Date().toISOString()),
    } as PlanningSession;
  });

  if (opts?.caseSlug) plans = plans.filter((p) => p.caseSlug === opts.caseSlug);
  if (opts?.status) plans = plans.filter((p) => p.status === opts.status);

  plans.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return plans;
}

export async function updatePlanStep(
  planId: string,
  stepId: string,
  updates: Partial<Pick<PlanStep, "status" | "notes">>
): Promise<void> {
  const plan = await loadPlan(planId);
  if (!plan) throw new Error("Plan not found");

  const steps = plan.steps.map((s) =>
    s.id === stepId
      ? {
          ...s,
          ...updates,
          completedAt: updates.status === "completed" ? new Date().toISOString() : s.completedAt,
        }
      : s
  );

  // Auto-advance current step index
  let currentStepIndex = plan.currentStepIndex;
  if (updates.status === "completed") {
    const nextIncomplete = steps.findIndex(
      (s) => s.status === "pending" || s.status === "in_progress"
    );
    currentStepIndex = nextIncomplete >= 0 ? nextIncomplete : steps.length - 1;
  }

  // Check if all steps are completed
  const allDone = steps.every((s) => s.status === "completed" || s.status === "skipped");
  const status = allDone ? "completed" : plan.status;

  const slug = `${PLAN_SLUG_PREFIX}/${planId}`;
  const now = new Date().toISOString();
  await api.brain.updatePage({
    slug,
    type: "copilot_plan",
    content: plan.goal,
    frontmatter: {
      type: "copilot_plan",
      plan_id: planId,
      title: plan.title,
      goal: plan.goal,
      case_slug: plan.caseSlug,
      status,
      steps,
      current_step_index: currentStepIndex,
      conversation_turns: plan.conversationTurns,
      created_at: plan.createdAt,
      updated_at: now,
    },
  });
}

export async function refinePlan(planId: string, userFeedback: string): Promise<PlanningSession> {
  const plan = await loadPlan(planId);
  if (!plan) throw new Error("Plan not found");

  // Use AI to refine the plan based on user feedback
  const existingStepsStr = plan.steps
    .map((s, i) => `${i + 1}. [${s.status}] ${s.title}: ${s.description}`)
    .join("\n");

  const prompt = `Aktualisiere diesen Plan basierend auf dem Feedback des Nutzers.

AKTUELLER PLAN ZIEL: ${plan.goal}

BESTEHENDE SCHRITTE:
${existingStepsStr}

NUTZER FEEDBACK: ${userFeedback}

Gib den aktualisierten Plan als JSON zurück:
{{
  "title": "Aktualisierter Titel",
  "steps": [
    {{ "title": "...", "description": "...", "estimatedTime": "..." }}
  ]
}}`;

  const result = await api.query.think(prompt, {
    mode: "balanced",
    queryMode: "deep_matter",
  });

  let updatedSteps = plan.steps;
  let title = plan.title;

  try {
    let jsonStr = result.answer.trim();
    const jsonMatch = result.answer.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr) as {
      title?: string;
      steps?: Array<{ title: string; description: string; estimatedTime?: string }>;
    };

    if (parsed.title) title = parsed.title;
    if (parsed.steps) {
      // Preserve status of existing steps that match by title
      updatedSteps = parsed.steps.slice(0, 10).map((newStep, i) => {
        const existing = plan.steps[i];
        return {
          id: existing?.id ?? generateStepId(),
          title: newStep.title,
          description: newStep.description,
          status: existing?.status ?? ("pending" as const),
          estimatedTime: newStep.estimatedTime,
          completedAt: existing?.completedAt,
          notes: existing?.notes,
        };
      });
    }
  } catch {
    // Keep existing plan if parsing fails
  }

  const now = new Date().toISOString();
  const updated: PlanningSession = {
    ...plan,
    title,
    steps: updatedSteps,
    conversationTurns: plan.conversationTurns + 1,
    updatedAt: now,
  };

  const slug = `${PLAN_SLUG_PREFIX}/${planId}`;
  await api.brain.updatePage({
    slug,
    type: "copilot_plan",
    content: updated.goal,
    frontmatter: {
      type: "copilot_plan",
      plan_id: planId,
      title: updated.title,
      goal: updated.goal,
      case_slug: updated.caseSlug,
      status: updated.status,
      steps: updated.steps,
      current_step_index: updated.currentStepIndex,
      conversation_turns: updated.conversationTurns,
      created_at: updated.createdAt,
      updated_at: now,
    },
  });

  return updated;
}

export async function abandonPlan(planId: string): Promise<void> {
  const plan = await loadPlan(planId);
  if (!plan) return;

  const slug = `${PLAN_SLUG_PREFIX}/${planId}`;
  await api.brain.updatePage({
    slug,
    type: "copilot_plan",
    content: plan.goal,
    frontmatter: {
      type: "copilot_plan",
      plan_id: planId,
      title: plan.title,
      goal: plan.goal,
      case_slug: plan.caseSlug,
      status: "abandoned",
      steps: plan.steps,
      current_step_index: plan.currentStepIndex,
      conversation_turns: plan.conversationTurns,
      created_at: plan.createdAt,
      updated_at: new Date().toISOString(),
    },
  });
}
