/**
 * Bulk download of German federal court decisions from rechtsprechung-im-internet.de
 *
 * Source: https://www.rechtsprechung-im-internet.de/rii-toc.xml
 * 83.000+ decisions from BGH, BVerfG, BVerwG, BFH, BAG, BSG, BPatG (2010+)
 *
 * Each decision is a ZIP file containing XML with full text + metadata.
 * We download, extract XML, parse, and write markdown files to law-corpus/de-judikatur/.
 *
 * Usage:
 *   bun scripts/bulk-download-de-judikatur.ts [--limit N] [--concurrency 3] [--court BGH|BVerfG|...]
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { dump as yamlDump } from "js-yaml";

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const skipIdx = args.indexOf("--skip");
const SKIP = skipIdx >= 0 ? parseInt(args[skipIdx + 1], 10) : 0;
const concurrencyIdx = args.indexOf("--concurrency");
const CONCURRENCY = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1], 10) : 3;
const courtIdx = args.indexOf("--court");
const COURT_FILTER = courtIdx >= 0 ? args[courtIdx + 1] : null;

const OUT_DIR = join(import.meta.dir, "..", "law-corpus", "de-judikatur");
const TOC_URL = "https://www.rechtsprechung-im-internet.de/rii-toc.xml";

interface TOCItem {
  gericht: string;
  datum: string;
  aktenzeichen: string;
  link: string;
  modified: string;
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
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseTOC(xml: string): TOCItem[] {
  const items: TOCItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  const matches = xml.match(itemRegex) ?? [];

  for (const item of matches) {
    const gericht = item.match(/<gericht>([^<]*)<\/gericht>/)?.[1]?.trim() ?? "";
    const datum = item.match(/<entsch-datum>([^<]*)<\/entsch-datum>/)?.[1]?.trim() ?? "";
    const az = item.match(/<aktenzeichen>([^<]*)<\/aktenzeichen>/)?.[1]?.trim() ?? "";
    const link = item.match(/<link>([^<]*)<\/link>/)?.[1]?.trim() ?? "";
    const modified = item.match(/<modified>([^<]*)<\/modified>/)?.[1]?.trim() ?? "";

    if (link) items.push({ gericht, datum, aktenzeichen: az, link, modified });
  }

  return items;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unbekannt"
  );
}

/** Extract ZIP content using manual ZIP parsing + inflateRawSync */
function extractZip(buf: Uint8Array): string {
  const { inflateRawSync } = require("node:zlib") as typeof import("node:zlib");

  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // Check ZIP signature
  if (dv.getUint32(0, true) !== 0x04034b50) {
    throw new Error("Not a ZIP file");
  }

  // Read local file header
  const method = dv.getUint16(8, true);
  const fnLen = dv.getUint16(26, true);
  const extraLen = dv.getUint16(28, true);
  const dataOffset = 30 + fnLen + extraLen;

  // Find central directory to get compressed size (for data descriptor entries)
  let cdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x01 && buf[i + 3] === 0x02) {
      cdOffset = i;
      break;
    }
  }

  let compressedData: Uint8Array;
  if (cdOffset > 0) {
    compressedData = buf.slice(dataOffset, cdOffset);
  } else {
    // Use compressed size from local header (if not zero)
    const compSize = dv.getUint32(18, true);
    compressedData = buf.slice(dataOffset, compSize > 0 ? dataOffset + compSize : buf.length);
  }

  if (method === 0) {
    // Stored (no compression)
    return new TextDecoder().decode(compressedData);
  } else if (method === 8) {
    // Deflate
    const decompressed = inflateRawSync(compressedData);
    return new TextDecoder().decode(decompressed);
  } else {
    throw new Error(`Unsupported compression method: ${method}`);
  }
}

/** Parse XML decision document */
function parseDecisionXml(xml: string): {
  doknr: string;
  ecli: string;
  gertyp: string;
  spruchkoerper: string;
  datum: string;
  aktenzeichen: string;
  doktyp: string;
  norm: string;
  titel: string;
  text: string;
} {
  const getTag = (tag: string): string =>
    xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"))?.[1]?.trim() ?? "";

  const doknr = getTag("doknr");
  const ecli = getTag("ecli");
  const gertyp = getTag("gertyp");
  const spruchkoerper = getTag("spruchkoerper");
  const datum = getTag("entsch-datum");
  const aktenzeichen = getTag("aktenzeichen");
  const doktyp = getTag("doktyp");
  const norm = getTag("norm");
  const titel = stripHtml(getTag("titelzeile"));

  // Extract all text content from the XML body
  // Remove XML declaration and DOCTYPE
  let body = xml.replace(/<\?xml[^>]*\?>/, "").replace(/<!DOCTYPE[^>]*>/, "");
  // Remove metadata tags, keep content tags
  body = body.replace(/<doknr>[\s\S]*?<\/doknr>/g, "");
  body = body.replace(/<ecli>[\s\S]*?<\/ecli>/g, "");
  body = body.replace(/<gertyp>[\s\S]*?<\/gertyp>/g, "");
  body = body.replace(/<gerort>[\s\S]*?<\/gerort>/g, "");
  body = body.replace(/<spruchkoerper>[\s\S]*?<\/spruchkoerper>/g, "");
  body = body.replace(/<entsch-datum>[\s\S]*?<\/entsch-datum>/g, "");
  body = body.replace(/<aktenzeichen>[\s\S]*?<\/aktenzeichen>/g, "");
  body = body.replace(/<doktyp>[\s\S]*?<\/doktyp>/g, "");
  body = body.replace(/<norm>[\s\S]*?<\/norm>/g, "");
  body = body.replace(/<vorinstanz>[\s\S]*?<\/vorinstanz>/g, "");
  body = body.replace(/<region>[\s\S]*?<\/region>/g, "");
  body = body.replace(/<mitwirkung>[\s\S]*?<\/mitwirkung>/g, "");
  body = body.replace(/<titelzeile>[\s\S]*?<\/titelzeile>/g, "");
  body = body.replace(/<link>[\s\S]*?<\/link>/g, "");
  body = body.replace(/<modified>[\s\S]*?<\/modified>/g, "");

  const text = stripHtml(body);

  return { doknr, ecli, gertyp, spruchkoerper, datum, aktenzeichen, doktyp, norm, titel, text };
}

function buildMarkdown(doc: ReturnType<typeof parseDecisionXml>, sourceUrl: string): string {
  const date = doc.datum
    ? `${doc.datum.slice(0, 4)}-${doc.datum.slice(4, 6)}-${doc.datum.slice(6, 8)}`
    : "0000-00-00";

  const frontmatter = yamlDump(
    {
      type: "court_decision",
      jurisdiction: "de",
      court: doc.gertyp,
      senate: doc.spruchkoerper,
      date,
      ecli: doc.ecli || "",
      case_number: doc.aktenzeichen,
      decision_type: doc.doktyp,
      norms: doc.norm,
      source: "rechtsprechung-im-internet",
      source_url: sourceUrl,
    },
    { lineWidth: -1, noRefs: true }
  ).trimEnd();

  const title = doc.titel || `${doc.gertyp} — ${doc.aktenzeichen || doc.doknr}`;
  const text = doc.text || "*Volltext nicht abrufbar — siehe Quelle.*";

  return `---
${frontmatter}
---

# ${doc.gertyp} — ${doc.aktenzeichen || doc.doknr}

${title}

${text}

---
*Quelle: [rechtsprechung-im-internet.de](${sourceUrl})*
`;
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)" },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return res;
      if (res.status === 404) return null;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  return null;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  DE Judikatur Bulk Download — rechtsprechung-im-internet.de");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Concurrency: ${CONCURRENCY}`);
  if (COURT_FILTER) console.log(`  Court filter: ${COURT_FILTER}`);
  console.log("");

  // 1. Fetch TOC
  console.log("  Fetching TOC...");
  const tocRes = await fetchWithRetry(TOC_URL);
  if (!tocRes) {
    console.error("  Failed to fetch TOC");
    process.exit(1);
  }
  const tocXml = await tocRes.text();
  const allItems = parseTOC(tocXml);
  console.log(`  TOC: ${allItems.length} entries`);

  // Filter by court if requested
  let items = allItems;
  if (COURT_FILTER) {
    items = items.filter((i) => i.gericht.startsWith(COURT_FILTER));
    console.log(`  After court filter (${COURT_FILTER}): ${items.length} entries`);
  }

  // Apply skip offset
  if (SKIP > 0) {
    items = items.slice(SKIP);
    console.log(`  After skip ${SKIP}: ${items.length} entries`);
  }

  // Apply limit
  if (LIMIT < Infinity) {
    items = items.slice(0, LIMIT);
    console.log(`  After limit: ${items.length} entries`);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  // 2. Download + extract + write
  let ok = 0;
  let skip = 0;
  let fail = 0;
  let total = 0;
  const startTime = Date.now();

  // Process in batches of CONCURRENCY
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (item) => {
        const filename = `de-${slugify(item.gericht)}-${item.datum}-${slugify(item.aktenzeichen || item.link.split("/").pop() || "unknown")}.md`;
        const filepath = join(OUT_DIR, filename);

        if (existsSync(filepath)) {
          return { status: "skip" as const };
        }

        try {
          const res = await fetchWithRetry(item.link);
          if (!res) return { status: "fail" as const };

          const buf = new Uint8Array(await res.arrayBuffer());
          const xml = extractZip(buf);
          const doc = parseDecisionXml(xml);
          const markdown = buildMarkdown(doc, item.link);
          writeFileSync(filepath, markdown, "utf-8");
          return { status: "ok" as const, textLen: doc.text.length };
        } catch (e) {
          return { status: "fail" as const, error: e instanceof Error ? e.message : String(e) };
        }
      })
    );

    for (const r of results) {
      total++;
      if (r.status === "ok") ok++;
      else if (r.status === "skip") skip++;
      else fail++;
    }

    if (total % 100 < CONCURRENCY) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (total / (Number(elapsed) || 1)).toFixed(1);
      const eta = ((items.length - total) / (Number(rate) || 1)).toFixed(0);
      console.log(
        `  [${total}/${items.length}] ok=${ok} skip=${skip} fail=${fail} | ${rate}/s ETA ${eta}s`
      );
    }

    // Rate limit between batches: 500ms
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  DONE: ${ok} downloaded, ${skip} skipped, ${fail} failed`);
  console.log(`  Time: ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
  console.log(`  Output: ${OUT_DIR}`);
  console.log(`═══════════════════════════════════════════════════════════`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
