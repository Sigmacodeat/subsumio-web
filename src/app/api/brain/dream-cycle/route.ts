import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Starts the installation-wide dream cycle (all firms). Operator only — a
 * firm admin must not trigger work on other firms' data; the engine refuses
 * firm callers as well.
 */
export const POST = createHandler(
  {
    action: "platform.operator",
    rateTier: "heavy",
    audit: (_ctx, _body) => ({
      action: "admin.dr" as const,
      entityType: "brain",
      details: {},
    }),
  },
  async (ctx) => {
    const response = await fetch(`${ENGINE_URL}/api/admin/dream`, {
      method: "POST",
      headers: ctx.headers,
      signal: AbortSignal.timeout(280_000),
    });
    if (!response.ok) {
      return Response.json({ error: "dream_cycle_failed" }, { status: response.status });
    }
    const result = (await response.json()) as Record<string, unknown>;
    return Response.json(result);
  }
);
