#!/usr/bin/env bun
/**
 * Fix missing YAML frontmatter in manually-curated statute files.
 *
 * The legal-import-preflight requires `version_date` (YYYY-MM-DD) and
 * `source_url` (http/https) in the YAML frontmatter. Some manually curated
 * files (at/brag.md, de/*.md, ch/*.md) were written without frontmatter —
 * only markdown headings. This script adds the required frontmatter by:
 *
 * 1. Extracting the title from the first `# ` heading
 * 2. Generating jurisdiction-appropriate source_url
 * 3. Using the "Stand:" date or today as version_date
 * 4. Prepending the YAML block
 *
 * Usage: bun run server/scripts/fix-statute-frontmatter.ts [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

// Files that failed preflight (from import-statutes-split.ts --dry-run)
const FAILING_FILES: { file: string; abbr: string; jurisdiction: "at" | "de" | "ch" }[] = [
  { file: "at/brag.md", abbr: "brag", jurisdiction: "at" },
  { file: "de/gewstg.md", abbr: "gewstg", jurisdiction: "de" },
  { file: "de/erbstg.md", abbr: "erbstg", jurisdiction: "de" },
  { file: "de/bewg.md", abbr: "bewg", jurisdiction: "de" },
  { file: "de/grestg.md", abbr: "grestg", jurisdiction: "de" },
  { file: "de/lstdv.md", abbr: "lstdv", jurisdiction: "de" },
  { file: "de/stberg.md", abbr: "stberg", jurisdiction: "de" },
  { file: "de/stbvv.md", abbr: "stbvv", jurisdiction: "de" },
  { file: "ch/zpo.md", abbr: "zpo", jurisdiction: "ch" },
  { file: "ch/bgfa.md", abbr: "bgfa", jurisdiction: "ch" },
  { file: "ch/bvg.md", abbr: "bvg", jurisdiction: "ch" },
  { file: "ch/dsg.md", abbr: "dsg", jurisdiction: "ch" },
  { file: "ch/schkg.md", abbr: "schkg", jurisdiction: "ch" },
  { file: "ch/uwg.md", abbr: "uwg", jurisdiction: "ch" },
  { file: "ch/vwvg.md", abbr: "vwvg", jurisdiction: "ch" },
];

function sourceUrlFor(jurisdiction: string, abbr: string): string {
  switch (jurisdiction) {
    case "at":
      return `https://www.ris.bka.gv.at/GeltendeFassung/wxresult.aspx?norm=${abbr.toUpperCase()}`;
    case "de":
      return `https://www.gesetze-im-internet.de/${abbr}/`;
    case "ch":
      return `https://www.fedlex.admin.ch/cc/${abbr}/`;
    default:
      return `https://example.org/${abbr}`;
  }
}

function licenseFor(jurisdiction: string): string {
  switch (jurisdiction) {
    case "at":
      return "Quelle: RIS (ris.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung.";
    case "de":
      return "Amtliches Werk, § 5 UrhG (gemeinfrei). Quelle: gesetze-im-internet.de, Bundesamt für Justiz.";
    case "ch":
      return "Amtliches Werk, Art. 5 URG (gemeinfrei). Quelle: Fedlex (fedlex.admin.ch), Bundeskanzlei.";
    default:
      return "Quelle: unbekannt.";
  }
}

function extractTitle(raw: string): string {
  // First `# ` heading
  const m = raw.match(/^#\s+(.+)$/m);
  if (!m) return "Unbekannt";
  // Strip markdown emphasis
  return m[1].replace(/[*_`]/g, "").trim();
}

function extractStandDate(raw: string): string | null {
  // Look for "Stand: YYYY-MM-DD" or "Stand: DD.MM.YYYY"
  const iso = raw.match(/Stand[:\s]+(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dot = raw.match(/Stand[:\s]+(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dot) return `${dot[3]}-${dot[2].padStart(2, "0")}-${dot[1].padStart(2, "0")}`;
  return null;
}

let fixed = 0;
let skipped = 0;

for (const sf of FAILING_FILES) {
  const path = join(CORPUS_ROOT, sf.file);
  if (!existsSync(path)) {
    console.log(`  ⏭️  ${sf.file} — nicht gefunden`);
    skipped++;
    continue;
  }

  let raw = readFileSync(path, "utf-8");

  // Already has frontmatter? Skip.
  if (raw.startsWith("---\n") && raw.slice(4).includes("\n---\n")) {
    // Check if it has version_date
    const fmEnd = raw.indexOf("\n---\n", 4);
    const fm = raw.slice(4, fmEnd);
    if (fm.includes("version_date:") && fm.includes("source_url:")) {
      console.log(`  ✅ ${sf.file} — hat bereits Frontmatter`);
      skipped++;
      continue;
    }
  }

  const title = extractTitle(raw);
  const versionDate = extractStandDate(raw) ?? new Date().toISOString().slice(0, 10);
  const sourceUrl = sourceUrlFor(sf.jurisdiction, sf.abbr);
  const license = licenseFor(sf.jurisdiction);
  const abbrUpper = sf.abbr.toUpperCase();

  const fm = [
    "---",
    `title: "${title}"`,
    `type: "law"`,
    `jurisdiction: "${sf.jurisdiction}"`,
    `abbreviation: "${abbrUpper}"`,
    `version_date: "${versionDate}"`,
    `retrieved_at: "${new Date().toISOString().slice(0, 10)}"`,
    `source_url: "${sourceUrl}"`,
    `license: "${license}"`,
    "---",
    "",
  ].join("\n");

  const newContent = fm + raw;
  if (!DRY_RUN) writeFileSync(path, newContent, "utf-8");
  fixed++;
  console.log(`  ${DRY_RUN ? "[DRY] " : ""}🔧 ${sf.file} — Frontmatter hinzugefügt (title: "${title}", version: ${versionDate})`);
}

console.log(`\n═══ Ergebnis ═══`);
console.log(`  Behoben:  ${fixed}`);
console.log(`  Skipped:  ${skipped}`);
if (DRY_RUN) console.log(`  (DRY RUN — keine Änderungen geschrieben)`);
