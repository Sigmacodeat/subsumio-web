/**
 * GET /api/health/credits — Provider Credits Health Check.
 *
 * Pings each configured LLM provider (Anthropic, OpenRouter) with a
 * minimal request (max_tokens=1) to detect depleted credits BEFORE
 * a pipeline run fails mid-flight.
 *
 * Returns per-provider status:
 *   { providers: { anthropic: { status, latencyMs, error? }, ... }, allOk: boolean }
 *
 * Public endpoint (no auth) — only reveals provider names + ok/not-ok,
 * NOT API keys or credit balances. Used by:
 *   - Admin UI health dashboard
 *   - Pipeline pre-flight check (server/src/core/ai/credits-preflight.ts)
 *   - Uptime monitoring
 *
 * The actual check logic lives in the shared module so the engine's
 * pre-flight check and this HTTP endpoint use the same code path.
 */

import { createPublicHandler } from "@/lib/api-handler";
import { getCreditsHealth } from "@/lib/credits-health-shared";

export const dynamic = "force-dynamic";

export const GET = createPublicHandler(
  {
    cacheMaxAge: 0, // getCreditsHealth does its own 60s in-memory caching
  },
  async () => {
    const data = await getCreditsHealth();
    // 503 if any configured provider is depleted/erroring
    const httpStatus = data.allOk ? 200 : 503;
    return Response.json(data, { status: httpStatus });
  }
);
