import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";

export const dynamic = "force-dynamic";

/** Revoke an MCP token (engine sets revoked_at; tokens are never deleted). */
export const DELETE = createHandler(
  {
    action: "settings.write",
    admin: true,
    rateTier: "standard",
    audit: () => ({ action: "settings.update" as const, entityType: "mcp_token" }),
  },
  async (ctx, _body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const res = await fetch(`${ENGINE_URL}/api/mcp-tokens/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: engineHeadersForBrain(ctx.brainId),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return apiError("not_found", "Token nicht gefunden", 404);
    if (!res.ok) return apiError("engine_error", "Token konnte nicht widerrufen werden", 502);
    return Response.json({ ok: true });
  }
);
