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
 * - Organisiert in Ordnern nach Bundesland und Gesetzesnummer (tir/gnr-10000001/p-1.md)
 *
 * Strategie:
 * 1. API paginieren (100 pro Seite)
 * 2. Nur "Paragraph" Docs fetchen (spart 38% der Requests)
 * 3. XML-URL aus API-Response verwenden (nicht konstruiert)
 * 4. Nach Bundesland und Gesetzesnummer in Unterordnern organisieren
 * 5. Eine Verbindung, 1 s Pause je Abruf (RIS-OGD-Regeln): ~31 Stunden für alles
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
 *   bun scripts/fetch-at-landesrecht-xml.ts --from-index /law-corpus/_state/ris-inforce-landesrecht.jsonl
 *
 * --from-index: holt NUR die Dokumente, die der In-force-Index listet und die
 * noch nicht geprüft in _normalized liegen — direkt per Dokumentnummer, ohne
 * die ~1.100 Suchseiten erneut zu blättern. Der Vollabruf vom 22.09. brach bei
 * Seite ~266 ab (Deploy) und wurde nie fortgesetzt; 12.111 geltende
 * Landesnormen wurden so nie geholt. Ein abgebrochener Index-Lauf setzt beim
 * nächsten Start genau dort fort, weil Geholtes nach der Normalisierung als
 * vorhanden zählt.
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, renameSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { landOfDocId } from "./normalize/normalize-corpus";
import { risMassPause, RIS_PAUSE_MS, RIS_USER_AGENT } from "./ris-pace";
import { recordFetchOutcome } from "./ris-fetch-outcomes";

const RIS_API = "https://data.bka.gv.at/ris/api/v2.6/Landesrecht";
/** Vorhandene Dateien überschreiben — nötig nach jeder Extraktor-Korrektur. */
const FORCE = process.argv.includes("--force");
const XML_BASE = "https://www.ris.bka.gv.at/Dokumente/Landesnormen";

// RIS OGD: one connection, ~1 s between requests. Was 5 parallel workers
// without the shared lock.
const CONCURRENCY = Number(arg("concurrency", "1"));
const THROTTLE_MS = Number(arg("throttle-ms", String(RIS_PAUSE_MS)));
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

const UA = { "User-Agent": RIS_USER_AGENT };

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const _corpusRoot = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");
const OUT_DIR = join(_corpusRoot, "at-landesrecht");
/** Every state-law paragraph in force at RIS, one JSON line each (reconcile-ris.ts). */
const INVENTORY = join(_corpusRoot, "_state", "ris-inforce-landesrecht.jsonl");

function arg(name: string, fb?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : (fb ?? "");
}

const LIMIT = Number(arg("limit", "0"));
const FROM_INDEX = arg("from-index");
const START_PAGE = Number(arg("page", "1"));
const END_PAGE = Number(arg("to-page", String(MAX_PAGES)));

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
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
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
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
/** Why the last fetchXmlFromUrl() returned null — 404 is "not found", anything else "failed". */
let lastFetchNotFound = false;

async function fetchXmlFromUrl(url: string, attempt = 0): Promise<string | null> {
  if (attempt === 0) lastFetchNotFound = false;
  try {
    const res = await fetch(url, {
      headers: UA,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 404) {
      consecutive503 = 0;
      lastFetchNotFound = true;
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

interface LrDoc {
  docId: string;
  title: string;
  xmlUrl: string;
  lrMeta: Record<string, string>;
  eli: string;
  gn: string;
  apa: string;
  fileKey: string;
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
  gn: string
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
  fm.push(
    `license: "Quelle: RIS OGD (data.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung."`
  );
  fm.push(`content_hash: "${createHash("sha256").update(text.trim()).digest("hex").slice(0, 16)}"`);

  return `---\n${fm.join("\n")}\n---\n\n# ${title}\n\n${text}\n`;
}

/** Landesrecht document ids that passed the normalizer (_normalized/at-landesrecht). */
function loadValidatedIds(root: string): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) {
        const id = readFileSync(p, "utf8")
          .slice(0, 800)
          .match(/^doc_id:\s*["']?([^"'\s]+)/m)?.[1];
        if (id) out.add(id);
      }
    }
  };
  walk(root);
  return out;
}

async function main() {
  await acquireRisLock();
  mkdirSync(OUT_DIR, { recursive: true });
  // Present = passed the normalizer. Older generations (state folders, HTML
  // fetches) that the gate rejected count as missing and are fetched as XML.
  const validated = loadValidatedIds(join(_corpusRoot, "_normalized", "at-landesrecht"));
  console.log(`  ${validated.size} Landesnormen bereits geprüft vorhanden (_normalized)`);

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
  // A complete scan (from page 1 to the end) also yields the inventory of
  // paragraphs in force; a partial one must not overwrite it.
  const inventory: string[] = [];
  let reachedEnd = false;

  // Fetch XML for a batch of documents (one RIS connection — CONCURRENCY 1).
  const runDocs = async (docs: LrDoc[], label: string) => {
    const queue = [...docs];
    const workers: Promise<void>[] = [];
    for (let w = 0; w < CONCURRENCY; w++) {
      workers.push(
        (async () => {
          while (queue.length > 0 && !aborted) {
            if (LIMIT > 0 && totalWritten >= LIMIT) break;
            const doc = queue.shift()!;

            // Build file key: gn-folder/key.md (like at-normen)
            // The states number their laws independently (Gesetzesnummer
            // 10000001 exists in Burgenland, Upper Austria, Salzburg, Tyrol …),
            // so the state is part of the path. Without it the paragraphs of
            // different states' laws overwrote each other.
            const land = landOfDocId(doc.docId) ?? "unbekannt";
            const folderName = `${land}/${doc.gn ? `gnr-${doc.gn}` : "no-gn"}`;
            const fullKey = `${folderName}/${doc.fileKey}`;

            // BUG FIX: Use fullKey (folder/key) not just fileKey —
            // different laws can have the same § number (p-1, p-2, etc.)
            // --force überschreibt vorhandene Dateien. Ohne diesen Schalter
            // ist der Lauf nach einer Extraktor-Korrektur wirkungslos: er
            // meldet für jede der 108.297 Dateien "skipped" und repariert
            // keine einzige. Derselbe Blocker steckte in ris-xml-fetch-normen.ts.
            if (!FORCE && validated.has(doc.docId)) {
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
              if (!aborted)
                recordFetchOutcome(
                  _corpusRoot,
                  "at-landesrecht",
                  doc.docId,
                  lastFetchNotFound ? "not_found" : "failed"
                );
              continue;
            }

            // Parse XML
            const { text, meta: xmlMeta } = extractText(xml);

            // Skip docs with too little text
            if (text.length < MIN_TEXT_LENGTH) {
              totalFailed++;
              // Typically an Anlage RIS keeps only as PDF/image.
              recordFetchOutcome(_corpusRoot, "at-landesrecht", doc.docId, "no_text", doc.apa);
              continue;
            }

            // Build markdown
            const md = buildMarkdown(
              doc.docId,
              doc.title,
              text,
              xmlMeta,
              doc.lrMeta,
              doc.eli,
              doc.gn
            );

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
              console.log(
                `  [${label}] Written: ${totalWritten} | Skipped: ${totalSkipped} | Norm skipped: ${totalSkippedNorm} | Failed: ${totalFailed} | Total: ${totalProcessed}`
              );
            }

            await risMassPause("Landesrecht-XML");
          }
        })()
      );
    }
    await Promise.all(workers);
  };

  if (FROM_INDEX) {
    const docs: LrDoc[] = [];
    for (const line of readFileSync(FROM_INDEX, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let d: {
        nor?: string;
        id?: string;
        gnr?: string | null;
        apa?: string | null;
        kurztitel?: string | null;
        region?: string | null;
        eli?: string | null;
      };
      try {
        d = JSON.parse(line);
      } catch {
        continue;
      }
      const docId = d.nor ?? d.id;
      if (!docId || d.apa === "§ 0") continue;
      const fileKey = normKey(d.apa ?? null);
      if (!fileKey) {
        totalSkippedNorm++;
        continue;
      }
      if (!FORCE && validated.has(docId)) {
        totalSkipped++;
        continue;
      }
      docs.push({
        docId,
        title: d.kurztitel || docId,
        xmlUrl: "",
        lrMeta: d.region ? { bundesland: d.region } : {},
        eli: d.eli ?? "",
        gn: d.gnr ?? "",
        apa: d.apa ?? "",
        fileKey,
      });
    }
    console.log(`  Index-Modus: ${docs.length} fehlende Landesnormen aus ${FROM_INDEX}`);
    await runDocs(docs, "index");
  }

  for (let page = START_PAGE; !FROM_INDEX && page <= Math.min(MAX_PAGES, END_PAGE); page++) {
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
      reachedEnd = true;
      break;
    }

    // Filter: Only Paragraph docs (skip Norm docs)
    const pageDocs: LrDoc[] = [];
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
      inventory.push(
        JSON.stringify({
          id: docId,
          nor: docId,
          land: landOfDocId(docId),
          gnr: gn || null,
          apa,
          key,
          from: lrkons?.Inkrafttretensdatum ?? null,
        })
      );
    }

    if (pageDocs.length === 0) {
      continue;
    }

    await runDocs(pageDocs, `page ${page}`);

    if (page % 10 === 0) {
      console.log(
        `\nPage ${page} done. Written: ${totalWritten} | Skipped: ${totalSkipped} | Norm skipped: ${totalSkippedNorm} | Failed: ${totalFailed} | Total: ${totalProcessed}\n`
      );
    }

    // Pause between search pages (RIS OGD: at most 0.5 requests/s)
    await risMassPause("Landesrecht-XML");
  }

  if (reachedEnd && START_PAGE === 1 && LIMIT === 0 && !aborted) {
    mkdirSync(dirname(INVENTORY), { recursive: true });
    writeFileSync(`${INVENTORY}.tmp`, inventory.join("\n") + "\n");
    renameSync(`${INVENTORY}.tmp`, INVENTORY);
    console.log(`  Inventar: ${inventory.length} geltende Landesnormen → ${INVENTORY}`);
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

main()
  .then(() => releaseRisLock())
  .catch((err) => {
    console.error("Fatal error:", err);
    releaseRisLock();
    process.exit(1);
  });
