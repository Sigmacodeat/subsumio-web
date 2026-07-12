import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/statute-currency — tägliches Check ob Gesetze veraltet sind.
 *
 * Ruft den Engine-Endpunkt /api/operations/statute_currency_check auf,
 * der die version_date der DB-Seiten gegen law-corpus Referenzdaten
 * und Live-Quellen (RIS-OGD, buzer.de, OpenCaseLaw) vergleicht.
 *
 * Bei veralteten Gesetzen wird /api/admin/law-sync getriggert,
 * um aktualisierte law-corpus Dateien zu importieren.
 */

export const GET = createCronHandler(async (_req: NextRequest) => {
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  const headers: Record<string, string> = {};
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;

  // Step 1: Run currency check
  const checkRes = await fetch(`${ENGINE_URL}/api/operations`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "statute_currency_check" }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!checkRes.ok) {
    const text = await checkRes.text();
    throw new Error(`statute-currency check failed: ${checkRes.status} ${text}`);
  }

  const checkResult = (await checkRes.json()) as {
    result?: {
      jurisdictions?: Record<string, {
        checked?: number;
        current?: number;
        outdated?: number;
        unknown?: number;
        outdated_laws?: Array<{ statute: string; db_version: string; live_version: string }>;
      }>;
    };
  };

  const jurisdictions = checkResult.result?.jurisdictions ?? {};
  const totalOutdated = Object.values(jurisdictions).reduce(
    (sum, j) => sum + (j.outdated ?? 0),
    0
  );

  // Step 2: If outdated laws found, trigger law-sync to reimport
  let syncResult = null;
  if (totalOutdated > 0) {
    const syncRes = await fetch(`${ENGINE_URL}/api/admin/law-sync`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(240_000),
    });
    if (syncRes.ok) {
      syncResult = await syncRes.json();
    }
  }

  return Response.json({
    checked: Object.values(jurisdictions).reduce((s, j) => s + (j.checked ?? 0), 0),
    current: Object.values(jurisdictions).reduce((s, j) => s + (j.current ?? 0), 0),
    outdated: totalOutdated,
    unknown: Object.values(jurisdictions).reduce((s, j) => s + (j.unknown ?? 0), 0),
    jurisdictions,
    sync_triggered: totalOutdated > 0,
    sync_result: syncResult,
  });
});
