#!/usr/bin/env bun
/**
 * Migrate Judikatur file paths from `<date>-<slug>.md` to `<slug>.md`.
 *
 * The ris-delta-watcher previously used `${changedAt}-${slug}.md` as the file
 * path for Judikatur documents. When RIS updated the `Geaendert` date, the
 * same decision got a new filename — leaving the old file as an orphan and
 * creating a duplicate.
 *
 * This script renames all `<YYYY-MM-DD>-<slug>.md` files to `<slug>.md`,
 * merging content if both exist (newer wins by retrieved_at date).
 *
 * Usage:
 *   bun run server/scripts/migrate-judikatur-paths.ts [--dry-run] [--corpus-dir at-judikatur]
 */
import { readdirSync, renameSync, readFileSync, existsSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const corpusIdx = args.indexOf("--corpus-dir");
const ONLY_DIR = corpusIdx >= 0 ? args[corpusIdx + 1] : null;

const JUDIKATUR_DIRS = ONLY_DIR
  ? [ONLY_DIR]
  : ["at-judikatur", "at-judikatur-vwgh", "at-judikatur-vfgh", "at-judikatur-bvwg",
     "at-judikatur-lvwg", "at-judikatur-asylgh", "at-judikatur-uvs", "at-judikatur-dsk",
     "at-judikatur-gbk", "at-judikatur-pvak", "at-judikatur-dok", "at-judikatur-ubas",
     "at-judikatur-umse"];

const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})-(.+\.md)$/;

let renamed = 0;
let merged = 0;
let skipped = 0;
let errors = 0;

function getRetrievedAt(filepath: string): string {
  try {
    const content = readFileSync(filepath, "utf-8");
    const m = content.match(/^retrieved_at:\s*"([^"]+)"/m);
    return m?.[1] || "0000-00-00";
  } catch {
    return "0000-00-00";
  }
}

for (const dir of JUDIKATUR_DIRS) {
  const absDir = join(CORPUS_ROOT, dir);
  if (!existsSync(absDir)) {
    console.log(`  ⏭️  ${dir} — existiert nicht`);
    continue;
  }

  console.log(`\n═══ ${dir} ═══`);
  const files = readdirSync(absDir).filter((f) => f.endsWith(".md"));
  const datedFiles = files.filter((f) => DATE_PREFIX_RE.test(f));

  if (datedFiles.length === 0) {
    console.log(`  ✅ Keine Datei mit Datum-Prefix — nichts zu tun`);
    continue;
  }

  console.log(`  ${datedFiles.length} Dateien mit Datum-Prefix gefunden`);

  for (const datedFile of datedFiles) {
    const m = datedFile.match(DATE_PREFIX_RE);
    if (!m) continue;
    const newFile = m[2];
    const oldPath = join(absDir, datedFile);
    const newPath = join(absDir, newFile);

    if (existsSync(newPath)) {
      // Beide existieren — neuere gewinnt
      const oldDate = getRetrievedAt(oldPath);
      const newDate = getRetrievedAt(newPath);
      if (oldDate > newDate) {
        if (!DRY_RUN) {
          unlinkSync(newPath);
          renameSync(oldPath, newPath);
        }
        merged++;
        console.log(`  ${DRY_RUN ? "[DRY] " : ""}🔀 merge: ${datedFile} → ${newFile} (alte war neuer)`);
      } else {
        if (!DRY_RUN) unlinkSync(oldPath);
        merged++;
        console.log(`  ${DRY_RUN ? "[DRY] " : ""}🔀 merge: ${datedFile} gelöscht (neue existiert bereits, neuer)`);
      }
    } else {
      if (!DRY_RUN) renameSync(oldPath, newPath);
      renamed++;
      if (renamed % 100 === 0) process.stderr.write(`\r  ${renamed} umbenannt...`);
    }
  }
}

console.log(`\n\n═══ Ergebnis ═══`);
console.log(`  Umbenannt:  ${renamed}`);
console.log(`  Merged:     ${merged}`);
console.log(`  Skipped:    ${skipped}`);
console.log(`  Errors:     ${errors}`);
if (DRY_RUN) console.log(`  (DRY RUN — keine Änderungen geschrieben)`);
