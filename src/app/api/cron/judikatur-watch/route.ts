import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { createCronHandler } from "@/lib/api-handler";
import { getRecipientsByBrain } from "@/lib/cron-utils";

import { logger } from "@/lib/logger";
const log = logger("api/cron/judikatur-watch");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/judikatur-watch — nightly Judikatur-Wächter per firm.
 *
 * Queues the engine's judikatur watch (RIS lookups for the norms cited in the
 * firm's matters; new decisions become alerts). No agent runs and no model
 * costs — the agent case scan is on demand only.
 */
async function queueWatch(brainId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/legal/judikatur-watch`, {
      method: "POST",
      headers: { ...engineHeadersForBrain(brainId), "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: false, error: String(data.message ?? data.error ?? `HTTP ${res.status}`) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const GET = createCronHandler(async (_req: NextRequest) => {
  const brainIds = [...(await getRecipientsByBrain()).keys()];
  let queued = 0;
  const errors: string[] = [];
  for (const brainId of brainIds) {
    const result = await queueWatch(brainId);
    if (result.ok) queued++;
    else {
      errors.push(`${brainId}: ${result.error}`);
      log.error("[judikatur-watch] queue failed", { brainId, error: result.error });
    }
  }
  return Response.json(
    { ok: errors.length === 0, brains_checked: brainIds.length, jobs_queued: queued, errors },
    { status: errors.length === 0 ? 200 : 500 }
  );
});
