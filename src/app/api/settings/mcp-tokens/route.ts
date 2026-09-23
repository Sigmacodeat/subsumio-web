import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u, "invalid_name"),
});

/**
 * WP-5.29 — MCP access for the firm brain. Tokens are minted on the engine
 * (access_tokens, namespaced `web-mcp:{brainId}:{label}`) and authenticate
 * MCP clients against the engine's /mcp endpoint. The token value is
 * returned exactly once — the engine stores only its SHA-256 hash.
 */
export const GET = createHandler({ action: "settings.read", rateTier: "standard" }, async (ctx) => {
  const res = await fetch(`${ENGINE_URL}/api/mcp-tokens`, {
    headers: ctx.headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return apiError("engine_error", "Token-Liste konnte nicht geladen werden", 502);
  const data = (await res.json()) as { tokens?: unknown };
  return Response.json({ ...data, endpoint: `${ENGINE_URL}/mcp` });
});

export const POST = createHandler(
  {
    action: "settings.write",
    admin: true,
    rateTier: "standard",
    body: createSchema,
    audit: (_ctx, body) => ({
      action: "settings.update" as const,
      entityType: "mcp_token",
      details: { name: body.name },
    }),
  },
  async (ctx, body) => {
    const res = await fetch(`${ENGINE_URL}/api/mcp-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({ name: body.name }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return apiError(
        data.error ?? "engine_error",
        data.error === "invalid_name"
          ? "Ungültiger Token-Name"
          : "Token konnte nicht erstellt werden",
        res.status === 400 ? 400 : 502
      );
    }
    return apiSuccess(await res.json());
  }
);
