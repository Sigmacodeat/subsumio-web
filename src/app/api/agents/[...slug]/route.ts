import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

export const maxDuration = 300;

const validActions = new Set(["pause", "resume", "cancel", "replay", "inbox"]);

const inboxSchema = z.object({
  message: z.string().min(1).max(8000).optional(),
  content: z.string().max(8000).optional(),
  query: z.string().max(4000).optional(),
}).passthrough();

export const GET = createHandler(
  {
    action: "agent.control",
    rateTier: "heavy",
  },
  async (ctx, _body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string[] }> }).params;
    const [id, sub] = slug;

    if (!id || isNaN(Number(id))) return apiError("invalid_id", "Ungültige ID", 400);

    const path = sub === "inbox" ? `${id}/inbox` : id;

    try {
      const res = await fetch(`${ENGINE_URL}/api/agents/${path}`, { headers: ctx.headers, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Response.json(await res.json());
    } catch (err) {
      console.error("[agents/slug] get failed:", err instanceof Error ? err.message : String(err));
      return Response.json(
        { error: "not_found", message: "Agent nicht gefunden" },
        { status: 404 }
      );
    }
  }
);

export const POST = createHandler(
  {
    action: "agent.control",
    rateTier: "heavy",
  },
  async (ctx, _body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string[] }> }).params;
    const [id, action] = slug;

    if (!id || isNaN(Number(id))) return apiError("invalid_id", "Ungültige ID", 400);
    if (!action || !validActions.has(action))
      return apiError("invalid_action", "Ungültige Aktion", 400);

    try {
      const isInbox = action === "inbox";
      let body: Record<string, unknown> | undefined;
      if (isInbox) {
        try {
          const raw = await req.json();
          const parsed = inboxSchema.safeParse(raw);
          if (!parsed.success) {
            return apiError("invalid_body", "Ungültiger Request-Body", 400);
          }
          body = parsed.data;
        } catch {
          return apiError("invalid_json", "Ungültiger JSON-Body", 400);
        }
      }

      const res = await fetch(`${ENGINE_URL}/api/agents/${id}/${action}`, {
        method: "POST",
        headers: isInbox ? { "Content-Type": "application/json", ...ctx.headers } : ctx.headers,
        ...(isInbox && body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Response.json(await res.json());
    } catch (err) {
      console.error("[agents/slug] post failed:", err instanceof Error ? err.message : String(err));
      return apiError("engine_unavailable", "Engine nicht erreichbar", 503);
    }
  }
);
