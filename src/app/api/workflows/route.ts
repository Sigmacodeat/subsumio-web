import { z } from "zod";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import {
  WORKFLOW_TEMPLATES,
  getTemplate,
  buildWorkflowFrontmatter,
  buildWorkflowSlug,
  buildWorkflowTitle,
  buildWorkflowSteps,
  buildWorkflowEvent,
  fmToWorkflowInstance,
  inferWorkflowStatus,
  advanceStep,
  advanceStepIdempotent,
  type WorkflowInstance,
} from "@/lib/workflow";

export const maxDuration = 30;

// ── GET: List workflows + templates ────────────────────────────────────

export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages?type=workflow&limit=200`, {
        headers: engineHeadersForBrain(ctx.brainId),
      });

      let workflows: WorkflowInstance[] = [];
      if (res.ok) {
        const raw = await res.json();
        const pages = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as Record<string, unknown>)?.pages)
            ? (raw as Record<string, unknown[]>).pages
            : [];
        workflows = pages
          .map((p) => fmToWorkflowInstance(p))
          .filter((w): w is WorkflowInstance => w !== null);
      }

      return apiSuccess({
        workflows,
        templates: WORKFLOW_TEMPLATES,
        total: workflows.length,
      });
    } catch (err) {
      return apiError(
        "workflows_list_failed",
        err instanceof Error ? err.message : "workflows_list_failed",
        500
      );
    }
  }
);

// ── POST: Start a new workflow ─────────────────────────────────────────

const startSchema = z.object({
  template_id: z.string().min(1),
  prompt: z.string().optional(),
  case_slug: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    body: startSchema,
  },
  async (ctx, body, _query, _req) => {
    try {
      const template = getTemplate(body.template_id);
      if (!template) {
        return apiError(
          "template_not_found",
          `Workflow-Template '${body.template_id}' nicht gefunden.`,
          404
        );
      }

      const prompt = body.prompt || template.prompt;
      const startedBy = ctx.user?.email || ctx.user?.name || "system";
      const frontmatter = buildWorkflowFrontmatter({
        template_id: body.template_id,
        prompt,
        started_by: startedBy,
        case_slug: body.case_slug,
      });
      const slug = buildWorkflowSlug(body.template_id);
      const title = buildWorkflowTitle(template);

      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: {
          ...engineHeadersForBrain(ctx.brainId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug,
          title,
          type: "workflow",
          content: prompt,
          frontmatter,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return apiError("workflow_create_failed", "Workflow konnte nicht erstellt werden", 502);
      }

      broadcastSseEvent(
        ctx.brainId,
        "workflow.started",
        buildWorkflowEvent("started", { slug, title, frontmatter })
      );

      return apiSuccess({
        slug,
        title,
        frontmatter,
        message: `Workflow '${template.label}' gestartet.`,
      });
    } catch (err) {
      return apiError(
        "workflow_start_failed",
        err instanceof Error ? err.message : "workflow_start_failed",
        500
      );
    }
  }
);

// ── PATCH: Advance a workflow step ─────────────────────────────────────

const patchSchema = z.object({
  slug: z.string().min(1),
  step_id: z.string().min(1),
  new_status: z.enum(["pending", "running", "approved", "rejected", "skipped"]),
  agent_action_slug: z.string().optional(),
  error: z.string().optional(),
});

export const PATCH = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    body: patchSchema,
  },
  async (ctx, body, _query, _req) => {
    try {
      // Load the workflow page
      const path = body.slug.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
        headers: engineHeadersForBrain(ctx.brainId),
      });

      if (!res.ok) {
        return apiError("workflow_not_found", `Workflow '${body.slug}' nicht gefunden.`, 404);
      }

      const page = (await res.json()) as {
        slug: string;
        title: string;
        frontmatter?: Record<string, unknown>;
      };

      const instance = fmToWorkflowInstance(page);
      if (!instance) {
        return apiError("invalid_workflow", "Seite ist kein Workflow.", 400);
      }

      // Advance the step (idempotent — rejects terminal step re-advancement)
      const idemResult = advanceStepIdempotent(
        instance.frontmatter.steps,
        body.step_id,
        body.new_status,
        {
          agent_action_slug: body.agent_action_slug,
          error: body.error,
        }
      );
      if (!idemResult.ok) {
        return apiError("step_idempotency_violation", idemResult.reason, 409);
      }
      const updatedSteps = idemResult.steps;

      const updatedStatus = inferWorkflowStatus(updatedSteps);
      const updatedFrontmatter = {
        ...instance.frontmatter,
        steps: updatedSteps,
        status: updatedStatus,
        completed_at:
          updatedStatus === "completed" || updatedStatus === "failed"
            ? new Date().toISOString()
            : instance.frontmatter.completed_at,
      };

      // Save back
      const updateRes = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "PUT",
        headers: {
          ...engineHeadersForBrain(ctx.brainId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug: body.slug,
          title: instance.title,
          frontmatter: updatedFrontmatter,
        }),
      });

      if (!updateRes.ok) {
        const text = await updateRes.text().catch(() => "");
        return apiError("workflow_update_failed", "Workflow konnte nicht aktualisiert werden", 502);
      }

      broadcastSseEvent(
        ctx.brainId,
        "workflow.step_changed",
        buildWorkflowEvent("step_changed", {
          slug: body.slug,
          step_id: body.step_id,
          new_status: body.new_status,
          workflow_status: updatedStatus,
          frontmatter: updatedFrontmatter,
        })
      );

      return apiSuccess({
        slug: body.slug,
        frontmatter: updatedFrontmatter,
        message: `Step '${body.step_id}' → ${body.new_status}`,
      });
    } catch (err) {
      return apiError(
        "workflow_advance_failed",
        err instanceof Error ? err.message : "workflow_advance_failed",
        500
      );
    }
  }
);
