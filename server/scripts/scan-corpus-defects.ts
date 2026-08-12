#!/usr/bin/env bun
/**
 * Corpus Defect Scanner — permanentes Skript für die Defekt-Erkennung.
 *
 * Ersetzt die ad-hoc SQL-Skripte durch einen einzigen, idempotenten Scan.
 * Läuft in ~5 Min auf 2,9M Chunks (mit CTE-Optimierung).
 *
 * Defect-Typen:
 *   - pdf_artifact: PDF-Header/Footer im Fließtext (www.ris.bka.gv.at, Seite X von Y)
 *   - abrupt_end: Text endet mitten im Satz (kleingeschriebenes Wort, kein Satzzeichen)
 *   - html_entities: HTML-Entities im Text (&nbsp;, &amp;, &#160;)
 *   - spoken_numbers: Ausgeschriebene Paragraphenangaben ("Paragraph eins")
 *   - mojibake: Kodierungsreste (Ã¤, â€, etc.)
 *
 *   bun server/scripts/scan-corpus-defects.ts
 *   bun server/scripts/scan-corpus-defects.ts --source law-at-normen
 *   bun server/scripts/scan-corpus-defects.ts --type pdf_artifact
 */

import { $ } from "bun";

const args = process.argv.slice(2);
const SOURCE = args.find((a) => a.startsWith("--source="))?.split("=")[1];
const TYPE = args.find((a) => a.startsWith("--type="))?.split("=")[1];
const DRY = args.includes("--dry-run");

// ── DB ─────────────────────────────────────────────────────────────────
const DB_URL = (await $`grep -hoE 'postgres://[^"'"'"' ]+subsumio_law[^"'"'"' ]*' server/.env`.quiet())
  .stdout.toString().trim().split("\n")[0];
const URL_ = DB_URL.replace(/\/[^/?]+(\?|$)/, "/subsumio_law_v2$1");

// ── SQL ────────────────────────────────────────────────────────────────
const sourceFilter = SOURCE ? `AND p.source_id = '${SOURCE}'` : "";
const typeFilter = TYPE ? `AND cd.defect_type = '${TYPE}'` : "";

const SQL = `
-- Lösche alte Defekte des gewählten Typs (oder alle)
DELETE FROM corpus_defects ${TYPE ? `WHERE defect_type = '${TYPE}'` : ""};

-- 1. PDF-Artifact: www.ris.bka.gv.at, Seite X von Y, etc.
${!TYPE || TYPE === "pdf_artifact" ? `
INSERT INTO corpus_defects (page_id, slug, source_id, defect_type, severity, detail)
SELECT DISTINCT
  p.id, p.slug, p.source_id,
  'pdf_artifact'::text, 'medium'::text,
  'PDF-Kopfzeile oder Seitenumbruch im Fließtext'
FROM pages p
JOIN content_chunks c ON c.page_id = p.id
WHERE p.deleted_at IS NULL ${sourceFilter}
  AND (
    c.chunk_text ~ 'Seite \\d+ von \\d+'
    OR c.chunk_text ~ 'www\\.ris\\.bka\\.gv\\.at'
    OR c.chunk_text ~ '--- Page \\d+ ---'
    OR c.chunk_text ~ 'Bundesrecht konsolidiert'
  )
ON CONFLICT (page_id, defect_type) DO NOTHING;
` : ""}

-- 2. abrupt_end: Text endet mitten im Satz
${!TYPE || TYPE === "abrupt_end" ? `
WITH page_text AS (
  SELECT
    p.id as page_id, p.slug, p.source_id,
    string_agg(c.chunk_text, E'\\n' ORDER BY c.chunk_index) as full_text
  FROM pages p
  JOIN content_chunks c ON c.page_id = p.id
  WHERE p.deleted_at IS NULL ${sourceFilter}
  GROUP BY p.id, p.slug, p.source_id
)
INSERT INTO corpus_defects (page_id, slug, source_id, defect_type, severity, detail)
SELECT
  pt.page_id, pt.slug, pt.source_id,
  'abrupt_end'::text, 'high'::text,
  'endet auf: ' || right(trim(pt.full_text), 60)
FROM page_text pt
WHERE length(trim(pt.full_text)) > 200
  AND trim(pt.full_text) ~ '(?:^|\\s)[a-zäöüß][a-zäöüß0-9-]*\\s*$'
  AND trim(pt.full_text) !~ '[.!?;:«»")\\]]\\s*$'
  AND NOT (pt.source_id LIKE 'law-at-judikatur-%'
    AND trim(pt.full_text) ~ '(OGH|VwGH|VfGH|BVWG|AsylGH|LVwG|UVS|DSK|UBAS|GBK|DOK|RS\\d|JUS\\d|Vgl auch|vgl\\. auch|nur T[0-9])\\s*$')
  AND trim(pt.full_text) !~ '(?:^|\\s)(der|die|das|und|oder|im|in|zu|von|mit|auf|für|ist|bei|nach|vor|seit|ab|bis|als|wie|wenn|dass|daß|sowie|beziehungsweise)\\s*$'
ON CONFLICT (page_id, defect_type) DO NOTHING;
` : ""}

-- 3. html_entities: HTML-Entities im Text
${!TYPE || TYPE === "html_entities" ? `
INSERT INTO corpus_defects (page_id, slug, source_id, defect_type, severity, detail)
SELECT DISTINCT
  p.id, p.slug, p.source_id,
  'html_entities'::text, 'low'::text,
  'HTML-Entities im Text'
FROM pages p
JOIN content_chunks c ON c.page_id = p.id
WHERE p.deleted_at IS NULL ${sourceFilter}
  AND c.chunk_text ~ '&nbsp;|&amp;|&lt;|&gt;|&quot;|&apos;|&#\\d+;'
ON CONFLICT (page_id, defect_type) DO NOTHING;
` : ""}

-- 4. spoken_numbers: Ausgeschriebene Paragraphenangaben
${!TYPE || TYPE === "spoken_numbers" ? `
INSERT INTO corpus_defects (page_id, slug, source_id, defect_type, severity, detail)
SELECT DISTINCT
  p.id, p.slug, p.source_id,
  'spoken_numbers'::text, 'medium'::text,
  'Ausgeschriebene Paragraphenangabe (Sprachausgabe-Artefakt)'
FROM pages p
JOIN content_chunks c ON c.page_id = p.id
WHERE p.deleted_at IS NULL ${sourceFilter}
  AND c.chunk_text ~ 'Paragraph \\d+,|Absatz \\d+,|Ziffer \\d+,'
ON CONFLICT (page_id, defect_type) DO NOTHING;
` : ""}

-- 5. mojibake: Kodierungsreste
${!TYPE || TYPE === "mojibake" ? `
INSERT INTO corpus_defects (page_id, slug, source_id, defect_type, severity, detail)
SELECT DISTINCT
  p.id, p.slug, p.source_id,
  'mojibake'::text, 'high'::text,
  'Kodierungsfehler im Text'
FROM pages p
JOIN content_chunks c ON c.page_id = p.id
WHERE p.deleted_at IS NULL ${sourceFilter}
  AND c.chunk_text ~ '[Ãâ][¤¶¼Ÿ€™]|â€|'
ON CONFLICT (page_id, defect_type) DO NOTHING;
` : ""}
`;

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Corpus Defect Scanner");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Source:     ${SOURCE ?? "alle"}`);
  console.log(`Type:       ${TYPE ?? "alle"}`);
  console.log(`Dry run:    ${DRY ? "JA" : "NEIN"}`);
  console.log("");

  if (DRY) {
    console.log("SQL:\n");
    console.log(SQL);
    return;
  }

  console.log("Starte Scan...");
  const start = Date.now();

  const result = await $`psql ${URL_} -v ON_ERROR_STOP=1 -c ${SQL}`.quiet();
  const duration = ((Date.now() - start) / 1000).toFixed(1);

  if (result.exitCode !== 0) {
    console.error("Fehler:", result.stderr.toString());
    process.exit(1);
  }

  console.log(`Scan fertig in ${duration}s`);

  // Ergebnis anzeigen
  const summary = (await $`psql ${URL_} -tAF| -c ${"select defect_type, count(*) from corpus_defects group by 1 order by 2 desc"}`.quiet())
    .stdout.toString().trim();

  console.log("\nDefekte:");
  for (const line of summary.split("\n")) {
    if (!line.trim()) continue;
    const [type, count] = line.split("|");
    console.log(`  ${type.padEnd(20)} ${count}`);
  }
}

await main();
