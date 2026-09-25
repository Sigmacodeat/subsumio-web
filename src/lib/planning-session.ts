/**
 * Multi-Turn Planning Mode — Structured planning conversations with the Copilot.
 *
 * Enables the AI to break down complex legal tasks into steps, track progress,
 * and allow the user to modify the plan iteratively across multiple turns.
 *
 * Planning sessions are persisted as brain pages with type "copilot_plan".
 */

import { getEnginePage, writeEnginePage, type EngineHeaders } from "@/lib/engine-page-io";
import { listEnginePages } from "@/lib/engine-pages";
import { engineThink } from "@/lib/engine-think";

// Every function takes the calling route's `ctx.headers`: they carry the
// tenant, the API key and the signed caller identity, so the engine scopes
// plans and the planning answers to the matters this person may see.

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
  /** Copilot-Tool, das der Schritt ausführen könnte (KI-Vorschlag). */
  suggested_tool?: string;
  /** Vorgeschlagene Tool-Parameter (werden vom Nutzer bestätigt). */
  suggested_params?: Record<string, unknown>;
  /** Tatsächlich ausgeführtes Tool + Ergebnis-Notiz. */
  executed_tool?: string;
  executed_at?: string;
}

/**
 * Tools, die ein Plan-Schritt automatisch ausführen darf (Whitelist).
 * Kein `send_email`: Empfänger und Text würde das Modell aus Akteninhalt
 * vorschlagen — E-Mails gehen nur über die reguläre Mail-Maske hinaus.
 */
export const EXECUTABLE_STEP_TOOLS = [
  "create_task",
  "create_deadline",
  "create_contact",
  "request_signature",
  "document_request_create",
  "render_template",
  "register_lookup",
  "invoice_draft",
  "search_cases",
  "search_deadlines",
  "search_tasks",
  "search_calendar",
  "client_lookup",
  "precedent_search",
] as const;

export type ExecutableStepTool = (typeof EXECUTABLE_STEP_TOOLS)[number];

export interface StepActionProposal {
  /** null = Schritt ist manuell (kein passendes Tool). */
  tool: ExecutableStepTool | null;
  params: Record<string, unknown>;
  rationale: string;
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

export async function createPlan(
  headers: EngineHeaders,
  opts: {
    goal: string;
    caseSlug?: string;
    existingSteps?: PlanStep[];
  }
): Promise<PlanningSession> {
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

  const result = await engineThink(headers, {
    query: prompt,
    mode: "balanced",
    queryMode: "deep_matter",
    caseSlug: opts.caseSlug,
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
  await writeEnginePage(headers, {
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

export async function loadPlan(
  headers: EngineHeaders,
  planId: string
): Promise<PlanningSession | null> {
  const slug = `${PLAN_SLUG_PREFIX}/${planId}`;
  const page = await getEnginePage(headers, slug);
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

export async function listPlans(
  headers: EngineHeaders,
  opts?: {
    caseSlug?: string;
    status?: PlanStatus;
  }
): Promise<PlanningSession[]> {
  const pages = await listEnginePages(headers, "copilot_plan", 50);
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
  headers: EngineHeaders,
  planId: string,
  stepId: string,
  updates: Partial<Pick<PlanStep, "status" | "notes">>
): Promise<void> {
  const plan = await loadPlan(headers, planId);
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
  await writeEnginePage(
    headers,
    {
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
    },
    { merge: true }
  );
}

export async function refinePlan(
  headers: EngineHeaders,
  planId: string,
  userFeedback: string
): Promise<PlanningSession> {
  const plan = await loadPlan(headers, planId);
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

  const result = await engineThink(headers, {
    query: prompt,
    mode: "balanced",
    queryMode: "deep_matter",
    caseSlug: plan.caseSlug,
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
  await writeEnginePage(
    headers,
    {
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
    },
    { merge: true }
  );

  return updated;
}

const STEP_ACTION_PROMPT = `Du bist ein Ausführungs-Planer für eine Anwalts-Software. Ein Plan-Schritt soll ausgeführt werden.

PLAN-ZIEL: {goal}
AKTEN-KONTEXT: {case_slug}

SCHRITT: {step_title}
BESCHREIBUNG: {step_description}

Verfügbare Tools (name: Zweck):
{tool_list}

Entscheide, welches Tool diesen Schritt ausführt. Gib NUR JSON zurück:
{{
  "tool": "tool_name" oder null,
  "params": {{ ... passende Parameter für das Tool ... }},
  "rationale": "Ein Satz warum (oder warum kein Tool passt)"
}}

Regeln:
- Wenn der Schritt rein intellektuell ist (prüfen, lesen, entscheiden), gib tool: null zurück.
- Nutze Akten-Kontext als case_slug wo das Tool ihn braucht.
- Parameter müssen zum Schema des Tools passen — im Zweifel nur die Pflichtfelder setzen.`;

/**
 * Proposes a Copilot tool call for a plan step (WP-5.24: sichtbarer Plan →
 * echte Agent-Ausführung). The proposal is advisory — the actual execution
 * goes through `/api/copilot/tools`, which enforces role-gating, the
 * confirmation token flow for mutating tools, and credit checks.
 */
export async function proposeStepAction(
  headers: EngineHeaders,
  planId: string,
  stepId: string
): Promise<StepActionProposal | null> {
  const plan = await loadPlan(headers, planId);
  if (!plan) return null;
  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) return null;

  const toolList = EXECUTABLE_STEP_TOOLS.join(", ");
  const prompt = STEP_ACTION_PROMPT.replace("{goal}", plan.goal)
    .replace("{case_slug}", plan.caseSlug ?? "(keine Akte)")
    .replace("{step_title}", step.title)
    .replace("{step_description}", step.description)
    .replace("{tool_list}", toolList);

  const result = await engineThink(headers, {
    query: prompt,
    mode: "balanced",
    queryMode: "deep_matter",
    caseSlug: plan.caseSlug,
  });

  try {
    let jsonStr = result.answer.trim();
    const jsonMatch = result.answer.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    const parsed = JSON.parse(jsonStr) as {
      tool?: string | null;
      params?: Record<string, unknown>;
      rationale?: string;
    };
    const tool =
      parsed.tool && (EXECUTABLE_STEP_TOOLS as readonly string[]).includes(parsed.tool)
        ? (parsed.tool as ExecutableStepTool)
        : null;
    const params = { ...(parsed.params ?? {}) };
    if (plan.caseSlug && !("case_slug" in params)) params.case_slug = plan.caseSlug;

    // Persist suggestion on the step so the UI can render it on reload.
    step.suggested_tool = tool ?? undefined;
    step.suggested_params = params;
    await persistPlan(headers, plan);

    return {
      tool,
      params,
      rationale: parsed.rationale ?? "",
    };
  } catch {
    return { tool: null, params: {}, rationale: "" };
  }
}

/** Writes the whole plan back (used by proposeStepAction). */
async function persistPlan(headers: EngineHeaders, plan: PlanningSession): Promise<void> {
  const slug = `${PLAN_SLUG_PREFIX}/${plan.id}`;
  await writeEnginePage(
    headers,
    {
      slug,
      type: "copilot_plan",
      content: plan.goal,
      frontmatter: {
        type: "copilot_plan",
        plan_id: plan.id,
        title: plan.title,
        goal: plan.goal,
        case_slug: plan.caseSlug,
        status: plan.status,
        steps: plan.steps,
        current_step_index: plan.currentStepIndex,
        conversation_turns: plan.conversationTurns,
        created_at: plan.createdAt,
        updated_at: new Date().toISOString(),
      },
    },
    { merge: true }
  );
}

/**
 * Marks a step as executed by a tool (called after `/api/copilot/tools`
 * succeeded). Records the tool + result summary in `notes` for audit.
 */
export async function markStepExecuted(
  headers: EngineHeaders,
  planId: string,
  stepId: string,
  tool: string,
  resultSummary: string
): Promise<void> {
  const plan = await loadPlan(headers, planId);
  if (!plan) throw new Error("Plan not found");
  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) throw new Error("Step not found");

  step.status = "completed";
  step.completedAt = new Date().toISOString();
  step.executed_tool = tool;
  step.executed_at = step.completedAt;
  step.notes = resultSummary.slice(0, 500);

  const nextIncomplete = plan.steps.findIndex(
    (s) => s.status === "pending" || s.status === "in_progress"
  );
  plan.currentStepIndex = nextIncomplete >= 0 ? nextIncomplete : plan.steps.length - 1;
  plan.status = plan.steps.every((s) => s.status === "completed" || s.status === "skipped")
    ? "completed"
    : plan.status;
  plan.updatedAt = new Date().toISOString();
  await persistPlan(headers, plan);
}

export async function abandonPlan(headers: EngineHeaders, planId: string): Promise<void> {
  const plan = await loadPlan(headers, planId);
  if (!plan) return;

  const slug = `${PLAN_SLUG_PREFIX}/${planId}`;
  await writeEnginePage(
    headers,
    {
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
    },
    { merge: true }
  );
}
