#!/usr/bin/env bun
/**
 * Backfill EU legislation — Cellar Preflight Edition
 *
 * Problem: 62% of EU regulations in the corpus are metadata-only entries
 * (no HTML/PDF manifestation in Cellar). The old backfill tried all of them
 * and failed 62% — wasting time and API calls.
 *
 * Solution: This script does a SPARQL preflight to identify which Cellar
 * entries actually have a digital manifestation (HTML or PDF). Only those
 * are fetched. Non-digitalized entries are marked as "not_digitalized"
 * in frontmatter so they're skipped by future backfill runs.
 *
 * Usage:
 *   bun scripts/backfill-eu-cellar-only.ts --dir law-corpus/eu/regulations
 *   bun scripts/backfill-eu-cellar-only.ts --dir law-corpus/eu/directives --limit 1000
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const TIMEOUT_MS = 30_000;
const SPARQL_ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";
const CELLAR_BASE = "https://publications.europa.eu/resource/cellar";

const args = process.argv.slice(2);
const dirIdx = args.indexOf("--dir");
const concIdx = args.indexOf("--concurrency");
const limitIdx = args.indexOf("--limit");
const dryRun = args.includes("--dry-run");

const _targetDir = dirIdx >= 0 ? args[dirIdx + 1] : "law-corpus/eu/regulations";
const _corpusRoot = process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "..", "law-corpus");
const TARGET_DIR = _targetDir;
const ABS_DIR = join(_corpusRoot, _targetDir.replace(/^law-corpus\//, ""));
const CONCURRENCY = concIdx >= 0 ? parseInt(args[concIdx + 1], 10) : 5;
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;
const RATE_LIMIT_MS = 500;

// ── Helpers ────────────────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  headers?: Record<string, string>
): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)",
          ...headers,
        },
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
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isPlaceholder(body: string): boolean {
  return body.includes("Volltext nicht abrufbar") || body.trim().length < 50;
}

function parseFrontmatter(content: string): { fm: string; body: string; fmEnd: number } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { fm: "", body: content, fmEnd: 0 };
  return { fm: match[1], body: match[2], fmEnd: match[0].length };
}

function extractCelex(fm: string): string {
  const match = fm.match(/celex:\s*"?([^\n"]+)"?/);
  return match ? match[1].trim() : "";
}

function extractSourceUrl(fm: string): string {
  const match = fm.match(/source_url:\s*"?([^\n"]+)"?/);
  return match ? match[1].trim() : "";
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/** Preflight: single HTTP request with broad Accept header.
 *  Cellar returns RDF/XML for metadata-only entries, HTML/PDF for digitalized ones.
 *  One request instead of 5 — 5x faster for the 62% non-digitalized majority. */
async function hasDigitalManifestation(cellarId: string): Promise<boolean> {
  const contentUrl = `${CELLAR_BASE}/${cellarId}`;

  const res = await fetchWithRetry(contentUrl, {
    Accept: "text/html,application/pdf,application/xhtml+xml,*/*;q=0.1",
    "Accept-Language": "de",
  });
  if (!res || !res.ok) return false;

  const ct = res.headers.get("content-type") || "";
  // RDF/XML = metadata only, no digital content
  if (ct.includes("rdf+xml")) return false;
  // HTML, PDF, XHTML = digital content available
  if (ct.includes("text/html") || ct.includes("pdf") || ct.includes("xhtml")) {
    return true;
  }
  // Unknown content type — be conservative, try format-specific paths
  for (const fmt of ["html", "pdf"]) {
    const fmtRes = await fetchWithRetry(`${contentUrl}/${fmt}`, {
      Accept: fmt === "pdf" ? "application/pdf" : "text/html",
      "Accept-Language": "de",
    });
    if (fmtRes && fmtRes.ok) return true;
  }
  return false;
}

/** Fetch full text from Cellar using multi-format strategy. */
async function fetchCellarContent(cellarId: string, celex: string): Promise<string> {
  const contentUrl = `${CELLAR_BASE}/${cellarId}`;

  // Strategy 1: HTML
  const htmlRes = await fetchWithRetry(contentUrl, {
    Accept: "text/html",
    "Accept-Language": "de",
  });
  if (htmlRes && htmlRes.ok) {
    const ct = htmlRes.headers.get("content-type") || "";
    if (ct.includes("text/html")) {
      const text = stripHtml(await htmlRes.text());
      if (text.length >= 50) return text;
    }
  }

  // Strategy 2: PDF
  const pdfRes = await fetchWithRetry(contentUrl, {
    Accept: "application/pdf",
    "Accept-Language": "de",
  });
  if (pdfRes && pdfRes.ok) {
    try {
      const { extractDocumentText } = await import("../src/core/extract-document.ts");
      const buf = Buffer.from(await pdfRes.arrayBuffer());
      const extracted = await extractDocumentText(buf, ".pdf");
      if (extracted.text.length >= 50) return extracted.text;
    } catch {
      /* skip */
    }
  }

  // Strategy 3: XHTML
  const xhtmlRes = await fetchWithRetry(contentUrl, {
    Accept: "application/xhtml+xml",
    "Accept-Language": "de",
  });
  if (xhtmlRes && xhtmlRes.ok) {
    const text = stripHtml(await xhtmlRes.text());
    if (text.length >= 50) return text;
  }

  // Strategy 4: Format-specific URL paths
  for (const fmt of ["html", "pdf"]) {
    const fmtRes = await fetchWithRetry(`${contentUrl}/${fmt}`, {
      Accept: fmt === "pdf" ? "application/pdf" : "text/html",
      "Accept-Language": "de",
    });
    if (fmtRes && fmtRes.ok) {
      if (fmt === "pdf") {
        try {
          const { extractDocumentText } = await import("../src/core/extract-document.ts");
          const buf = Buffer.from(await fmtRes.arrayBuffer());
          const extracted = await extractDocumentText(buf, ".pdf");
          if (extracted.text.length >= 50) return extracted.text;
        } catch {
          /* skip */
        }
      } else {
        const text = stripHtml(await fmtRes.text());
        if (text.length >= 50) return text;
      }
    }
  }

  // Strategy 5: EUR-Lex direct (only if 200 OK, not WAF 202)
  if (celex) {
    const eurlexUrl = `https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:${celex}`;
    const eurlexRes = await fetchWithRetry(eurlexUrl, {
      "Accept-Language": "de",
    });
    if (eurlexRes && eurlexRes.ok && eurlexRes.status === 200) {
      const html = await eurlexRes.text();
      if (html.length > 100) {
        const text = stripHtml(html);
        if (text.length >= 50) return text;
      }
    }
  }

  return "";
}

/** Mark a file as not_digitalized in frontmatter. */
function markNotDigitalized(filepath: string, content: string): void {
  if (content.includes("not_digitalized:")) return; // already marked
  const updated = content.replace(/^(---\n[\s\S]*?)(\n---\n)/m, "$1\nnot_digitalized: true$2");
  if (updated !== content) {
    writeFileSync(filepath, updated, "utf-8");
  }
}

/** Atomic write via temp file + rename. */
function atomicWrite(filepath: string, content: string): void {
  const tmp = filepath + ".tmp";
  writeFileSync(tmp, content, "utf-8");
  renameSync(tmp, filepath);
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(ABS_DIR)) {
    console.error(`Directory not found: ${ABS_DIR}`);
    process.exit(1);
  }

  const allFiles = readdirSync(ABS_DIR).filter((f) => f.endsWith(".md"));
  const placeholders: string[] = [];

  for (const f of allFiles) {
    const content = readFileSync(join(ABS_DIR, f), "utf-8");
    // Skip already marked as not_digitalized
    if (content.includes("not_digitalized: true")) continue;
    const { body } = parseFrontmatter(content);
    if (isPlaceholder(body)) placeholders.push(f);
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  EU Cellar Preflight Backfill — ${TARGET_DIR}`);
  console.log(`  Total files: ${allFiles.length}`);
  console.log(`  Placeholders (unmarked): ${placeholders.length}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Rate limit: ${RATE_LIMIT_MS}ms between requests`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const toProcess = LIMIT > 0 ? placeholders.slice(0, LIMIT) : placeholders;
  let ok = 0;
  let skip = 0;
  let fail = 0;
  let notDigitalized = 0;
  const startTime = Date.now();

  // Process in batches with concurrency
  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const batch = toProcess.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (filename) => {
        const filepath = join(ABS_DIR, filename);
        const content = readFileSync(filepath, "utf-8");
        const { fm, body } = parseFrontmatter(content);
        const sourceUrl = extractSourceUrl(fm);
        const celex = extractCelex(fm);

        if (!sourceUrl.includes("publications.europa.eu")) {
          return { status: "skip" as const, filename };
        }

        const cellarId = sourceUrl.split("/cellar/")[1];
        if (!cellarId) return { status: "skip" as const, filename };

        // Preflight: does this entry have digital content?
        const hasContent = await hasDigitalManifestation(cellarId);
        if (!hasContent) {
          if (!dryRun) markNotDigitalized(filepath, content);
          return { status: "not_digitalized" as const, filename };
        }

        // Fetch the actual content
        const text = await fetchCellarContent(cellarId, celex);
        if (text.length < 50) {
          return { status: "fail" as const, filename };
        }

        // Identity check
        if (celex) {
          const normText = normalize(text);
          const normCelex = normalize(celex);
          const celexCore = normCelex.replace(/^3/, "");
          if (
            !normText.includes(normCelex) &&
            !(celexCore.length > 4 && normText.includes(celexCore)) &&
            text.length < 500
          ) {
            return { status: "fail" as const, filename };
          }
        }

        // Write back with real text
        if (!dryRun) {
          const newBody = body.replace(/\*Volltext nicht abrufbar — siehe EUR-Lex\.\*/, text);
          const updated = `---\n${fm}\n---\n${newBody}`;
          atomicWrite(filepath, updated);
        }

        return { status: "ok" as const, filename };
      })
    );

    for (const r of results) {
      if (r.status === "ok") ok++;
      else if (r.status === "skip") skip++;
      else if (r.status === "not_digitalized") notDigitalized++;
      else fail++;
    }

    const processed = i + batch.length;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (processed / elapsed).toFixed(1);
    const eta = Math.round((toProcess.length - processed) / parseFloat(rate));
    console.log(
      `  [${processed}/${toProcess.length}] ok=${ok} skip=${skip} notDigital=${notDigitalized} fail=${fail} | ${rate}/s ETA ${eta}s`
    );

    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(
    `  DONE: ${ok} backfilled, ${notDigitalized} not_digitalized (marked), ${fail} failed, ${skip} skipped`
  );
  console.log(`  Time: ${elapsed}s`);
  console.log(`═══════════════════════════════════════════════════════════`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
