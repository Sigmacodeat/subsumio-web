import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { apiError, apiSuccess } from "@/lib/api-response";
import { ENGINE_URL } from "@/lib/engine";

export const maxDuration = 60;

const resumePipelineSchema = z.object({
  case_slug: z.string().min(1).max(200),
  resume_from_layer: z.number().int().min(1).max(10).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: resumePipelineSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "case",
      details: { case_slug: body.case_slug, pipeline_resume: true },
    }),
  },
  async (ctx, body, _query, _req) => {
    const res = await fetch(`${ENGINE_URL}/api/pipeline/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        case_slug: body.case_slug,
        resume_from_layer: body.resume_from_layer ?? 3,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return apiError("pipeline_resume_failed", errText || `Engine ${res.status}`, res.status);
    }

    const data = await res.json().catch(() => ({}));
    return apiSuccess({
      status: data.status ?? "resumed",
      case_slug: body.case_slug,
    });
  }
);
