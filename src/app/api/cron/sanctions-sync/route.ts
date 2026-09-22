import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { refreshAllSanctionsLists } from "@/lib/sanctions/store";
import { logger } from "@/lib/logger";

const log = logger("api/cron/sanctions-sync");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/sanctions-sync — refreshes every configured sanctions source
 * (EU FSF, UN SC, OFAC SDN; § 8c RAO). Weekly is enough: the lists change a
 * few times a month, and every KYC check reports which version it used.
 * A failing source is reported but does not block the others — the previous
 * snapshot stays stored and checks keep working with it.
 */
export const GET = createCronHandler(async (_req: NextRequest) => {
  const results = await refreshAllSanctionsLists();
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    if (r.ok) log.info(`${r.source}: ${r.entryCount} entries refreshed`);
    else log.error(`${r.source} refresh failed: ${r.error}`);
  }
  return NextResponse.json(
    { ok: failed.length === 0, results },
    { status: failed.length === results.length ? 503 : 200 }
  );
});
