#!/usr/bin/env bun
/**
 * Re-chunk all pages that have compiled_truth but no content_chunks.
 * Also embeds the new chunks inline.
 */

import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway, reconfigureGatewayWithEngine } from "../src/core/ai/gateway.ts";
import { chunkText, MARKDOWN_CHUNKER_VERSION } from "../src/core/chunkers/recursive.ts";
import { chunkLegalSection, LEGAL_CHUNKER_VERSION } from "../src/core/chunkers/legal-statute.ts";
import {
  chunkLegalDecision,
  LEGAL_DECISION_CHUNKER_VERSION,
} from "../src/core/chunkers/legal-decision.ts";
import { embedBatch, currentEmbeddingSignature } from "../src/core/embedding.ts";
import { isLegalPage, isCourtDecisionPage } from "../src/core/embedding-context.ts";

const BATCH_SIZE = 100;

function toVectorStr(arr: Float32Array): string {
  return "[" + Array.from(arr).join(",") + "]";
}

function detectPageType(fm: Record<string, unknown>): PageType {
  const t = (fm.type as string) || "";
  if (["law", "statute"].includes(t)) return "law";
  if (["court_decision", "judgement"].includes(t)) return "court_decision";
  return "generic";
}

type PageType = "law" | "court_decision" | "generic";

async function main() {
  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured");
  configureGateway(buildGatewayConfig(cfg));
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {}

  const rows = (await engine.executeRaw(`
    SELECT p.id, p.source_id, p.slug, p.compiled_truth, p.frontmatter
    FROM pages p
    LEFT JOIN content_chunks c ON c.page_id = p.id
    WHERE p.deleted_at IS NULL AND p.compiled_truth != '' AND c.id IS NULL
    ORDER BY p.source_id, p.slug
  `)) as any[];

  console.log(`Pages without chunks: ${rows.length}`);
  if (rows.length === 0) {
    await engine.disconnect();
    return;
  }

  const sig = await currentEmbeddingSignature();
  let done = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const chunksToInsert: { pageId: number; index: number; text: string; sourceId: string }[] = [];

    for (const r of batch) {
      const fm = (r.frontmatter as Record<string, unknown>) || {};
      const type = detectPageType(fm);
      let chunks: { text: string }[] = [];
      try {
        if (type === "law" || r.slug.startsWith("legal/statutes/")) {
          const paragraphRef = typeof fm.paragraph === "string" ? fm.paragraph : "";
          const statuteAbbr = typeof fm.abbreviation === "string" ? fm.abbreviation : "";
          const jurisdiction = typeof fm.jurisdiction === "string" ? fm.jurisdiction : "";
          chunks = chunkLegalSection(r.compiled_truth, {
            paragraph_ref: paragraphRef,
            statute_abbr: statuteAbbr,
            jurisdiction,
          });
        } else if (type === "court_decision" || r.slug.startsWith("legal/judikatur/")) {
          chunks = chunkLegalDecision(r.compiled_truth, {
            court: typeof fm.court === "string" ? fm.court : "",
            case_number: typeof fm.case_number === "string" ? fm.case_number : "",
            decision_date: typeof fm.decision_date === "string" ? fm.decision_date : "",
            ecli: typeof fm.ecli === "string" ? fm.ecli : "",
            legal_area: typeof fm.legal_area === "string" ? fm.legal_area : "",
            jurisdiction: typeof fm.jurisdiction === "string" ? fm.jurisdiction : "",
          });
        } else {
          chunks = chunkText(r.compiled_truth);
        }
      } catch (e) {
        console.warn(
          `  ⚠️ chunking error ${r.slug}: ${e instanceof Error ? e.message : String(e)}`
        );
        errors++;
        continue;
      }

      for (let idx = 0; idx < chunks.length; idx++) {
        chunksToInsert.push({
          pageId: r.id,
          index: idx,
          text: chunks[idx].text,
          sourceId: r.source_id,
        });
      }
      if (chunks.length === 0) {
        console.warn(`  ⚠️ no chunks produced for ${r.slug}`);
        errors++;
      }
    }

    if (chunksToInsert.length === 0) continue;

    // Insert chunk rows without embeddings first
    const inserted: { id: number; text: string }[] = [];
    for (const c of chunksToInsert) {
      const res = (await engine.executeRaw(
        `INSERT INTO content_chunks (page_id, chunk_index, chunk_text, chunk_source, created_at)
         VALUES ($1, $2, $3, $4, now())
         RETURNING id`,
        [c.pageId, c.index, c.text, "rechunk"]
      )) as any[];
      inserted.push({ id: Number(res[0].id), text: c.text });
    }

    // Embed and update
    const texts = inserted.map((c) => c.text);
    try {
      const embeddings = await embedBatch(texts);
      for (let j = 0; j < inserted.length; j++) {
        await engine.executeRaw(
          `UPDATE content_chunks SET embedding = $1::vector, embedded_at = now(), model = $2 WHERE id = $3`,
          [toVectorStr(embeddings[j]), sig, inserted[j].id]
        );
      }
      done += inserted.length;
      console.log(
        `  ✅ ${done}/${rows.length * BATCH_SIZE > rows.length ? rows.length : done} chunks done (batch ${Math.floor(i / BATCH_SIZE) + 1})`
      );
    } catch (e) {
      console.error(`  ❌ embed batch error: ${e instanceof Error ? e.message : String(e)}`);
      errors += inserted.length;
    }
  }

  console.log(`Done: ${done} chunks inserted/embedded, ${errors} errors.`);
  await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
