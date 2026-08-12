#!/usr/bin/env bun
/**
 * backfill-normen-frontmatter-id — fügt das `id: "ris-<NOR>"` Feld zum
 * Frontmatter bestehender at-normen Dateien hinzu.
 *
 * ris-xml-fetch-normen.ts schreibt `id` seit dem Fix vom 2026-08-01 in
 * jeden neuen Norm-File. Bestehende Dateien (vor dem Fix geholt) haben
 * das Feld nicht — dieser Backfill ergänzt es idempotent.
 *
 * Ohne `id` würde importFromContent bei Content-Hash-Kollisionen (21 Paare
 * im Corpus) die zweite Norm still als Duplikat überspringen.
 *
 *   bun run server/scripts/backfill-normen-frontmatter-id.ts
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..", "..", "law-corpus", "at-normen");

function walk(dir: string, files: string[] = []): string[] {
  const { readdirSync, statSync } = require("fs");
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (entry.endsWith(".md")) files.push(full);
  }
  return files;
}

let updated = 0;
let skipped = 0;
let noNorId = 0;

for (const path of walk(ROOT)) {
  const content = readFileSync(path, "utf-8");

  // Frontmatter-Ende finden
  const fmEnd = content.indexOf("\n---\n", 4);
  if (fmEnd < 0) { skipped++; continue; }
  const fm = content.slice(0, fmEnd);

  // Bereits vorhanden?
  if (/\nid:\s/.test(fm)) { skipped++; continue; }

  // nor_id extrahieren
  const norMatch = fm.match(/\nnor_id:\s*"([^"]+)"/);
  if (!norMatch) { noNorId++; continue; }
  const norId = norMatch[1];

  // id-Feld nach nor_id einfügen
  const newFm = fm.replace(
    /(\nnor_id:\s*"[^"]+")/,
    `$1\nid: "ris-${norId}"`
  );
  const newContent = newFm + content.slice(fmEnd);
  writeFileSync(path, newContent);
  updated++;
}

console.log(`✓ ${updated} Dateien aktualisiert, ${skipped} bereits vorhanden, ${noNorId} ohne nor_id`);
