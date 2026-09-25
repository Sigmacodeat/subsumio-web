import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { fetchAllPagesStrict, getRecipientsByBrain } from "@/lib/cron-utils";
import { processDunningRun, type OpenItem } from "@/lib/fibu";
import { readCurrentPage } from "@/lib/page-write-guards";
import { logger } from "@/lib/logger";

const log = logger("cron/dunning-run");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Mahnlauf for one Kanzlei (brain): marks which open items are due for the
 * next reminder level ("Mahnvorschlag").
 *
 * The run itself neither raises the level nor charges a fee: a dunning fee
 * is only owed when a reminder is actually sent, and that happens through
 * /api/invoices/remind — the one place that sets level + fee on the open
 * item and sends the letter. The run only merge-writes the proposal fields,
 * re-reads each item right before writing and skips it when it was settled
 * meanwhile, so a payment booked during the run is never overwritten.
 * Failed writes are counted, not swallowed.
 */
async function runDunningForBrain(
  brainId: string
): Promise<{ totalItems: number; dunningActions: number; failed: number }> {
  const headers = engineHeadersForBrain(brainId);
  const pages = await fetchAllPagesStrict(brainId, "open_item");
  const openItems: OpenItem[] = pages.map((p) => p.frontmatter as unknown as OpenItem);

  const results = processDunningRun(openItems);
  let written = 0;
  let failed = 0;

  for (const result of results) {
    const slug = `legal/open-items/${result.item_id}`;
    try {
      const fresh = await readCurrentPage(ENGINE_URL, headers, slug);
      if (fresh.kind === "error") {
        failed++;
        continue;
      }
      if (fresh.kind === "missing") continue;
      const now = fresh.page.frontmatter as unknown as OpenItem;
      if (now.status === "paid" || now.status === "written_off") continue;
      if ((now.dunning_level ?? 0) >= result.new_level) continue;
      if (Number(now.dunning_suggested_level ?? 0) === result.new_level) continue;

      const res = await enginePatchPage(
        headers,
        {
          slug,
          frontmatter: {
            dunning_suggested_level: result.new_level,
            dunning_suggested_at: new Date().toISOString(),
          },
        },
        { timeoutMs: 10_000 }
      );
      if (res.ok) written++;
      else {
        failed++;
        log.warn("[dunning-run] write failed", {
          brainId,
          itemId: result.item_id,
          status: res.status,
        });
      }
    } catch (err) {
      failed++;
      log.warn("[dunning-run] write failed", {
        brainId,
        itemId: result.item_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { totalItems: openItems.length, dunningActions: written, failed };
}

async function dunningRunHandler(_req: NextRequest): Promise<Response> {
  const recipientsByBrain = await getRecipientsByBrain();

  let totalItems = 0;
  let dunningActions = 0;
  let failed = 0;
  const perBrain: Array<{
    brainId: string;
    totalItems: number;
    dunningActions: number;
    failed: number;
  }> = [];

  for (const brainId of recipientsByBrain.keys()) {
    try {
      const result = await runDunningForBrain(brainId);
      totalItems += result.totalItems;
      dunningActions += result.dunningActions;
      failed += result.failed;
      perBrain.push({ brainId, ...result });
    } catch (err) {
      failed++;
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
    failed,
    perBrain,
  });
}

// Vercel Cron sends GET requests (not POST). The previous POST-only handler
// meant the dunning-run cron NEVER fired — dunning escalations were silently
// skipped. Added GET as the cron entry point; POST kept for manual triggers.
export const GET = createCronHandler(dunningRunHandler, { maxDuration: 300 });
export const POST = createCronHandler(dunningRunHandler, { maxDuration: 300 });
