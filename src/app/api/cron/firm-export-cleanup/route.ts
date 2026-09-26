import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { env } from "@/lib/env";
import { createFirmExportReadyNotification } from "@/lib/comments";

import { logger } from "@/lib/logger";
const log = logger("api/cron/firm-export-cleanup");

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface FinishedExport {
  id: number;
  user_id: string | null;
  web_brain_id: string | null;
  expires_at: string | null;
  complete: boolean;
}

/**
 * GET /api/cron/firm-export-cleanup — every 15 minutes.
 *
 * Deletes full firm exports whose download link expired (or that were
 * downloaded) from storage, and tells the requesting admin once when an
 * export has finished. The engine hands out each finished export only once.
 */
export const GET = createCronHandler(async (_req: NextRequest) => {
  const headers: Record<string, string> = {};
  const apiKey = env("SUBSUMIO_WEB_API_KEY");
  if (apiKey) headers["x-subsumio-api-key"] = apiKey;
  // Tenant-free housekeeping; the header only satisfies the source check.
  headers["x-subsumio-source"] = "law-de";

  const res = await fetch(`${ENGINE_URL}/api/firm-export/sweep`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(100_000),
  });
  if (!res.ok) {
    throw new Error(`firm-export sweep failed: ${res.status} ${await res.text()}`);
  }
  const result = (await res.json()) as { deleted: number; finished: FinishedExport[] };

  let notified = 0;
  for (const f of result.finished ?? []) {
    if (!f.user_id || !f.web_brain_id) continue;
    await createFirmExportReadyNotification({
      userId: f.user_id,
      brainId: f.web_brain_id,
      exportId: f.id,
      expiresAt: f.expires_at,
      complete: f.complete,
    });
    notified++;
  }
  log.info(`[cron:firm-export-cleanup] deleted=${result.deleted} notified=${notified}`);
  return Response.json({ deleted: result.deleted, notified });
});
