import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { refreshSanctionsList } from "@/lib/sanctions/store";
import { logger } from "@/lib/logger";

const log = logger("api/cron/sanctions-sync");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/sanctions-sync — refreshes the EU consolidated financial
 * sanctions list (§ 8c RAO). Weekly is enough: the list changes a few times a
 * month, and every KYC check reports which version it used.
 */
export const GET = createCronHandler(async (_req: NextRequest) => {
  try {
    const result = await refreshSanctionsList();
    log.info(`sanctions list refreshed: ${result.entryCount} entries, ${result.generatedAt}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("sanctions list refresh failed:", message);
    // 503: the stored list stays as it was, checks keep working with it.
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
});
