import { NextResponse } from "next/server";
import { z } from "zod";
import { createHandler, apiError, recordCreditConsumption } from "@/lib/api-handler";
import { canAffordOptionalLlm } from "@/lib/billing/optional-llm-credits";
import {
  createPlan,
  loadPlan,
  listPlans,
  updatePlanStep,
  refinePlan,
  abandonPlan,
  proposeStepAction,
  markStepExecuted,
  type PlanStepStatus,
  type PlanStatus,
} from "@/lib/planning-session";

import { logger } from "@/lib/logger";
const log = logger("api/copilot/plan");

const planPostSchema = z.object({
  action: z.enum(["create", "refine", "abandon", "step", "propose", "executed"]).optional(),
  goal: z.string().max(5000).optional(),
  caseSlug: z.string().max(200).optional(),
  planId: z.string().max(200).optional(),
  feedback: z.string().max(5000).optional(),
  stepId: z.string().max(200).optional(),
  status: z.enum(["pending", "in_progress", "done", "skipped"]).optional(),
  notes: z.string().max(5000).optional(),
  tool: z.string().max(100).optional(),
  resultSummary: z.string().max(1000).optional(),
});

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, query) => {
    const planId = query?.planId;
    const caseSlug = query?.caseSlug;
    const status = query?.status as PlanStatus | undefined;

    try {
      if (planId) {
        const plan = await loadPlan(ctx.headers, planId);
        if (!plan) return apiError("not_found", "Plan not found", 404);
        return NextResponse.json({ plan });
      }

      const plans = await listPlans(ctx.headers, { caseSlug, status });
      return NextResponse.json({ plans });
    } catch (err) {
      log.error("[copilot/plan] GET failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Failed to load plans", 500);
    }
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "search",
    body: planPostSchema,
    audit: (_ctx, body) => {
      const b = body as {
        action?: string;
        goal?: string;
        caseSlug?: string;
        planId?: string;
        feedback?: string;
      };
      return {
        action: "copilot.plan_create" as const,
        entityType: "plan",
        details: {
          subAction: b.action,
          caseSlug: b.caseSlug,
          planId: b.planId,
          goalLength: b.goal?.length ?? 0,
        },
      };
    },
  },
  async (ctx, body) => {
    const { action, goal, caseSlug, planId, feedback, stepId, tool, resultSummary } = body as {
      action?: string;
      goal?: string;
      caseSlug?: string;
      planId?: string;
      feedback?: string;
      stepId?: string;
      tool?: string;
      resultSummary?: string;
    };

    // Only plan creation and step proposals call the model; bookkeeping
    // (refine notes, abandon, executed) stays free even at zero balance, so
    // `credits:` on createHandler would refuse too much.
    const usesModel = (action === "create" && goal) || (action === "propose" && planId && stepId);
    if (usesModel && !(await canAffordOptionalLlm(ctx, "think"))) {
      return apiError("insufficient_credits", "Nicht genügend Credits für die Planung.", 402);
    }

    try {
      if (action === "create" && goal) {
        const plan = await createPlan(ctx.headers, { goal, caseSlug });
        void recordCreditConsumption(ctx, "think");
        return NextResponse.json({ plan });
      }

      if (action === "refine" && planId && feedback) {
        const plan = await refinePlan(ctx.headers, planId, feedback);
        return NextResponse.json({ plan });
      }

      if (action === "propose" && planId && stepId) {
        const proposal = await proposeStepAction(ctx.headers, planId, stepId);
        if (!proposal) return apiError("not_found", "Plan or step not found", 404);
        void recordCreditConsumption(ctx, "think");
        return NextResponse.json({ proposal });
      }

      if (action === "executed" && planId && stepId && tool) {
        await markStepExecuted(ctx.headers, planId, stepId, tool, resultSummary ?? "");
        return NextResponse.json({ ok: true });
      }

      return apiError("bad_request", "Invalid action or missing fields", 400);
    } catch (err) {
      log.error("[copilot/plan] POST failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Failed to process plan", 500);
    }
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: planPostSchema,
    audit: (_ctx, body) => {
      const b = body as {
        planId?: string;
        stepId?: string;
        status?: string;
        notes?: string;
      };
      return {
        action: "copilot.plan_update" as const,
        entityType: "plan",
        entityId: b.planId,
        details: { stepId: b.stepId, status: b.status },
      };
    },
  },
  async (ctx, body) => {
    const { planId, stepId, status, notes } = body as {
      planId?: string;
      stepId?: string;
      status?: PlanStepStatus;
      notes?: string;
    };

    if (!planId || !stepId || !status) {
      return apiError("bad_request", "planId, stepId, and status required", 400);
    }

    try {
      await updatePlanStep(ctx.headers, planId, stepId, { status, notes });
      return NextResponse.json({ ok: true });
    } catch (err) {
      log.error("[copilot/plan] PATCH failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Failed to update step", 500);
    }
  }
);

export const DELETE = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    audit: (_ctx, body) => {
      const b = (body ?? {}) as { planId?: string };
      return {
        action: "copilot.plan_abandon" as const,
        entityType: "plan",
        entityId: b.planId,
        details: {},
      };
    },
  },
  async (ctx, body) => {
    const { planId } = (body ?? {}) as { planId?: string };

    if (!planId) return apiError("bad_request", "planId required", 400);

    try {
      await abandonPlan(ctx.headers, planId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      log.error("[copilot/plan] DELETE failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Failed to abandon plan", 500);
    }
  }
);
