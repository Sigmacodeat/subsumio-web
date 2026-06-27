import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/contradiction-probe — nightly contradiction probe.
 *
 * Triggers the engine's eval suspected-contradictions with Haiku judge
 * (low cost, ~$0.50 budget cap). Results are stored in
 * eval_contradictions_runs and can be read by the find_contradictions
 * MCP operation / subagent tool.
 */

export const GET = createCronHandler(async (_req: NextRequest) => {
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;
  headers["x-subsumio-source"] = "law-de";

  const res = await fetch(`${ENGINE_URL}/api/admin/contradiction-probe`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      budget_usd: 0.5,
      top_k: 5,
      limit: 20,
    }),
    signal: AbortSignal.timeout(280_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`contradiction-probe failed: ${res.status} ${text}`);
  }

  const result = (await res.json()) as { status: string; message: string };

  return Response.json({
    success: result.status === "ok",
    status: result.status,
    message: result.message,
  });
});
