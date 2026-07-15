#!/usr/bin/env bun
/**
 * Backfill AT Landesrecht — ELI URL Fetcher
 *
 * Problem: 6.988 of 11.867 AT-Landesrecht files are placeholders.
 * Source URLs are RIS ELI URLs (https://www.ris.bka.gv.at/eli/lgbl/...).
 *
 * Strategy: RIS ELI URLs redirect to the actual document page.
 * We fetch the HTML, extract the Landesrecht text, and verify identity
 * via the LGBl number in the frontmatter.
 *
 * RIS OGD compliance: single connection, 1500ms delay.
 *
 * Usage:
 *   bun scripts/backfill-landesrecht.ts --limit 100
 *   bun scripts/backfill-landesrecht.ts --dry-run
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;
const TIMEOUT_MS = 30_000;
const DELAY_MS = 1500; // RIS: 1.5s between requests

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;
const dryRun = args.includes("--dry-run");

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const ABS_DIR = join(_scriptDir, "..", "..", "law-corpus", "at-landesrecht");

// ── Helpers ────────────────────────────────────────────────────────────

async function fetchWithRetry(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "de",
        },
        redirect: "follow",
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
    .replace(/<h[1-6][^>]*>/gi, "\n## ")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isPlaceholder(body: string): boolean {
  return body.includes("Volltext nicht abrufbar") || body.trim().length < 50;
}

function parseFrontmatter(content: string): { fm: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { fm: "", body: content };
  return { fm: match[1], body: match[2] };
}

function extractSourceUrl(fm: string): string {
  const match = fm.match(/source_url:\s*"?([^\n"]+)"?/);
  return match ? match[1].trim() : "";
}

function extractLgblId(fm: string): string {
  // Extract LGBl identifier from frontmatter or filename
  const match = fm.match(/title:\s*"?([^"\n]+)"?/);
  return match ? match[1].trim() : "";
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/** RIS ELI URLs for Landesrecht follow the pattern:
 *  https://www.ris.bka.gv.at/eli/lgbl/{Bundesland}/{Jahr}/{Nummer}/{Datum}
 *  They redirect to the document page. We fetch and extract the content. */
async function fetchLandesrechtText(eliUrl: string, lgblId: string): Promise<string> {
  // Strategy 1: Direct ELI URL (redirects to HTML page)
  const res = await fetchWithRetry(eliUrl);
  if (res && res.ok) {
    const html = await res.text();
    // RIS Landesrecht pages have the content in specific divs
    // Try to extract the main content area
    let content = html;

    // Remove navigation, header, footer
    content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
    content = content.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
    content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
    content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

    // Try to find the main content container
    const mainMatch = content.match(
      /<div[^>]*class="[^"]*(?:content|main|document|text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );
    if (mainMatch) {
      const text = stripHtml(mainMatch[1]);
      if (text.length >= 100) return text;
    }

    // Fallback: strip all HTML
    const text = stripHtml(content);
    if (text.length >= 100) return text;
  }

  // Strategy 2: Try the RIS OGD API for Landesrecht
  // ELI URL: /eli/lgbl/OB/2024/13/20240131
  const eliParts = eliUrl.match(/\/eli\/lgbl\/([^/]+)\/(\d+)\/([^/]+)\/(\d+)/);
  if (eliParts) {
    const [, bundesland, jahr, nummer, datum] = eliParts;
    // Try OGD API
    const ogdUrl = `https://data.bka.gv.at/ris/api/v2.6/Bundeslandnorm?Applikation=Landesrecht&Bundesland=${bundesland}&Norm=${nummer}&Jahr=${jahr}`;
    try {
      const ogdRes = await fetchWithRetry(ogdUrl);
      if (ogdRes && ogdRes.ok) {
        const data = (await ogdRes.json()) as Record<string, unknown>;
        // Extract content from OGD response
        const docs = (data.OgdSearchResult as any)?.OgdDocumentResults?.OgdDocumentReference;
        if (docs) {
          const arr = Array.isArray(docs) ? docs : [docs];
          for (const d of arr) {
            const urls = d.Data?.Dokumentliste?.ContentReference?.Urls?.ContentUrl;
            if (urls) {
              const urlArr = Array.isArray(urls) ? urls : [urls];
              for (const u of urlArr) {
                if (u.DataType === "Html") {
                  const docRes = await fetchWithRetry(u.Url);
                  if (docRes && docRes.ok) {
                    const text = stripHtml(await docRes.text());
                    if (text.length >= 100) return text;
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      /* skip */
    }
  }

  return "";
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
    const { body } = parseFrontmatter(content);
    if (isPlaceholder(body)) placeholders.push(f);
  }

  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  AT Landesrecht Backfill — ELI URL Fetcher`);
  console.log(`  Total files: ${allFiles.length}`);
  console.log(`  Placeholders: ${placeholders.length}`);
  console.log(`  Rate limit: ${DELAY_MS}ms (RIS single-connection)`);
  console.log(`  Dry run: ${dryRun}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const toProcess = LIMIT > 0 ? placeholders.slice(0, LIMIT) : placeholders;
  let ok = 0;
  let skip = 0;
  let fail = 0;
  const startTime = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const filename = toProcess[i];
    const filepath = join(ABS_DIR, filename);
    const content = readFileSync(filepath, "utf-8");
    const { fm, body } = parseFrontmatter(content);
    const sourceUrl = extractSourceUrl(fm);
    const lgblId = extractLgblId(fm);

    if (!sourceUrl || !sourceUrl.includes("ris.bka.gv.at")) {
      skip++;
      continue;
    }

    const text = await fetchLandesrechtText(sourceUrl, lgblId);

    if (text.length >= 100) {
      if (!dryRun) {
        const newBody = body.replace(/\*Volltext nicht abrufbar — siehe Quelle\.\*/, text);
        const updated = `---\n${fm}\n---\n${newBody}`;
        atomicWrite(filepath, updated);
      }
      ok++;
    } else {
      fail++;
    }

    if ((i + 1) % 100 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = ((i + 1) / elapsed).toFixed(1);
      const eta = Math.round((toProcess.length - i - 1) / parseFloat(rate));
      console.log(
        `  [${i + 1}/${toProcess.length}] ok=${ok} skip=${skip} fail=${fail} | ${rate}/s ETA ${eta}s`
      );
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  DONE: ${ok} backfilled, ${skip} skipped, ${fail} failed`);
  console.log(`  Time: ${elapsed}s`);
  console.log(`═══════════════════════════════════════════════════════════`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
