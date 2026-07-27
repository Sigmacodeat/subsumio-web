#!/usr/bin/env bun
/**
 * Fetch missing RIS sources — universal fetcher based on RIS_API_REFERENCE.md.
 *
 * Handles all 6 RIS OGD endpoints with correct parameter construction,
 * metadata extraction, and content fetching via XML content URLs.
 *
 * Usage:
 *   bun run server/scripts/fetch-missing-sources.ts [--dry-run] [--source Erlaesse]
 *   bun run server/scripts/fetch-missing-sources.ts --source Avsv
 *   bun run server/scripts/fetch-missing-sources.ts --source Gemeinden
 */
import { mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { atomicWrite, contentHash, stripHtmlComplete, decodeEntities } from "./backfill-utils";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const UA = { "User-Agent": "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)" };
const DELAY_MS = 500;
const MAX_RETRIES = 3;
const MAX_PAGES = 5000;

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const sourceIdx = args.indexOf("--source");
const FILTER_SOURCE = sourceIdx >= 0 ? args[sourceIdx + 1] : "";

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");
const RETRIEVED_AT = new Date().toISOString().slice(0, 10);

// ─── Source Definitions ───────────────────────────────────────────────────

interface SourceConfig {
  endpoint: "Bundesrecht" | "Landesrecht" | "Judikatur" | "Sonstige" | "Bezirke" | "Gemeinden";
  applikation: string; // empty = no Applikation param
  outDir: string;
  label: string;
  docType: string;
  metadataKey: string; // key in Metadaten for endpoint-specific data
  titleFields: string[]; // fields to try for title (in order)
}

const SOURCES: SourceConfig[] = [
  // ── Sonstige ──
  {
    endpoint: "Sonstige",
    applikation: "Erlaesse",
    outDir: "at-bmerl",
    label: "Erlaesse",
    docType: "erlass",
    metadataKey: "Sonstige",
    titleFields: ["Kurztitel", "Titel"],
  },
  {
    endpoint: "Sonstige",
    applikation: "Avsv",
    outDir: "at-avsv",
    label: "AVSV",
    docType: "amtliche_verlautbarung",
    metadataKey: "Sonstige",
    titleFields: ["Kurztitel", "Titel"],
  },
  {
    endpoint: "Sonstige",
    applikation: "Avn",
    outDir: "at-avn",
    label: "AVN",
    docType: "amtliche_verlautbarung",
    metadataKey: "Sonstige",
    titleFields: ["Kurztitel", "Titel"],
  },
  {
    endpoint: "Sonstige",
    applikation: "Spg",
    outDir: "at-spg",
    label: "SPG",
    docType: "strukturplan",
    metadataKey: "Sonstige",
    titleFields: ["Kurztitel", "Titel"],
  },
  {
    endpoint: "Sonstige",
    applikation: "KmGer",
    outDir: "at-kmger",
    label: "KmGer",
    docType: "kundmachung",
    metadataKey: "Sonstige",
    titleFields: ["Kurztitel", "Titel"],
  },
  // ── Bezirke (no Applikation) ──
  {
    endpoint: "Bezirke",
    applikation: "",
    outDir: "at-bezirke",
    label: "Bezirke",
    docType: "kundmachung",
    metadataKey: "Bezirke",
    titleFields: ["Kurztitel", "Titel"],
  },
  // ── Gemeinden (no Applikation) ──
  {
    endpoint: "Gemeinden",
    applikation: "",
    outDir: "at-gemeinden",
    label: "Gemeinden",
    docType: "gemeinderecht",
    metadataKey: "Gemeinden",
    titleFields: ["Kurztitel", "Titel"],
  },
  // ── Judikatur (small courts first) ──
  {
    endpoint: "Judikatur",
    applikation: "Umse",
    outDir: "at-judikatur-umse",
    label: "Umse",
    docType: "judikatur",
    metadataKey: "Judikatur",
    titleFields: ["Dokumenttyp"],
  },
  {
    endpoint: "Judikatur",
    applikation: "Gbk",
    outDir: "at-judikatur-gbk",
    label: "GBK",
    docType: "judikatur",
    metadataKey: "Judikatur",
    titleFields: ["Dokumenttyp"],
  },
  {
    endpoint: "Judikatur",
    applikation: "Pvak",
    outDir: "at-judikatur-pvak",
    label: "PVAK",
    docType: "judikatur",
    metadataKey: "Judikatur",
    titleFields: ["Dokumenttyp"],
  },
  {
    endpoint: "Judikatur",
    applikation: "Dsk",
    outDir: "at-judikatur-dsk",
    label: "DSK",
    docType: "judikatur",
    metadataKey: "Judikatur",
    titleFields: ["Dokumenttyp"],
  },
  {
    endpoint: "Judikatur",
    applikation: "Dok",
    outDir: "at-judikatur-dok",
    label: "DOK",
    docType: "judikatur",
    metadataKey: "Judikatur",
    titleFields: ["Dokumenttyp"],
  },
  {
    endpoint: "Judikatur",
    applikation: "Ubas",
    outDir: "at-judikatur-ubas",
    label: "UBAS",
    docType: "judikatur",
    metadataKey: "Judikatur",
    titleFields: ["Dokumenttyp"],
  },
  {
    endpoint: "Judikatur",
    applikation: "Vfgh",
    outDir: "at-judikatur-vfgh",
    label: "VfGH",
    docType: "judikatur",
    metadataKey: "Judikatur",
    titleFields: ["Dokumenttyp"],
  },
  {
    endpoint: "Judikatur",
    applikation: "Uvs",
    outDir: "at-judikatur-uvs",
    label: "UVS",
    docType: "judikatur",
    metadataKey: "Judikatur",
    titleFields: ["Dokumenttyp"],
  },
  // ── Judikatur (large courts) ──
  {
    endpoint: "Judikatur",
    applikation: "Lvwg",
    outDir: "at-judikatur-lvwg",
    label: "LVwG",
    docType: "judikatur",
    metadataKey: "Judikatur",
    titleFields: ["Dokumenttyp"],
  },
  {
    endpoint: "Judikatur",
    applikation: "Justiz",
    outDir: "at-judikatur",
    label: "OGH",
    docType: "judikatur",
    metadataKey: "Judikatur",
    titleFields: ["Dokumenttyp"],
  },
  {
    endpoint: "Judikatur",
    applikation: "AsylGH",
    outDir: "at-judikatur-asylgh",
    label: "AsylGH",
    docType: "judikatur",
    metadataKey: "Judikatur",
    titleFields: ["Dokumenttyp"],
  },
  {
    endpoint: "Judikatur",
    applikation: "Bvwg",
    outDir: "at-judikatur-bvwg",
    label: "BVwG",
    docType: "judikatur",
    metadataKey: "Judikatur",
    titleFields: ["Dokumenttyp"],
  },
  {
    endpoint: "Judikatur",
    applikation: "Vwgh",
    outDir: "at-judikatur-vwgh",
    label: "VwGH",
    docType: "judikatur",
    metadataKey: "Judikatur",
    titleFields: ["Dokumenttyp"],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function cleanText(s: string): string {
  return decodeEntities(stripHtmlComplete(s))
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchWithRetry(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return res;
      if (res.status === 404) return null;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      console.error(`  HTTP ${res.status} after ${attempt + 1} attempts: ${url.slice(0, 100)}`);
      return null;
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      console.error(`  Fetch error: ${e}`);
      return null;
    }
  }
  return null;
}

// ─── Content Fetching ─────────────────────────────────────────────────────

/**
 * Extract content URLs from Dokumentliste.ContentReference.Urls.ContentUrl[]
 * Returns { xmlUrl, htmlUrl } or null.
 */
function extractContentUrls(dokumentliste: unknown): { xmlUrl: string; htmlUrl: string } | null {
  try {
    const dl = dokumentliste as Record<string, unknown>;
    const cr = dl?.ContentReference as Record<string, unknown>;
    const urls = cr?.Urls as Record<string, unknown>;
    const contentUrls = urls?.ContentUrl as Array<Record<string, unknown>>;
    if (!Array.isArray(contentUrls)) return null;

    let xmlUrl = "";
    let htmlUrl = "";
    for (const cu of contentUrls) {
      const dataType = cu.DataType as string;
      const url = cu.Url as string;
      if (dataType === "Xml") xmlUrl = url;
      if (dataType === "Html") htmlUrl = url;
    }
    if (xmlUrl || htmlUrl) return { xmlUrl, htmlUrl };
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch document content. Strategy:
 * 1. Try XML content URL (richest structured format)
 * 2. Fallback to HTML content URL
 * 3. Fallback to DokumentUrl (RIS page)
 */
async function fetchDocContent(dokumentliste: unknown, dokumentUrl: string): Promise<string> {
  const contentUrls = extractContentUrls(dokumentliste);

  // Strategy 1: XML content URL
  if (contentUrls?.xmlUrl) {
    const res = await fetchWithRetry(contentUrls.xmlUrl);
    if (res) {
      const xml = await res.text();
      const text = cleanText(xml);
      if (text.length > 100) return text;
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  // Strategy 2: HTML content URL
  if (contentUrls?.htmlUrl) {
    const res = await fetchWithRetry(contentUrls.htmlUrl);
    if (res) {
      const html = await res.text();
      const text = cleanText(html);
      if (text.length > 100) return text;
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  // Strategy 3: DokumentUrl (RIS page — less structured)
  if (dokumentUrl) {
    const res = await fetchWithRetry(dokumentUrl);
    if (res) {
      const html = await res.text();
      const text = cleanText(html);
      if (text.length > 100) return text;
    }
  }

  return "";
}

// ─── Metadata Extraction ──────────────────────────────────────────────────

function extractTitle(meta: Record<string, unknown>, source: SourceConfig, docId: string): string {
  const metaSrc = (meta[source.metadataKey] ?? {}) as Record<string, unknown>;
  // For Judikatur: build title from Geschaeftszahl + Entscheidungsdatum
  if (source.endpoint === "Judikatur") {
    const gz = metaSrc.Geschaeftszahl;
    let gzStr = "";
    if (typeof gz === "string") gzStr = gz;
    else if (gz && typeof gz === "object") {
      const item = (gz as Record<string, unknown>).item;
      if (typeof item === "string") gzStr = item;
      else if (Array.isArray(item)) gzStr = (item as string[]).join(", ");
    }
    const datum = metaSrc.Entscheidungsdatum as string | undefined;
    const ecli = metaSrc.EuropeanCaseLawIdentifier as string | undefined;
    // Use ECLI as title (unique, contains court + date + case number)
    if (ecli) return ecli;
    if (gzStr && datum) return `${gzStr} (${datum})`;
    if (gzStr) return gzStr;
  }
  for (const field of source.titleFields) {
    const val = metaSrc[field] as string | undefined;
    if (val && val.trim()) return val.trim().replace(/<br\s*\/?>/gi, "");
  }
  return docId;
}

function extractMetadata(
  meta: Record<string, unknown>,
  source: SourceConfig
): Record<string, string> {
  const result: Record<string, string> = {};
  const metaSrc = (meta[source.metadataKey] ?? {}) as Record<string, unknown>;

  // Common fields
  if (metaSrc.Kurztitel)
    result.kurztitel = (metaSrc.Kurztitel as string).replace(/<br\s*\/?>/gi, "").trim();
  if (metaSrc.Titel) result.titel = (metaSrc.Titel as string).replace(/<br\s*\/?>/gi, "").trim();
  if (metaSrc.Bundesland) result.bundesland = metaSrc.Bundesland as string;
  if (metaSrc.Kundmachungsdatum) result.kundmachungsdatum = metaSrc.Kundmachungsdatum as string;

  // Judikatur-specific fields
  if (source.endpoint === "Judikatur") {
    if (metaSrc.Dokumenttyp) result.dokumenttyp = metaSrc.Dokumenttyp as string;
    if (metaSrc.Entscheidungsdatum)
      result.entscheidungsdatum = metaSrc.Entscheidungsdatum as string;
    if (metaSrc.EuropeanCaseLawIdentifier)
      result.ecli = metaSrc.EuropeanCaseLawIdentifier as string;
    const gz = metaSrc.Geschaeftszahl;
    if (gz) {
      if (typeof gz === "string") result.geschaeftszahl = gz;
      else if (typeof gz === "object") {
        const item = (gz as Record<string, unknown>).item;
        if (typeof item === "string") result.geschaeftszahl = item;
        else if (Array.isArray(item)) result.geschaeftszahl = (item as string[]).join(", ");
      }
    }
    // Normen (cited laws)
    const normen = metaSrc.Normen;
    if (normen) {
      const item = (normen as Record<string, unknown>).item;
      if (typeof item === "string") result.normen = item;
      else if (Array.isArray(item)) result.normen = (item as string[]).join("; ");
    }
    // Court-specific sub-object (Vwgh, Vfgh, Justiz, AsylGH, Bvwg, Lvwg, Uvs, Dsk, Gbk, Pvak, Dok, Ubas, Umse)
    const courtKeys = [
      "Vwgh",
      "Vfgh",
      "Justiz",
      "AsylGH",
      "Bvwg",
      "Lvwg",
      "Uvs",
      "Dsk",
      "Gbk",
      "Pvak",
      "Dok",
      "Ubas",
      "Umse",
    ];
    for (const ck of courtKeys) {
      const court = metaSrc[ck] as Record<string, unknown> | undefined;
      if (!court) continue;
      if (court.Entscheidungsart) result.entscheidungsart = court.Entscheidungsart as string;
      if (court.Gericht) result.gericht = court.Gericht as string;
      if (court.Rechtssatznummer) result.rechtssatznummer = court.Rechtssatznummer as string;
      // Indizes
      const indizes = court.Indizes;
      if (indizes) {
        const item = (indizes as Record<string, unknown>).item;
        if (typeof item === "string") result.indizes = item;
        else if (Array.isArray(item)) result.indizes = (item as string[]).join("; ");
      }
    }
    if (metaSrc.GesamteEntscheidungUrl)
      result.gesamte_entscheidung_url = metaSrc.GesamteEntscheidungUrl as string;
    return result;
  }

  // App-specific sub-objects for Sonstige/Bezirke/Gemeinden
  const subKeys = ["Erlaesse", "Avsv", "Avn", "Spg", "KmGer", "Bvb", "Gr", "BrKons", "LrKons"];
  for (const sk of subKeys) {
    const sub = metaSrc[sk] as Record<string, unknown> | undefined;
    if (!sub) continue;
    if (sub.Typ) result.typ_detail = sub.Typ as string;
    if (sub.Geschaeftszahl) {
      const gz = sub.Geschaeftszahl;
      if (typeof gz === "string") result.geschaeftszahl = gz;
      else if (gz && typeof gz === "object") {
        const item = (gz as Record<string, unknown>).item;
        if (typeof item === "string") result.geschaeftszahl = item;
        else if (Array.isArray(item)) result.geschaeftszahl = (item as string[]).join(", ");
      }
    }
    if (sub.Inkrafttretensdatum) result.inkrafttretensdatum = sub.Inkrafttretensdatum as string;
    if (sub.Kurzinformation) result.kurzinformation = (sub.Kurzinformation as string).slice(0, 500);
    if (sub.Urheber) result.urheber = sub.Urheber as string;
    if (sub.Gericht) result.gericht = sub.Gericht as string;
    if (sub.Gemeinde) result.gemeinde = sub.Gemeinde as string;
    if (sub.Bezirksverwaltungsbehoerde)
      result.bezirksbehoerde = sub.Bezirksverwaltungsbehoerde as string;
  }

  return result;
}

// ─── File Naming ──────────────────────────────────────────────────────────

function buildFilename(
  docId: string,
  title: string,
  outDir: string,
  existingFiles: Set<string>
): string {
  let base = slugify(title);
  if (!base || base.length < 3) base = slugify(docId);
  if (!base) base = docId.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  let filename = `${base}.md`;
  let counter = 2;
  while (existingFiles.has(filename)) {
    // Check if it's the same doc (by docId in frontmatter) — if so, skip
    filename = `${base}-${counter}.md`;
    counter++;
  }
  existingFiles.add(filename);
  return filename;
}

// ─── Main Fetch Logic ─────────────────────────────────────────────────────

async function fetchSource(source: SourceConfig): Promise<void> {
  const outDir = join(CORPUS_ROOT, source.outDir);
  mkdirSync(outDir, { recursive: true });

  // Load existing files for dedup
  const existingFiles = new Set<string>();
  try {
    for (const f of readdirSync(outDir)) {
      if (f.endsWith(".md")) existingFiles.add(f);
    }
  } catch {}

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  ${source.label} — ${source.endpoint}/${source.applikation || "(none)"}`);
  console.log(`  Output: ${outDir} (${existingFiles.size} existing files)`);
  console.log(`═══════════════════════════════════════════════════════════`);

  let total = 0;
  let saved = 0;
  let failed = 0;
  let skipped = 0;
  let notDigitalized = 0;

  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    // Build URL with correct parameters
    const params: string[] = [];
    if (source.applikation) params.push(`Applikation=${source.applikation}`);
    params.push("DokumenteProSeite=OneHundred");
    params.push(`Seitennummer=${pageNo}`);
    // AlleRechtssaetze=true is needed for Sonstige/Judikatur to get all docs
    if (source.endpoint === "Sonstige" || source.endpoint === "Judikatur") {
      params.push("AlleRechtssaetze=true");
    }
    const url = `${RIS_BASE}/${source.endpoint}?${params.join("&")}`;

    try {
      const res = await fetchWithRetry(url);
      if (!res) {
        console.log(`  Page ${pageNo}: fetch failed, stopping`);
        break;
      }
      const data = (await res.json()) as Record<string, unknown>;
      const result = (data.OgdSearchResult as Record<string, unknown>)
        ?.OgdDocumentResults as Record<string, unknown>;
      const hits = result?.Hits as Record<string, unknown>;
      const totalCount = hits?.["#text"] as string;
      let refs = result?.OgdDocumentReference as
        | Array<Record<string, unknown>>
        | Record<string, unknown>
        | undefined;
      if (!refs) {
        console.log(`  Page ${pageNo}: no more results`);
        break;
      }
      if (!Array.isArray(refs)) refs = [refs];

      let newDocs = 0;
      for (const ref of refs as Array<Record<string, unknown>>) {
        total++;
        const dataObj = ref.Data as Record<string, unknown>;
        const meta = dataObj?.Metadaten as Record<string, unknown>;
        const allgemein = meta?.Allgemein as Record<string, unknown>;
        const technisch = meta?.Technisch as Record<string, unknown>;
        const docUrl = (allgemein?.DokumentUrl as string) ?? "";
        const docId = (technisch?.ID as string) ?? `doc-${total}`;
        const dokumentliste = dataObj?.Dokumentliste;

        // Extract title
        const title = extractTitle(meta, source, docId);

        // Build filename
        const filename = buildFilename(docId, title, outDir, existingFiles);
        const filepath = join(outDir, filename);

        if (existsSync(filepath)) {
          skipped++;
          continue;
        }

        if (DRY) {
          console.log(`  [DRY] ${filename} — ${title.slice(0, 60)}`);
          newDocs++;
          continue;
        }

        // Fetch document content
        let text = await fetchDocContent(dokumentliste, docUrl);

        if (text.length < 50) {
          // Save as metadata-only placeholder
          const metaFields = extractMetadata(meta, source);
          const metaLines = Object.entries(metaFields).map(([k, v]) => `${k}: ${v}`);
          text = `${title}\n\n${metaLines.join("\n")}\n\nVolltext nicht abrufbar — siehe ${docUrl}`;
          notDigitalized++;
        }

        // Build frontmatter
        const metaFields = extractMetadata(meta, source);
        const fmLines: string[] = [
          "---",
          `title: "${title.replace(/"/g, "'")}"`,
          `type: "${source.docType}"`,
          `jurisdiction: "at"`,
          `source: "ris-ogd"`,
          `source_url: "${docUrl}"`,
          `document_id: "${docId}"`,
        ];

        // Add app-specific metadata fields
        for (const [k, v] of Object.entries(metaFields)) {
          if (v && v.length < 500) {
            fmLines.push(`${k}: "${v.replace(/"/g, "'")}"`);
          }
        }

        fmLines.push(`retrieved_at: "${RETRIEVED_AT}"`);
        fmLines.push(
          `license: "Quelle: RIS OGD (data.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung."`
        );

        // Content hash
        const hash = contentHash(text);
        fmLines.push(`content_hash: "${hash}"`);
        fmLines.push("---");
        fmLines.push("");

        try {
          atomicWrite(filepath, `${fmLines.join("\n")}\n${text}\n`);
          saved++;
          newDocs++;
        } catch (e) {
          console.error(`  ❌ Write failed: ${e}`);
          failed++;
        }
      }

      if (pageNo % 10 === 0 || (refs as Array<Record<string, unknown>>).length < 100) {
        const totalStr = totalCount ? `/${totalCount}` : "";
        console.log(
          `  Page ${pageNo}: ${(refs as Array<Record<string, unknown>>).length} docs, ${newDocs} new (total: ${total}${totalStr}, saved: ${saved}, skipped: ${skipped})`
        );
      }

      if ((refs as Array<Record<string, unknown>>).length < 100) break;
      await new Promise((r) => setTimeout(r, 500)); // pagination delay
    } catch (e) {
      console.error(`  Page ${pageNo}: error ${e} — stopping`);
      break;
    }
  }

  console.log(
    `  DONE: ${saved} saved, ${skipped} skipped, ${failed} failed, ${notDigitalized} not_digitalized, ${total} total`
  );
}

// ─── Entry Point ──────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Subsumio — Fetch Missing RIS Sources                    ║");
  console.log("║  Based on RIS_API_REFERENCE.md                           ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const sources = FILTER_SOURCE
    ? SOURCES.filter(
        (s) =>
          s.label.toLowerCase() === FILTER_SOURCE.toLowerCase() ||
          s.outDir === FILTER_SOURCE ||
          s.applikation.toLowerCase() === FILTER_SOURCE.toLowerCase()
      )
    : SOURCES;

  if (sources.length === 0) {
    console.error(
      `No sources matching "${FILTER_SOURCE}". Available: ${SOURCES.map((s) => s.label).join(", ")}`
    );
    process.exit(1);
  }

  console.log(`Sources: ${sources.map((s) => s.label).join(", ")}`);
  if (DRY) console.log("DRY RUN — no files will be written");

  await acquireRisLock();
  console.log("✅ RIS lock acquired.");

  for (const source of sources) {
    await fetchSource(source);
  }

  await releaseRisLock();
  console.log("\n✅ All sources done!");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
