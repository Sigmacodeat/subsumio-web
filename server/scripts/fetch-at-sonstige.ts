#!/usr/bin/env bun
/**
 * Fetch ALL "Sonstige" + Bezirke + Gemeinden sources from RIS OGD API.
 *
 * Sources:
 *   Sonstige: Bmerl, Avn, Avsv, Pruef, Spg, KmGer, Transparenz
 *   Bezirke:  Bezirksverwaltungsbehörden Kundmachungen
 *   Gemeinden: Gemeinderecht
 *
 * Usage:
 *   bun run server/scripts/fetch-at-sonstige.ts [--dry-run] [--source avsv]
 */
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { atomicWrite } from "./backfill-utils";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const UA = { "User-Agent": "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)" };
const DELAY_MS = 500;
const MAX_RETRIES = 3;

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const sourceIdx = args.indexOf("--source");
const FILTER_SOURCE = sourceIdx >= 0 ? args[sourceIdx + 1] : "";

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");
const RETRIEVED_AT = new Date().toISOString().slice(0, 10);

interface SourceConfig {
  endpoint: string;
  applikation: string;
  outDir: string;
  label: string;
  type: string;
}

const SOURCES: SourceConfig[] = [
  // Sonstige
  {
    endpoint: "Sonstige",
    applikation: "Avsv",
    outDir: "at-avsv",
    label: "AVSV",
    type: "amtliche_verlautbarung",
  },
  {
    endpoint: "Sonstige",
    applikation: "Avn",
    outDir: "at-avn",
    label: "AVN",
    type: "amtliche_verlautbarung",
  },
  {
    endpoint: "Sonstige",
    applikation: "Spg",
    outDir: "at-spg",
    label: "SPG",
    type: "strukturplan",
  },
  {
    endpoint: "Sonstige",
    applikation: "KmGer",
    outDir: "at-kmger",
    label: "KmGer",
    type: "kundmachung",
  },
  {
    endpoint: "Sonstige",
    applikation: "Bmerl",
    outDir: "at-bmerl",
    label: "BMERL",
    type: "erlass",
  },
  {
    endpoint: "Sonstige",
    applikation: "Pruef",
    outDir: "at-pruef",
    label: "Pruef",
    type: "pruefungsordnung",
  },
  {
    endpoint: "Sonstige",
    applikation: "Transparenz",
    outDir: "at-transparenz",
    label: "Transparenz",
    type: "transparenz",
  },
  // Bezirke
  {
    endpoint: "Bezirke",
    applikation: "Bvb",
    outDir: "at-bezirke",
    label: "Bezirke",
    type: "kundmachung",
  },
  // Gemeinden
  {
    endpoint: "Gemeinden",
    applikation: "",
    outDir: "at-gemeinden",
    label: "Gemeinden",
    type: "gemeinderecht",
  },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#228;/g, "ä")
    .replace(/&#196;/g, "Ä")
    .replace(/&#246;/g, "ö")
    .replace(/&#214;/g, "Ö")
    .replace(/&#252;/g, "ü")
    .replace(/&#220;/g, "Ü")
    .replace(/&#223;/g, "ß")
    .replace(/&#233;/g, "é")
    .replace(/&#232;/g, "è")
    .replace(/&#239;/g, "ï")
    .replace(/&#241;/g, "ñ")
    .replace(/&#224;/g, "à")
    .replace(/&#242;/g, "ò")
    .replace(/&#249;/g, "ù")
    .replace(/&#238;/g, "î")
    .replace(/&#231;/g, "ç")
    .replace(/&#226;/g, "â")
    .replace(/&#234;/g, "ê")
    .replace(/&#32;/g, " ")
    .replace(/&#38;/g, "&")
    .replace(/&#60;/g, "<")
    .replace(/&#62;/g, ">")
    .replace(/&#34;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#167;/g, "§")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&[a-z]+;/g, "")
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
      console.error(`  HTTP ${res.status} after ${attempt + 1} attempts: ${url}`);
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

async function fetchSourceText(docUrl: string): Promise<string> {
  // Try HTML page first
  const res = await fetchWithRetry(docUrl);
  if (!res) return "";
  const html = await res.text();

  // Try to find content in the HTML
  const text = stripHtml(html);
  if (text.length > 100) return text;

  // Try XML if available
  const xmlUrl = docUrl.replace(/\.html$/, ".xml");
  if (xmlUrl !== docUrl) {
    const xmlRes = await fetchWithRetry(xmlUrl);
    if (xmlRes) {
      const xmlText = await xmlRes.text();
      const stripped = stripHtml(xmlText);
      if (stripped.length > 100) return stripped;
    }
  }

  return text;
}

async function fetchSource(source: SourceConfig): Promise<void> {
  const outDir = join(CORPUS_ROOT, source.outDir);
  mkdirSync(outDir, { recursive: true });

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  ${source.label} — ${source.endpoint}/${source.applikation}`);
  console.log(`  Output: ${outDir}`);
  console.log(`═══════════════════════════════════════════════════════════`);

  let total = 0;
  let saved = 0;
  let failed = 0;
  let skipped = 0;

  for (let pageNo = 1; pageNo <= 500; pageNo++) {
    const url = source.applikation
      ? `${RIS_BASE}/${source.endpoint}?Applikation=${source.applikation}&DokumenteProSeite=OneHundred&Seitennummer=${pageNo}&AlleRechtssaetze=true`
      : `${RIS_BASE}/${source.endpoint}?DokumenteProSeite=OneHundred&Seitennummer=${pageNo}&AlleRechtssaetze=true`;

    try {
      const res = await fetchWithRetry(url);
      if (!res) {
        console.log(`  Page ${pageNo}: fetch failed, stopping`);
        break;
      }
      const data = (await res.json()) as Record<string, unknown>;
      const result = (data.OgdSearchResult as Record<string, unknown>)
        ?.OgdDocumentResults as Record<string, unknown>;
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
        const meta = (ref.Data as Record<string, unknown>)?.Metadaten as Record<string, unknown>;
        const allgemein = meta?.Allgemein as Record<string, unknown>;
        const docUrl = (allgemein?.DokumentUrl as string) ?? "";
        const technisch = meta?.Technisch as Record<string, unknown>;
        const docId = (technisch?.ID as string) ?? `doc-${total}`;

        // Extract title from metadata — key varies by endpoint
        const metaSrc = (meta?.Sonstige ?? meta?.Gemeinden ?? meta?.Bezirke ?? {}) as Record<
          string,
          unknown
        >;
        const kurztitel = (metaSrc.Kurztitel ?? metaSrc.Titel ?? docId) as string;
        const filename = `${slugify(kurztitel || docId)}.md`;
        const filepath = join(outDir, filename);

        if (existsSync(filepath)) {
          skipped++;
          continue;
        }

        if (DRY) {
          console.log(`  [DRY] ${filename}`);
          newDocs++;
          continue;
        }

        // Fetch document text
        let text = "";
        if (docUrl) {
          text = await fetchSourceText(docUrl);
          await new Promise((r) => setTimeout(r, DELAY_MS));
        }

        if (text.length < 50) {
          // Save as metadata-only placeholder
          text = `Kurztitel: ${kurztitel}\n\nDokument nicht im Volltext abrufbar — siehe Quelle.`;
        }

        const fm = [
          "---",
          `title: "${(kurztitel || docId).replace(/"/g, "'")}"`,
          `type: "${source.type}"`,
          `jurisdiction: "at"`,
          `source: "ris-ogd"`,
          `source_url: "${docUrl}"`,
          `retrieved_at: "${RETRIEVED_AT}"`,
          `license: "Quelle: RIS OGD (data.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung."`,
          "---",
          "",
        ].join("\n");

        try {
          atomicWrite(filepath, `${fm}\n${text}\n`);
          saved++;
          newDocs++;
        } catch (e) {
          console.error(`  ❌ Write failed: ${e}`);
          failed++;
        }
      }

      if (pageNo % 10 === 0 || (refs as Array<Record<string, unknown>>).length < 100) {
        console.log(
          `  Page ${pageNo}: ${(refs as Array<Record<string, unknown>>).length} docs, ${newDocs} new (total: ${total}, saved: ${saved})`
        );
      }

      if ((refs as Array<Record<string, unknown>>).length < 100) break;
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error(`  Page ${pageNo}: error ${e} — stopping`);
      break;
    }
  }

  console.log(`  DONE: ${saved} saved, ${skipped} skipped, ${failed} failed, ${total} total`);
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Subsumio — Fetch AT Sonstige + Bezirke + Gemeinden      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const sources = FILTER_SOURCE
    ? SOURCES.filter(
        (s) => s.label.toLowerCase() === FILTER_SOURCE.toLowerCase() || s.outDir === FILTER_SOURCE
      )
    : SOURCES;

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
