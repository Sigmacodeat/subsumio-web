/**
 * Bulk import of Austrian Supreme Court (OGH) decisions from RIS-OGD API.
 *
 * Fetches top decisions per legal area, retrieves full text, writes markdown
 * files to law-corpus/at-judikatur/, ready for `gbrain import`.
 *
 *   bun scripts/ingest-at-judikatur.ts [--out ../law-corpus/at-judikatur] [--limit 100]
 *
 * RIS-OGD API: https://data.bka.gv.at/ris/api/v2.6/judikatur
 * Applikation=Justiz, no auth required (public OGD).
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { dump as yamlDump } from "js-yaml";
import {
  extractRisReferences,
  mapRisReference,
  stripHtml,
} from "../src/core/ingestion/connectors/legal-judgements.ts";

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const DEFAULT_OUT = join(import.meta.dir, "..", "law-corpus", "at-judikatur");
const DEFAULT_LIMIT = 100;

interface LegalArea {
  query: string;
  label: string;
  limit: number;
}

const LEGAL_AREAS: LegalArea[] = [
  { query: "Amtshaftung", label: "amtshaftung", limit: 80 },
  { query: "Schadensersatz ABGB", label: "schadensersatz", limit: 100 },
  { query: "Vertragsrecht ABGB", label: "vertragsrecht", limit: 100 },
  { query: "Sachbeschädigung StGB", label: "strafrecht-sachbeschädigung", limit: 50 },
  { query: "Betrug StGB", label: "strafrecht-betrug", limit: 50 },
  { query: "Körperverletzung StGB", label: "strafrecht-körperverletzung", limit: 50 },
  { query: "Zivilverfahren ZPO", label: "zivilverfahren", limit: 100 },
  { query: "Exekution EO", label: "exekution", limit: 50 },
  { query: "Kündigung ArbVG", label: "arbeitsrecht", limit: 50 },
  { query: "Verwaltungsrecht AVG", label: "verwaltungsrecht", limit: 50 },
  { query: "Datenschutz DSG", label: "datenschutz", limit: 50 },
  { query: "Gesellschaftsrecht UGB", label: "gesellschaftsrecht", limit: 50 },
];

interface JudikaturDoc {
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

async function fetchRisSearch(
  query: string,
  page: number,
  pageSize: number = 100
): Promise<Array<Record<string, unknown>>> {
  const url = new URL(`${RIS_BASE}/judikatur`);
  url.searchParams.set("Applikation", "Justiz");
  url.searchParams.set("Suchworte", query);
  url.searchParams.set("DokumenteProSeite", "OneHundred");
  url.searchParams.set("Seitennummer", String(page));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`RIS-OGD HTTP ${res.status} for query "${query}"`);
  const data = (await res.json()) as Record<string, unknown>;
  return extractRisReferences(data);
}

/** Extract the HTML content URL from a RIS search result's Dokumentliste. */
function extractHtmlUrl(ref: Record<string, unknown>): string {
  const data = (ref.Data ?? {}) as Record<string, unknown>;
  const dl = (data.Dokumentliste ?? {}) as Record<string, unknown>;
  const cr = (dl.ContentReference ?? {}) as Record<string, unknown>;
  const urls = cr.Urls as Record<string, unknown> | undefined;
  if (!urls) return "";
  const contentUrl = urls.ContentUrl;
  if (!contentUrl) return "";
  const urlArr = Array.isArray(contentUrl) ? contentUrl : [contentUrl];
  for (const u of urlArr) {
    const du = u as Record<string, unknown>;
    if (du.DataType === "Html") return String(du.Url ?? "");
  }
  // Fallback: first URL
  if (urlArr.length > 0) {
    const first = urlArr[0] as Record<string, unknown>;
    return String(first.Url ?? "");
  }
  return "";
}

async function fetchRisFullText(htmlUrl: string): Promise<string> {
  if (!htmlUrl) return "";
  try {
    const res = await fetch(htmlUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Subsumio-Legal-Import/1.0)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    return stripHtml(html);
  } catch {
    return "";
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unbekannt"
  );
}

function buildMarkdown(doc: JudikaturDoc): string {
  const title = `${doc.court} — ${doc.az || "Entscheidung"}`;
  const frontmatter = yamlDump(
    {
      type: "court_decision",
      jurisdiction: "at",
      title,
      court: doc.court,
      date: doc.date,
      decision_date: doc.date,
      ecli: doc.ecli ?? "",
      case_number: doc.az,
      legal_area: doc.legalArea,
      keywords: doc.keywords,
      source: "ris-ogd",
      source_url: doc.url,
    },
    { lineWidth: -1, noRefs: true }
  ).trimEnd();

  const text = doc.text || "*Volltext nicht abrufbar — siehe Quelle.*";

  return `---
${frontmatter}
---

# ${title}

${text}

---
*Quelle: [RIS-OGD](${doc.url})*
`;
}

async function main() {
  const args = process.argv.slice(2);
  const outDirIdx = args.indexOf("--out");
  const outDir = outDirIdx >= 0 ? args[outDirIdx + 1] : DEFAULT_OUT;
  const limitIdx = args.indexOf("--limit");
  const globalLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;

  mkdirSync(outDir, { recursive: true });

  let totalFetched = 0;
  let totalWritten = 0;
  let totalSkipped = 0;
  const seen = new Set<string>();

  for (const area of LEGAL_AREAS) {
    if (globalLimit > 0 && totalFetched >= globalLimit) break;

    const areaLimit = globalLimit > 0 ? Math.min(area.limit, globalLimit - totalFetched) : area.limit;
    console.log(`\n=== ${area.label} (query: "${area.query}", limit: ${areaLimit}) ===`);

    let areaCount = 0;
    for (let page = 1; page <= 5 && areaCount < areaLimit; page++) {
      let refs: Array<Record<string, unknown>>;
      try {
        refs = await fetchRisSearch(area.query, page);
      } catch (err) {
        console.error(`  Page ${page} failed: ${err}`);
        break;
      }
      if (refs.length === 0) break;

      for (const ref of refs) {
        if (areaCount >= areaLimit) break;
        const item = mapRisReference(ref, new Date());
        if (!item) continue;

        const id = item.id.replace(/^ris-/, "");
        if (seen.has(id)) {
          totalSkipped++;
          continue;
        }
        seen.add(id);
        totalFetched++;
        areaCount++;

        // Fetch full text from HTML URL in Dokumentliste
        const htmlUrl = extractHtmlUrl(ref);
        const fullText = await fetchRisFullText(htmlUrl);

        const doc: JudikaturDoc = {
          id,
          court: item.court,
          date: item.date,
          az: item.az ?? "",
          ecli: item.ecli,
          legalArea: item.legalArea,
          keywords: item.keywords,
          text: fullText,
          url: item.url,
          title: item.title,
        };

        // Write markdown file
        const slugDate = doc.date.split("T")[0];
        const slugAz = slugify(doc.az || id);
        const filename = `${slugDate}-${slugAz}.md`;
        const filepath = join(outDir, filename);

        if (existsSync(filepath)) {
          totalSkipped++;
          continue;
        }

        const markdown = buildMarkdown(doc);
        writeFileSync(filepath, markdown, "utf-8");
        totalWritten++;

        const textPreview = fullText ? `${fullText.length} chars` : "no text";
        console.log(`  [${totalWritten}] ${doc.court} ${doc.az} (${slugDate}) — ${textPreview}`);

        // Rate limit: 200ms between detail fetches
        await new Promise((r) => setTimeout(r, 200));
      }

      if (refs.length < 100) break;
    }

    console.log(`  → ${areaCount} decisions for ${area.label}`);

    // Rate limit between areas
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Fetched: ${totalFetched}`);
  console.log(`Written: ${totalWritten}`);
  console.log(`Skipped (duplicates): ${totalSkipped}`);
  console.log(`Output: ${outDir}`);
  console.log(`\nImport with:`);
  console.log(`  gbrain sources add law-at-judikatur ${outDir}`);
  console.log(`  gbrain import ${outDir} --source-id law-at-judikatur`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
