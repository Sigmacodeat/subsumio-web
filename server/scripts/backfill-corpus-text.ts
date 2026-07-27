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

import { readFileSync, writeFileSync, readdirSync, existsSync, renameSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import {
  hasProxies,
  proxyFetchOptions,
  getUserAgent,
  recommendedConcurrency,
  PROXY_DELAY_MS,
  logProxyConfig,
  reportProxyFailure,
} from "./ris-proxy";
import {
  stripHtmlComplete,
  risXmlToText,
  decodeEntities,
  contentMatchesDocument as contentMatchesDocumentUtil,
  validateFetchedText,
  validateLegalStructure,
  countSections,
  contentHash,
  atomicWrite as atomicWriteUtil,
} from "./backfill-utils";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const TIMEOUT_MS = 30_000;

const args = process.argv.slice(2);
const dirIdx = args.indexOf("--dir");
const concIdx = args.indexOf("--concurrency");
const limitIdx = args.indexOf("--limit");
const offHoursOnly = args.includes("--off-hours-only");
const noLock = args.includes("--no-lock");
const noScan = args.includes("--no-scan");
const fileListIdx = args.indexOf("--file-list");
const forceReFetch = args.includes("--force-refetch");

const TARGET_DIR = dirIdx >= 0 ? args[dirIdx + 1] : "law-corpus/at-judikatur-vfgh";
// RIS OGD requires single connection — default concurrency is 1.
// For non-RIS sources (EU), higher concurrency is safe.
const isRIS = TARGET_DIR.includes("judikatur");
const CONCURRENCY =
  concIdx >= 0 ? parseInt(args[concIdx + 1], 10) : isRIS ? recommendedConcurrency() : 5;
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;
const RATE_LIMIT_MS = isRIS ? (hasProxies() ? PROXY_DELAY_MS : 1500) : 500; // RIS: 1.5s (or proxy delay), EU: 500ms

/** Check if current time is within RIS-recommended off-hours (18:00–06:00 or weekend). */
function isRisOffHours(): boolean {
  const now = new Date();
  const cetHour = parseInt(
    now.toLocaleTimeString("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", hour12: false })
  );
  const day = now.toLocaleDateString("en-US", { timeZone: "Europe/Vienna", weekday: "short" });
  const isWeekend = day === "Sat" || day === "Sun";
  return isWeekend || cetHour < 8 || cetHour >= 18;
}

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const _corpusRoot = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");
const ABS_DIR = join(_corpusRoot, TARGET_DIR.replace(/^law-corpus\//, ""));

async function fetchWithRetry(
  url: string,
  headers?: Record<string, string>
): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": getUserAgent(),
          ...headers,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        ...proxyFetchOptions(),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
          continue;
        }
      }
      return res;
    } catch {
      if (hasProxies()) reportProxyFailure();
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
      }
    }
  }
  return null;
}

// stripHtml, decodeEntities, risXmlToText now imported from backfill-utils
// stripHtmlComplete replaces the old stripHtml with a more thorough version
// that removes RIS chrome, pagination headers, metadata blocks, and all entities.
function stripHtml(html: string): string {
  return stripHtmlComplete(html);
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

function extractCaseNumber(fm: string): string {
  const match = fm.match(/case_number:\s*['"]?([^\n'"]*)['"]?/);
  return match ? match[1].trim() : "";
}

function extractEcli(fm: string): string {
  const match = fm.match(/ecli:\s*['"]?([^\n'"]*)['"]?/);
  return match ? match[1].trim() : "";
}

/**
 * 2026-07-15 incident: the RIS Dokument.wxe fallback below sometimes returns
 * HTTP 200 with an unrelated document (e.g. a random OGH Rechtssatz) instead
 * of a 404/503 — because RIS serves a generic fallback page rather than
 * erroring. Nothing downstream checked that the fetched text actually
 * belonged to the requested decision, so mismatched content got written
 * silently: BVwG/LVwG/VfGH/VwGH/AsylGH/UVS files ended up with unrelated OGH
 * case text under their own (correct) frontmatter/title. Rate was 10-77%
 * across affected courts. This guard rejects any fetch whose body doesn't
 * contain the requesting document's own case number or ECLI — the one
 * thing genuinely unique to that decision — before it's ever written.
 *
 * 2026-07-16 extension: EU sources (EUR-Lex / publications.europa.eu) now
 * also pass through this guard. EU documents have a CELEX number in
 * frontmatter — the unique identifier for EU legislation. The fetched text
 * must contain this CELEX number, otherwise we reject it as a mismatch.
 * This prevents the same class of silent mislabeling that affected RIS
 * judikatur (wrong document served under a 200 OK) from affecting EU corpus
 * files.
 */
function contentMatchesDocument(text: string, fm: string): boolean {
  return contentMatchesDocumentUtil(text, {
    case_number: extractCaseNumber(fm),
    ecli: extractEcli(fm),
    celex: extractCelex(fm),
  });
}

async function backfillFile(filepath: string): Promise<"ok" | "skip" | "fail"> {
  const content = readFileSync(filepath, "utf-8");
  const { fm, body } = parseFrontmatter(content);

  if (!isPlaceholder(body) && !forceReFetch) return "skip";

  // Skip files marked as not_digitalized — these are pre-digital-era EU
  // documents that only exist in printed OJ. No online source has them.
  if (/not_digitalized:\s*true/i.test(fm)) return "skip";

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

    // Strategy 1: PDF (most reliable for EU legislation — Cellar stores
    // the official OJ version as PDF). Try this first since many Cellar
    // entries don't serve HTML at all.
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
        // PDF extraction failed — try other formats
      }
    }

    // Strategy 2: HTML
    if (text.length < 50) {
      const htmlRes = await fetchWithRetry(contentUrl, {
        Accept: "text/html",
        "Accept-Language": "de",
      });
      if (htmlRes && htmlRes.ok) {
        text = stripHtml(await htmlRes.text());
      }
    }

    // Strategy 3: XHTML
    if (text.length < 50) {
      const xhtmlRes = await fetchWithRetry(contentUrl, {
        Accept: "application/xhtml+xml",
        "Accept-Language": "de",
      });
      if (xhtmlRes && xhtmlRes.ok) {
        text = stripHtml(await xhtmlRes.text());
      }
    }

    // Strategy 4: EUR-Lex direct URL with CELEX number
    if (text.length < 50) {
      const celex = extractCelex(fm);
      if (celex) {
        const eurlexUrl = `https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:${celex}`;
        const eurlexRes = await fetchWithRetry(eurlexUrl, {
          "Accept-Language": "de",
        });
        if (eurlexRes && eurlexRes.ok && eurlexRes.status === 200) {
          const html = await eurlexRes.text();
          if (html.length > 100) {
            text = stripHtml(html);
          }
        }
      }
    }

    // Strategy 5: Cellar format-specific URL paths — some entries only
    // serve content at /cellar/{id}/html or /cellar/{id}/pdf, not via
    // content negotiation on the base URL.
    if (text.length < 50) {
      for (const fmt of ["html", "pdf"]) {
        const fmtUrl = `${contentUrl}/${fmt}`;
        const fmtRes = await fetchWithRetry(fmtUrl, {
          Accept: fmt === "pdf" ? "application/pdf" : "text/html",
          "Accept-Language": "de",
        });
        if (fmtRes && fmtRes.ok) {
          if (fmt === "pdf") {
            try {
              const { extractDocumentText } = await import("../src/core/extract-document.ts");
              const buf = Buffer.from(await fmtRes.arrayBuffer());
              const extracted = await extractDocumentText(buf, ".pdf");
              text = extracted.text;
            } catch {
              /* skip */
            }
          } else {
            text = stripHtml(await fmtRes.text());
          }
          if (text.length >= 50) break;
        }
      }
    }

    if (text.length < 50) {
      // All Cellar strategies failed. Try EUR-Lex legal-content as last resort.
      const celex = extractCelex(fm);
      if (celex) {
        const eurlexUrl = `https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:${celex}`;
        const eurlexRes = await fetchWithRetry(eurlexUrl, {
          "Accept-Language": "de",
        });
        if (eurlexRes && eurlexRes.ok && eurlexRes.status === 200) {
          const html = await eurlexRes.text();
          if (html.length > 100) {
            text = stripHtml(html);
          }
        }
      }
    }

    if (text.length < 50) {
      // All strategies failed — mark as not_digitalized so future runs skip it
      const updatedFm = fm.includes("not_digitalized:")
        ? fm.replace(/not_digitalized:\s*\S*/, "not_digitalized: true")
        : `${fm}\nnot_digitalized: true`;
      const newContent = `---\n${updatedFm}\n---\n${body}`;
      try {
        atomicWriteUtil(filepath, newContent);
      } catch {}
      return "skip";
    }

    // EU identity check: For PDF-extracted text, the CELEX number may not
    // appear in the body text (it's in the OJ header which PDF extraction
    // may not capture). We accept text > 200 chars from the Cellar URL as
    // valid — the URL itself is the identity guarantee. For HTML/XHTML
    // fetches, we still check CELEX to guard against generic fallback pages.
    // (Threshold lowered from 500→200: many valid berichtigungen/corrections
    // are 200-500 chars and legitimately don't contain the CELEX number.)
    if (text.length < 200 && !contentMatchesDocument(text, fm)) {
      console.error(`  ✗ EU identity check FAILED for ${filepath} — CELEX not in fetched text`);
      return "fail";
    }
  } else if (isRIS) {
    // 2026-07-15 rewrite. The old primary path queried
    // `v2.6/judikatur/{court}?Dokumentnummer=...` — but the RIS API silently
    // IGNORES both that path segment and the Dokumentnummer param, returning
    // the unfiltered default Justiz search instead (its first hit, OGH
    // Rechtssatz RS0043603, is verbatim the text found in all 72k
    // contaminated files). Correct usage verified against the live API:
    //   - filter params are query params: `Judikatur?Applikation=Bvwg&Geschaeftszahl=...`
    //   - content URLs are deterministic: Dokumente/{Abfrage}/{DokNr}/{DokNr}.html
    // Every candidate still passes contentMatchesDocument() — the API shape
    // being "correct" is never trusted on its own again.
    // Parse RIS document URL. Two formats:
    //   1. Query URL: ...Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_...
    //   2. Direct URL: ...Dokumente/Justiz/JJR_.../JJR_....html
    const abfrageMatch = sourceUrl.match(/Abfrage=([^&]+)/);
    const dokNrMatch = sourceUrl.match(/Dokumentnummer=([^&]+)/);
    const directPathMatch = sourceUrl.match(/\/Dokumente\/([^/]+)\/([^/]+)\//);
    const abfrage = abfrageMatch?.[1] || directPathMatch?.[1] || "";
    const dokNr = dokNrMatch?.[1] || directPathMatch?.[2] || "";
    if (abfrage && dokNr) {
      // Primary: deterministic XML document URL — structured nutzdaten, no
      // site chrome, no search round-trip.
      const xmlUrl = `https://www.ris.bka.gv.at/Dokumente/${abfrage}/${dokNr}/${dokNr}.xml`;
      const xmlRes = await fetchWithRetry(xmlUrl);
      if (xmlRes && xmlRes.ok) {
        const candidate = risXmlToText(await xmlRes.text());
        if (candidate.length >= 50 && contentMatchesDocument(candidate, fm)) {
          text = candidate;
        }
      }

      // Secondary: deterministic HTML URL (full site page — noisier, but
      // stripHtml + identity check still beat a placeholder).
      if (text.length < 50) {
        const directUrl = `https://www.ris.bka.gv.at/Dokumente/${abfrage}/${dokNr}/${dokNr}.html`;
        const directRes = await fetchWithRetry(directUrl);
        if (directRes && directRes.ok) {
          const candidate = stripHtml(await directRes.text());
          if (contentMatchesDocument(candidate, fm)) {
            text = candidate;
          }
        }
      }

      // Tertiary: search by Applikation + Geschaeftszahl, then pick the hit
      // whose Technisch.ID matches OUR document number exactly.
      if (text.length < 50) {
        const caseNum = extractCaseNumber(fm);
        if (caseNum) {
          const searchUrl =
            `https://data.bka.gv.at/ris/api/v2.6/Judikatur?Applikation=${encodeURIComponent(abfrage)}` +
            `&Geschaeftszahl=${encodeURIComponent(caseNum)}`;
          const ogdRes = await fetchWithRetry(searchUrl);
          if (ogdRes && ogdRes.ok) {
            try {
              const ogdData = (await ogdRes.json()) as any;
              const docs = ogdData?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference;
              const docArr = Array.isArray(docs) ? docs : docs ? [docs] : [];
              const match = docArr.find((d: any) => d?.Data?.Metadaten?.Technisch?.ID === dokNr);
              const contentRef = match?.Data?.Dokumentliste?.ContentReference;
              const urls = contentRef?.Urls?.ContentUrl;
              const urlArr = Array.isArray(urls) ? urls : urls ? [urls] : [];
              let htmlUrl = "";
              for (const u of urlArr) {
                if (u.DataType === "Html") {
                  htmlUrl = String(u.Url);
                  break;
                }
              }
              if (htmlUrl) {
                const htmlRes = await fetchWithRetry(htmlUrl);
                if (htmlRes && htmlRes.ok) {
                  const candidate = stripHtml(await htmlRes.text());
                  if (contentMatchesDocument(candidate, fm)) {
                    text = candidate;
                  }
                }
              }
            } catch {
              /* OGD parse failed */
            }
          }
        }
      }
    }

    // Fallback: try the original source_url directly. RIS serves HTTP 200
    // with an unrelated/generic page here more often than an actual error —
    // contentMatchesDocument() is the only thing standing between that and a
    // silently-mislabeled file, so a fetch that fails the check is a "fail",
    // not an "ok with wrong text".
    if (text.length < 50) {
      const res = await fetchWithRetry(sourceUrl);
      if (res && res.ok) {
        const candidate = stripHtml(await res.text());
        if (contentMatchesDocument(candidate, fm)) {
          text = candidate;
        }
      }
    }
  } else {
    // Generic fetch
    const res = await fetchWithRetry(sourceUrl);
    if (!res || !res.ok) return "fail";
    text = stripHtml(await res.text());
  }

  if (text.length < 50) return "fail";

  // Final validation gate: reject text with encoding artifacts, HTML residue, or RIS chrome
  const validation = validateFetchedText(text);
  if (!validation.valid) {
    console.error(`  ⚠️ validation failed for ${filepath}: ${validation.reason}`);
    return "fail";
  }
  text = validation.cleanedText;

  // Re-check identity after cleaning (stripHtmlComplete may have removed chrome
  // that contained the case number — but the case number should be in the body)
  if (!contentMatchesDocument(text, fm)) {
    console.error(`  ⚠️ identity check failed for ${filepath} after validation`);
    return "fail";
  }

  // Structure validation: ensure the fetched text has the expected legal structure
  // (§-headings for laws, section headings for decisions)
  const docType = fm.match(/^type:\s*(\S+)/m)?.[1] ?? "";
  const structResult = validateLegalStructure(text, docType);
  if (!structResult.valid) {
    console.error(`  ⚠️ structure validation failed for ${filepath}: ${structResult.reason}`);
    return "fail";
  }

  // Compute content hash for post-backfill verification
  const hash = contentHash(text);

  // Rebuild file: keep frontmatter, replace body
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : "";
  const sourceLine = body.match(/\n\*Quelle:.*$/m);
  const sourceSuffix = sourceLine ? sourceLine[0] : "";

  const newBody = `# ${title}\n\n${text}\n\n${sourceSuffix}`;
  // Inject content_hash into frontmatter for provenance tracking
  const fmWithHash = fm.includes("content_hash:")
    ? fm.replace(/content_hash:\s*"\?[^"]*\"?/, `content_hash: "${hash}"`)
    : `${fm}\ncontent_hash: "${hash}"`;
  const newContent = `---\n${fmWithHash}\n---\n\n${newBody}\n`;

  // Atomic write via shared utility
  try {
    atomicWriteUtil(filepath, newContent);
  } catch (e: any) {
    if (e?.message?.includes("too long")) {
      console.error(`  ⚠️ filename too long, skipping: ${filepath.slice(-80)}...`);
      return "skip";
    }
    throw e;
  }
  return "ok";
}

async function runBatch(
  files: string[],
  startIdx: number,
  batchSize: number
): Promise<{ ok: number; skip: number; fail: number }> {
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

  // Global RIS lock — only for RIS sources without proxies and without --no-lock.
  // With proxies, each request goes through a different IP so parallel is safe.
  // With --no-lock, caller takes responsibility for rate limiting across processes.
  if (isRIS && !hasProxies() && !noLock) {
    console.log("🔒 Acquiring RIS lock (single-connection mode)...");
    await acquireRisLock();
    console.log("✅ RIS lock acquired.");
  } else if (isRIS && hasProxies()) {
    console.log("✅ RIS proxy mode — skipping global lock (proxies handle rate limiting).");
  } else if (isRIS && noLock) {
    console.log("✅ RIS no-lock mode — caller manages rate limiting across processes.");
  }

  let allFiles: string[];
  if (fileListIdx >= 0) {
    // Use pre-filtered file list (e.g. from grep -rl)
    const listPath = args[fileListIdx + 1];
    allFiles = readFileSync(listPath, "utf-8")
      .trim()
      .split("\n")
      .filter((l) => l.trim().length > 0);
    console.log(`  Using file list: ${listPath} (${allFiles.length} files)`);
  } else {
    allFiles = readdirSync(ABS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(ABS_DIR, f));
  }

  // Quick-filter to only files that need backfill (skip if --no-scan for speed)
  const needBackfill =
    noScan || forceReFetch
      ? allFiles
      : allFiles.filter((f) => {
          const content = readFileSync(f, "utf-8");
          return isPlaceholder(content);
        });

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Backfill Text — ${TARGET_DIR}`);
  console.log(`  Total files: ${allFiles.length}`);
  console.log(`  Need backfill: ${needBackfill.length}`);
  console.log(`  Concurrency: ${CONCURRENCY}${isRIS ? " (RIS single-connection)" : ""}`);
  console.log(`  Rate limit: ${RATE_LIMIT_MS}ms between requests`);
  if (isRIS && offHoursOnly) {
    console.log(`  Off-hours only: waiting until 18:00 CET or weekend`);
  }
  console.log(`═══════════════════════════════════════════════════════════\n`);

  // RIS off-hours enforcement
  if (isRIS && offHoursOnly && !isRisOffHours()) {
    const now = new Date();
    const cetHour = parseInt(
      now.toLocaleTimeString("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", hour12: false })
    );
    const waitHours = 18 - cetHour;
    console.log(`⏳ Waiting ${waitHours}h until 18:00 CET (RIS OGD guidelines).`);
    while (!isRisOffHours()) {
      await new Promise((r) => setTimeout(r, 60_000));
    }
    console.log(`✅ Off-hours reached. Starting backfill.`);
  }

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

    // Rate limit between batches for RIS compliance
    if (isRIS && i + CONCURRENCY < files.length) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }

    const processed = Math.min(i + CONCURRENCY, files.length);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const remaining = (files.length - processed) / rate;

    if (processed % 100 < CONCURRENCY || processed === files.length) {
      console.log(
        `  [${processed}/${files.length}] ok=${ok} skip=${skip} fail=${fail} | ${rate.toFixed(1)}/s ETA ${remaining.toFixed(0)}s`
      );
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  DONE: ${ok} backfilled, ${skip} already had text, ${fail} failed`);
  console.log(`  Time: ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
  console.log(`═══════════════════════════════════════════════════════════`);
}

main()
  .then(() => {
    if (isRIS && !hasProxies() && !noLock) releaseRisLock();
  })
  .catch((err) => {
    console.error("Fatal:", err);
    if (isRIS && !hasProxies() && !noLock) releaseRisLock();
    process.exit(1);
  });
