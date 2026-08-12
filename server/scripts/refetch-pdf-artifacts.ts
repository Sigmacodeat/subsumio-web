#!/usr/bin/env bun
/**
 * Universeller RIS-XML Refetcher für PDF-Artifact-Defekte.
 *
 * Liest pdf_artifact Defects aus der DB, fetcht die XML-Quelle neu,
 * extrahiert den Text (ohne kzinhalt/fzinhalt PDF-Header) und
 * schreibt die bereinigte Datei zurück.
 *
 * Unterstützte Quellen (mit XML):
 *   - Gemeinderecht (GEMRE_*)
 *   - Erlaesse (ERL_*)
 *   - Dok (DKT_*)
 *   - Avsv (AVSV_*)
 *   - Landesrecht (NOR*)
 *   - Bundesnormen (NOR*)
 *   - Judikatur (RS_*, JUS_*)
 *
 *   bun server/scripts/refetch-pdf-artifacts.ts --dry-run
 *   bun server/scripts/refetch-pdf-artifacts.ts --source law-at-gemeinden
 *   bun server/scripts/refetch-pdf-artifacts.ts --batch-size 100 --sleep-ms 200
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import { $ } from "bun";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const SOURCE = args.find((a) => a.startsWith("--source="))?.split("=")[1]
  ?? args[args.indexOf("--source") + 1];
const BATCH_SIZE = parseInt(args.find((a) => a.startsWith("--batch-size="))?.split("=")[1] ?? "100", 10);
const SLEEP_MS = parseInt(args.find((a) => a.startsWith("--sleep-ms="))?.split("=")[1] ?? "200", 10);
const LIMIT = parseInt(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0", 10);

const CORPUS_ROOT = `${process.cwd()}/law-corpus`;

// ── DB ─────────────────────────────────────────────────────────────────
const DB_URL = (await $`grep -hoE 'postgres://[^"'"'"' ]+subsumio_law[^"'"'"' ]*' server/.env`.quiet())
  .stdout.toString().trim().split("\n")[0];
const DB_NAME = "subsumio_law_v2";
const URL_ = DB_URL.replace(/\/[^/?]+(\?|$)/, `/${DB_NAME}$1`);

// ── Source-ID → Korpus-Verzeichnis + RIS-Typ ────────────────────────────
interface SourceConfig {
  corpusDir: string;      // law-corpus/<dir>
  risType: string;        // Dokumente/<type>/ Pfad
  slugPrefix: string;     // legal/statutes/at/... oder legal/judikatur/at/...
  slugStrip: string;      // Was vom Slug abgeschnitten wird
}

const SOURCE_CONFIG: Record<string, SourceConfig> = {
  "law-at-gemeinden": { corpusDir: "at-gemeinden", risType: "Gemeinderecht", slugPrefix: "legal/statutes/at/", slugStrip: "legal/statutes/at/" },
  "law-at-bezirke": { corpusDir: "at-bezirke", risType: "Bvb", slugPrefix: "legal/statutes/at/", slugStrip: "legal/statutes/at/" },
  "law-at-bmerl": { corpusDir: "at-bmerl", risType: "Erlaesse", slugPrefix: "legal/statutes/at/", slugStrip: "legal/statutes/at/" },
  "law-at-judikatur-dok": { corpusDir: "at-judikatur-dok", risType: "Dok", slugPrefix: "legal/judikatur/at/", slugStrip: "legal/judikatur/at/" },
  "law-at-avsv": { corpusDir: "at-avsv", risType: "Avsv", slugPrefix: "legal/statutes/at/", slugStrip: "legal/statutes/at/" },
  "law-at-avn": { corpusDir: "at-avn", risType: "Avn", slugPrefix: "legal/statutes/at/", slugStrip: "legal/statutes/at/" },
  "law-at-landesrecht": { corpusDir: "at-landesrecht", risType: "Landesnormen", slugPrefix: "legal/statutes/at/landesrecht/", slugStrip: "legal/statutes/at/landesrecht/" },
  "law-at-normen": { corpusDir: "at-normen", risType: "Bundesnormen", slugPrefix: "legal/statutes/at/", slugStrip: "legal/statutes/at/" },
  "law-at": { corpusDir: "at", risType: "Bundesnormen", slugPrefix: "legal/statutes/at/", slugStrip: "legal/statutes/at/" },
  // Judikatur
  "law-at-judikatur-gbk": { corpusDir: "at-judikatur-gbk", risType: "Gbk", slugPrefix: "legal/judikatur/at/", slugStrip: "legal/judikatur/at/" },
  "law-at-judikatur-lvwg": { corpusDir: "at-judikatur-lvwg", risType: "Lvwg", slugPrefix: "legal/judikatur/at/", slugStrip: "legal/judikatur/at/" },
  "law-at-judikatur-asylgh": { corpusDir: "at-judikatur-asylgh", risType: "Asylgh", slugPrefix: "legal/judikatur/at/", slugStrip: "legal/judikatur/at/" },
  "law-at-judikatur-dsk": { corpusDir: "at-judikatur-dsk", risType: "Dsk", slugPrefix: "legal/judikatur/at/", slugStrip: "legal/judikatur/at/" },
  "law-at-judikatur-bvwg": { corpusDir: "at-judikatur-bvwg", risType: "Bvwg", slugPrefix: "legal/judikatur/at/", slugStrip: "legal/judikatur/at/" },
  "law-at-judikatur-vfgh": { corpusDir: "at-judikatur-vfgh", risType: "Vfgh", slugPrefix: "legal/judikatur/at/", slugStrip: "legal/judikatur/at/" },
  "law-at-judikatur-vwgh": { corpusDir: "at-judikatur-vwgh", risType: "Vwgh", slugPrefix: "legal/judikatur/at/", slugStrip: "legal/judikatur/at/" },
  "law-at-judikatur-uvs": { corpusDir: "at-judikatur-uvs", risType: "Uvs", slugPrefix: "legal/judikatur/at/", slugStrip: "legal/judikatur/at/" },
  "law-at-judikatur-ogh": { corpusDir: "at-judikatur", risType: "Justiz", slugPrefix: "legal/judikatur/at/", slugStrip: "legal/judikatur/at/" },
  "law-at-judikatur-ubas": { corpusDir: "at-judikatur-ubas", risType: "Ubas", slugPrefix: "legal/judikatur/at/", slugStrip: "legal/judikatur/at/" },
  "law-at-judikatur-pvak": { corpusDir: "at-judikatur-pvak", risType: "Pvak", slugPrefix: "legal/judikatur/at/", slugStrip: "legal/judikatur/at/" },
  "law-at-judikatur-umse": { corpusDir: "at-judikatur-umse", risType: "Umse", slugPrefix: "legal/judikatur/at/", slugStrip: "legal/judikatur/at/" },
};

// ── XML-Text-Extraktion ────────────────────────────────────────────────
/**
 * Extrahiert Text aus RIS-XML, OHNE kzinhalt/fzinhalt (PDF-Header/Footer).
 *
 * Strategie: Entferne zuerst alle <kzinhalt>...</kzinhalt> und
 * <fzinhalt>...</fzinhalt> Blöcke aus dem XML, dann extrahiere
 * <absatz>, <ueberschrift>, <listelem>, <schluss>, <schlussteil>
 * mit ct="text" ODER typ="erltext" ODER typ="abs" ODER typ="titel".
 */
function extractText(xml: string): { text: string; meta: Record<string, string> } {
  const meta: Record<string, string> = {};
  const blocks: string[] = [];

  // 1. Entferne kzinhalt/fzinhalt (PDF-Header/Footer)
  let cleanXml = xml
    .replace(/<kzinhalt\b[^>]*>[\s\S]*?<\/kzinhalt>/g, "")
    .replace(/<fzinhalt\b[^>]*>[\s\S]*?<\/fzinhalt>/g, "");

  // 2. Extrahiere Text-Elemente
  // Match absatz, ueberschrift, listelem, schluss, schlussteil
  // mit ct="text" (Bundesnormen) ODER typ="erltext" (Gemeinderecht/Erlaesse)
  // ODER typ="abs" (Bundesnormen) ODER typ="titel" (Bundesnormen)
  const tagRe = /<(absatz|ueberschrift|listelem|schluss|schlussteil)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(cleanXml)) !== null) {
    const tag = m[1];
    const attrs = m[2];
    const inner = m[3];

    // Attribut-Check: ct oder typ muss ein Text-Typ sein
    const ctM = attrs.match(/\bct="([^"]*)"/);
    const typM = attrs.match(/\btyp="([^"]*)"/);
    const ct = ctM ? ctM[1] : null;
    const typ = typM ? typM[1] : null;

    // Akzeptierte Text-Typen:
    // ct="text" — Bundesnormen
    // typ="erltext" — Gemeinderecht, Erlaesse, Dok, Avsv
    // typ="abs" — Bundesnormen (Absatz)
    // typ="titel" — Bundesnormen (Titel)
    // typ="para" — Bundesnormen (Paragraph)
    const isTextType =
      ct === "text" ||
      typ === "erltext" ||
      typ === "abs" ||
      typ === "titel" ||
      typ === "para" ||
      (ct === null && typ === null); // Fallback: keine Attribute

    // Meta-Daten extrahieren (ct != text)
    if (ct && ct !== "text") {
      if (!meta[ct]) {
        const plain = stripXml(inner);
        if (plain) meta[ct] = plain;
      }
      continue;
    }

    if (!isTextType) continue;

    const plain = stripXml(inner);
    if (!plain) continue;

    // ueberschrift als Markdown-Heading
    if (tag === "ueberschrift") {
      blocks.push(`## ${plain}`);
    } else {
      blocks.push(plain);
    }
  }

  return { text: blocks.join("\n\n"), meta };
}

function stripXml(inner: string): string {
  return inner
    .replace(/<tab\b[^>]*\/>/g, "\t")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<b\b[^>]*>([\s\S]*?)<\/b>/g, "$1")
    .replace(/<i\b[^>]*>([\s\S]*?)<\/i>/g, "$1")
    .replace(/<span\b[^>]*>([\s\S]*?)<\/span>/g, "$1")
    .replace(/<feld\b[^>]*>([\s\S]*?)<\/feld>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Slug → Dateipfad + Dokument-ID ──────────────────────────────────────
function slugToPath(slug: string, config: SourceConfig): string {
  const rel = slug.replace(config.slugStrip, "");
  return `${CORPUS_ROOT}/${config.corpusDir}/${rel}.md`;
}

function readDocId(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf8");
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = m[1];

  // Verschiedene Frontmatter-Felder für die Dokument-ID (mit/ohne Quotes)
  const norM = fm.match(/^nor_id:\s*"?([^"\n]+)"?/m);
  if (norM) return norM[1].trim();
  const docM = fm.match(/^document_id:\s*"?([^"\n]+)"?/m);
  if (docM) return docM[1].trim();
  const idM = fm.match(/^id:\s*"?ris-([^"\n]+)"?/m);
  if (idM) return idM[1].trim();

  // Aus source_url extrahieren (mit oder ohne Anführungszeichen)
  const urlM = fm.match(/^source_url:\s*"?([^"\n]+)"?/m);
  if (urlM) {
    const url = urlM[1].trim();
    // Dokument.wxe?Abfrage=X&Dokumentnummer=Y
    const dnM = url.match(/Dokumentnummer=([^&"\n]+)/);
    if (dnM) return dnM[1];
    // /Dokumente/Type/ID/ID.xml
    const dxM = url.match(/\/Dokumente\/([^/]+)\/([^/]+)\//);
    if (dxM) return dxM[2];
  }

  return null;
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  PDF-Artifact Refetch — RIS-XML");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Source:     ${SOURCE ?? "alle"}`);
  console.log(`Dry run:    ${DRY ? "JA" : "NEIN"}`);
  console.log(`Batch:      ${BATCH_SIZE} Dateien, Sleep ${SLEEP_MS}ms`);
  console.log("");

  // 1. Defekte aus DB lesen
  const DEFECT_TYPE = args.find((a) => a.startsWith("--defect-type="))?.split("=")[1] ?? "pdf_artifact";
  const sourceFilter = SOURCE ? `and p.source_id = '${SOURCE}'` : "";
  const limitFilter = LIMIT > 0 ? `limit ${LIMIT}` : "";
  const sql = `select distinct p.slug, p.source_id
    from corpus_defects cd
    join pages p on p.id = cd.page_id
    where cd.defect_type = '${DEFECT_TYPE}' ${sourceFilter}
    order by p.slug ${limitFilter}`;

  // Verwende | als Separator (zuverlässiger als \x1f in Shell)
  const sep = "|";
  const raw = (await $`psql ${URL_} -tAF${sep} -c ${sql}`.quiet()).stdout.toString();
  const entries: { slug: string; sourceId: string }[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split(sep);
    if (parts.length >= 2) {
      entries.push({ slug: parts[0], sourceId: parts[1] });
    }
  }

  console.log(`Gefunden: ${entries.length} Defekte\n`);

  // 2. Nach Source gruppieren
  const bySource: Record<string, typeof entries> = {};
  for (const e of entries) {
    if (!bySource[e.sourceId]) bySource[e.sourceId] = [];
    bySource[e.sourceId].push(e);
  }
  for (const [src, list] of Object.entries(bySource)) {
    const config = SOURCE_CONFIG[src];
    const hasXml = config ? "XML" : "???";
    console.log(`  ${src.padEnd(30)} ${list.length.toString().padStart(6)}  ${hasXml}`);
  }
  console.log("");

  // 3. Refetch
  let refetched = 0, unchanged = 0, failed = 0, noXml = 0, notFound = 0;
  const logPath = "/tmp/refetch-pdf-artifacts.jsonl";
  writeFileSync(logPath, "");

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const config = SOURCE_CONFIG[entry.sourceId];

    if (!config) {
      noXml++;
      appendLog(logPath, { slug: entry.slug, status: "no_config", source: entry.sourceId });
      if ((i + 1) % 100 === 0) printProgress(i + 1, entries.length, refetched, unchanged, failed, noXml);
      continue;
    }

    const filePath = slugToPath(entry.slug, config);
    if (!existsSync(filePath)) {
      notFound++;
      appendLog(logPath, { slug: entry.slug, status: "not_found", path: filePath });
      if ((i + 1) % 100 === 0) printProgress(i + 1, entries.length, refetched, unchanged, failed, noXml);
      continue;
    }

    const docId = readDocId(filePath);
    if (!docId) {
      failed++;
      appendLog(logPath, { slug: entry.slug, status: "no_docid" });
      if ((i + 1) % 100 === 0) printProgress(i + 1, entries.length, refetched, unchanged, failed, noXml);
      continue;
    }

    try {
      const xmlUrl = `https://www.ris.bka.gv.at/Dokumente/${config.risType}/${docId}/${docId}.xml`;
      const response = await fetch(xmlUrl);
      if (!response.ok) {
        failed++;
        appendLog(logPath, { slug: entry.slug, status: "fetch_failed", code: response.status, url: xmlUrl });
        if ((i + 1) % 100 === 0) printProgress(i + 1, entries.length, refetched, unchanged, failed, noXml);
        continue;
      }

      const xml = await response.text();
      const { text, meta } = extractText(xml);

      if (!text.trim() || text.trim().length < 20) {
        failed++;
        appendLog(logPath, { slug: entry.slug, status: "empty_text" });
        if ((i + 1) % 100 === 0) printProgress(i + 1, entries.length, refetched, unchanged, failed, noXml);
        continue;
      }

      // Content-Hash vergleichen
      const newHash = createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);

      // Frontmatter lesen und aktualisieren
      const content = readFileSync(filePath, "utf8");
      const fmM = content.match(/^---\n([\s\S]*?)\n---\n?/);
      if (!fmM) {
        failed++;
        appendLog(logPath, { slug: entry.slug, status: "no_frontmatter" });
        continue;
      }
      const fm = fmM[1];
      const oldHashM = fm.match(/^content_hash:\s*"([^"]+)"/m);
      const oldHash = oldHashM ? oldHashM[1] : "";

      if (oldHash === newHash) {
        unchanged++;
        appendLog(logPath, { slug: entry.slug, status: "unchanged" });
        if ((i + 1) % 100 === 0) printProgress(i + 1, entries.length, refetched, unchanged, failed, noXml);
        continue;
      }

      if (DRY) {
        refetched++;
        appendLog(logPath, { slug: entry.slug, status: "dry_run", oldHash, newHash });
        if ((i + 1) % 100 === 0) printProgress(i + 1, entries.length, refetched, unchanged, failed, noXml);
        continue;
      }

      // Neue Datei schreiben
      const titleM = fm.match(/^title:\s*"([^"]+)"/m);
      const title = titleM ? titleM[1] : entry.slug.split("/").pop()!;
      const newFm = fm
        .replace(/^content_hash:\s*"[^"]*"/m, `content_hash: "${newHash}"`)
        .replace(/^source_url:\s*"[^"]*"/m, `source_url: "${xmlUrl}"`)
        .replace(/^source_format:\s*"[^"]*"/m, `source_format: "xml"`);
      const newContent = `---\n${newFm}\n---\n\n# ${title}\n\n${text}\n`;
      writeFileSync(filePath, newContent);

      refetched++;
      appendLog(logPath, { slug: entry.slug, status: "refetched", oldHash, newHash });
    } catch (e) {
      failed++;
      appendLog(logPath, { slug: entry.slug, status: "error", error: String(e).slice(0, 200) });
    }

    if ((i + 1) % 100 === 0) {
      printProgress(i + 1, entries.length, refetched, unchanged, failed, noXml);
    }

    // Rate limiting
    if ((i + 1) % BATCH_SIZE === 0 && !DRY) {
      await sleep(SLEEP_MS);
    }
  }

  console.log("\n────────────────────────────────────────────────────────────");
  console.log(`Fertig: ${entries.length} Slugs verarbeitet`);
  console.log(`  refetched: ${refetched}`);
  console.log(`  unchanged: ${unchanged}`);
  console.log(`  failed:    ${failed}`);
  console.log(`  noXml:     ${noXml}`);
  console.log(`  notFound:  ${notFound}`);
  console.log(`Protokoll: ${logPath}`);
}

function appendLog(path: string, entry: Record<string, unknown>) {
  if (!DRY) {
    const { appendFileSync } = require("fs");
    appendFileSync(path, JSON.stringify(entry) + "\n");
  }
}

function printProgress(done: number, total: number, refetched: number, unchanged: number, failed: number, noXml: number) {
  const pct = ((100 * done) / total).toFixed(1);
  const rate = (done / (process.uptime())).toFixed(1);
  console.log(`  ${done}/${total} (${pct}%)  refetched=${refetched} unchanged=${unchanged} failed=${failed} noXml=${noXml}  ${rate}/s`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

await main();
