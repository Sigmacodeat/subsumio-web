#!/usr/bin/env bun
/** Re-chunk only pages listed by the oversized-chunk maintenance scan. */

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";
import { assertChunkModelConsistency } from "../src/core/embedding-consistency-guard.ts";
import { importFromContent } from "../src/core/import-file.ts";
import { serializeMarkdown } from "../src/core/markdown.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    manifest: { type: "string" },
    limit: { type: "string" },
    "start-after": { type: "string", default: "0" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help || !values.manifest) {
  console.log(
    "Usage: bun run scripts/rechunk-oversized-pages.ts --manifest FILE [--dry-run] [--limit N] [--start-after PAGE_ID]"
  );
  process.exit(values.help ? 0 : 2);
}

const manifest = String(values.manifest);
const dryRun = Boolean(values["dry-run"]);
const startAfter = Number.parseInt(String(values["start-after"]), 10) || 0;
const parsedLimit = values.limit ? Number.parseInt(String(values.limit), 10) : undefined;
const limit = parsedLimit && parsedLimit > 0 ? parsedLimit : undefined;

function readPageIds(path: string): number[] {
  const ids = new Set<number>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const [, rawPageId] = line.split("|");
    const pageId = Number.parseInt(rawPageId ?? "", 10);
    if (Number.isInteger(pageId) && pageId > startAfter) ids.add(pageId);
  }
  return [...ids].sort((a, b) => a - b).slice(0, limit);
}

async function main(): Promise<void> {
  const pageIds = readPageIds(manifest);
  console.log(`[oversized] ${pageIds.length} unique page(s) selected from ${manifest}`);
  if (dryRun || pageIds.length === 0) return;

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured");
  configureGateway(buildGatewayConfig(cfg));
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  await assertChunkModelConsistency(engine);

  let repaired = 0;
  let failed = 0;
  try {
    for (const id of pageIds) {
      try {
        const rows = await engine.executeRaw<{ slug: string; source_id: string }>(
          `SELECT slug, source_id FROM pages WHERE id = $1 AND deleted_at IS NULL`,
          [id]
        );
        const row = rows[0];
        if (!row) continue;
        const page = await engine.getPage(row.slug, { sourceId: row.source_id });
        if (!page) continue;
        const tags = await engine.getTags(row.slug, { sourceId: row.source_id });
        const markdown = serializeMarkdown(
          page.frontmatter ?? {},
          page.compiled_truth ?? "",
          page.timeline ?? "",
          { type: page.type, title: page.title, tags }
        );
        await importFromContent(engine, row.slug, markdown, {
          sourceId: row.source_id,
          forceRechunk: true,
        });
        const check = await engine.executeRaw<{ oversized: string }>(
          `SELECT COUNT(*)::text AS oversized
             FROM content_chunks
            WHERE page_id = $1 AND length(chunk_text) > 6000`,
          [id]
        );
        if (Number(check[0]?.oversized ?? 0) !== 0) {
          throw new Error("re-chunk still produced a chunk above 6000 characters");
        }
        repaired++;
        console.log(`[oversized] repaired page_id=${id} (${repaired}/${pageIds.length})`);
      } catch (error) {
        failed++;
        console.error(
          `[oversized] page_id=${id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } finally {
    await engine.disconnect();
  }
  console.log(`[oversized] done repaired=${repaired} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
