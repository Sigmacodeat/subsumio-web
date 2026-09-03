import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { processDunningRun, applyDunningRun, type OpenItem } from "@/lib/fibu";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function dunningRunHandler(_req: NextRequest): Promise<Response> {
  const headers = engineHeadersForBrain("system");

  // 1. Load all open items from engine
  const params = new URLSearchParams({ type: "open_item", limit: "500" });
  const listRes = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!listRes.ok) {
    return NextResponse.json({
      executedAt: new Date().toISOString(),
      totalItems: 0,
      dunningActions: 0,
      results: [],
    });
  }
  const listData = await listRes.json();
  const pages = (Array.isArray(listData) ? listData : (listData.pages ?? [])) as Array<{
    frontmatter: Record<string, unknown>;
  }>;
  const openItems: OpenItem[] = pages.map((p) => p.frontmatter as unknown as OpenItem);

  // 2. Process dunning run
  const results = processDunningRun(openItems);

  // 3. Apply changes and persist
  const updatedItems = applyDunningRun(openItems, results);

  for (let i = 0; i < updatedItems.length; i++) {
    const item = updatedItems[i];
    const original = openItems[i];
    if (item.dunning_level !== original?.dunning_level) {
      await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: `legal/open-items/${item.id}`,
          title: `OPOS: ${item.invoice_number} — ${item.client_name}`,
          type: "open_item",
          frontmatter: item,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    }
  }

  return NextResponse.json({
    executedAt: new Date().toISOString(),
    totalItems: openItems.length,
    dunningActions: results.length,
    results,
  });
}

// Vercel Cron sends GET requests (not POST). The previous POST-only handler
// meant the dunning-run cron NEVER fired — dunning escalations were silently
// skipped. Added GET as the cron entry point; POST kept for manual triggers.
export const GET = createCronHandler(dunningRunHandler, { maxDuration: 60 });
export const POST = createCronHandler(dunningRunHandler, { maxDuration: 60 });
