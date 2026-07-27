/**
 * Bulk download of Swiss Federal Supreme Court (BGE/BGer) decisions.
 *
 * The BGER website has a search interface at:
 *   https://www.bger.ch/ext/eurocratgh/de/index.htm
 *
 * We use the JSON API endpoint that powers the search UI:
 *   https://www.bger.ch/ext/eurocratgh/de/search.htm?query=*&page=N
 *
 * Each decision has a detail page with full text as HTML.
 * We fetch, extract text, and write markdown files to law-corpus/ch-judikatur/.
 *
 * Coverage: All published decisions from 2000 onwards (~130.000+).
 *
 * Usage:
 *   bun scripts/bulk-download-ch-judikatur.ts [--limit N] [--concurrency 3] [--start-page 1]
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { dump as yamlDump } from "js-yaml";

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const skipIdx = args.indexOf("--skip");
const SKIP = skipIdx >= 0 ? parseInt(args[skipIdx + 1], 10) : 0;
const concurrencyIdx = args.indexOf("--concurrency");
const CONCURRENCY = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1], 10) : 3;
const startPageIdx = args.indexOf("--start-page");
const START_PAGE = startPageIdx >= 0 ? parseInt(args[startPageIdx + 1], 10) : 1;

const OUT_DIR = join(
  process.env.LAW_CORPUS_ROOT ?? join(import.meta.dir, "..", "law-corpus"),
  "ch-judikatur"
);

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

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unbekannt"
  );
}

function extractAz(text: string): string {
  const bgeMatch = text.match(/BGE\s+\d+\s+[IVX]+\s+\d+/i);
  if (bgeMatch) return bgeMatch[0];
  const azMatch = text.match(/\d+[A-Z]_\d+\/\d{4}/i);
  if (azMatch) return azMatch[0];
  return "";
}

function extractEcli(text: string): string | undefined {
  const ecliMatch = text.match(/ECLI:CH:BGER:\d{4}:[\d.]+/i);
  return ecliMatch ? ecliMatch[0] : undefined;
}

async function fetchWithRetry(
  url: string,
  retries = 5,
  timeoutMs = 20_000
): Promise<Response | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)" },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      if (res.ok) return res;
      if (res.status === 404) return null;
      if (res.status === 429) {
        // BGER rate limit — wait longer with exponential backoff
        const wait = 3000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  return null;
}

/** Fetch a BGER decision detail page and extract full text.
 *  The JumpCGI URL redirects to the actual decision page. */
async function fetchFullText(url: string): Promise<string> {
  const res = await fetchWithRetry(url);
  if (!res) return "";
  const html = await res.text();

  // BGER detail pages have content in various containers
  // Try multiple patterns for the decision content
  const contentMatch =
    html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ??
    html.match(/<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/i) ??
    html.match(/<div[^>]*class="[^"]*urteil[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ??
    html.match(/<div[^>]*class="[^"]*entscheid[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ??
    html.match(/<div[^>]*class="[^"]*page[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  const rawHtml = contentMatch ? contentMatch[1]! : html;
  return stripHtml(rawHtml);
}

/** Parse search result page to extract decision links */
function parseSearchPage(html: string): Array<{
  url: string;
  title: string;
  date: string;
  az: string;
}> {
  const results: Array<{ url: string; title: string; date: string; az: string }> = [];

  // BGER search results have links to detail pages
  // Format: <a href="...detail.htm?..." class="...">Title</a>
  const linkRegex = /<a[^>]*href="([^"]*detail[^"]*\.htm[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const matches = html.matchAll(linkRegex);

  for (const match of matches) {
    const url = match[1]!;
    const title = stripHtml(match[2]!);
    const az = extractAz(title);
    const dateMatch = title.match(/(\d{2}\.\d{2}\.\d{4})/);
    const date = dateMatch ? dateMatch[1]! : "";

    // Make URL absolute if needed
    const fullUrl = url.startsWith("http") ? url : `https://www.bger.ch${url}`;

    results.push({ url: fullUrl, title, date, az });
  }

  return results;
}

function buildMarkdown(doc: {
  court: string;
  date: string;
  az: string;
  ecli?: string;
  legalArea: string;
  text: string;
  url: string;
  title: string;
}): string {
  const frontmatter = yamlDump(
    {
      type: "court_decision",
      jurisdiction: "ch",
      court: doc.court,
      date: doc.date,
      ecli: doc.ecli ?? "",
      case_number: doc.az,
      legal_area: doc.legalArea,
      source: "bger-public",
      source_url: doc.url,
    },
    { lineWidth: -1, noRefs: true }
  ).trimEnd();

  const text = doc.text || "*Volltext nicht abrufbar — siehe Quelle.*";

  return `---
${frontmatter}
---

# ${doc.court} — ${doc.az || "Entscheidung"}

${text}

---
*Quelle: [${doc.court}](${doc.url})*
`;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  CH Judikatur Bulk Download — bger.ch");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Start page: ${START_PAGE}`);
  console.log("");

  mkdirSync(OUT_DIR, { recursive: true });

  let ok = 0;
  let skip = 0;
  let fail = 0;
  let total = 0;
  const startTime = Date.now();
  const seen = new Set<string>();

  // BGER RSS feeds from relevancy.bger.ch
  // aza_de = all decisions (176k+), atf_de = published BGE (20k+), cedh_de = ECHR
  const BGE_FEEDS = [
    {
      url: "http://relevancy.bger.ch/feeds/aza_de.rss",
      legalArea: "all",
      label: "aza (alle Urteile)",
    },
    {
      url: "http://relevancy.bger.ch/feeds/atf_de.rss",
      legalArea: "leitentscheidung",
      label: "atf (Leitentscheide BGE)",
    },
  ];

  console.log("  Processing BGER RSS feeds from relevancy.bger.ch...\n");

  for (const feed of BGE_FEEDS) {
    if (total >= LIMIT) break;

    console.log(`  Feed: ${feed.label}`);
    const feedRes = await fetchWithRetry(feed.url, 5, 120_000);
    if (!feedRes) {
      console.log(`  Feed failed: ${feed.url}`);
      continue;
    }

    const feedXml = await feedRes.text();
    const itemRegex = /<item[\s\S]*?<\/item>/gi;
    const items = feedXml.match(itemRegex) ?? [];
    console.log(`  → ${items.length} entries in feed`);

    // Apply skip offset
    const feedItems = SKIP > 0 ? items.slice(SKIP) : items;
    if (SKIP > 0) console.log(`  After skip ${SKIP}: ${feedItems.length} entries`);

    // Process sequentially — BGER has aggressive Varnish rate limiting (429)
    for (let i = 0; i < feedItems.length; i++) {
      if (total >= LIMIT) break;

      const item = feedItems[i]!;
      const link = item.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() ?? "";
      const title = stripHtml(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
      const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ?? "";

      if (!link || seen.has(link)) {
        skip++;
        total++;
        continue;
      }
      seen.add(link);
      total++;

      const az = extractAz(title);
      const ecli = extractEcli(title);
      const date = pubDate
        ? new Date(pubDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      const slugAz = slugify(az || link.split("id=")[1] || "unknown");
      const filename = `bger-${date}-${slugAz}.md`;
      const filepath = join(OUT_DIR, filename);

      if (existsSync(filepath)) {
        skip++;
        continue;
      }

      try {
        const fullText = await fetchFullText(link);
        if (!fullText) {
          fail++;
        } else {
          const doc = {
            court: "BGer",
            date,
            az,
            ecli,
            legalArea: feed.legalArea,
            text: fullText,
            url: link,
            title,
          };
          const markdown = buildMarkdown(doc);
          writeFileSync(filepath, markdown, "utf-8");
          ok++;
        }
      } catch (e) {
        fail++;
      }

      if (total % 50 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (total / (Number(elapsed) || 1)).toFixed(1);
        console.log(`  [${total}] ok=${ok} skip=${skip} fail=${fail} | ${rate}/s`);
      }

      // 3s delay — BGER Varnish rate limits, 3s works after cache cooldown
      await new Promise((r) => setTimeout(r, 3000));
    }
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
