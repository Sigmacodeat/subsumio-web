import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { logger } from "@/lib/logger";

const log = logger("api/legal/deep-analysis/run/cancel");

export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9-]{1,80}$/;

/**
 * Stop a background deep analysis. A run that has not reached the model ends
 * immediately and costs nothing; once the model is answering, the answer is
 * kept and the run reports that the cancel came too late.
 */
export const POST = createHandler(
  {
    action: "legal.deep_analysis",
    rateTier: "standard",
    audit: (_ctx, _body, _query, req) => ({
      action: "legal.deep_analysis" as const,
      entityType: "document",
      details: { cancel: true, run: req ? new URL(req.url).pathname.split("/").at(-2) : null },
    }),
  },
  async (ctx, _body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    if (!ID_RE.test(id ?? "")) return apiError("invalid_id", "Ungültige Lauf-Kennung", 400);
    try {
      const upstream = await fetch(
        `${ENGINE_URL}/api/legal/deep-analysis/run/deep_analysis/${encodeURIComponent(id)}/cancel`,
        {
          method: "POST",
          headers: { ...ctx.headers, "Content-Type": "application/json" },
          body: "{}",
          signal: AbortSignal.timeout(15_000),
        }
      );
      const payload = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
      if (!upstream.ok) {
        return Response.json(payload.error ? payload : { error: `Engine ${upstream.status}` }, {
          status: upstream.status,
        });
      }
      return Response.json(payload);
    } catch (err) {
      log.error(
        "[deep-analysis/cancel] engine unreachable:",
        err instanceof Error ? err.message : err
      );
      return apiError("service_unavailable", "Engine nicht erreichbar", 503);
    }
  }
);
