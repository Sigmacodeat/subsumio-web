import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { computeAndStoreInventory } from "@/lib/corpus-inventory";
import { computeAndStoreQuality } from "@/lib/corpus-quality";
import { logger } from "@/lib/logger";

const log = logger("api/cron/corpus-inventory");

export const dynamic = "force-dynamic";
export const maxDuration = 900;

/**
 * 10-minute inventory snapshot of the law corpus (corpus_inventory_snapshot)
 * plus the chunk-quality snapshot derived from it (corpus_quality_snapshot).
 * The operator dashboard /ops/corpus reads the latest snapshots instead of
 * counting millions of chunks on every page view.
 */
export const GET = createCronHandler(async (_req: NextRequest) => {
  const pool = getSharedPgPool();
  if (!pool) return NextResponse.json({ ok: false, error: "no database" }, { status: 503 });
  try {
    const started = Date.now();
    const rows = await computeAndStoreInventory(pool);
    const pages = rows.reduce((n, r) => n + r.pages, 0);
    log.info(
      `corpus inventory: ${rows.length} sources, ${pages} pages, ${Date.now() - started} ms`
    );
    // The quality sample is a separate step so a failure there never costs
    // the inventory the dashboard's sync table depends on.
    let quality: "ok" | "failed" = "ok";
    try {
      const qStarted = Date.now();
      const q = await computeAndStoreQuality(pool, rows);
      log.info(
        `corpus quality: ${q.sampledChunks} sampled of ${q.totalChunks} chunks, ${Date.now() - qStarted} ms`
      );
    } catch (err) {
      quality = "failed";
      log.error("corpus quality failed:", err instanceof Error ? err.message : String(err));
    }
    return NextResponse.json({ ok: true, sources: rows.length, pages, quality });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("corpus inventory failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
});
