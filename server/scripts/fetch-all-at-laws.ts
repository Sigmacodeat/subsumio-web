#!/usr/bin/env bun
/**
 * Fetch ALL Austrian federal laws from RIS OGD API.
 *
 *   bun run server/scripts/fetch-all-at-laws.ts [--dry-run] [--limit N]
 *
 * Paginates through the RIS Bundesrecht API, collects every geltende
 * Bundesgesetz (federal law), cross-references with the local corpus
 * in law-corpus/at/, and downloads any missing laws as markdown files.
 *
 * Uses the same fetchAt() infrastructure as ingest-law-corpus.ts but
 * discovers laws dynamically instead of relying on a hardcoded list.
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const RIS_API = "https://data.bka.gv.at/ris/api/v2.6/Bundesrecht";
const RIS_UA = {
  "User-Agent": "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)",
};

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : 0;

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(_scriptDir, "..", "..", "law-corpus", "at");
const RETRIEVED_AT = new Date().toISOString().slice(0, 10);

// ── Types ──────────────────────────────────────────────────────────────

interface RisLaw {
  gesetzesnummer: string;
  kurztitel: string;
  langtitel?: string;
  dokumentUrl?: string;
}

interface CorpusEntry {
  filename: string;
  abbr: string;
  gesetzesnummer?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function frontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

function stripHtmlSimple(html: string): string {
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
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Load existing corpus ───────────────────────────────────────────────

function loadCorpusIndex(): Map<string, CorpusEntry> {
  const map = new Map<string, CorpusEntry>();
  if (!existsSync(CORPUS_DIR)) return map;

  for (const file of readdirSync(CORPUS_DIR)) {
    if (!file.endsWith(".md")) continue;
    const path = join(CORPUS_DIR, file);
    const content = readFileSync(path, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1];
    const abbrMatch = fm.match(/abbreviation:\s*"?([^"\n]+)"?/);
    const gnrMatch = fm.match(/gesetzesnummer:\s*"?(\d+)"?/);
    const titleMatch = fm.match(/title:\s*"?([^"\n]+)"?/);
    const abbr = abbrMatch ? abbrMatch[1].trim() : file.replace(".md", "");
    const gesetzesnummer = gnrMatch ? gnrMatch[1] : undefined;
    const title = titleMatch ? titleMatch[1].trim() : "";
    map.set(file.replace(".md", ""), { filename: file, abbr, gesetzesnummer });
    // Also index by normalized title for fuzzy matching
    if (title) {
      map.set(normalize(title).toLowerCase(), { filename: file, abbr, gesetzesnummer });
    }
  }
  return map;
}

// ── Filter: only real Gesetze, no Verordnungen ─────────────────────────

function isRelevantLaw(law: RisLaw): boolean {
  const title = law.kurztitel.toLowerCase();

  // ── Exclude COVID-specific temporary laws ──
  if (title.includes("covid")) return false;

  // ── Exclude Nachträge (supplements) ──
  if (title.includes("nachtrag")) return false;

  // ── Exclude numbered one-off laws (e.g. "1. ...", "2. ...", "10. ...") ──
  if (/^\d+\.\s/.test(title)) return false;

  // ── Exclude clearly niche/one-off topics ──
  const nicheKeywords = [
    "section control", "messstrecke", "fahrverbots-aufhebung",
    "partnership for peace", "visaerteilung", "bazillenausscheider",
    "bundesgoldmünze", "goldmünze", "formblatt", "arzneibuch",
    "geschäftsverteilung", "wohnrechtsänderung", "verstaatlichung",
    "wiederauffüllung", "zusatzabkommen", "hochwasserschutz",
    "kunst- und kulturgutbereinigung", "öbb-ü", "schulenversuch",
    "budgetüberschreitung", "budgetbegleit", "budget",
    "staatsvertragsdurchführung", "rückstellungsanspruch",
    "bundesrechenamt", "auflassung",
  ];
  for (const kw of nicheKeywords) {
    if (title.includes(kw)) return false;
  }

  // ── Exclude very short titles (likely not real laws) ──
  if (law.kurztitel.trim().length < 10) return false;

  return true;
}

// ── Check if law is already in corpus ──────────────────────────────────

function isInCorpus(law: RisLaw, corpus: Map<string, CorpusEntry>): boolean {
  // Check by gesetzesnummer
  if (law.gesetzesnummer) {
    for (const entry of corpus.values()) {
      if (entry.gesetzesnummer === law.gesetzesnummer) return true;
    }
  }
  // Check by normalized title match (corpus titles are like "ABGB — Allgemeines bürgerliches Gesetzbuch")
  const normalizedTitle = normalize(law.kurztitel).toLowerCase();
  if (corpus.has(normalizedTitle)) return true;

  // Check if any corpus title CONTAINS the RIS kurztitel or vice versa
  for (const [key, entry] of corpus) {
    // corpus keys include both filename-based and title-based
    // title-based keys are normalized like "abgb — allgemeines bürgerliches gesetzbuch"
    if (key.includes(normalizedTitle) || normalizedTitle.includes(key)) return true;
    // Also check by abbreviation
    if (entry.abbr && normalizedTitle.includes(entry.abbr.toLowerCase().replace(/-at$/, ""))) return true;
  }

  return false;
}

// ── Discover all laws from RIS API ─────────────────────────────────────

async function discoverAllLaws(): Promise<RisLaw[]> {
  const all: RisLaw[] = [];
  const seen = new Set<string>();

  for (let pageNo = 1; pageNo <= 200; pageNo++) {
    const url = `${RIS_API}?Applikation=BrKons&DokumenteProSeite=OneHundred&Seitennummer=${pageNo}`;
    process.stdout.write(`  RIS API page ${pageNo}...`);

    try {
      const res = await fetch(url, { headers: RIS_UA });
      if (!res.ok) {
        console.log(` HTTP ${res.status} — stopping`);
        break;
      }
      const data = (await res.json()) as Record<string, unknown>;
      const result = (data.OgdSearchResult as Record<string, unknown>)
        ?.OgdDocumentResults as Record<string, unknown>;
      let refs = result?.OgdDocumentReference as
        | Array<Record<string, unknown>>
        | Record<string, unknown>
        | undefined;
      if (!refs) {
        console.log(" no more results");
        break;
      }
      if (!Array.isArray(refs)) refs = [refs];

      let count = 0;
      for (const ref of refs as Array<Record<string, unknown>>) {
        const meta = (ref.Data as Record<string, unknown>)?.Metadaten as
          | Record<string, unknown>
          | undefined;
        const bund = meta?.Bundesrecht as Record<string, unknown> | undefined;
        if (!bund) continue;

        const gnr = (bund.BrKons as Record<string, unknown> | undefined)?.Gesetzesnummer
          ?? bund.Gesetzesnummer as string | undefined;
        if (typeof gnr !== "string" || !/^\d+$/.test(gnr)) continue;
        if (seen.has(gnr)) continue;
        seen.add(gnr);

        const kurztitel = normalize(String(bund.Kurztitel ?? ""));
        if (!kurztitel) continue;

        const langtitel = bund.Langtitel ? normalize(String(bund.Langtitel)) : undefined;
        const dokumentUrl = (meta?.Allgemein as Record<string, unknown> | undefined)
          ?.DokumentUrl as string | undefined;

        all.push({ gesetzesnummer: gnr, kurztitel, langtitel, dokumentUrl });
        count++;
      }

      console.log(` ${count} new laws (total: ${all.length})`);

      if ((refs as Array<Record<string, unknown>>).length < 100) break;
      if (LIMIT && all.length >= LIMIT) break;

      // Rate limit — be nice to RIS
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.log(` error: ${err} — stopping`);
      break;
    }
  }

  return all;
}

// ── Fetch a single law via GeltendeFassung ─────────────────────────────

async function fetchLawText(law: RisLaw): Promise<{ markdown: string; versionDate: string } | null> {
  const nr = law.gesetzesnummer;

  // Try GeltendeFassung PDF first
  const pageUrl = `https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=${nr}`;
  try {
    const pageRes = await fetch(pageUrl, { headers: RIS_UA });
    if (pageRes.ok) {
      const pageHtml = await pageRes.text();
      const pdfMatch = pageHtml.match(
        /href="(\/GeltendeFassung\/Bundesnormen\/\d+\/[^"]*Fassung%20vom%20([\d.]+)\.pdf)"/
      );
      if (pdfMatch) {
        const pdfUrl = `https://www.ris.bka.gv.at${pdfMatch[1]}`;
        const [dd, mm, yyyy] = pdfMatch[2].split(".");
        const versionDate = `${yyyy}-${mm}-${dd}`;

        const pdfRes = await fetch(pdfUrl, { headers: RIS_UA });
        if (pdfRes.ok) {
          const { extractDocumentText } = await import("../src/core/extract-document.ts");
          const extracted = await extractDocumentText(
            Buffer.from(await pdfRes.arrayBuffer()),
            ".pdf"
          );
          let text = extracted.text;
          if (text.length < 500 || !text.includes("§")) {
            // Some laws are very short (e.g. Verfassungsgesetze with 1-2 articles)
            if (text.length < 100) return null;
          }
          if (text.length > 4_000_000) text = text.slice(0, 4_000_000);

          const abbr = law.kurztitel.split(" ")[0].replace(/[(),.]/g, "");
          const fm = frontmatter({
            title: `${abbr} — ${law.kurztitel}`,
            type: "law",
            jurisdiction: "at",
            abbreviation: abbr,
            version_date: versionDate,
            retrieved_at: RETRIEVED_AT,
            source_url: pdfUrl,
            gesetzesnummer: nr,
            license:
              "Quelle: RIS (ris.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung.",
          });
          return { markdown: `${fm}\n${text}\n`, versionDate };
        }
      }
    }
  } catch {
    // Fall through to OGD fallback
  }

  // Fallback: OGD norm-by-norm
  return await fetchLawViaOgd(law);
}

async function fetchLawViaOgd(law: RisLaw): Promise<{ markdown: string; versionDate: string } | null> {
  const allText: string[] = [];
  const versionDate = RETRIEVED_AT;

  for (let pageNo = 1; pageNo <= 20; pageNo++) {
    const apiUrl = `${RIS_API}?Applikation=BrKons&Gesetzesnummer=${law.gesetzesnummer}&DokumenteProSeite=OneHundred&Seitennummer=${pageNo}`;
    try {
      const res = await fetch(apiUrl, { headers: RIS_UA });
      if (!res.ok) break;
      const data = (await res.json()) as Record<string, unknown>;
      const result = (data.OgdSearchResult as Record<string, unknown>)
        ?.OgdDocumentResults as Record<string, unknown>;
      let refs = result?.OgdDocumentReference as
        | Array<Record<string, unknown>>
        | Record<string, unknown>
        | undefined;
      if (!refs) break;
      if (!Array.isArray(refs)) refs = [refs];

      for (const ref of refs as Array<Record<string, unknown>>) {
        const d = ref.Data as Record<string, unknown> | undefined;
        if (!d) continue;
        const dokListe = d.Dokumentliste as Record<string, unknown> | undefined;
        if (!dokListe) continue;
        const contentRef = dokListe.ContentReference as Record<string, unknown> | undefined;
        if (!contentRef) continue;
        const urls = contentRef.Urls as Record<string, unknown> | undefined;
        if (!urls) continue;
        const contentUrls = urls.ContentUrl as Array<Record<string, unknown>> | undefined;
        if (!contentUrls) continue;

        const htmlUrl = contentUrls.find((u) => u.DataType === "Html")?.Url as string | undefined;
        if (!htmlUrl) continue;

        const htmlRes = await fetch(htmlUrl, { headers: RIS_UA });
        if (!htmlRes.ok) continue;
        const html = await htmlRes.text();
        const text = stripHtmlSimple(html);
        if (text.length > 50) allText.push(text);
      }

      if ((refs as Array<Record<string, unknown>>).length < 100) break;
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      break;
    }
  }

  if (allText.length === 0) return null;

  let text = allText.join("\n\n---\n\n");
  if (text.length < 200) return null;
  if (text.length > 4_000_000) text = text.slice(0, 4_000_000);

  const abbr = law.kurztitel.split(" ")[0].replace(/[(),.]/g, "");
  const fm = frontmatter({
    title: `${abbr} — ${law.kurztitel}`,
    type: "law",
    jurisdiction: "at",
    abbreviation: abbr,
    version_date: versionDate,
    retrieved_at: RETRIEVED_AT,
    source_url: `https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=BrKons&Gesetzesnummer=${law.gesetzesnummer}`,
    gesetzesnummer: law.gesetzesnummer,
    license:
      "Quelle: RIS OGD (data.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung.",
  });
  return { markdown: `${fm}\n${text}\n`, versionDate };
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Subsumio — Fetch ALL Austrian Federal Laws from RIS     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  // 1. Load existing corpus
  const corpus = loadCorpusIndex();
  console.log(`📁 Existing corpus: ${corpus.size} files in law-corpus/at/`);

  // Build set of known Gesetzesnummern
  const knownGnrs = new Set<string>();
  for (const entry of corpus.values()) {
    if (entry.gesetzesnummer) knownGnrs.add(entry.gesetzesnummer);
  }

  // 2. Discover all laws from RIS
  console.log("\n🔍 Discovering all Austrian federal laws from RIS API...");
  const allLaws = await discoverAllLaws();
  console.log(`📋 RIS returned ${allLaws.length} unique federal laws`);

  // 3. Filter to relevant laws only (no Verordnungen, no COVID, etc.)
  const relevant = allLaws.filter(isRelevantLaw);
  console.log(`🔎 After filtering Verordnungen & niche laws: ${relevant.length} relevant laws`);

  // 4. Find missing laws
  const missing = relevant.filter((l) => !isInCorpus(l, corpus));
  console.log(`\n📊 Gap analysis:`);
  console.log(`   Total on RIS: ${allLaws.length}`);
  console.log(`   Relevant (Gesetze): ${relevant.length}`);
  console.log(`   Already in corpus: ${relevant.length - missing.length}`);
  console.log(`   Missing: ${missing.length}`);

  if (missing.length === 0) {
    console.log("\n✅ Corpus is complete — no missing laws!");
    return;
  }

  // 4. Print missing laws (dry run or preview)
  console.log(`\n📝 Missing laws (first 30):`);
  for (const law of missing.slice(0, 30)) {
    console.log(`   ${law.gesetzesnummer} — ${law.kurztitel}`);
  }
  if (missing.length > 30) {
    console.log(`   ... and ${missing.length - 30} more`);
  }

  if (DRY) {
    console.log("\n🚫 Dry run — no downloads. Remove --dry-run to fetch.");
    return;
  }

  // 5. Download missing laws
  console.log(`\n⬇️  Downloading ${missing.length} missing laws...`);
  mkdirSync(CORPUS_DIR, { recursive: true });

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < missing.length; i++) {
    const law = missing[i];
    const filename = `${slugify(law.kurztitel)}.md`;
    const filepath = join(CORPUS_DIR, filename);

    // Skip if file already exists (by slug)
    if (existsSync(filepath)) {
      skipped++;
      continue;
    }

    process.stdout.write(`   [${i + 1}/${missing.length}] ${law.kurztitel}...`);

    try {
      const result = await fetchLawText(law);
      if (result) {
        writeFileSync(filepath, result.markdown);
        console.log(` ✅ (${Math.round(result.markdown.length / 1024)} KB)`);
        success++;
      } else {
        console.log(` ❌ (fetch failed)`);
        failed++;
      }
    } catch (err) {
      console.log(` ❌ (${err})`);
      failed++;
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n📊 Results:`);
  console.log(`   Downloaded: ${success}`);
  console.log(`   Skipped (exists): ${skipped}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total corpus now: ${corpus.size + success} files`);
  console.log(`\n✅ Done! Run import-statutes-split.ts to import the new laws.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
