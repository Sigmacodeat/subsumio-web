#!/usr/bin/env bun
/**
 * rechunk-source — In-Place Re-Chunking of existing pages for a given source.
 *
 * Reads compiled_truth from existing pages, re-chunks with the current
 * chunker version, deletes old chunks, inserts new ones, and nulls embeddings.
 *
 * Usage:
 *   bun run server/scripts/rechunk-source.ts --source law-at-judikatur-bvwg
 *   bun run server/scripts/rechunk-source.ts --source law-at-judikatur --batch-size 500
 */

import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    source: { type: "string" },
    "batch-size": { type: "string", default: "200" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
rechunk-source — In-Place Re-Chunking

Usage:
  bun run server/scripts/rechunk-source.ts --source <source_id> [options]

Options:
  --source      Source ID to re-chunk (e.g. law-at-judikatur-bvwg)
  --batch-size  Pages per batch (default: 200)
  --dry-run     Show stats only, don't modify DB
  --help        This help
`);
  process.exit(0);
}

const SOURCE_ID = values.source as string;
const BATCH_SIZE = parseInt(values["batch-size"] as string, 10) || 200;
const DRY_RUN = values["dry-run"] as boolean;

if (!SOURCE_ID) {
  console.error("ERROR: --source is required. Use --help for usage.");
  process.exit(1);
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — In-Place Re-Chunking");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Source:      ${SOURCE_ID}`);
  console.log(`Batch size:  ${BATCH_SIZE}`);
  console.log(`Dry run:     ${DRY_RUN ? "YES" : "no"}`);
  console.log("");

  const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
  const { createEngine } = await import("../src/core/engine-factory.ts");
  const {
    chunkLegalDecision,
    LEGAL_DECISION_CHUNKER_VERSION,
    formatLegalDecisionEmbeddingContext,
  } = await import("../src/core/chunkers/legal-decision.ts");
  const { chunkLegalSection, LEGAL_CHUNKER_VERSION, formatLegalSectionEmbeddingContext } =
    await import("../src/core/chunkers/legal-statute.ts");
  const { chunkText, MARKDOWN_CHUNKER_VERSION } = await import("../src/core/chunkers/recursive.ts");
  const { isLegalPage, isCourtDecisionPage } = await import("../src/core/embedding-context.ts");

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured.");
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));

  // Get total page count
  const countRows = await engine.executeRaw(
    `SELECT COUNT(*) as cnt FROM pages WHERE source_id = $1 AND deleted_at IS NULL`,
    [SOURCE_ID]
  );
  const totalPages = Number(countRows[0]?.cnt ?? 0);
  console.log(`Total pages: ${totalPages}`);
  console.log("");

  if (totalPages === 0) {
    console.log("No pages found for this source. Nothing to do.");
    await engine.disconnect();
    return;
  }

  if (DRY_RUN) {
    // Sample 100 pages to estimate new chunk count
    const sample = await engine.executeRaw(
      `SELECT id, slug, compiled_truth, frontmatter, page_kind FROM pages
       WHERE source_id = $1 AND deleted_at IS NULL LIMIT 100`,
      [SOURCE_ID]
    );
    let estChunks = 0;
    for (const p of sample) {
      const fm =
        typeof p.frontmatter === "string" ? JSON.parse(p.frontmatter) : p.frontmatter || {};
      const sampleBody = typeof p.compiled_truth === "string" ? p.compiled_truth : "";
      const isDecision =
        isCourtDecisionPage(fm) || fm.type === "court_decision" || fm.type === "judgement";
      const isStatute = isLegalPage(fm) || fm.type === "law" || fm.type === "statute";
      let chunks: { text: string }[] = [];
      if (isDecision) {
        chunks = chunkLegalDecision(sampleBody, {
          court: fm.court || "",
          case_number: fm.case_number || "",
          decision_date: fm.decision_date || "",
          ecli: fm.ecli || "",
          legal_area: fm.legal_area || "",
          jurisdiction: fm.jurisdiction || "",
        });
      } else if (isStatute) {
        chunks = chunkLegalSection(sampleBody, {
          paragraph_ref: fm.paragraph || "",
          statute_abbr: fm.abbreviation || "",
          jurisdiction: fm.jurisdiction || "",
        });
      } else {
        chunks = chunkText(sampleBody);
      }
      estChunks += chunks.length;
    }
    const avgPerPage = estChunks / sample.length;
    const totalEst = Math.round(avgPerPage * totalPages);
    console.log(
      `[DRY-RUN] Sample: ${sample.length} pages → ${estChunks} chunks (${avgPerPage.toFixed(1)} per page)`
    );
    console.log(`[DRY-RUN] Estimated total: ${totalEst} chunks (vs current pages: ${totalPages})`);
    await engine.disconnect();
    return;
  }

  // Process in batches
  let processed = 0;
  let totalNewChunks = 0;
  let totalDeletedChunks = 0;
  let errors = 0;
  const startTime = Date.now();
  let lastId = 0;

  while (processed < totalPages) {
    // Fetch batch of pages
    const pages = await engine.executeRaw(
      `SELECT id, slug, compiled_truth, frontmatter, page_kind
       FROM pages
       WHERE source_id = $1 AND deleted_at IS NULL AND id > $2
       ORDER BY id ASC
       LIMIT $3`,
      [SOURCE_ID, lastId, BATCH_SIZE]
    );

    if (pages.length === 0) break;

    for (const p of pages) {
      try {
        const fm =
          typeof p.frontmatter === "string" ? JSON.parse(p.frontmatter) : p.frontmatter || {};
        const body = typeof p.compiled_truth === "string" ? p.compiled_truth : "";
        if (!body.trim()) {
          lastId = Number(p.id);
          processed++;
          continue;
        }

        const isDecision =
          isCourtDecisionPage(fm) || fm.type === "court_decision" || fm.type === "judgement";
        const isStatute = isLegalPage(fm) || fm.type === "law" || fm.type === "statute";

        let chunkTexts: { text: string; embeddingContext?: string }[] = [];

        if (isDecision) {
          const decisionChunks = chunkLegalDecision(body, {
            court: fm.court || "",
            case_number: fm.case_number || "",
            decision_date: fm.decision_date || "",
            ecli: fm.ecli || "",
            legal_area: fm.legal_area || "",
            jurisdiction: fm.jurisdiction || "",
          });
          chunkTexts = decisionChunks.map((c) => ({
            text: c.text,
            embeddingContext: formatLegalDecisionEmbeddingContext(c.metadata),
          }));
        } else if (isStatute) {
          const legalChunks = chunkLegalSection(body, {
            paragraph_ref: fm.paragraph || "",
            statute_abbr: fm.abbreviation || "",
            jurisdiction: fm.jurisdiction || "",
          });
          chunkTexts = legalChunks.map((c) => ({
            text: c.text,
            embeddingContext: formatLegalSectionEmbeddingContext(c.metadata),
          }));
        } else {
          const genericChunks = chunkText(body);
          chunkTexts = genericChunks.map((c) => ({ text: c.text }));
        }

        // Delete old chunks for this page
        const delResult = await engine.executeRaw(
          `DELETE FROM content_chunks WHERE page_id = $1 RETURNING id`,
          [p.id]
        );
        totalDeletedChunks += delResult.length;

        // Insert new chunks
        for (let i = 0; i < chunkTexts.length; i++) {
          await engine.executeRaw(
            `INSERT INTO content_chunks (page_id, chunk_index, chunk_text, chunk_source, embedding, language)
             VALUES ($1, $2, $3, 'compiled_truth', NULL, 'de')`,
            [p.id, i, chunkTexts[i].text]
          );
        }
        totalNewChunks += chunkTexts.length;

        // Update chunker_version on page
        const chunkerVersion = isDecision
          ? LEGAL_DECISION_CHUNKER_VERSION
          : isStatute
            ? LEGAL_CHUNKER_VERSION
            : MARKDOWN_CHUNKER_VERSION;
        await engine.executeRaw(`UPDATE pages SET chunker_version = $1 WHERE id = $2`, [
          chunkerVersion,
          p.id,
        ]);

        lastId = Number(p.id);
        processed++;
      } catch (e) {
        errors++;
        if (errors <= 10 || errors % 100 === 0) {
          console.error(`  ERROR [${p.slug}]: ${e instanceof Error ? e.message : String(e)}`);
        }
        lastId = Number(p.id);
        processed++;
      }
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (processed / elapsed).toFixed(1);
    const remaining = Math.ceil((totalPages - processed) / parseFloat(rate));
    console.log(
      `Progress: ${processed}/${totalPages} (${rate} pages/s, ETA ${remaining}s) | ` +
        `New chunks: ${totalNewChunks} | Deleted: ${totalDeletedChunks} | Errors: ${errors}`
    );
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  RE-CHUNKING COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Pages processed:  ${processed}`);
  console.log(`New chunks:       ${totalNewChunks}`);
  console.log(`Old chunks deleted: ${totalDeletedChunks}`);
  console.log(`Errors:           ${errors}`);
  console.log(`Duration:         ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log(`Avg chunks/page:  ${(totalNewChunks / processed).toFixed(1)}`);
  console.log("");
  console.log(`Next: Run embed-worker-standalone.ts to embed the ${totalNewChunks} new chunks.`);

  await engine.disconnect();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
