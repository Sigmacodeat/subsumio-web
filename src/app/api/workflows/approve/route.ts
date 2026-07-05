import { createHandler, type HandlerContext } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { apiSuccess, apiError } from "@/lib/api-response";
import { advanceStepIdempotent, type WorkflowStep } from "@/lib/workflow";
import { z } from "zod";

export const dynamic = "force-dynamic";

const approvalSchema = z.object({
  workflowSlug: z.string(),
  stepId: z.string(),
  action: z.enum(["approve", "reject"]),
  comment: z.string().optional(),
});

/**
 * POST /api/workflows/approve
 *
 * Approve or reject a workflow step that requires human approval.
 * Updates the step's approval_status and optionally adds a comment.
 */
async function approveStepHandler(ctx: HandlerContext, body: z.infer<typeof approvalSchema>) {
  const { workflowSlug, stepId, action, comment } = body;
  const userId = ctx.user.id;

  // Fetch workflow page (tenant-scoped via ctx.headers)
  const encodedSlug = workflowSlug.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodedSlug}`, {
    headers: ctx.headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    return apiError("workflow_not_found", "Workflow nicht gefunden", 404);
  }

  const workflow = await res.json();
  const steps: WorkflowStep[] | undefined = workflow.frontmatter?.steps;

  if (!Array.isArray(steps)) {
    return apiError("invalid_workflow", "Workflow hat kein gültiges steps-Array", 400);
  }

  const step = steps.find((s) => s.id === stepId);
  if (!step) {
    return apiError("step_not_found", "Schritt nicht gefunden", 404);
  }

  if (!step.requires_approval) {
    return apiError(
      "step_does_not_require_approval",
      "Dieser Schritt erfordert keine Freigabe",
      400
    );
  }

  // Idempotent state transition: rejects double-approval / race conditions
  // if the step is already in a terminal status.
  const newStatus = action === "approve" ? "approved" : "rejected";
  const result = advanceStepIdempotent(steps, stepId, newStatus);
  if (!result.ok) {
    return apiError("already_decided", result.reason, 409);
  }

  const now = new Date().toISOString();
  const updatedSteps = result.steps.map((s) =>
    s.id === stepId
      ? {
          ...s,
          approval_status: newStatus,
          approved_by: userId,
          approved_at: now,
          approval_comment: comment ?? s.approval_comment,
        }
      : s
  );

  // Update workflow page — the engine only supports GET+POST(merge:true) on
  // /api/pages, there is no PATCH route (see enginePatchPage docs).
  const updateRes = await enginePatchPage(ctx.headers, {
    slug: workflowSlug,
    frontmatter: { steps: updatedSteps },
  });

  if (!updateRes.ok) {
    return apiError("update_failed", "Aktualisierung fehlgeschlagen", 502);
  }

  return apiSuccess({
    workflowSlug,
    stepId,
    action,
    approvalStatus: newStatus,
  });
}

export const POST = createHandler(
  {
    action: "workflow.approve",
    rateTier: "standard",
    body: approvalSchema,
    audit: (ctx, body) => ({
      action: "workflow.approve" as const,
      entityType: "workflow_step",
      entityId: body.stepId,
      details: { workflowSlug: body.workflowSlug, action: body.action },
    }),
  },
  approveStepHandler
);
