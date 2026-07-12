/**
 * Bulk import of Swiss Federal Supreme Court (BGE — Bundesgerichtsentscheide)
 * decisions from the Swiss OGD API.
 *
 * The Swiss Federal Supreme Court publishes decisions via:
 *   https://www.bger.ch/DE/Juridiction%20f%C3%A9d%C3%A9rale/Juridiction%20f%C3%A9d%C3%A9rale.html
 *   OGD API: https://opendata.swiss/de/dataset/entscheide-des-bundesgerichts
 *
 * This script fetches BGE decisions via the BGER API, extracts metadata +
 * full text, and writes markdown files to law-corpus/ch-judikatur/, ready
 * for `gbrain import`.
 *
 *   bun scripts/ingest-ch-judikatur.ts [--out ../law-corpus/ch-judikatur] [--limit 100]
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { dump as yamlDump } from "js-yaml";

const DEFAULT_OUT = join(import.meta.dir, "..", "law-corpus", "ch-judikatur");
const DEFAULT_LIMIT = 100;

/** Strip HTML tags and decode entities */
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

interface DecisionDoc {
  id: string;
  court: string;
  date: string;
  az: string;
  ecli?: string;
  legalArea: string;
  keywords: string[];
  text: string;
  url: string;
  title: string;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unbekannt"
  );
}

function buildMarkdown(doc: DecisionDoc): string {
  const frontmatter = yamlDump(
    {
      type: "court_decision",
      jurisdiction: "ch",
      court: doc.court,
      date: doc.date,
      ecli: doc.ecli ?? "",
      case_number: doc.az,
      legal_area: doc.legalArea,
      keywords: doc.keywords,
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

/** Extract case number from BGE title or description */
function extractAz(text: string): string {
  // BGE format: "BGE 147 III 123" or "4A_123/2021" or "BGer 4A_123/2021"
  const bgeMatch = text.match(/BGE\s+\d+\s+[IVX]+\s+\d+/i);
  if (bgeMatch) return bgeMatch[0];
  const azMatch = text.match(/\d+[A-Z]_\d+\/\d{4}/i);
  if (azMatch) return azMatch[0];
  const bgMatch = text.match(/BGer\s+\d+[A-Z]_\d+\/\d{4}/i);
  return bgMatch ? bgMatch[0] : "";
}

/** Extract ECLI from text */
function extractEcli(text: string): string | undefined {
  const ecliMatch = text.match(/ECLI:CH:BGER:\d{4}:[\d.]+/i);
  return ecliMatch ? ecliMatch[0] : undefined;
}

/** Fetch full text from a BGE detail page */
async function fetchFullText(url: string): Promise<string> {
  if (!url) return "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return "";
    const html = await res.text();

    // BGER detail pages: content in <div id="content"> or <div class="content">
    const contentMatch =
      html.match(/<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ??
      html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ??
      html.match(/<div[^>]*class="[^"]*entscheidung[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    const rawHtml = contentMatch ? contentMatch[1]! : html;
    return stripHtml(rawHtml);
  } catch {
    return "";
  }
}

/** Parse RSS XML to extract decision entries */
function parseRssXml(xml: string): Array<{
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid?: string;
}> {
  const entries: Array<{
    title: string;
    link: string;
    description: string;
    pubDate: string;
    guid?: string;
  }> = [];

  const itemRegex = /<item[\s\S]*?<\/item>/gi;
  const items = xml.match(itemRegex) ?? [];

  for (const item of items) {
    const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/i);
    const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const dateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const guidMatch = item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);

    entries.push({
      title: titleMatch ? stripHtml(titleMatch[1]!.trim()) : "",
      link: linkMatch ? linkMatch[1]!.trim() : "",
      description: descMatch ? stripHtml(descMatch[1]!.trim()) : "",
      pubDate: dateMatch ? dateMatch[1]!.trim() : "",
      guid: guidMatch ? guidMatch[1]!.trim() : undefined,
    });
  }

  return entries;
}

/** Fetch RSS feed and parse entries */
async function fetchFeed(url: string): Promise<Array<{
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid?: string;
}>> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`  Feed HTTP ${res.status}: ${url}`);
      return [];
    }
    const xml = await res.text();
    return parseRssXml(xml);
  } catch (err) {
    console.error(`  Feed failed: ${err}`);
    return [];
  }
}

// BGE RSS feeds per legal area
const BGE_FEEDS: Array<{ url: string; legalArea: string; label: string }> = [
  {
    url: "https://www.bger.ch/ext/eurocratgh/de/rss/entscheide.xml",
    legalArea: "zivilrecht",
    label: "zivilrecht",
  },
  {
    url: "https://www.bger.ch/ext/eurocratgh/de/rss/strafrecht.xml",
    legalArea: "strafrecht",
    label: "strafrecht",
  },
  {
    url: "https://www.bger.ch/ext/eurocratgh/de/rss/oeffentliches-recht.xml",
    legalArea: "oeffentliches-recht",
    label: "oeffentliches-recht",
  },
];

async function main() {
  const args = process.argv.slice(2);
  const outDirIdx = args.indexOf("--out");
  const outDir = outDirIdx >= 0 ? args[outDirIdx + 1] : DEFAULT_OUT;
  const limitIdx = args.indexOf("--limit");
  const globalLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : DEFAULT_LIMIT;

  mkdirSync(outDir, { recursive: true });

  let totalFetched = 0;
  let totalWritten = 0;
  let totalSkipped = 0;
  const seen = new Set<string>();

  console.log(`\n=== Bundesgerichtsentscheide (BGE) ===`);

  for (const feed of BGE_FEEDS) {
    if (globalLimit > 0 && totalFetched >= globalLimit) break;

    console.log(`\n  Feed: ${feed.label} (${feed.legalArea})`);
    const entries = await fetchFeed(feed.url);
    console.log(`  → ${entries.length} entries in feed`);

    for (const entry of entries) {
      if (globalLimit > 0 && totalFetched >= globalLimit) break;

      const id = entry.guid ?? entry.link ?? entry.title;
      if (!id || seen.has(id)) {
        totalSkipped++;
        continue;
      }
      seen.add(id);
      totalFetched++;

      const az = extractAz(entry.title + " " + entry.description);
      const ecli = extractEcli(entry.title + " " + entry.description);
      const date = entry.pubDate
        ? new Date(entry.pubDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      // Fetch full text from detail page
      const fullText = await fetchFullText(entry.link);

      const doc: DecisionDoc = {
        id: slugify(id),
        court: "BGer",
        date,
        az,
        ecli,
        legalArea: feed.legalArea,
        keywords: [],
        text: fullText,
        url: entry.link,
        title: entry.title,
      };

      // Write markdown file
      const slugDate = date;
      const slugAz = slugify(az || doc.id);
      const filename = `bger-${slugDate}-${slugAz}.md`;
      const filepath = join(outDir, filename);

      if (existsSync(filepath)) {
        totalSkipped++;
        continue;
      }

      const markdown = buildMarkdown(doc);
      writeFileSync(filepath, markdown, "utf-8");
      totalWritten++;

      const textPreview = fullText ? `${fullText.length} chars` : "no text";
      console.log(
        `  [${totalWritten}] BGer ${az || "(no Az)"} (${slugDate}) — ${textPreview}`
      );

      // Rate limit: 300ms between detail fetches
      await new Promise((r) => setTimeout(r, 300));
    }

    // Rate limit between feeds
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Fetched: ${totalFetched}`);
  console.log(`Written: ${totalWritten}`);
  console.log(`Skipped (duplicates): ${totalSkipped}`);
  console.log(`Output: ${outDir}`);
  console.log(`\nImport with:`);
  console.log(`  gbrain sources add law-ch-judikatur ${outDir}`);
  console.log(`  gbrain import ${outDir} --source-id law-ch-judikatur`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
