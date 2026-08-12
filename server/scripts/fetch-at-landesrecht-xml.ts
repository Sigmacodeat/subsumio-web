#!/usr/bin/env bun
/**
 * Fetch Austrian state law (Landesrecht) from RIS as XML.
 *
 * SCAN-ERGEBNISSE (1000 API-Docs analysiert):
 * - 279.949 API-Docs total
 * - 38% sind "Norm" docs (§ 0 = nur Metadaten, kein Gesetzestext) → ÜBERSPRINGEN
 * - 62% sind "Paragraph" docs (§ 1, § 2, etc. = Gesetzestext) → FETCHEN
 * - ~106.380 einzigartige Gesetze (nach Gesetzesnummer)
 * - XML hat ct="text" blocks mit Gesetzestext
 * - Organisiert in Ordnern nach Gesetzesnummer (wie at-normen)
 *
 * Strategie:
 * 1. API paginieren (100 pro Seite)
 * 2. Nur "Paragraph" Docs fetchen (spart 38% der Requests)
 * 3. XML-URL aus API-Response verwenden (nicht konstruiert)
 * 4. Nach Gesetzesnummer in Unterordnern organisieren
 * 5. Bei 5 concurrent + 200ms throttle: ~1.9 Stunden
 *
 * Fehlerbehandlung:
 * - 503/429: Exponential backoff, max 25 consecutive before abort
 * - Missing XML URL: Skip doc
 * - Text < 20 chars: Skip doc (kein echter Gesetzestext)
 * - Missing Gesetzesnummer: Verwende doc_id als Ordner
 *
 * Usage:
 *   bun scripts/fetch-at-landesrecht-xml.ts
 *   bun scripts/fetch-at-landesrecht-xml.ts --limit 100    # Testlauf
 *   bun scripts/fetch-at-landesrecht-xml.ts --page 50      # Resume ab Seite 50
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const RIS_API = "https://data.bka.gv.at/ris/api/v2.6/Landesrecht";
/** Vorhandene Dateien überschreiben — nötig nach jeder Extraktor-Korrektur. */
const FORCE = process.argv.includes("--force");
const XML_BASE = "https://www.ris.bka.gv.at/Dokumente/Landesnormen";

const CONCURRENCY = Number(arg("concurrency", "5"));
const THROTTLE_MS = Number(arg("throttle-ms", "200"));
const REQUEST_TIMEOUT_MS = Number(arg("timeout-ms", "20000"));
const MAX_CONSECUTIVE_503 = Number(arg("max-503", "25"));
const PAGE_SIZE = "OneHundred";
const MAX_PAGES = 3000;
/**
 * Stichtag des Fassungsfilters. Voreinstellung heute — der Bestand soll das
 * heute geltende Landesrecht abbilden. Über `--fassung-vom YYYY-MM-DD` lässt
 * sich ein anderer Stichtag setzen (Rekonstruktion eines Altstands).
 */
const FASSUNG_VOM = arg("fassung-vom", new Date().toISOString().slice(0, 10));
/** Verzeichnis für die Roh-XML-Ablage. Siehe Begründung an der Schreibstelle. */
const KEEP_XML = arg("keep-xml");
const MIN_TEXT_LENGTH = 20; // Skip docs with less than 20 chars of law text

const UA = { "User-Agent": "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)" };

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const _corpusRoot = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");
const OUT_DIR = join(_corpusRoot, "at-landesrecht");

function arg(name: string, fb?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fb ?? "";
}

const LIMIT = Number(arg("limit", "0"));
const START_PAGE = Number(arg("page", "1"));

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function esc(s: string): string {
  return s.replace(/"/g, '\\"');
}

/**
 * Extract text and metadata from RIS XML.
 * Same logic as ris-xml-fetch-normen.ts (mit listelem+schluss+schlussteil Fix).
 * Extrahiert <absatz>, <ueberschrift>, <listelem>, <schluss> und <schlussteil>
 * mit ct="text". Kopf-/Fußzeile (<kzinhalt>/<fzinhalt>) werden automatisch
 * ausgeschlossen.
 *
 * listelem+schluss+schlussteil MÜSSEN in der Alternation stehen: Listenelemente
 * (Aufzählungen) und Schluss-Texte tragen ct="text" und enthalten echten
 * Normtext. Ohne sie fiel § 13 Vorarlberg Landesforstgesetz nach „wenn" ab.
 * Siehe auch ris-xml-fetch-normen.ts für dieselbe Korrektur.
 */
function extractText(xml: string): { text: string; meta: Record<string, string> } {
  const meta: Record<string, string> = {};
  const blocks: string[] = [];

  const tagRe = /<(absatz|ueberschrift|listelem|schluss|schlussteil)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    const attrs = m[2];
    const inner = m[3];
    const ctM = attrs.match(/\bct="([^"]*)"/);
    const ct = ctM ? ctM[1] : null;
    const plain = inner
      .replace(/<[^>]+>/g, " ")
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) continue;
    if (ct && ct !== "text") {
      if (!meta[ct]) meta[ct] = plain;
      continue;
    }
    if (ct === "text") blocks.push(plain);
  }
  return { text: blocks.join("\n\n"), meta };
}

let consecutive503 = 0;
let aborted = false;

async function fetchXmlFromUrl(url: string, attempt = 0): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: UA,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 404) {
      consecutive503 = 0;
      return null;
    }
    if (res.status === 429 || res.status === 503) {
      consecutive503++;
      if (consecutive503 >= MAX_CONSECUTIVE_503) {
        aborted = true;
        return null;
      }
      if (attempt < 6) {
        await new Promise((r) => setTimeout(r, 3000 * 2 ** attempt));
        return fetchXmlFromUrl(url, attempt + 1);
      }
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    consecutive503 = 0;
    return body;
  } catch {
    if (attempt < 5) {
      await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
      return fetchXmlFromUrl(url, attempt + 1);
    }
    return null;
  }
}

async function fetchApiPage(page: number): Promise<any[]> {
  const url = new URL(RIS_API);
  url.searchParams.set("Applikation", "LrKons");
  url.searchParams.set("DokumenteProSeite", PAGE_SIZE);
  url.searchParams.set("Seitennummer", String(page));
  // Fassungsfilter ist ZWINGEND, nicht optional.
  //
  // Ohne ihn liefert LrKons jede historische Fassung jedes Paragraphen:
  // 280.013 Dokumente statt 110.549 geltender. Der Dateiname wird aus dem
  // Paragraphen gebildet (`fileKey`), nicht aus der Dokument-ID — jede
  // gelieferte Fassung überschreibt daher die vorherige, in der Reihenfolge
  // der API. Welche Fassung am Ende auf der Platte liegt, ist Zufall.
  // Gemessen am Lauf vom 05.08.: 166.000 Schreibvorgänge auf 76.137
  // verschiedene Dateien — jede Datei im Schnitt 2,2-mal überschrieben.
  // Dieselbe Falle wie bei den Bundesnormen (dort 440.840 statt 158.806).
  url.searchParams.set("Fassung.FassungVom", FASSUNG_VOM);

  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: UA,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
          continue;
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const refs = data?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference ?? [];
      return Array.isArray(refs) ? refs : [refs];
    } catch (err) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
        continue;
      }
      throw err;
    }
  }
  return [];
}

function extractXmlUrl(ref: Record<string, unknown>): string {
  const data = (ref.Data ?? {}) as Record<string, unknown>;
  const dl = (data.Dokumentliste ?? {}) as Record<string, unknown>;
  const cr = (dl.ContentReference ?? {}) as Record<string, unknown>;
  const urls = cr.Urls as Record<string, unknown> | undefined;
  if (!urls) return "";
  const contentUrl = urls.ContentUrl;
  if (!contentUrl) return "";
  const urlArr = Array.isArray(contentUrl) ? contentUrl : [contentUrl];
  for (const u of urlArr) {
    const du = u as Record<string, unknown>;
    if (du.DataType === "Xml") return String(du.Url ?? "");
  }
  return "";
}

function normKey(apa: string | null): string | null {
  if (!apa) return null;
  const s = apa.trim();
  if (/^§+\s*0\s*$/.test(s)) return null; // Skip § 0 (Norm/overview)

  const teile: string[] = [];
  const rx = /(§+|Art\.?|Anl\.?)\s*([0-9]+[a-zA-Z]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(s)) !== null) {
    const art = m[1].toLowerCase();
    const praefix = art.startsWith("§") ? "p" : art.startsWith("art") ? "art" : "anl";
    teile.push(`${praefix}-${m[2].toLowerCase()}`);
  }
  if (teile.length === 0) return null;
  return teile.join("-");
}

function buildMarkdown(
  docId: string,
  title: string,
  text: string,
  meta: Record<string, string>,
  lrMeta: Record<string, string>,
  eli: string,
  gn: string,
): string {
  const fm: string[] = [
    `title: "${esc(title)}"`,
    `type: law`,
    `jurisdiction: at`,
    `doc_id: "${docId}"`,
    `id: "ris-${docId}"`,
  ];

  if (gn) fm.push(`gesetzesnummer: "${gn}"`);
  if (meta.kurztitel) fm.push(`statute: "${esc(meta.kurztitel)}"`);
  if (meta.kundmachungsorgan) fm.push(`kundmachungsorgan: "${esc(meta.kundmachungsorgan)}"`);
  if (meta.typ) fm.push(`typ: "${esc(meta.typ)}"`);
  if (meta.artikel_anlage) fm.push(`paragraph: "${esc(meta.artikel_anlage)}"`);
  if (meta.ikra) fm.push(`inkrafttretensdatum: "${esc(meta.ikra)}"`);
  if (meta.ausra) fm.push(`ausserkrafttretensdatum: "${esc(meta.ausra)}"`);
  if (meta.index) fm.push(`indizes: "${esc(meta.index)}"`);
  if (meta.schlagworte) fm.push(`schlagworte: "${esc(meta.schlagworte)}"`);
  if (meta.anmerkung) fm.push(`anmerkung: "${esc(meta.anmerkung)}"`);
  if (meta.geaendert) fm.push(`zuletzt_aktualisiert: "${esc(meta.geaendert)}"`);
  if (meta.doknr) fm.push(`dokumentnummer: "${esc(meta.doknr)}"`);
  if (eli) fm.push(`eli: "${esc(eli)}"`);
  if (lrMeta.bundesland) fm.push(`bundesland: "${esc(lrMeta.bundesland)}"`);

  fm.push(`source_url: "${XML_BASE}/${docId}/${docId}.xml"`);
  fm.push(`source_format: xml`);
  fm.push(`retrieved_at: "${new Date().toISOString().slice(0, 10)}"`);
  fm.push(`license: "Quelle: RIS OGD (data.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung."`);
  fm.push(`content_hash: "${createHash("sha256").update(text.trim()).digest("hex").slice(0, 16)}"`);

  return `---\n${fm.join("\n")}\n---\n\n# ${title}\n\n${text}\n`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Load existing files for resume (check all subfolders)
  // Store full relative path (folder/key) to avoid collisions between laws
  const existing = new Set<string>();
  function scanExisting(dir: string, relPrefix: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        scanExisting(fullPath, relPath);
      } else if (entry.name.endsWith(".md")) {
        existing.add(relPath.replace(/\.md$/, ""));
      }
    }
  }
  scanExisting(OUT_DIR, "");

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  AT Landesrecht — XML Volltext Fetch (v2)`);
  console.log(`  API: ${RIS_API}`);
  console.log(`  Strategy: Skip Norm docs (38%), only fetch Paragraph docs (62%)`);
  console.log(`  Existing files: ${existing.size}`);
  console.log(`  Start page: ${START_PAGE}`);
  console.log(`  Concurrency: ${CONCURRENCY} | Throttle: ${THROTTLE_MS}ms`);
  console.log(`  Output: ${OUT_DIR}`);
  if (LIMIT > 0) console.log(`  Limit: ${LIMIT} files (test mode)`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  let totalWritten = 0;
  let totalSkipped = 0;
  let totalSkippedNorm = 0;
  let totalFailed = 0;
  let totalProcessed = 0;

  for (let page = START_PAGE; page <= MAX_PAGES; page++) {
    if (aborted) {
      console.log(`\nAborted due to ${MAX_CONSECUTIVE_503} consecutive 503 errors.`);
      console.log(`Resume with: --page ${page}`);
      break;
    }

    if (LIMIT > 0 && totalWritten >= LIMIT) break;

    let refs: any[];
    try {
      refs = await fetchApiPage(page);
    } catch (err) {
      console.error(`Page ${page} failed: ${err}`);
      break;
    }

    if (refs.length === 0) {
      console.log(`\nPage ${page}: no results — reached end.`);
      break;
    }

    // Filter: Only Paragraph docs (skip Norm docs)
    const pageDocs: { docId: string; title: string; xmlUrl: string; lrMeta: Record<string, string>; eli: string; gn: string; apa: string; fileKey: string }[] = [];

    for (const ref of refs) {
      const meta = ref?.Data?.Metadaten ?? {};
      const tech = meta?.Technisch ?? {};
      const lr = meta?.Landesrecht ?? {};
      const lrkons = lr?.LrKons ?? {};
      const docId = tech?.ID ?? "";
      if (!docId) continue;

      const typ = lrkons?.Dokumenttyp ?? "";
      const apa = lrkons?.ArtikelParagraphAnlage ?? "";
      const gn = lrkons?.Gesetzesnummer ?? "";

      // SKIP Norm docs (§ 0 = only metadata, no law text)
      if (typ === "Norm") {
        totalSkippedNorm++;
        continue;
      }

      // Skip § 0
      const key = normKey(apa);
      if (!key) {
        totalSkippedNorm++;
        continue;
      }

      const title = lr?.Kurztitel ?? lr?.Titel ?? lr?.Langtitel ?? docId;
      const xmlUrl = extractXmlUrl(ref);
      const eli = lrkons?.Eli ?? "";

      const lrMeta: Record<string, string> = {};
      if (lr?.Bundesland) lrMeta.bundesland = lr.Bundesland;

      pageDocs.push({ docId, title, xmlUrl, lrMeta, eli, gn, apa, fileKey: key });
    }

    if (pageDocs.length === 0) {
      continue;
    }

    // Fetch XML for each document (with concurrency)
    const queue = [...pageDocs];
    const workers: Promise<void>[] = [];

    for (let w = 0; w < CONCURRENCY; w++) {
      workers.push((async () => {
        while (queue.length > 0 && !aborted) {
          if (LIMIT > 0 && totalWritten >= LIMIT) break;
          const doc = queue.shift()!;

          // Build file key: gn-folder/key.md (like at-normen)
          const folderName = doc.gn ? `gnr-${doc.gn}` : "no-gn";
          const fullKey = `${folderName}/${doc.fileKey}`;

          // BUG FIX: Use fullKey (folder/key) not just fileKey —
          // different laws can have the same § number (p-1, p-2, etc.)
          // --force überschreibt vorhandene Dateien. Ohne diesen Schalter
          // ist der Lauf nach einer Extraktor-Korrektur wirkungslos: er
          // meldet für jede der 108.297 Dateien "skipped" und repariert
          // keine einzige. Derselbe Blocker steckte in ris-xml-fetch-normen.ts.
          if (existing.has(fullKey) && !FORCE) {
            totalSkipped++;
            continue;
          }

          totalProcessed++;

          // Fetch XML — use API URL or construct fallback
          let xmlUrl = doc.xmlUrl;
          if (!xmlUrl) {
            xmlUrl = `${XML_BASE}/${doc.docId}/${doc.docId}.xml`;
          }

          const xml = await fetchXmlFromUrl(xmlUrl);

          if (!xml) {
            totalFailed++;
            continue;
          }

          // Parse XML
          const { text, meta: xmlMeta } = extractText(xml);

          // Skip docs with too little text
          if (text.length < MIN_TEXT_LENGTH) {
            totalFailed++;
            continue;
          }

          // Build markdown
          const md = buildMarkdown(doc.docId, doc.title, text, xmlMeta, doc.lrMeta, doc.eli, doc.gn);

          // Write file in subfolder
          const outFolder = join(OUT_DIR, folderName);
          mkdirSync(outFolder, { recursive: true });
          // Roh-XML ablegen, BEVOR der Text daraus gewonnen wird.
          //
          // Ohne Ablage erzwingt jede Extraktor-Korrektur einen vollständigen
          // Neuabruf. Beim Bundesrecht hat die abgelegte Kopie den
          // Beachte/Anmerkung-Fix auf 2 Minuten gedrückt statt 9 Stunden —
          // und sie ist die Voraussetzung dafür, den Textbestand überhaupt
          // gegen die Quelle prüfen zu können (Stufe „textidentisch"), ohne
          // 110.000 Anfragen an RIS zu stellen. Kostet ~1 GB.
          if (KEEP_XML) {
            const xmlDir = join(KEEP_XML, folderName);
            mkdirSync(xmlDir, { recursive: true });
            writeFileSync(join(xmlDir, `${doc.docId}.xml`), xml);
          }
          const outPath = join(outFolder, `${doc.fileKey}.md`);
          writeFileSync(outPath, md);
          existing.add(fullKey);
          totalWritten++;

          if (totalWritten % 200 === 0) {
            console.log(`  [page ${page}] Written: ${totalWritten} | Skipped: ${totalSkipped} | Norm skipped: ${totalSkippedNorm} | Failed: ${totalFailed} | Total: ${totalProcessed}`);
          }

          await new Promise((r) => setTimeout(r, THROTTLE_MS));
        }
      })());
    }

    await Promise.all(workers);

    if (page % 10 === 0) {
      console.log(`\nPage ${page} done. Written: ${totalWritten} | Skipped: ${totalSkipped} | Norm skipped: ${totalSkippedNorm} | Failed: ${totalFailed} | Total: ${totalProcessed}\n`);
    }

    // Small delay between pages
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  DONE`);
  console.log(`  Written: ${totalWritten}`);
  console.log(`  Skipped (already existed): ${totalSkipped}`);
  console.log(`  Norm docs skipped (no text): ${totalSkippedNorm}`);
  console.log(`  Failed (no XML or text too short): ${totalFailed}`);
  console.log(`  Total processed: ${totalProcessed}`);
  console.log(`  Total files in output: ${existing.size}`);
  console.log(`═══════════════════════════════════════════════════════════`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
