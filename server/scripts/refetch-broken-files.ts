#!/usr/bin/env bun
/**
 * Refetch broken corpus files from RIS-OGD via XML.
 *
 * A file is "broken" if ANY of:
 *   - Does not start with "---\n" (missing frontmatter delimiter)
 *   - Body contains "RIS Dokument" (broken HTML from primitive stripHtml)
 *   - Body contains "römisch" (duplicate sr-only text)
 *
 * Refetches via XML endpoint which produces clean ## headers and no duplicates.
 *
 * Usage:
 *   bun scripts/refetch-broken-files.ts --dir law-corpus/at-judikatur-bvwg
 *   bun scripts/refetch-broken-files.ts --dir law-corpus/at-judikatur-bvwg --limit 10
 *   bun scripts/refetch-broken-files.ts --dir law-corpus/at-judikatur-bvwg --dry-run
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { proxyFetchOptions, getUserAgent } from "./ris-proxy";
import { risXmlToText, contentHash } from "./backfill-utils";
import { validateBody, type DocClass } from "./normalize/canonical-schema.ts";

const args = process.argv.slice(2);
const dirIdx = args.indexOf("--dir");
const limitIdx = args.indexOf("--limit");
const dryRun = args.includes("--dry-run");
const noLock = args.includes("--no-lock");
const rateIdx = args.indexOf("--rate-ms");

const TARGET_DIR = dirIdx >= 0 ? args[dirIdx + 1] : "law-corpus/at-judikatur-bvwg";
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;
const RATE_LIMIT_MS = rateIdx >= 0 ? parseInt(args[rateIdx + 1], 10) : 1500;

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const _corpusRoot = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");
const ABS_DIR = join(_corpusRoot, TARGET_DIR.replace(/^law-corpus\//, ""));

interface BrokenFile {
  path: string;
  reason: string;
  sourceUrl: string;
  dokNr: string | null;
  abfrage: string | null;
  frontmatter: string | null;
  title: string;
}

/** Check if a file is broken. */
function checkFile(fullPath: string): BrokenFile | null {
  let content: string;
  try {
    content = readFileSync(fullPath, "utf-8");
  } catch {
    return null;
  }

  // Check if file starts with --- (proper frontmatter)
  const hasFrontmatter = content.startsWith("---\n");
  let frontmatter: string | null = null;
  let body: string = content;

  if (hasFrontmatter) {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      frontmatter = fmMatch[1];
      body = content.slice(fmMatch[0].length).trim();
    }
  } else {
    // No --- markers — try to extract YAML from first lines
    // Pattern: YAML keys until a --- line or # header
    const lines = content.split("\n");
    let yamlEnd = -1;
    for (let i = 0; i < Math.min(50, lines.length); i++) {
      const line = lines[i];
      if (line.trim() === "---") {
        yamlEnd = i;
        break;
      }
      if (line.startsWith("# ") || (line.trim() && !line.includes(":") && !line.startsWith(" "))) {
        yamlEnd = i;
        break;
      }
    }
    if (yamlEnd > 0) {
      frontmatter = lines.slice(0, yamlEnd).join("\n");
      body = lines.slice(yamlEnd + 1).join("\n").trim();
    }
  }

  // Check for broken indicators — matches verify-all-files.py 100%
  const reasons: string[] = [];

  // 1. Frontmatter markers
  if (!hasFrontmatter) reasons.push("no_fm_start");

  // 2. Required frontmatter fields (source only for court_decision)
  const typeMatchFM = (frontmatter || content.slice(0, 2000)).match(/^type:\s*(.+)/m);
  const isCourtDecisionFM = typeMatchFM && typeMatchFM[1].includes("court_decision");
  const REQUIRED_FM_FIELDS = isCourtDecisionFM
    ? ["type", "jurisdiction", "source", "source_url", "content_hash", "title"]
    : ["type", "jurisdiction", "title"];
  for (const field of REQUIRED_FM_FIELDS) {
    if (frontmatter && !frontmatter.includes(field + ":")) {
      reasons.push("missing_fm:" + field);
    }
  }

  // 3. Fetcher artifacts
  if (body.slice(0, 500).includes("RIS Dokument")) reasons.push("ris_dokument");
  // "römisch" is only broken if followed by a digit (sr-only: "römisch 40")
  if (/römisch \d/.test(body)) reasons.push("roemisch");
  if (body.includes("sr-only")) reasons.push("sr_only");

  // 4. Merged headers
  const MERGED_HEADER_WORDS = [
    "Text", "Spruch", "Tenor", "Ausspruch",
    "Begründung", "Begruendung",
    "Rechtssatz", "Leitsatz", "Stammrechtssatz",
    "Sachverhalt", "Tatbestand",
    "Beachte", "Norm", "Entscheidungstexte",
  ];
  for (const word of MERGED_HEADER_WORDS) {
    const re = new RegExp(`[a-zA-Z0-9)"\\]]${word}[A-Z\\[]`, "");
    if (re.test(body)) {
      reasons.push("merged_header:" + word);
      break;
    }
  }

  // 4b. Merged law metadata headers (at/ root and at-landesrecht files)
  // These files have "KurztitelValue" instead of "## Kurztitel\nValue"
  const LAW_MERGED_HEADERS = [
    "Kurztitel", "Kundmachungsorgan", "Inkrafttretensdatum", "Außerkrafttretensdatum",
    "Langtitel", "Änderung", "Präambel", "Typ", "Index", "Abkürzung", "Anmerkung",
    "Schlagworte", "Gesetzesnummer", "Dokumentnummer", "§/Artikel/Anlage",
  ];
  for (const word of LAW_MERGED_HEADERS) {
    const re = new RegExp(`^${word}[A-Z0-9]`, "m");
    if (re.test(body)) {
      reasons.push("merged_law_header:" + word);
      break;
    }
  }

  // 5. Spelled-out numbers
  const SPELLED = /(Paragraph (eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf))|(Absatz (eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn))/;
  if (SPELLED.test(body)) reasons.push("spelled_numbers");

  // 6. Boilerplate
  if (body.includes("Quelle: [RIS-OGD]") || body.includes("Quelle:[RIS-OGD]")) {
    reasons.push("boilerplate");
  }

  // 7. HTML entities
  if (body.includes("&#160;") || body.includes("&#x") || body.includes("&amp;")) {
    reasons.push("html_entities");
  }

  // 8. Replacement chars (encoding issues)
  if (content.slice(0, 5000).includes("\ufffd")) {
    reasons.push("replacement_chars");
  }

  // 9. Empty body
  if (body.trim().length < 50) {
    reasons.push("empty_body");
  }

  // 10. Court decisions: must have content headers AND >= 3 ## headers
  const typeMatch = (frontmatter || content.slice(0, 2000)).match(/^type:\s*(.+)/m);
  const isCourtDecision = typeMatch && typeMatch[1].includes("court_decision");
  if (isCourtDecision) {
    const CONTENT_HEADERS = [
      "## Text", "## Spruch", "## Tenor", "## Ausspruch",
      "## Entscheidungstexte", "## Rechtssatz", "## Leitsatz",
      "## Entscheidungsgründe", "## Entscheidungsgruende",
      "## Begründung", "## Begruendung",
      "## Sachverhalt", "## Tatbestand", "## Feststellungen",
      "## Stammrechtssatz",
    ];
    const hasContentHeader = CONTENT_HEADERS.some((h) => body.includes(h));
    if (!hasContentHeader && body.length > 200) {
      reasons.push("no_content_header");
    }
    // Must have at least 3 ## headers (Gericht + Entscheidungsdatum + content)
    const headerCount = (body.match(/^## .+/gm) || []).length;
    if (headerCount < 3) {
      reasons.push("only_" + headerCount + "_headers");
    }
  }

  // 11. Inhalts-Schleuse (kanonischer Validator).
  // Die Kriterien 1-10 prüfen Fetcher-Artefakte im Text — sie erkennen NICHT,
  // ob überhaupt Recht in der Datei steht. at-bezirke bestand alle zehn und
  // enthält in allen 2.484 Dateien trotzdem nur RIS-Seitennavigation statt
  // Verordnungstext. Deshalb hier zusätzlich validateBody(), dieselbe Schleuse,
  // die auch vor dem Import läuft.
  const docClass: DocClass = isCourtDecision ? "decision" : "statute";
  // Stammt die Datei bereits aus dem XML? Dann ist ihr Inhalt maßgeblich.
  // (`frontmatter` ist hier in Reichweite; `fmText` wird erst weiter unten
  // gebildet und dürfte hier noch nicht gelesen werden.)
  const fmForOrigin = frontmatter ?? content.slice(0, 2000);
  const ausXml = /source_format:\s*"?xml/.test(fmForOrigin) || /source_url:.*\.xml/.test(fmForOrigin);
  for (const issue of validateBody(body, docClass)) {
    // image_only ist kein Fetch-Fehler: die Anlage liegt in RIS nur als Bild
    // vor. Ein Refetch würde dasselbe Bild nochmal holen.
    if (issue.code === "image_only") continue;
    // too_short bei XML-Herkunft ebenso wenig: "Artikel 8" ohne Text ist in
    // RIS genau so hinterlegt. Bei HTML-Herkunft bleibt es ein Verdacht auf
    // einen abgebrochenen Abruf und wird weiter gemeldet.
    if (issue.code === "too_short" && ausXml) continue;
    reasons.push("content:" + issue.code);
  }

  if (reasons.length === 0) return null;

  // Extract source_url from frontmatter (or pseudo-frontmatter)
  const fmText = frontmatter || content.slice(0, 2000);
  const sourceUrlMatch = fmText.match(/source_url:\s*(.+)/);
  const sourceUrl = sourceUrlMatch ? sourceUrlMatch[1].trim().replace(/['"]/g, "") : "";

  // Extract abfrage/dokNr from source_url
  let abfrage: string | null = null;
  let dokNr: string | null = null;

  const abfrageQuery = sourceUrl.match(/Abfrage=([^&]+)/);
  const dokNrQuery = sourceUrl.match(/Dokumentnummer=([^&]+)/);
  if (abfrageQuery && dokNrQuery) {
    abfrage = abfrageQuery[1];
    dokNr = dokNrQuery[1];
  } else {
    const pathMatch = sourceUrl.match(/\/Dokumente\/([^/]+)\/([^/]+)\//);
    if (pathMatch) {
      abfrage = pathMatch[1];
      dokNr = pathMatch[2];
    }
  }

  // If still no abfrage/dokNr, try extracting NOR ID from ELI field
  if (!abfrage || !dokNr) {
    const eliMatch = fmText.match(/eli:\s*"?([^"\n]+)"?/);
    if (eliMatch) {
      const eli = eliMatch[1].trim();
      // ELI format: https://www.ris.bka.gv.at/eli/bgbl/i/2020/16/P0/NOR40221469
      const norMatch = eli.match(/(NOR\d+)/);
      if (norMatch) {
        abfrage = "Bundesnormen";
        dokNr = norMatch[1];
      }
    }
  }

  const titleMatch = fmText.match(/title:\s*(.+)/);
  const title = titleMatch ? titleMatch[1].trim().replace(/['"]/g, "") : "";

  return {
    path: fullPath,
    reason: reasons.join(","),
    sourceUrl,
    dokNr,
    abfrage,
    frontmatter,
    title,
  };
}

/** Scan directory recursively for broken files. */
function findBrokenFiles(dir: string): BrokenFile[] {
  const broken: BrokenFile[] = [];

  function scan(d: string) {
    const entries = readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(d, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.name.endsWith(".md")) {
        const b = checkFile(fullPath);
        if (b) broken.push(b);
      }
    }
  }

  scan(dir);
  return broken;
}

/** Fetch XML from RIS and convert to clean markdown text. */
/**
 * Zeitlimit je Abruf. OHNE das wartet `fetch()` unbegrenzt: als der
 * RIS-Dokumentserver nach mehreren tausend Abrufen aufhörte zu antworten,
 * blieb die Verbindung im Zustand ESTABLISHED stehen und der Lauf hing 12
 * Minuten lang ohne eine einzige Logzeile — von außen nicht von "arbeitet
 * gerade" zu unterscheiden. Lieber schnell scheitern und erneut versuchen.
 */
const FETCH_TIMEOUT_MS = Number(
  (() => { const i = args.indexOf("--timeout-ms"); return i >= 0 ? args[i + 1] : "20000"; })()
);

async function fetchXml(abfrage: string, dokNr: string): Promise<string> {
  const xmlUrl = `https://www.ris.bka.gv.at/Dokumente/${abfrage}/${dokNr}/${dokNr}.xml`;
  const res = await fetch(xmlUrl, {
    headers: { "User-Agent": getUserAgent(), ...proxyFetchOptions() },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${xmlUrl}`);
  }
  const xml = await res.text();
  return risXmlToText(xml);
}

/** Verify fetched text matches document identity. */
function contentMatchesDocument(text: string, caseNum: string, ecli: string): boolean {
  const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const normText = normalize(text);
  if (caseNum && normText.includes(normalize(caseNum))) return true;
  if (ecli && normText.includes(normalize(ecli))) return true;
  if (!caseNum && !ecli) return true;
  return false;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Refetch Broken Files from RIS-OGD (XML)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Target dir:    ${TARGET_DIR}`);
  console.log(`Dry run:       ${dryRun ? "YES" : "no"}`);
  console.log(`Rate limit:    ${RATE_LIMIT_MS}ms`);
  if (LIMIT) console.log(`Limit:         ${LIMIT}`);
  console.log("");

  console.log(`Scanning ${ABS_DIR} for broken files...`);
  const broken = findBrokenFiles(ABS_DIR);

  const fetchable = broken.filter((b) => b.abfrage && b.dokNr);
  const notFetchable = broken.filter((b) => !b.abfrage || !b.dokNr);

  console.log(`Found ${broken.length} broken files`);
  console.log(`  Fetchable:    ${fetchable.length}`);
  console.log(`  Not fetchable: ${notFetchable.length}`);
  if (notFetchable.length > 0) {
    console.log("  Not fetchable (first 5):");
    for (const b of notFetchable.slice(0, 5)) {
      console.log(`    ${b.path.slice(-60)} — reason=${b.reason}`);
    }
  }
  console.log("");

  if (dryRun) {
    console.log("Dry run — not fetching. First 5 broken files:");
    for (const b of broken.slice(0, 5)) {
      console.log(`  ${b.reason}: ${b.path.slice(-60)}`);
      console.log(`    abfrage=${b.abfrage} dokNr=${b.dokNr}`);
    }
    return;
  }

  if (!noLock) {
    await acquireRisLock();
  }

  let success = 0;
  let failed = 0;
  let skipped = 0;
  const failedFiles: string[] = [];

  const toProcess = LIMIT ? fetchable.slice(0, LIMIT) : fetchable;
  const startTime = Date.now();

  console.log(`Processing ${toProcess.length} files...`);
  console.log("");

  for (let i = 0; i < toProcess.length; i++) {
    const b = toProcess[i];

    try {
      // Read original file to preserve frontmatter
      const content = readFileSync(b.path, "utf-8");

      // Extract identity for verification
      const fmText = b.frontmatter || content.slice(0, 2000);
      const caseNum = (fmText.match(/case_number:\s*(.+)/) || [])[1]?.trim().replace(/['"]/g, "") || "";
      const ecli = (fmText.match(/ecli:\s*(.+)/) || [])[1]?.trim().replace(/['"]/g, "") || "";

      // Fetch XML
      const text = await fetchXml(b.abfrage!, b.dokNr!);

      if (text.length < 50) {
        skipped++;
        continue;
      }

      if (!contentMatchesDocument(text, caseNum, ecli)) {
        skipped++;
        continue;
      }

      // Build clean frontmatter from original
      let cleanFm = b.frontmatter || "";
      if (!cleanFm) {
        // No frontmatter at all — skip, can't reconstruct
        skipped++;
        continue;
      }

      // Update content_hash
      const newHash = contentHash(text);
      if (cleanFm.includes("content_hash:")) {
        cleanFm = cleanFm.replace(/content_hash:\s*.*/, `content_hash: "${newHash}"`);
      } else {
        cleanFm += `\ncontent_hash: "${newHash}"`;
      }

      // Write new file: --- frontmatter --- + H1 title + body
      const newContent = `---\n${cleanFm}\n---\n\n# ${b.title}\n\n${text}\n`;
      writeFileSync(b.path, newContent);

      success++;
      if (success % 100 === 0 || i < 5) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = (i + 1) / elapsed;
        const eta = (toProcess.length - i - 1) / rate / 60;
        console.log(
          `  [${i + 1}/${toProcess.length}] OK (${success} ok, ${failed} fail, ${skipped} skip) — ${rate.toFixed(1)} f/s, ETA ${eta.toFixed(0)}min`
        );
      }
    } catch (e) {
      failed++;
      failedFiles.push(b.path);
      if (failed <= 10) {
        console.log(`  [${i + 1}/${toProcess.length}] FAIL: ${b.path.slice(-60)} — ${e}`);
      }
    }

    // Rate limit
    if (i < toProcess.length - 1) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  const elapsed = ((Date.now() - startTime) / 60).toFixed(1);
  console.log(`  Done in ${elapsed}min: ${success} success, ${failed} failed, ${skipped} skipped`);
  console.log("═══════════════════════════════════════════════════════════");

  if (failedFiles.length > 0) {
    console.log("");
    console.log(`Failed files (${failedFiles.length}, showing first 10):`);
    for (const f of failedFiles.slice(0, 10)) {
      console.log(`  ${f}`);
    }
  }

  if (!noLock) {
    releaseRisLock();
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
