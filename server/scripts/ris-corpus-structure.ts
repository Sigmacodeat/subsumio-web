#!/usr/bin/env bun
/**
 * RIS Corpus Structurator — Fix and enrich every corpus file.
 *
 * Cases handled:
 * 1. Broken frontmatter (149 files): content_hash in separate --- block,
 *    real metadata in body → merge into single proper frontmatter
 * 2. No frontmatter (1 file): create from scratch via RIS API lookup
 * 3. Normal frontmatter (2165 files): enrich with RIS API metadata
 *
 * For ALL files: ensure gesetzesnummer is present, then fetch verified
 * metadata from RIS API (typ, kundmachungsorgan, inkrafttretensdatum, etc.)
 *
 *   bun run server/scripts/ris-corpus-structure.ts [--dry-run] [--limit N]
 *
 * NO GUESSING — only writes verified data from RIS API or existing file content.
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const RIS_API = "https://data.bka.gv.at/ris/api/v2.6/Bundesrecht";
const RIS_UA = { "User-Agent": "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)" };
const corpusDir = "law-corpus/at";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 0;

interface RisMeta {
  gesetzesnummer: string;
  kurztitel: string;
  titel?: string;
  typ: string;
  dokumenttyp: string;
  inkrafttretensdatum: string;
  ausserkrafttretensdatum?: string;
  kundmachungsorgan: string;
  stammnormBgblnummer: string;
  gesamtUrl: string;
  eli?: string;
  anzahlNormen: number;
}

const risCache = new Map<string, RisMeta | null>();

async function fetchRisMeta(gnr: string): Promise<RisMeta | null> {
  if (risCache.has(gnr)) return risCache.get(gnr) ?? null;
  const url = `${RIS_API}?Applikation=BrKons&Gesetzesnummer=${gnr}&DokumenteProSeite=OneHundred&Seitennummer=1`;
  try {
    const res = await fetch(url, { headers: RIS_UA });
    if (!res.ok) { risCache.set(gnr, null); return null; }
    const data = await res.json() as any;
    const result = data?.OgdSearchResult?.OgdDocumentResults;
    let refs = result?.OgdDocumentReference;
    if (!refs) { risCache.set(gnr, null); return null; }
    if (!Array.isArray(refs)) refs = [refs];
    const bund = refs[0]?.Data?.Metadaten?.Bundesrecht;
    const brKons = bund?.BrKons;
    if (!brKons) { risCache.set(gnr, null); return null; }
    const hits = result?.Hits?.["#text"];
    const meta: RisMeta = {
      gesetzesnummer: brKons.Gesetzesnummer,
      kurztitel: (bund.Kurztitel || "").trim(),
      titel: bund.Titel,
      typ: brKons.Typ || "",
      dokumenttyp: brKons.Dokumenttyp || "",
      inkrafttretensdatum: brKons.Inkrafttretensdatum || "",
      ausserkrafttretensdatum: brKons.Ausserkrafttretensdatum,
      kundmachungsorgan: brKons.Kundmachungsorgan || "",
      stammnormBgblnummer: brKons.StammnormBgblnummer || "",
      gesamtUrl: brKons.GesamteRechtsvorschriftUrl || "",
      eli: bund.Eli,
      anzahlNormen: parseInt(hits) || refs.length,
    };
    risCache.set(gnr, meta);
    return meta;
  } catch {
    risCache.set(gnr, null);
    return null;
  }
}

async function lookupGnrByTitle(title: string): Promise<RisMeta | null> {
  const url = `${RIS_API}?Applikation=BrKons&Titel=${encodeURIComponent(title)}&DokumenteProSeite=OneHundred&Seitennummer=1`;
  try {
    const res = await fetch(url, { headers: RIS_UA });
    if (!res.ok) return null;
    const data = await res.json() as any;
    let refs = data?.OgdSearchResult?.OgdDocumentResults?.OgdDocumentReference;
    if (!refs) return null;
    if (!Array.isArray(refs)) refs = [refs];
    const byGnr = new Map<string, { kurztitel: string; typ: string }>();
    for (const ref of refs) {
      const bund = ref?.Data?.Metadaten?.Bundesrecht;
      const brKons = bund?.BrKons;
      if (brKons?.Gesetzesnummer) {
        const kt = (bund.Kurztitel || "").trim();
        if (!byGnr.has(brKons.Gesetzesnummer)) {
          byGnr.set(brKons.Gesetzesnummer, { kurztitel: kt, typ: brKons.Typ || "" });
        }
      }
    }
    const titleLower = title.toLowerCase().trim();
    for (const [gnr, info] of byGnr) {
      if (info.kurztitel.toLowerCase().trim() === titleLower) return await fetchRisMeta(gnr);
    }
    for (const [gnr, info] of byGnr) {
      if (info.kurztitel.toLowerCase().startsWith(titleLower) || titleLower.startsWith(info.kurztitel.toLowerCase())) {
        return await fetchRisMeta(gnr);
      }
    }
    return null;
  } catch {
    return null;
  }
}

function parseYamlLines(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) fields[m[1]] = m[2].replace(/^"|"$/g, "").trim();
  }
  return fields;
}

type FileStructure =
  | { type: "normal"; fm: Record<string, string>; body: string }
  | { type: "broken"; strayMeta: Record<string, string>; body: string }
  | { type: "none"; body: string };

function analyzeFile(content: string): FileStructure {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return { type: "none", body: content };

  const firstFm = parseYamlLines(fmMatch[1]);
  const afterFirstFm = content.slice(fmMatch[0].length);

  if (afterFirstFm.match(/^title:\s/) && fmMatch[1].trim().match(/^content_hash:/)) {
    const secondFmMatch = afterFirstFm.match(/^([\s\S]*?)\n---\n/);
    if (secondFmMatch) {
      const strayMeta = parseYamlLines(secondFmMatch[1]);
      const body = afterFirstFm.slice(secondFmMatch[0].length);
      return { type: "broken", strayMeta, body };
    }
  }

  return { type: "normal", fm: firstFm, body: afterFirstFm };
}

function buildFrontmatter(fm: Record<string, string>): string {
  const order = [
    "title", "type", "jurisdiction", "abbreviation", "gesetzesnummer",
    "typ", "kundmachungsorgan", "inkrafttretensdatum", "ausserkrafttretensdatum",
    "version_date", "retrieved_at", "source_url", "eli",
    "content_hash", "license",
  ];
  const lines: string[] = ["---"];
  const seen = new Set<string>();
  for (const key of order) {
    if (fm[key] !== undefined && fm[key] !== "") {
      const val = fm[key];
      const needsQuoting = val.includes(":") || val.includes("#") || val.includes('"') || val.includes("—") || val.includes("–");
      lines.push(`${key}: ${needsQuoting ? `"${val.replace(/"/g, '\\"')}"` : val}`);
      seen.add(key);
    }
  }
  for (const [key, val] of Object.entries(fm)) {
    if (!seen.has(key) && val !== undefined && val !== "") {
      const needsQuoting = val.includes(":") || val.includes("#") || val.includes('"') || val.includes("—") || val.includes("–");
      lines.push(`${key}: ${needsQuoting ? `"${val.replace(/"/g, '\\"')}"` : val}`);
    }
  }
  lines.push("---");
  return lines.join("\n") + "\n";
}

function extractGnrFromUrl(url: string): string | undefined {
  const pathMatch = url.match(/\/(\d{8})\//);
  if (pathMatch) return pathMatch[1];
  const paramMatch = url.match(/Gesetzesnummer=(\d+)/);
  if (paramMatch) return paramMatch[1];
  return undefined;
}

function enrichWithRis(fm: Record<string, string>, ris: RisMeta): boolean {
  let changed = false;
  if (!fm.typ && ris.typ) { fm.typ = ris.typ; changed = true; }
  if (!fm.kundmachungsorgan && ris.kundmachungsorgan) { fm.kundmachungsorgan = ris.kundmachungsorgan; changed = true; }
  if (!fm.inkrafttretensdatum && ris.inkrafttretensdatum) { fm.inkrafttretensdatum = ris.inkrafttretensdatum; changed = true; }
  if (!fm.ausserkrafttretensdatum && ris.ausserkrafttretensdatum) { fm.ausserkrafttretensdatum = ris.ausserkrafttretensdatum; changed = true; }
  if (!fm.eli && ris.eli) { fm.eli = ris.eli; changed = true; }
  return changed;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  RIS Corpus Structurator — Fix & Enrich Every File       ║");
  console.log(`║  Mode: ${DRY ? "DRY RUN                    " : "WRITE                       "}   ║`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const files = readdirSync(corpusDir).filter(f => f.endsWith(".md")).sort();
  const toProcess = LIMIT > 0 ? files.slice(0, LIMIT) : files;

  const stats = {
    total: toProcess.length,
    brokenFixed: 0,
    noneFixed: 0,
    enriched: 0,
    gnrFromUrl: 0,
    gnrFromApi: 0,
    alreadyComplete: 0,
    notFoundInRis: 0,
    written: 0,
    skipped: 0,
  };

  for (let i = 0; i < toProcess.length; i++) {
    const filename = toProcess[i];
    const filepath = join(corpusDir, filename);
    const content = readFileSync(filepath, "utf-8");
    const structure = analyzeFile(content);

    let fm: Record<string, string> = {};
    let body = "";

    if (structure.type === "normal") {
      fm = { ...structure.fm };
      body = structure.body;
    } else if (structure.type === "broken") {
      fm = { ...structure.strayMeta };
      body = structure.body;
      stats.brokenFixed++;
    } else {
      body = structure.body;
      stats.noneFixed++;
    }

    // Step 1: Ensure gesetzesnummer
    let gnr = fm.gesetzesnummer;
    let gnrSource = "existing";

    if (!gnr && fm.source_url) {
      const extracted = extractGnrFromUrl(fm.source_url);
      if (extracted) {
        gnr = extracted;
        gnrSource = "source_url";
        fm.gesetzesnummer = gnr;
        stats.gnrFromUrl++;
      }
    }

    if (!gnr) {
      const titleFromFilename = filename.replace(/\.md$/, "").replace(/-/g, " ").trim();
      const searchTitle = fm.title
        ? fm.title.replace(/^.*?—\s*/, "").replace(/\(.*?\)/g, "").trim()
        : titleFromFilename;

      process.stdout.write(`  [${i + 1}/${toProcess.length}] 🔍 ${filename.slice(0, 50)}...`);
      const risMeta = await lookupGnrByTitle(searchTitle);
      if (risMeta) {
        gnr = risMeta.gesetzesnummer;
        gnrSource = "ris_api";
        fm.gesetzesnummer = gnr;
        console.log(` ✅ gnr=${gnr}`);
        stats.gnrFromApi++;
      } else {
        console.log(` ❌ NOT FOUND in RIS`);
        stats.notFoundInRis++;
        stats.skipped++;
        continue;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    // Step 2: Fetch RIS metadata for enrichment
    let risMeta: RisMeta | null = null;
    if (gnr) {
      risMeta = await fetchRisMeta(gnr);
      if (!risMeta) {
        process.stdout.write(`  [${i + 1}/${toProcess.length}] 📊 ${filename.slice(0, 50)}... fetching RIS meta...`);
        risMeta = await fetchRisMeta(gnr);
        console.log(risMeta ? ` ✅` : ` ❌`);
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // Step 3: Enrich with verified RIS metadata
    if (risMeta) {
      const enriched = enrichWithRis(fm, risMeta);
      if (enriched) stats.enriched++;
    }

    // Step 4: Ensure required fields
    if (!fm.type) fm.type = "law";
    if (!fm.jurisdiction) fm.jurisdiction = "at";

    // Step 5: Build new frontmatter and check if changed
    const newFm = buildFrontmatter(fm);
    const oldFmMatch = content.match(/^---\n[\s\S]*?\n---\n/);
    const oldFm = oldFmMatch ? oldFmMatch[0] : "";

    if (newFm === oldFm && structure.type === "normal") {
      stats.alreadyComplete++;
      continue;
    }

    // Step 6: Write
    const newContent = newFm + body;
    if (DRY) {
      console.log(`  [${i + 1}/${toProcess.length}] 📝 DRY — would write ${filename} (${structure.type})`);
    } else {
      writeFileSync(filepath, newContent);
      stats.written++;
    }

    if (i > 0 && i % 100 === 0) {
      console.log(`  ... ${i}/${toProcess.length} processed ...`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  STRUCTURATOR SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Total files:              ${stats.total}`);
  console.log(`  Broken frontmatter fixed: ${stats.brokenFixed}`);
  console.log(`  No frontmatter fixed:     ${stats.noneFixed}`);
  console.log(`  Normal enriched:          ${stats.enriched}`);
  console.log(`  Gnr from source_url:      ${stats.gnrFromUrl}`);
  console.log(`  Gnr from RIS API lookup:  ${stats.gnrFromApi}`);
  console.log(`  Already complete:         ${stats.alreadyComplete}`);
  console.log(`  Not found in RIS:         ${stats.notFoundInRis}`);
  console.log(`  Files written:            ${stats.written}`);
  console.log(`  Skipped:                  ${stats.skipped}`);
  if (DRY) console.log(`  (DRY RUN — no files modified)`);
}

main().catch(console.error);
