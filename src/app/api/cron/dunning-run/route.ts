import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { fetchPages, getRecipientsByBrain } from "@/lib/cron-utils";
import { processDunningRun, applyDunningRun, type OpenItem } from "@/lib/fibu";
import { logger } from "@/lib/logger";
import { engineWriteBestEffort } from "@/lib/engine-write";

const log = logger("cron/dunning-run");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Run the dunning escalation for one Kanzlei (brain).
 *
 * Previously this whole route only ever read/wrote
 * engineHeadersForBrain("system") — a fixed, non-tenant brain that no real
 * Kanzlei's open items live in, so the cron always processed zero items for
 * every actual firm. Mirrors the fetch-all-then-patch-changed shape of the
 * original, just scoped per brainId and paginated past the engine's
 * 200-page cap via fetchPages (see engine-list-cap-and-tombstones).
 */
async function runDunningForBrain(
  brainId: string
): Promise<{ totalItems: number; dunningActions: number; failedWrites: number }> {
  const headers = engineHeadersForBrain(brainId);
  const pages = await fetchPages(brainId, "open_item", 2000);
  const openItems: OpenItem[] = pages.map((p) => p.frontmatter as unknown as OpenItem);

  const results = processDunningRun(openItems);
  const updatedItems = applyDunningRun(openItems, results);

  // A refused write is counted and logged (engineWriteBestEffort), never
  // taken as a stored dunning level.
  let failedWrites = 0;
  for (let i = 0; i < updatedItems.length; i++) {
    const item = updatedItems[i];
    const original = openItems[i];
    if (item.dunning_level !== original?.dunning_level) {
      const saved = await engineWriteBestEffort(
        `${ENGINE_URL}/api/pages`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: `legal/open-items/${item.id}`,
            title: `OPOS: ${item.invoice_number} — ${item.client_name}`,
            type: "open_item",
            frontmatter: item,
          }),
          signal: AbortSignal.timeout(10_000),
        },
        "Mahnstufe"
      );
      if (!saved) failedWrites++;
    }
  }
  if (failedWrites > 0) log.error("[dunning-run] writes failed", { brainId, failedWrites });

  return { totalItems: openItems.length, dunningActions: results.length, failedWrites };
}

async function dunningRunHandler(_req: NextRequest): Promise<Response> {
  const recipientsByBrain = await getRecipientsByBrain();

  let totalItems = 0;
  let dunningActions = 0;
  let failedWrites = 0;
  let failedBrains = 0;
  const perBrain: Array<{
    brainId: string;
    totalItems: number;
    dunningActions: number;
    failedWrites: number;
  }> = [];

  for (const brainId of recipientsByBrain.keys()) {
    try {
      const result = await runDunningForBrain(brainId);
      totalItems += result.totalItems;
      dunningActions += result.dunningActions;
      failedWrites += result.failedWrites;
      perBrain.push({ brainId, ...result });
    } catch (err) {
      failedBrains++;
      log.error("[dunning-run] brain failed", {
        brainId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    executedAt: new Date().toISOString(),
    brainsChecked: recipientsByBrain.size,
    totalItems,
    dunningActions,
    failedWrites,
    failedBrains,
    perBrain,
  });
}

// Vercel Cron sends GET requests (not POST). The previous POST-only handler
// meant the dunning-run cron NEVER fired — dunning escalations were silently
// skipped. Added GET as the cron entry point; POST kept for manual triggers.
export const GET = createCronHandler(dunningRunHandler, { maxDuration: 300 });
export const POST = createCronHandler(dunningRunHandler, { maxDuration: 300 });
