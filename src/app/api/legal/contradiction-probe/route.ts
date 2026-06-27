import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

export const maxDuration = 30;

const schema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
});

/**
 * GET /api/legal/contradiction-probe?case_slug=...
 *
 * Retrieves semantic contradiction findings from the GBrain engine's
 * eval_contradictions_runs table (populated by the nightly contradiction
 * probe cron). Returns findings filtered by the case slug.
 *
 * Unlike /api/legal/contradictions (which cross-checks structured document
 * analysis fields), this surfaces LLM-judge verdicts on chunk pairs —
 * semantic contradictions that keyword matching can't catch.
 */

export const GET = createHandler(
  {
    action: "legal.contradictions",
    rateTier: "standard",
    query: schema,
  },
  async (ctx, _body, query) => {
    const headers: Record<string, string> = {};
    if (ctx.headers["x-subsumio-api-key"]) {
      headers["x-subsumio-api-key"] = ctx.headers["x-subsumio-api-key"];
    }
    headers["x-subsumio-source"] = ctx.headers["x-subsumio-source"] ?? "law-de";

    // Call the engine's find_contradictions operation via the think API
    // The engine reads eval_contradictions_runs and filters by slug
    const res = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `find_contradictions slug=${query?.case_slug ?? ""}`,
        tools: ["find_contradictions"],
        tool_choice: "find_contradictions",
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const text = await res.text();
      return apiError("engine_error", `Engine returned ${res.status}: ${text}`, res.status);
    }

    const data = await res.json();

    // The engine returns findings from the latest probe run
    const findings = Array.isArray(data.findings) ? data.findings : [];
    const lastRun = data.last_run ?? null;

    return Response.json({
      findings: findings.map((f: Record<string, unknown>) => ({
        chunk_a: f.a ?? f.chunk_a ?? "",
        chunk_b: f.b ?? f.chunk_b ?? "",
        severity: f.severity ?? "medium",
        axis: f.axis ?? null,
        explanation: f.explanation ?? f.reasoning ?? "",
        slug: f.slug ?? query?.case_slug ?? "",
      })),
      total: findings.length,
      last_run: lastRun,
      probe_available: findings.length > 0 || lastRun !== null,
    });
  }
);
