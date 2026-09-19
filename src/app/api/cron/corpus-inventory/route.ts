import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { computeAndStoreInventory } from "@/lib/corpus-inventory";
import { logger } from "@/lib/logger";

const log = logger("api/cron/corpus-inventory");

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * Hourly inventory snapshot of the law corpus (corpus_inventory_snapshot).
 * The operator dashboard /ops/corpus reads the latest snapshot instead of
 * counting millions of chunks on every page view.
 */
export const GET = createCronHandler(async (_req: NextRequest) => {
  const pool = getSharedPgPool();
  if (!pool) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  try {
    const started = Date.now();
    const rows = await computeAndStoreInventory(pool);
    const pages = rows.reduce((n, r) => n + r.pages, 0);
    log.info(`corpus inventory: ${rows.length} sources, ${pages} pages, ${Date.now() - started} ms`);
    return NextResponse.json({ ok: true, sources: rows.length, pages });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("corpus inventory failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
});
