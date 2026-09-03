import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const maxDuration = 30;

const patchSchema = z.object({
  review_status: z.enum(["accepted", "dismissed", "no_contradiction"]),
  review_reason: z.string().max(1000).optional(),
});

export const PATCH = createHandler(
  {
    action: "legal.case_investigation_review",
    rateTier: "standard",
    body: patchSchema,
    audit: (_ctx, body, _query, req) => {
      // Extract id from URL path synchronously (params is a Promise in App Router)
      const url = new URL(req?.url ?? "");
      const segments = url.pathname.split("/");
      const id = segments[segments.length - 1] ?? "";
      return {
        action: "legal.case_investigation_review" as const,
        entityType: "contradiction",
        entityId: id,
        details: {
          review_status: body.review_status,
          has_reason: Boolean(body.review_reason),
        },
      };
    },
  },
  async (ctx, body, _query, req) => {
    const { runId, id } = await (
      req as unknown as {
        params: Promise<{ runId: string; id: string }>;
      }
    ).params;
    if (!runId || !id) {
      return apiError("missing_params", "runId und id sind erforderlich.", 400);
    }

    try {
      const res = await fetch(
        `${ENGINE_URL}/api/legal/case-investigation/${encodeURIComponent(
          runId
        )}/contradictions/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...ctx.headers },
          body: JSON.stringify({
            review_status: body.review_status,
            review_reason: body.review_reason,
          }),
          signal: AbortSignal.timeout(15_000),
        }
      );
      if (!res.ok) {
        return apiError("engine_error", `Engine request failed: ${res.status}`, 502);
      }
      const data = await res.json();
      return apiSuccess(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown_error";
      return apiError("engine_unreachable", message, 502);
    }
  }
);
