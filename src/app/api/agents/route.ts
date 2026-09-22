import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, recordCreditConsumption } from "@/lib/api-handler";

import { logger } from "@/lib/logger";
const log = logger("api/agents");

export const maxDuration = 300;

// Strict: the model, the critic and the budget are server policy, not user
// input (was `.passthrough()` — a user could pick any vendor model, skip the
// critic and lift the spend cap).
const agentsPostSchema = z
  .object({
    prompt: z.string().min(1, "prompt_required").max(10_000, "prompt_too_long"),
    force_specialists: z.array(z.string().max(60)).max(4).optional(),
    model: z.string().max(80).optional(),
    // Accepted for client compatibility and IGNORED: the critic always runs
    // for user-started agent runs.
    skip_critic: z.boolean().optional(),
  })
  .strict();

export const GET = createHandler(
  {
    action: "agent.read",
    rateTier: "heavy",
  },
  async (ctx, _body, _query, req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/agents`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const jobs: Record<string, unknown>[] = data.jobs ?? [];

      const url = new URL(req.url);
      const filter = url.searchParams.get("filter");
      if (filter === "rundown") {
        const filtered = jobs.filter((j) => {
          const name = String(j.name ?? "").toLowerCase();
          return name.includes("rundown") || name.includes("briefing");
        });
        return Response.json({ jobs: filtered });
      }
      if (filter === "next-steps") {
        const caseSlug = url.searchParams.get("case") ?? "";
        const prefix = `next-steps:${caseSlug}`;
        const filtered = jobs.filter((j) => String(j.name ?? "") === prefix);
        return Response.json({ jobs: filtered });
      }

      return Response.json({ jobs });
    } catch (err) {
      log.error("[agents] list failed:", err instanceof Error ? err.message : String(err));
      return Response.json({ jobs: [] });
    }
  }
);

export const POST = createHandler(
  {
    action: "agent.write",
    rateTier: "heavy",
    credits: "agent",
    body: agentsPostSchema,
    audit: (ctx, body) => ({
      action: "agent.supervisor_run" as const,
      entityType: "agent_job",
      details: { user: ctx.user.email, prompt_length: body.prompt.length },
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const upstream = await fetch(`${ENGINE_URL}/api/agents/supervisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          prompt: body.prompt,
          ...(body.force_specialists ? { force_specialists: body.force_specialists } : {}),
          // Catalogue id only; the engine maps it (unknown ids are ignored).
          ...(body.model ? { supervisor_model: body.model } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!upstream.ok) {
        return new Response(JSON.stringify({ error: `Engine returned ${upstream.status}` }), {
          status: upstream.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      const job = await upstream.json();
      void recordCreditConsumption(ctx, "agent");
      return Response.json(job);
    } catch (err) {
      log.error("[agents] supervisor failed:", err instanceof Error ? err.message : String(err));
      return apiError("engine_unavailable", "Engine nicht erreichbar", 503);
    }
  }
);
