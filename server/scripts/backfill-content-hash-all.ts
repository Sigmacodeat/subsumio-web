#!/usr/bin/env bun
/**
 * backfill-content-hash-all — Fügt fehlendes content_hash-Feld zu allen
 * law-corpus Dateien hinzu, die keines haben.
 *
 * Der batch-import Quality Gate überspringt Dateien ohne content_hash.
 * Das betrifft v.a. "Volltext nicht abrufbar" Dateien (RIS hat nur Metadaten).
 *
 * Verfahren: sha256(body.trim()).slice(0,16) — identisch mit fetch-normen.ts
 *
 * Usage:
 *   bun run server/scripts/backfill-content-hash-all.ts
 *   bun run server/scripts/backfill-content-hash-all.ts --dry-run
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { glob } from "glob";

const DRY_RUN = process.argv.includes("--dry-run");
const CORPUS_DIR = "law-corpus";

function computeContentHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);
}

function processFile(filePath: string): { file: string; hash: string; added: boolean; error?: string } {
  const content = readFileSync(filePath, "utf-8");

  // Skip if already has content_hash
  if (content.includes("content_hash:")) {
    return { file: filePath, hash: "", added: false };
  }

  // Parse frontmatter: find first --- and second ---
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    return { file: filePath, hash: "", added: false, error: "no frontmatter" };
  }

  const frontmatter = fmMatch[1];
  const body = content.slice(fmMatch[0].length);

  // Compute hash over the body text (after frontmatter)
  const hash = computeContentHash(body);

  // Add content_hash as last frontmatter field (before closing ---)
  const newFrontmatter = frontmatter + `\ncontent_hash: "${hash}"`;
  const newContent = `---\n${newFrontmatter}\n---${body}`;

  if (!DRY_RUN) {
    writeFileSync(filePath, newContent, "utf-8");
  }

  return { file: filePath, hash, added: true };
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Backfill content_hash for ALL corpus files");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Dir: ${CORPUS_DIR}`);
  console.log(`Dry run: ${DRY_RUN ? "YES" : "NO"}`);
  console.log("");

  // Find all .md files in law-corpus
  const files = await glob("**/*.md", { cwd: CORPUS_DIR });
  console.log(`Total .md files: ${files.length}`);

  let added = 0;
  let skipped = 0;
  let errors = 0;
  const byCorpus: Record<string, { added: number; skipped: number; errors: number }> = {};

  for (const relPath of files) {
    // Extract corpus name (first directory under law-corpus)
    const corpus = relPath.split("/")[0];
    const file = join(CORPUS_DIR, relPath);

    if (!byCorpus[corpus]) {
      byCorpus[corpus] = { added: 0, skipped: 0, errors: 0 };
    }

    const result = processFile(file);
    if (result.added) {
      added++;
      byCorpus[corpus].added++;
    } else if (result.error) {
      errors++;
      byCorpus[corpus].errors++;
    } else {
      skipped++;
      byCorpus[corpus].skipped++;
    }
  }

  console.log("");
  console.log("=== PER CORPUS ===");
  for (const [corpus, stats] of Object.entries(byCorpus).sort()) {
    if (stats.added > 0) {
      console.log(`  ${corpus.padEnd(30)} added=${stats.added} skipped=${stats.skipped} errors=${stats.errors}`);
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ${DRY_RUN ? "DRY RUN COMPLETE" : "BACKFILL COMPLETE"}`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Added:    ${added}`);
  console.log(`Skipped:  ${skipped} (already had hash)`);
  console.log(`Errors:   ${errors}`);
  console.log("");

  if (!DRY_RUN && added > 0) {
    console.log("Next step: re-import affected corpora with --force-rechunk");
  }
}

main();
