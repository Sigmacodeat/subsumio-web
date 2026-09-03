import { NextResponse } from "next/server";
import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import {
  createPlan,
  loadPlan,
  listPlans,
  updatePlanStep,
  refinePlan,
  abandonPlan,
  type PlanStepStatus,
  type PlanStatus,
} from "@/lib/planning-session";

const planPostSchema = z.object({
  action: z.enum(["create", "refine", "abandon", "step"]).optional(),
  goal: z.string().max(5000).optional(),
  caseSlug: z.string().max(200).optional(),
  planId: z.string().max(200).optional(),
  feedback: z.string().max(5000).optional(),
  stepId: z.string().max(200).optional(),
  status: z.enum(["pending", "in_progress", "done", "skipped"]).optional(),
  notes: z.string().max(5000).optional(),
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
        const plan = await loadPlan(planId);
        if (!plan) return apiError("not_found", "Plan not found", 404);
        return NextResponse.json({ plan });
      }

      const plans = await listPlans({ caseSlug, status });
      return NextResponse.json({ plans });
    } catch (err) {
      console.error("[copilot/plan] GET failed:", err instanceof Error ? err.message : String(err));
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
    const { action, goal, caseSlug, planId, feedback } = body as {
      action?: string;
      goal?: string;
      caseSlug?: string;
      planId?: string;
      feedback?: string;
    };

    try {
      if (action === "create" && goal) {
        const plan = await createPlan({ goal, caseSlug });
        return NextResponse.json({ plan });
      }

      if (action === "refine" && planId && feedback) {
        const plan = await refinePlan(planId, feedback);
        return NextResponse.json({ plan });
      }

      return apiError("bad_request", "Invalid action or missing fields", 400);
    } catch (err) {
      console.error(
        "[copilot/plan] POST failed:",
        err instanceof Error ? err.message : String(err)
      );
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
      await updatePlanStep(planId, stepId, { status, notes });
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error(
        "[copilot/plan] PATCH failed:",
        err instanceof Error ? err.message : String(err)
      );
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
      await abandonPlan(planId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error(
        "[copilot/plan] DELETE failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Failed to abandon plan", 500);
    }
  }
);
