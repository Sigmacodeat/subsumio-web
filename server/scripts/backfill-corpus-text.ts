#!/usr/bin/env bun
/**
 * Backfill full text for corpus files created with --skip-text.
 *
 * Reads each .md file, extracts the source_url from frontmatter,
 * downloads the HTML content, strips tags, and rewrites the file
 * with the full text inserted.
 *
 * Runs with configurable concurrency for speed.
 *
 * Usage:
 *   bun scripts/backfill-corpus-text.ts --dir law-corpus/at-judikatur-vfgh --concurrency 10
 *   bun scripts/backfill-corpus-text.ts --dir law-corpus/eu/regulations --concurrency 20
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const TIMEOUT_MS = 30_000;

const args = process.argv.slice(2);
const dirIdx = args.indexOf("--dir");
const concIdx = args.indexOf("--concurrency");
const limitIdx = args.indexOf("--limit");

const TARGET_DIR = dirIdx >= 0 ? args[dirIdx + 1] : "law-corpus/at-judikatur-vfgh";
const CONCURRENCY = concIdx >= 0 ? parseInt(args[concIdx + 1], 10) : 10;
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const ABS_DIR = join(_scriptDir, "..", "..", TARGET_DIR);

async function fetchWithRetry(url: string, headers?: Record<string, string>): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)", ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
          continue;
        }
      }
      return res;
    } catch {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
      }
    }
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
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
    .replace(/&szlig;/g, "ß")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseFrontmatter(content: string): { fm: string; body: string; fmEnd: number } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { fm: "", body: content, fmEnd: 0 };
  return { fm: match[1], body: content.slice(match[0].length), fmEnd: match[0].length };
}

function extractSourceUrl(fm: string): string {
  const match = fm.match(/source_url:\s*"?([^\n"]+)"?/);
  return match ? match[1].trim() : "";
}

function extractCourtType(fm: string): string {
  const match = fm.match(/court_type:\s*"?([^\n"]+)"?/);
  return match ? match[1].trim() : "";
}

function extractCelex(fm: string): string {
  const match = fm.match(/celex:\s*"?([^\n"]+)"?/);
  return match ? match[1].trim() : "";
}

function isPlaceholder(body: string): boolean {
  return body.includes("Volltext nicht abrufbar") || body.trim().length < 50;
}

async function backfillFile(filepath: string): Promise<"ok" | "skip" | "fail"> {
  const content = readFileSync(filepath, "utf-8");
  const { fm, body } = parseFrontmatter(content);

  if (!isPlaceholder(body)) return "skip";

  const sourceUrl = extractSourceUrl(fm);
  if (!sourceUrl) return "fail";

  // For RIS judikatur, the source_url is the RIS page URL, not the direct HTML
  // For EU, it's the cellar URI
  let text = "";

  const isEU = sourceUrl.includes("publications.europa.eu");
  const isRIS = sourceUrl.includes("ris.bka.gv.at") || sourceUrl.includes("data.bka.gv.at");

  if (isEU) {
    // Extract cellar ID from URL
    const cellarId = sourceUrl.split("/cellar/")[1];
    if (!cellarId) return "fail";
    const contentUrl = `https://publications.europa.eu/resource/cellar/${cellarId}`;

    // Try HTML first
    const htmlRes = await fetchWithRetry(contentUrl, {
      Accept: "text/html",
      "Accept-Language": "de",
    });
    if (htmlRes && htmlRes.ok) {
      text = stripHtml(await htmlRes.text());
    }

    // Fallback: try PDF and extract text
    if (text.length < 50) {
      const pdfRes = await fetchWithRetry(contentUrl, {
        Accept: "application/pdf",
        "Accept-Language": "de",
      });
      if (pdfRes && pdfRes.ok) {
        try {
          const { extractDocumentText } = await import("../src/core/extract-document.ts");
          const buf = Buffer.from(await pdfRes.arrayBuffer());
          const extracted = await extractDocumentText(buf, ".pdf");
          text = extracted.text;
        } catch {
          // PDF extraction failed
        }
      }
    }

    // Fallback: try XHTML
    if (text.length < 50) {
      const xhtmlRes = await fetchWithRetry(contentUrl, {
        Accept: "application/xhtml+xml",
        "Accept-Language": "de",
      });
      if (xhtmlRes && xhtmlRes.ok) {
        text = stripHtml(await xhtmlRes.text());
      }
    }

    // Fallback: try EUR-Lex direct URL with CELEX number
    if (text.length < 50) {
      const celex = extractCelex(fm);
      if (celex) {
        const eurlexUrl = `https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:${celex}`;
        const eurlexRes = await fetchWithRetry(eurlexUrl, {
          "Accept-Language": "de",
        });
        if (eurlexRes && eurlexRes.ok) {
          const html = await eurlexRes.text();
          // EUR-Lex pages have the text in #textTabContent or .tabContent
          text = stripHtml(html);
        }
      }
    }

    if (text.length < 50) return "fail";
  } else if (isRIS) {
    // RIS Dokument.wxe pages are often 503 — use OGD API instead
    // Extract Abfrage and Dokumentnummer from source_url
    const abfrageMatch = sourceUrl.match(/Abfrage=([^&]+)/);
    const dokNrMatch = sourceUrl.match(/Dokumentnummer=([^&]+)/);
    if (abfrageMatch && dokNrMatch) {
      const abfrage = abfrageMatch[1];
      const dokNr = dokNrMatch[1];
      // Map RIS Abfrage to OGD endpoint
      const ogdMap: Record<string, string> = {
        Justiz: "justiz",
        Vfgh: "vfgh",
        Vwgh: "vwgh",
        Bvwg: "bvwg",
        Lvwg: "lvwg",
        AsylGH: "asylgh",
        Uvs: "uvs",
        Bundesverfassung: "bundesverfassung",
      };
      const ogdEndpoint = ogdMap[abfrage] || abfrage.toLowerCase();
      const ogdUrl = `https://data.bka.gv.at/ris/api/v2.6/judikatur/${ogdEndpoint}?Dokumentnummer=${dokNr}&PageSize=1`;

      const ogdRes = await fetchWithRetry(ogdUrl);
      if (ogdRes && ogdRes.ok) {
        try {
          const ogdData = await ogdRes.json() as any;
          const docs = ogdData?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference;
          const docArr = Array.isArray(docs) ? docs : docs ? [docs] : [];
          if (docArr.length > 0) {
            const contentRef = docArr[0]?.Data?.Dokumentliste?.ContentReference;
            const urls = contentRef?.Urls?.ContentUrl;
            const urlArr = Array.isArray(urls) ? urls : urls ? [urls] : [];
            // Find HTML URL
            let htmlUrl = "";
            for (const u of urlArr) {
              if (u.DataType === "Html") { htmlUrl = String(u.Url); break; }
            }
            if (!htmlUrl && urlArr.length > 0) htmlUrl = String(urlArr[0].Url);

            if (htmlUrl) {
              const htmlRes = await fetchWithRetry(htmlUrl);
              if (htmlRes && htmlRes.ok) {
                text = stripHtml(await htmlRes.text());
              }
            }
          }
        } catch { /* OGD parse failed */ }
      }
    }

    // Fallback: try the original source_url directly
    if (text.length < 50) {
      const res = await fetchWithRetry(sourceUrl);
      if (res && res.ok) {
        text = stripHtml(await res.text());
      }
    }
  } else {
    // Generic fetch
    const res = await fetchWithRetry(sourceUrl);
    if (!res || !res.ok) return "fail";
    text = stripHtml(await res.text());
  }

  if (text.length < 50) return "fail";

  // Rebuild file: keep frontmatter, replace body
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : "";
  const sourceLine = body.match(/\n\*Quelle:.*$/m);
  const sourceSuffix = sourceLine ? sourceLine[0] : "";

  const newBody = `# ${title}\n\n${text}\n\n${sourceSuffix}`;
  const newContent = `---\n${fm}\n---\n\n${newBody}\n`;

  writeFileSync(filepath, newContent, "utf-8");
  return "ok";
}

async function runBatch(files: string[], startIdx: number, batchSize: number): Promise<{ ok: number; skip: number; fail: number }> {
  const batch = files.slice(startIdx, startIdx + batchSize);
  const results = await Promise.all(batch.map((f) => backfillFile(f)));
  return {
    ok: results.filter((r) => r === "ok").length,
    skip: results.filter((r) => r === "skip").length,
    fail: results.filter((r) => r === "fail").length,
  };
}

async function main() {
  if (!existsSync(ABS_DIR)) {
    console.error(`Directory not found: ${ABS_DIR}`);
    process.exit(1);
  }

  const allFiles = readdirSync(ABS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(ABS_DIR, f));

  // Quick-filter to only files that need backfill
  const needBackfill = allFiles.filter((f) => {
    const content = readFileSync(f, "utf-8");
    return isPlaceholder(content);
  });

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Backfill Text — ${TARGET_DIR}`);
  console.log(`  Total files: ${allFiles.length}`);
  console.log(`  Need backfill: ${needBackfill.length}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const files = LIMIT > 0 ? needBackfill.slice(0, LIMIT) : needBackfill;

  let ok = 0;
  let skip = 0;
  let fail = 0;
  const startTime = Date.now();

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const result = await runBatch(files, i, CONCURRENCY);
    ok += result.ok;
    skip += result.skip;
    fail += result.fail;

    const processed = Math.min(i + CONCURRENCY, files.length);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const remaining = (files.length - processed) / rate;

    if (processed % 100 < CONCURRENCY || processed === files.length) {
      console.log(`  [${processed}/${files.length}] ok=${ok} skip=${skip} fail=${fail} | ${rate.toFixed(0)}/s ETA ${remaining.toFixed(0)}s`);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  DONE: ${ok} backfilled, ${skip} already had text, ${fail} failed`);
  console.log(`  Time: ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
  console.log(`═══════════════════════════════════════════════════════════`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
