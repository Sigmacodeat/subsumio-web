import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const maxDuration = 30;

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 10,
  },
  async (ctx, _body, _query, req) => {
    const { runId } = await (
      req as unknown as {
        params: Promise<{ runId: string }>;
      }
    ).params;
    if (!runId) {
      return apiError("missing_run_id", "Run ID is required.", 400);
    }

    try {
      const res = await fetch(
        `${ENGINE_URL}/api/legal/case-investigation/${encodeURIComponent(runId)}`,
        {
          headers: ctx.headers,
          signal: AbortSignal.timeout(20_000),
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
