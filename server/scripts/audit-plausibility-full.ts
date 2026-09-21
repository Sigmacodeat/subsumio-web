#!/usr/bin/env bun
/**
 * The complete, non-sampled version of every ad-hoc plausibility check this
 * audit has run so far. Every prior check (2026-09-21) looked at a sample —
 * 55 documents here, a handful of files there — and each one turned up
 * something new, because a sample can only prove what it touched, never
 * what it didn't. This runs the SAME rule the normalizer gates new imports
 * with (validateBody() in canonical-schema.ts) against every single page
 * already in the database, cursor-paginated so it covers 100% of rows, not
 * a slice of them. No new rules invented here — reusing the ingest gate is
 * the point: a page that would be rejected today if freshly imported is
 * flagged, whether it entered the brain yesterday or eight months ago.
 *
 * Also flags, per page: known-bad fetch generation (retrieved_at markers
 * this audit already identified as suspect), legacy pre-canonical
 * frontmatter (missing doc_id/schema_version), and whether a
 * known-plausibility-issue page already carries an embedding — the
 * question that actually matters before spending more on embedding.
 *
 * Usage:
 *   bun run scripts/audit-plausibility-full.ts [--source law-at-normen] [--limit 5000]
 */

import { parseArgs } from "util";
import { validateBody, type DocClass } from "./normalize/canonical-schema.ts";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { upsertPlausibility } from "./corpus-status-db.ts";

/** Every corpus source this audit covers, and how validateBody should treat its pages. */
export const DOC_CLASS_OF_SOURCE: Record<string, DocClass> = {
  "law-at-normen": "statute",
  "law-at-landesrecht": "statute",
  "law-at-gemeinden": "statute",
  "law-at-bezirke": "statute",
  "law-at-avsv": "statute",
  "law-at-avn": "statute",
  "law-at-bmerl": "statute",
  "law-at-spg": "statute",
  "law-at-kmger": "statute",
  "law-at-staatsvertraege": "statute",
  "law-at-literatur": "literature",
  "law-at-judikatur": "decision",
  "law-at-judikatur-vwgh": "decision",
  "law-at-judikatur-vfgh": "decision",
  "law-at-judikatur-bvwg": "decision",
  "law-at-judikatur-lvwg": "decision",
  "law-at-judikatur-asylgh": "decision",
  "law-at-judikatur-uvs": "decision",
  "law-at-judikatur-dsk": "decision",
  "law-at-judikatur-gbk": "decision",
  "law-at-judikatur-pvak": "decision",
  "law-at-judikatur-dok": "decision",
  "law-at-judikatur-ubas": "decision",
  "law-at-judikatur-umse": "decision",
};

/** Fetch generations this audit already proved defective — see korpus-inventur-2026-09-21. */
const KNOWN_BAD_RETRIEVED_AT = new Set(["2026-08-03"]);

export interface PageRow {
  id: number;
  frontmatter: Record<string, unknown> | null;
  compiled_truth: string | null;
}

export interface PlausibilityVerdict {
  ok: boolean;
  issues: string[]; // e.g. "body:no_content_section", "schema:legacy", "generation:known_bad"
}

/** Pure — one page's verdict, no DB or I/O. */
export function assessPage(row: PageRow, docClass: DocClass): PlausibilityVerdict {
  const issues: string[] = [];
  const fm = row.frontmatter ?? {};

  if (!fm["doc_id"] && !fm["nor_id"]) issues.push("schema:no_identity");
  else if (!fm["schema_version"]) issues.push("schema:legacy_frontmatter");

  const retrievedAt = typeof fm["retrieved_at"] === "string" ? fm["retrieved_at"] : null;
  if (retrievedAt && KNOWN_BAD_RETRIEVED_AT.has(retrievedAt)) issues.push("generation:known_bad");

  const body = row.compiled_truth ?? "";
  for (const bodyIssue of validateBody(body, docClass)) {
    issues.push(`body:${bodyIssue.code}`);
  }

  return { ok: issues.length === 0, issues };
}

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  connect(cfg: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

interface DbRow {
  id: number;
  frontmatter: Record<string, unknown> | null;
  compiled_truth: string | null;
  has_embedding: boolean;
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      source: { type: "string" },
      limit: { type: "string" },
    },
    allowPositionals: false,
  });

  const sources = values.source ? [values.source as string] : Object.keys(DOC_CLASS_OF_SOURCE);
  const unknownSources = sources.filter((s) => !DOC_CLASS_OF_SOURCE[s]);
  if (unknownSources.length > 0) {
    console.error(`Unbekannte Quelle(n): ${unknownSources.join(", ")}`);
    process.exit(1);
  }
  const hardLimit = values.limit ? parseInt(values.limit as string, 10) : Infinity;

  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);

  const PAGE_SIZE = 2000;
  const grandTotals: Record<string, number> = {};

  try {
    for (const source of sources) {
      const docClass = DOC_CLASS_OF_SOURCE[source]!;
      let total = 0;
      let ok = 0;
      let okButUnembedded = 0;
      let badButEmbedded = 0;
      const issueCounts: Record<string, number> = {};
      let lastId = 0;
      let scanned = 0;

      for (;;) {
        if (scanned >= hardLimit) break;
        const batch = (await engine.executeRaw(
          `SELECT p.id, p.frontmatter, p.compiled_truth,
                  EXISTS (SELECT 1 FROM content_chunks c WHERE c.page_id = p.id AND c.embedding_qwen IS NOT NULL) AS has_embedding
             FROM pages p
            WHERE p.deleted_at IS NULL AND p.source_id = $1 AND p.id > $2
            ORDER BY p.id
            LIMIT $3`,
          [source, lastId, Math.min(PAGE_SIZE, hardLimit - scanned)]
        )) as DbRow[];
        if (batch.length === 0) break;

        for (const row of batch) {
          total++;
          scanned++;
          const verdict = assessPage(row, docClass);
          if (verdict.ok) {
            ok++;
            if (!row.has_embedding) okButUnembedded++;
          } else {
            for (const issue of verdict.issues) issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
            if (row.has_embedding) badButEmbedded++;
          }
        }
        lastId = batch[batch.length - 1]!.id;
        if (total % 20000 < PAGE_SIZE) {
          process.stderr.write(`  ${source}: ${total.toLocaleString("de-AT")} geprüft...\r`);
        }
      }

      grandTotals[source] = total;
      if (total > 0) {
        await upsertPlausibility(engine, {
          sourceId: source,
          docClass,
          dbPages: total,
          plausiblePages: ok,
          issueBreakdown: issueCounts,
          unembeddedOkPages: okButUnembedded,
        });
      }
      console.log(`\n═══ ${source} (${docClass}) ═══`);
      console.log(`  Geprüft:              ${total.toLocaleString("de-AT")}`);
      console.log(
        `  Plausibel:            ${ok.toLocaleString("de-AT")} (${total > 0 ? ((ok / total) * 100).toFixed(1) : "0"}%)`
      );
      console.log(`  ...davon unembedded:  ${okButUnembedded.toLocaleString("de-AT")}`);
      console.log(`  Nicht plausibel:      ${(total - ok).toLocaleString("de-AT")}`);
      console.log(`  ...davon TROTZDEM eingebettet: ${badButEmbedded.toLocaleString("de-AT")}`);
      if (Object.keys(issueCounts).length > 0) {
        console.log(`  Gründe:`);
        for (const [issue, count] of Object.entries(issueCounts).sort((a, b) => b[1] - a[1])) {
          console.log(`    ${issue.padEnd(30)} ${count.toLocaleString("de-AT")}`);
        }
      }
    }
  } finally {
    await engine.disconnect();
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
