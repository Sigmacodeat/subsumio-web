#!/usr/bin/env bun
/**
 * Erzeugt server/src/core/legal/at-law-abbreviations.generated.ts aus den
 * AT-Kurztiteln in src/lib/corpus-meta.json (Quelle: RIS-Korpus).
 *
 * Die Engine läuft ohne das Frontend-Verzeichnis src/ im Container, deshalb
 * wird die Liste als Datei in den Engine-Code geschrieben. Der Frischetest
 * (server/test/citation-guardrail-at.test.ts) schlägt fehl, wenn die Datei
 * nicht mehr zur corpus-meta.json passt.
 *
 * Aufruf (Repo-Wurzel): bun server/scripts/generate-at-law-abbreviations.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..");
export const CORPUS_META_PATH = join(REPO_ROOT, "src", "lib", "corpus-meta.json");
export const OUTPUT_PATH = join(
  REPO_ROOT,
  "server",
  "src",
  "core",
  "legal",
  "at-law-abbreviations.generated.ts"
);

/** Ein Kürzel: beginnt mit Großbuchstabe, nur Buchstaben/Bindestrich, mind. zwei Großbuchstaben. */
const ABBR = /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]{0,14}[A-Za-zÄÖÜäöüß]$/;
const ROMAN = /^[IVXLC]+$/;

export function deriveAtLawAbbreviations(
  meta: Record<string, { jurisdiction: string; label: string }>
): string[] {
  const out = new Set<string>();
  for (const entry of Object.values(meta)) {
    if (entry.jurisdiction !== "at") continue;
    // Kurztitel mit Jahreszahl ("KHVG 1994", "VAG 2016") werden im Text meist
    // ohne Jahr zitiert — deshalb ohne Jahreszahl aufnehmen.
    const label = entry.label
      .replace(/\s+/g, " ")
      .trim()
      .replace(/ (?:19|20)\d{2}$/, "");
    if (!ABBR.test(label) || ROMAN.test(label)) continue;
    if ((label.match(/[A-ZÄÖÜ]/g) ?? []).length < 2) continue;
    out.add(label);
  }
  return [...out].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function renderGeneratedFile(abbrs: string[]): string {
  return [
    "// AUTOMATISCH ERZEUGT — nicht von Hand bearbeiten.",
    "// Quelle: src/lib/corpus-meta.json (AT-Kurztitel aus dem RIS-Korpus).",
    "// Neu erzeugen: bun server/scripts/generate-at-law-abbreviations.ts",
    "",
    "export const AT_LAW_ABBREVIATIONS: readonly string[] = [",
    ...abbrs.map((a) => `  ${JSON.stringify(a)},`),
    "];",
    "",
  ].join("\n");
}

if (import.meta.main) {
  const meta = JSON.parse(readFileSync(CORPUS_META_PATH, "utf8"));
  const abbrs = deriveAtLawAbbreviations(meta);
  writeFileSync(OUTPUT_PATH, renderGeneratedFile(abbrs));
  console.log(`${abbrs.length} AT-Kürzel → ${OUTPUT_PATH}`);
}
