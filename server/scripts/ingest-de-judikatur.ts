/**
 * Bulk import of German Federal Court (BGH) and Federal Constitutional Court
 * (BVerfG) decisions from their public APIs.
 *
 * BGH: https://www.bundesgerichtshof.de/DE/Entscheidungen/Entscheidungen.html
 *   → RSS feeds per senate, full text via detail pages
 * BVerfG: https://www.bundesverfassungsgericht.de/DE/Entscheidungen/Entscheidungen.html
 *   → RSS feeds, full text via detail pages
 *
 * Both courts publish decisions as HTML pages. This script fetches RSS feeds,
 * extracts decision metadata + full text, and writes markdown files to
 * law-corpus/de-judikatur/, ready for `gbrain import`.
 *
 *   bun scripts/ingest-de-judikatur.ts [--out ../law-corpus/de-judikatur] [--limit 100] [--court bgh|bverfg|both]
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { dump as yamlDump } from "js-yaml";

const DEFAULT_OUT = join(import.meta.dir, "..", "law-corpus", "de-judikatur");
const DEFAULT_LIMIT = 100;

interface CourtConfig {
  name: string;
  shortName: string;
  /** RSS feed URLs per legal area */
  feeds: Array<{ url: string; legalArea: string; label: string }>;
}

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
      jurisdiction: "de",
      court: doc.court,
      date: doc.date,
      ecli: doc.ecli ?? "",
      case_number: doc.az,
      legal_area: doc.legalArea,
      keywords: doc.keywords,
      source: "bgh-bverfg-public",
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

/** Extract case number (Az.) from title or description */
function extractAz(text: string): string {
  // Patterns: "I ZR 123/21", "XII ZR 123/21", "2 BvR 123/21"
  const azMatch = text.match(/(?:\d+\s+)?(?:[IVX]+\s+)?(?:Bv[A-Z]|ZR|ZR|R|AR|VR|LR|S|R|K|R)\s+\d+\/\d+/i);
  if (azMatch) return azMatch[0];
  // Try "Az. ..." pattern
  const azExplicit = text.match(/Az\.?\s*([^\s,;]+)/i);
  return azExplicit ? azExplicit[1]! : "";
}

/** Extract ECLI from text */
function extractEcli(text: string): string | undefined {
  const ecliMatch = text.match(/ECLI:DE:[A-Z]+:\d{4}:[\d.]+/i);
  return ecliMatch ? ecliMatch[0] : undefined;
}

/** Fetch full text from a decision detail page */
async function fetchFullText(url: string): Promise<string> {
  if (!url) return "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return "";
    const html = await res.text();

    // Try to extract the main content area
    // BGH: <div id="content" ...> or <div class="dec-text">
    // BVerfG: <div id="content" ...> or <div class="entscheidung">
    const contentMatch =
      html.match(/<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i) ??
      html.match(/<div[^>]*class="[^"]*dec[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ??
      html.match(/<div[^>]*class="[^"]*entscheidung[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

    const rawHtml = contentMatch ? contentMatch[1]! : html;
    return stripHtml(rawHtml);
  } catch {
    return "";
  }
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

// ── Court configurations ──

const BGH_FEEDS: Array<{ url: string; legalArea: string; label: string }> = [
  // BGH RSS feeds per senate group
  { url: "https://www.bundesgerichtshof.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed_BGH/Entscheidungen_Zivilsachen.xml", legalArea: "zivilrecht", label: "zivilsachen" },
  { url: "https://www.bundesgerichtshof.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed_BGH/Entscheidungen_Strafsachen.xml", legalArea: "strafrecht", label: "strafsachen" },
];

const BVERFG_FEEDS: Array<{ url: string; legalArea: string; label: string }> = [
  { url: "https://www.bundesverfassungsgericht.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed_BVerfG/Entscheidungen.xml", legalArea: "verfassungsrecht", label: "verfassungsrecht" },
];

const COURTS: Record<string, CourtConfig> = {
  bgh: {
    name: "Bundesgerichtshof",
    shortName: "BGH",
    feeds: BGH_FEEDS,
  },
  bverfg: {
    name: "Bundesverfassungsgericht",
    shortName: "BVerfG",
    feeds: BVERFG_FEEDS,
  },
};

async function main() {
  const args = process.argv.slice(2);
  const outDirIdx = args.indexOf("--out");
  const outDir = outDirIdx >= 0 ? args[outDirIdx + 1] : DEFAULT_OUT;
  const limitIdx = args.indexOf("--limit");
  const globalLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : DEFAULT_LIMIT;
  const courtIdx = args.indexOf("--court");
  const courtFilter = courtIdx >= 0 ? args[courtIdx + 1] : "both";

  mkdirSync(outDir, { recursive: true });

  const courtsToProcess =
    courtFilter === "both"
      ? Object.values(COURTS)
      : courtFilter === "bgh" || courtFilter === "bverfg"
        ? [COURTS[courtFilter]]
        : Object.values(COURTS);

  let totalFetched = 0;
  let totalWritten = 0;
  let totalSkipped = 0;
  const seen = new Set<string>();

  for (const court of courtsToProcess) {
    console.log(`\n=== ${court.name} (${court.shortName}) ===`);

    for (const feed of court.feeds) {
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
          court: court.shortName,
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
        const filename = `${court.shortName.toLowerCase()}-${slugDate}-${slugAz}.md`;
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
          `  [${totalWritten}] ${court.shortName} ${az || "(no Az)"} (${slugDate}) — ${textPreview}`
        );

        // Rate limit: 300ms between detail fetches
        await new Promise((r) => setTimeout(r, 300));
      }

      // Rate limit between feeds
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Fetched: ${totalFetched}`);
  console.log(`Written: ${totalWritten}`);
  console.log(`Skipped (duplicates): ${totalSkipped}`);
  console.log(`Output: ${outDir}`);
  console.log(`\nImport with:`);
  console.log(`  gbrain sources add law-de-judikatur ${outDir}`);
  console.log(`  gbrain import ${outDir} --source-id law-de-judikatur`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
