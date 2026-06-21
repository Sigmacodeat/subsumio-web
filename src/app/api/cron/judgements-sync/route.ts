import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { getRecipientsByBrain } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/judgements-sync — täglicher Delta-Import neuer Rechtsprechung.
 *
 * Ruft für jede aktive Kanzlei (brain) den Engine-Endpunkt /api/legal/judgements-sync
 * auf, der RIS-OGD (AT) und openlegaldata (DE) abfragt und neue Entscheidungen in
 * die jeweilige Tenant-Source importiert. Der Cursor pro Jurisdiction wird im Engine
 * persistiert, sodass wiederholte Läufe nur Deltas holen.
 */

export const GET = createCronHandler(async (_req: NextRequest) => {
  const brains = await getRecipientsByBrain();
  const results: { brainId: string; ok: boolean; status?: string; message?: string }[] = [];

  for (const brainId of brains.keys()) {
    const headers = engineHeadersForBrain(brainId);
    try {
      const res = await fetch(`${ENGINE_URL}/api/legal/judgements-sync`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ jurisdiction: "all" }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const text = await res.text();
        results.push({ brainId, ok: false, message: `${res.status}: ${text}` });
      } else {
        const data = (await res.json()) as {
          success: boolean;
          jurisdiction: string;
          fetched: number;
          imported: number;
          errors?: string[];
        };
        results.push({
          brainId,
          ok: true,
          status: `${data.imported}/${data.fetched} imported`,
        });
      }
    } catch (err) {
      results.push({
        brainId,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - okCount;

  return Response.json({
    success: failedCount === 0,
    brains_total: results.length,
    brains_ok: okCount,
    brains_failed: failedCount,
    results,
  });
});
