#!/usr/bin/env bun
/**
 * backfill-content-hash-at — Fügt fehlendes content_hash-Feld zu at-Gesetzen hinzu.
 *
 * 80 at-Files (ABGB, EO, EstG, etc.) haben kein content_hash im Frontmatter
 * und werden deshalb vom batch-import Quality Gate übersprungen.
 *
 * Verfahren: sha256(text.trim()).slice(0,16) — identisch mit ris-xml-fetch-normen.ts
 *
 * Usage:
 *   bun run server/scripts/backfill-content-hash-at.ts
 *   bun run server/scripts/backfill-content-hash-at.ts --dry-run
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const AT_DIR = "law-corpus/at";

function computeContentHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);
}

function processFile(filePath: string): { file: string; hash: string; added: boolean } {
  const content = readFileSync(filePath, "utf-8");

  // Skip if already has content_hash
  if (content.includes("content_hash:")) {
    return { file: filePath, hash: "", added: false };
  }

  // Parse frontmatter: find first --- and second ---
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    console.error(`  ! No frontmatter found: ${filePath}`);
    return { file: filePath, hash: "", added: false };
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
  console.log("  Subsumio — Backfill content_hash for at-Gesetze");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Dir: ${AT_DIR}`);
  console.log(`Dry run: ${DRY_RUN ? "YES" : "NO"}`);
  console.log("");

  // Read list of files without content_hash
  const listFile = "/tmp/at-without-hash.txt";
  if (!existsSync(listFile)) {
    console.error(`ERROR: ${listFile} not found. Run the grep first.`);
    process.exit(1);
  }

  const files = readFileSync(listFile, "utf-8")
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);

  console.log(`Files to process: ${files.length}`);
  console.log("");

  let added = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const result = processFile(file);
    if (result.added) {
      added++;
      const name = file.split("/").pop();
      console.log(`  ✓ ${name} → ${result.hash}`);
    } else if (result.hash === "") {
      // Already has hash or error
      if (readFileSync(file, "utf-8").includes("content_hash:")) {
        skipped++;
      } else {
        errors++;
      }
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
    console.log("Next step: re-import at with:");
    console.log("  bun run server/scripts/batch-import-from-disk.ts \\");
    console.log("    --source law-at --disk-dir law-corpus/at \\");
    console.log("    --slug-prefix legal/statutes/at \\");
    console.log("    --batch-size 500 --sleep-ms 10 --no-embed");
  }
}

main();
