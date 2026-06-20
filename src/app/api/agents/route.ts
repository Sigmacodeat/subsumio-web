
import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

const agentsPostSchema = z.object({
  prompt: z.string().min(1, "prompt_required").max(10_000, "prompt_too_long"),
}).passthrough();

export const GET = createHandler(
  {
    action: "agent.read",
    rateTier: "heavy",
  },
  async (ctx, _body, _query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/agents`, { headers: ctx.headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Response.json(await res.json());
    } catch (err) {
      console.error("[agents] list failed:", err instanceof Error ? err.message : String(err));
      return Response.json({ jobs: [] });
    }
  },
);

export const POST = createHandler(
  {
    action: "agent.write",
    rateTier: "heavy",
    body: agentsPostSchema,
  },
  async (ctx, body, _query, _req) => {
    try {
      const upstream = await fetch(`${ENGINE_URL}/api/agents/supervisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(body),
      });

      if (!upstream.ok) {
        return new Response(
          JSON.stringify({ error: `Engine returned ${upstream.status}` }),
          { status: upstream.status, headers: { "Content-Type": "application/json" } },
        );
      }

      return Response.json(await upstream.json());
    } catch (err) {
      console.error("[agents] supervisor failed:", err instanceof Error ? err.message : String(err));
      return apiError("engine_unavailable", "Engine nicht erreichbar", 503);
    }
  },
);
