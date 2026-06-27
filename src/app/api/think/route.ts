import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { recordQuery } from "@/lib/usage";
import { createHandler, apiStream, apiError, recordQuota } from "@/lib/api-handler";
import { createCitationGateStream } from "@/lib/citation-gate";
import { sanitizeObjectStrings } from "@/lib/prompt-sanitizer";
import { mapQueryModeToEngineMode } from "@/lib/matter-context";

export const maxDuration = 300;

const thinkSchema = z.object({
  query: z.string().min(1, "query_required").max(10_000, "query_too_long"),
  mode: z.enum(["conservative", "balanced", "tokenmax"]).default("balanced"),
  query_mode: z.enum(["conservative", "balanced", "deep_matter"]).default("balanced"),
  case_slug: z.string().optional(),
  model: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "query.submit",
    rateTier: "heavy",
    quota: "queries",
    body: thinkSchema,
    audit: (_ctx, body) => ({
      action: "query.submit" as const,
      entityType: "query",
      details: { mode: body.mode, query_mode: body.query_mode, case_slug: body.case_slug },
    }),
  },
  async (ctx, body, _query, _req) => {
    void recordQuery(ctx.brainId);
    void recordQuota(ctx, "queries");

    try {
      const safeBody = sanitizeObjectStrings(body);

      const engineMode = mapQueryModeToEngineMode(body.query_mode);
      const payload = {
        query: safeBody.query,
        mode: engineMode,
        case_slug: safeBody.case_slug,
        query_mode: body.query_mode,
        model: body.model,
      };

      const upstream = await fetch(`${ENGINE_URL}/api/think`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(300_000),
      });

      if (!upstream.ok) {
        return apiError("engine_error", `Engine returned ${upstream.status}`, upstream.status);
      }

      if (!upstream.body) {
        return apiError("engine_error", "Engine returned empty body", 502);
      }

      return apiStream(createCitationGateStream(upstream.body), {
        contentType: upstream.headers.get("Content-Type") || "text/event-stream",
        aiGenerated: true,
      });
    } catch (err) {
      console.error(
        "[think] engine unreachable:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("service_unavailable", "Engine nicht erreichbar", 503);
    }
  }
);
