import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { validateCronAuth } from "@/lib/cron-auth";
import { getRecipientsByBrain } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/case-scanner — Nightly Legal Case Scanner.
 *
 * Läuft als Vercel Cron (vercel.json) oder manuell:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/case-scanner
 *
 * Pro Brain (Kanzlei): scannt alle legal_case Pages und startet
 * Supervisor-Jobs für Akten mit kritischen Fristen, fehlendem Evidence
 * oder stale Analysen.
 */

async function triggerCaseScanner(brainId: string): Promise<{ ok: boolean; job_id?: number; error?: string }> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/legal/case-scanner`, {
      method: "POST",
      headers: {
        ...engineHeadersForBrain(brainId),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        look_ahead_days: 7,
        evidence_threshold: 1,
        max_cases: 50,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: false, error: String(data.message ?? data.error ?? `HTTP ${res.status}`) };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return {
      ok: true,
      job_id: typeof data.job_id === "number" ? data.job_id : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: NextRequest) {
  const authError = validateCronAuth(req);
  if (authError) return authError;

  // Brain → Org-Mapping (shared helper)
  const recipientsByBrain = await getRecipientsByBrain();
  const brainIds = new Set(recipientsByBrain.keys());

  let brainsChecked = 0;
  let jobsQueued = 0;
  let failures = 0;

  for (const brainId of brainIds) {
    brainsChecked++;
    const result = await triggerCaseScanner(brainId);
    if (result.ok) {
      jobsQueued++;
    } else {
      failures++;
      console.error(`[case-scanner] Brain ${brainId}: ${result.error}`);
    }
  }

  return Response.json({
    ok: true,
    brains_checked: brainsChecked,
    jobs_queued: jobsQueued,
    failures,
  });
}
