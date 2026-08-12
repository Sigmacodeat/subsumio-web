#!/usr/bin/env bun
/**
 * PDF-Artifact Cleaner für Quellen ohne XML (z.B. Bezirke/Bvb).
 *
 * Entfernt PDF-Header und -Footer aus dem Text:
 *   - "www.ris.bka.gv.at" (alleine oder gefolgt von "Seite X von Y")
 *   - "Seite X von Y" / "X von Y" (Seitenzahlen)
 *   - "VERORDNUNGSBLATT DER BEZIRKSHAUPTMANNSCHAFT <ORT>" (Briefkopf)
 *   - "Jahrgang XXXX  Ausgegeben am ..." (Ausgabe-Info)
 *   - "Bundesrecht konsolidiert" (allgemeiner PDF-Header)
 *   - "Gesamte Rechtsvorschrift für ..." (PDF-Titelzeile)
 *   - "--- Page N ---" (explizite PDF-Seitenmarker)
 *   - Zusammengeklebte Ortsnamen: "GrazGraz", "WienWien", etc.
 *
 *   bun server/scripts/clean-pdf-artifacts.ts --dry-run
 *   bun server/scripts/clean-pdf-artifacts.ts --source law-at-bezirke
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { createHash } from "crypto";
import { $ } from "bun";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const SOURCE = args.find((a) => a.startsWith("--source="))?.split("=")[1]
  ?? args[args.indexOf("--source") + 1];
const LIMIT = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0", 10);

const CORPUS_ROOT = `${process.cwd()}/law-corpus`;

// ── DB ─────────────────────────────────────────────────────────────────
const DB_URL = (await $`grep -hoE 'postgres://[^"'"'"' ]+subsumio_law[^"'"'"' ]*' server/.env`.quiet())
  .stdout.toString().trim().split("\n")[0];
const URL_ = DB_URL.replace(/\/[^/?]+(\?|$)/, "/subsumio_law_v2$1");

// ── Source → Korpus-Verzeichnis ────────────────────────────────────────
const SOURCE_DIR: Record<string, string> = {
  "law-at-bezirke": "at-bezirke",
  "law-at-gemeinden": "at-gemeinden",
  "law-at-bmerl": "at-bmerl",
  "law-at-avsv": "at-avsv",
  "law-at-avn": "at-avn",
  "law-at-judikatur-dok": "at-judikatur-dok",
  "law-at-judikatur-pvak": "at-judikatur-pvak",
  "law-at-judikatur-umse": "at-judikatur-umse",
  "law-at": "at",
};

// ── PDF-Artifact Patterns ──────────────────────────────────────────────
// Reihenfolge wichtig: spezifischere Patterns zuerst

/** Zusammengeklebte Ortsnamen: "GrazGraz", "WienWien", "LinzLinz" etc. */
const RE_DUP_CITY = /([A-ZÄÖÜ][a-zäöü]+)\1/g;

/** "www.ris.bka.gv.at" gefolgt von "Seite X von Y" (mit oder ohne Whitespace) */
const RE_RIS_SEITE = /www\.ris\.bka\.gv\.at\s*Seite\s*\d+\s*von\s*\d+/g;

/** "www.ris.bka.gv.at" alleine */
const RE_RIS_URL = /www\.ris\.bka\.gv\.at/g;

/** "Seite X von Y" alleine */
const RE_SEITE = /Seite\s*\d+\s*von\s*\d+/g;

/** "X von Y" (kurze Form, z.B. "1 von 2") — nur am Zeilenanfang */
const RE_SHORT_PAGE = /^\s*\d+\s+von\s+\d+\s*$/gm;

/** "--- Page N ---" Marker */
const RE_PAGE_MARKER = /---\s*Page\s*\d+\s*---/g;

/** "Bundesrecht konsolidiert" Header */
const RE_BUNDESRECHT = /Bundesrecht\s+konsolidiert/g;

/** "Gesamte Rechtsvorschrift für ..." Titelzeile */
const RE_GESAMTE = /Gesamte\s+Rechtsvorschrift\s+für\s+[^\n]+\n/g;

/** "VERORDNUNGSBLATT DER BEZIRKSHAUPTMANNSCHAFT <ORT>" Briefkopf */
const RE_VERORDNUNGSBLATT = /VERORDNUNGSBLATT\s+DER\s+BEZIRKSHAUPTMANNSCHAFT\s+[A-ZÄÖÜ.\s]+\n/gi;

/** "Jahrgang XXXX  Ausgegeben am ..." Ausgabe-Info */
const RE_JAHRGANG = /Jahrgang\s+\d{4}\s+Ausgegeben\s+am\s+[^\n]+\n/gi;

/** DVR/UID/Briefkopf-Zeilen */
const RE_BRIEFKOPF = /DVR:\s*\d{7}|UID:\s*ATU\d+|P\.b\.b\.\s+Erscheinungsort/gi;

/**
 * Bereinigt den Text von PDF-Artefakten.
 * Gibt den bereinigten Text zurück.
 */
function cleanPdfArtifacts(text: string): { cleaned: string; removed: number } {
  let removed = 0;
  let result = text;

  // 1. Zusammengeklebte Ortsnamen: "GrazGraz" → "Graz"
  result = result.replace(RE_DUP_CITY, "$1");

  // 2. "www.ris.bka.gv.atSeite X von Y" (zusammengeklebt)
  result = result.replace(RE_RIS_SEITE, () => { removed++; return ""; });

  // 3. "www.ris.bka.gv.at" alleine
  result = result.replace(RE_RIS_URL, () => { removed++; return ""; });

  // 4. "Seite X von Y" alleine
  result = result.replace(RE_SEITE, () => { removed++; return ""; });

  // 5. "1 von 2" (kurze Form am Zeilenanfang)
  result = result.replace(RE_SHORT_PAGE, () => { removed++; return ""; });

  // 6. "--- Page N ---" Marker
  result = result.replace(RE_PAGE_MARKER, () => { removed++; return ""; });

  // 7. "Bundesrecht konsolidiert"
  result = result.replace(RE_BUNDESRECHT, () => { removed++; return ""; });

  // 8. "Gesamte Rechtsvorschrift für ..." Titelzeile
  result = result.replace(RE_GESAMTE, () => { removed++; return ""; });

  // 9. "VERORDNUNGSBLATT DER BEZIRKSHAUPTMANNSCHAFT <ORT>"
  result = result.replace(RE_VERORDNUNGSBLATT, () => { removed++; return ""; });

  // 10. "Jahrgang XXXX Ausgegeben am ..."
  result = result.replace(RE_JAHRGANG, () => { removed++; return ""; });

  // 11. DVR/UID/Briefkopf
  result = result.replace(RE_BRIEFKOPF, () => { removed++; return ""; });

  // Aufräumen: leere Zeilen und überflüssige Whitespaces
  result = result
    .replace(/[ \t]+\n/g, "\n")  // trailing whitespace
    .replace(/\n{3,}/g, "\n\n")  // max 2 aufeinanderfolgende newlines
    .replace(/^\s+/, "")         // leading whitespace
    .trim();

  return { cleaned: result, removed };
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  PDF-Artifact Cleaner (kein XML — Text-Bereinigung)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Source:     ${SOURCE ?? "alle"}`);
  console.log(`Dry run:    ${DRY ? "JA" : "NEIN"}`);
  console.log("");

  // 1. Defekte aus DB lesen
  const sourceFilter = SOURCE ? `and p.source_id = '${SOURCE}'` : "";
  const limitFilter = LIMIT > 0 ? `limit ${LIMIT}` : "";
  const sql = `select distinct p.slug, p.source_id
    from corpus_defects cd
    join pages p on p.id = cd.page_id
    where cd.defect_type = 'pdf_artifact' ${sourceFilter}
    order by p.slug ${limitFilter}`;

  const sep = "\x1f";
  const raw = (await $`psql ${URL_} -tAF${sep} -c ${sql}`.quiet()).stdout.toString();
  const entries: { slug: string; sourceId: string }[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\x1f");
    if (parts.length >= 2) {
      entries.push({ slug: parts[0], sourceId: parts[1] });
    }
  }

  console.log(`Gefunden: ${entries.length} Defekte\n`);

  let cleaned = 0, unchanged = 0, failed = 0, notFound = 0;
  const logPath = "/tmp/clean-pdf-artifacts.jsonl";
  if (!DRY) writeFileSync(logPath, "");

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const dir = SOURCE_DIR[entry.sourceId];
    if (!dir) { failed++; continue; }

    const slugRel = entry.slug.replace("legal/statutes/at/", "").replace("legal/judikatur/at/", "");
    const filePath = `${CORPUS_ROOT}/${dir}/${slugRel}.md`;

    if (!existsSync(filePath)) {
      notFound++;
      if (!DRY) appendFileSync(logPath, JSON.stringify({ slug: entry.slug, status: "not_found" }) + "\n");
      continue;
    }

    try {
      const content = readFileSync(filePath, "utf8");
      const fmM = content.match(/^---\n([\s\S]*?)\n---\n?/);
      if (!fmM) { failed++; continue; }

      const fm = fmM[1];
      const body = content.slice(fmM[0].length);

      const { cleaned: cleanedBody, removed } = cleanPdfArtifacts(body);

      if (removed === 0) {
        unchanged++;
        if (!DRY) appendFileSync(logPath, JSON.stringify({ slug: entry.slug, status: "no_artifacts" }) + "\n");
        continue;
      }

      // Neuen Hash berechnen
      const newHash = createHash("sha256").update(cleanedBody.trim()).digest("hex").slice(0, 16);
      const oldHashM = fm.match(/^content_hash:\s*"?([^"\n]+)"?/m);
      const oldHash = oldHashM ? oldHashM[1].trim() : "";

      if (oldHash === newHash) {
        unchanged++;
        if (!DRY) appendFileSync(logPath, JSON.stringify({ slug: entry.slug, status: "unchanged" }) + "\n");
        continue;
      }

      if (DRY) {
        cleaned++;
        if (cleaned <= 3) {
          console.log(`  [DRY] ${entry.slug}: ${removed} Artefakte entfernt`);
        }
        continue;
      }

      // Neue Datei schreiben
      const newFm = fm.replace(/^content_hash:\s*"?[^"\n]+"?/m, `content_hash: "${newHash}"`);
      const newContent = `---\n${newFm}\n---\n${cleanedBody}\n`;
      writeFileSync(filePath, newContent);

      cleaned++;
      if (!DRY) appendFileSync(logPath, JSON.stringify({ slug: entry.slug, status: "cleaned", removed, oldHash, newHash }) + "\n");
    } catch (e) {
      failed++;
      if (!DRY) appendFileSync(logPath, JSON.stringify({ slug: entry.slug, status: "error", error: String(e).slice(0, 200) }) + "\n");
    }

    if ((i + 1) % 500 === 0) {
      const pct = ((100 * (i + 1)) / entries.length).toFixed(1);
      console.log(`  ${i + 1}/${entries.length} (${pct}%)  cleaned=${cleaned} unchanged=${unchanged} failed=${failed} notFound=${notFound}`);
    }
  }

  console.log("\n────────────────────────────────────────────────────────────");
  console.log(`Fertig: ${entries.length} Slugs verarbeitet`);
  console.log(`  cleaned:   ${cleaned}`);
  console.log(`  unchanged: ${unchanged}`);
  console.log(`  failed:    ${failed}`);
  console.log(`  notFound:  ${notFound}`);
  if (!DRY) console.log(`Protokoll: ${logPath}`);
}

await main();
