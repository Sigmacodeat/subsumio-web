#!/usr/bin/env bun
/**
 * Fetch ALL missing Austrian legal corpus data from RIS OGD API.
 *
 * Covers:
 *   1. BVwG (Bundesverwaltungsgericht) Judikatur
 *   2. BFG (Bundesfinanzgericht) Judikatur
 *   3. LVwG (Landesverwaltungsgerichte) Judikatur — all 9 states
 *   4. Staatsverträge (from BrKons API, filtered by document type)
 *   5. Landesrecht (Landesgesetze + Landesverordnungen) — all 9 states
 *
 * Usage:
 *   bun run server/scripts/fetch-at-complete-corpus.ts [--dry-run] [--phase judikatur|staatsvertraege|landesrecht|all]
 *
 * Output directories:
 *   server/law-corpus/at-judikatur-bvwg/   — BVwG decisions
 *   server/law-corpus/at-judikatur-bfg/    — BFG decisions
 *   server/law-corpus/at-judikatur-lvwg/   — LVwG decisions
 *   law-corpus/at-staatsvertraege/          — Staatsverträge
 *   law-corpus/at-landesrecht/              — Landesrecht (per-state subdirs)
 *
 * RIS OGD API: https://data.bka.gv.at/ris/api/v2.6
 * No auth required (public OGD).
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { dump as yamlDump } from "js-yaml";

// ── Config ─────────────────────────────────────────────────────────────

const RIS_BASE = "https://data.bka.gv.at/ris/api/v2.6";
const RIS_UA = {
  "User-Agent": "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)",
};
const RATE_LIMIT_MS = 200;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const phaseIdx = args.indexOf("--phase");
const PHASE = phaseIdx >= 0 ? args[phaseIdx + 1] : "all";

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const SERVER_LAW_CORPUS = join(_scriptDir, "..", "law-corpus");
const FRONTEND_LAW_CORPUS = join(_scriptDir, "..", "..", "law-corpus");
const RETRIEVED_AT = new Date().toISOString().slice(0, 10);

// ── Court configs for missing judikatur ────────────────────────────────

interface CourtConfig {
  applikation: string;
  outDir: string;
  label: string;
  target: number;
}

// NOTE: BFG (Bundesfinanzgericht) is NOT available via RIS OGD API V2.6.
// Valid judikatur applications: Justiz, Vfgh, Vwgh, Bvwg, Lvwg, Dsk, Dok,
// Pvak, Gbk, Uvs, AsylGH, Ubas, Umse, Bks, Verg.
// AsylGH = Asylgerichtshof (predecessor of BVwG for asylum, 2008-2020)
// Uvs = Unabhängige Verwaltungssenate (predecessors of LVwG, pre-2014)
const NEW_COURTS: Record<string, CourtConfig> = {
  bvwg: { applikation: "Bvwg", outDir: "at-judikatur-bvwg", label: "BVwG (Bundesverwaltungsgericht)", target: 500 },
  lvwg: { applikation: "Lvwg", outDir: "at-judikatur-lvwg", label: "LVwG (Landesverwaltungsgerichte)", target: 500 },
  asylgh: { applikation: "AsylGH", outDir: "at-judikatur-asylgh", label: "AsylGH (Asylgerichtshof, historisch)", target: 200 },
  uvs: { applikation: "Uvs", outDir: "at-judikatur-uvs", label: "Uvs (Unabhängige Verwaltungssenate, historisch)", target: 200 },
};

// ── Austrian states (Bundesländer) for Landesrecht ─────────────────────

const AT_STATES = [
  { code: "1", name: "Burgenland", abbr: "bgld" },
  { code: "2", name: "Kärnten", abbr: "ktnt" },
  { code: "3", name: "Niederösterreich", abbr: "noe" },
  { code: "4", name: "Oberösterreich", abbr: "ooe" },
  { code: "5", name: "Salzburg", abbr: "sbzg" },
  { code: "6", name: "Steiermark", abbr: "stmk" },
  { code: "7", name: "Tirol", abbr: "tirol" },
  { code: "8", name: "Vorarlberg", abbr: "vbg" },
  { code: "9", name: "Wien", abbr: "wien" },
];

// ── Search terms for judikatur (norm-prioritized) ──────────────────────

const JUDIKATUR_SEARCH_TERMS: string[] = [
  "ABGB", "B-VG", "Baupolizei", "Baurecht", "Gewerbeordnung",
  "GewO", "AVG", "VStG", "VVG", "AsylG", "AufenthG", "FPG",
  "SPG", "WaffG", "SMG", "StVO", "Wasserrecht", "WRG",
  "Abfall", "AWG", "ForstG", "Umwelt", "Naturschutz",
  "Jagd", "Fischerei", "Bauleitplan", "Raumordnung",
  "Schulrecht", "Beamte", "BDG", "Verfassungsrecht",
  "Grundrechte", "Verwaltungsvollstreckung", "Finanzstraf",
  "FinStrG", "BAO", "BewG", "UStG", "EStG", "KStG",
  "Gebührengesetz", "GebG", "Zoll", "Maut",
  "Amtshaftung", "AHG", "Sicherheitspolizeigesetz",
  "Fremdenrecht", "Ausländer", "Integration",
];


// ── Types ──────────────────────────────────────────────────────────────

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

interface LandesrechtDoc {
  id: string;
  title: string;
  state: string;
  text: string;
  url: string;
  kurztitel: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalize(s: string): string {
  return s.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
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

function frontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

async function fetchWithRetry(
  url: string,
  maxRetries: number = MAX_RETRIES
): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: RIS_UA,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429 || res.status >= 500) {
        const backoff = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`  ⚠ HTTP ${res.status}, retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const backoff = RETRY_BASE_MS * Math.pow(2, attempt);
      console.warn(`  ⚠ Fetch error, retrying in ${backoff}ms: ${lastErr.message}`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr ?? new Error("fetchWithRetry exhausted");
}

// ── Extract references from RIS search results ─────────────────────────

function extractRisReferences(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const result = (data.OgdSearchResult as Record<string, unknown>)
    ?.OgdDocumentResults as Record<string, unknown> | undefined;
  if (!result) return [];
  let refs = result.OgdDocumentReference;
  if (!refs) return [];
  if (!Array.isArray(refs)) refs = [refs];
  return refs as Array<Record<string, unknown>>;
}

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
  if (urlArr.length > 0) {
    const first = urlArr[0] as Record<string, unknown>;
    return String(first.Url ?? "");
  }
  return "";
}

function mapRisReference(ref: Record<string, unknown>): {
  id: string;
  court: string;
  date: string;
  az: string | null;
  ecli: string | null;
  legalArea: string;
  keywords: string[];
  url: string;
  title: string;
} | null {
  const data = (ref.Data ?? {}) as Record<string, unknown>;
  const meta = (data.Metadaten ?? {}) as Record<string, unknown>;

  // Judikatur metadata — structure varies by court:
  // OGH/VfGH/VwGH: judikatur.Justiz / .Vfgh / .Vwgh with Geschaeftszahl as string
  // BVwG/LVwG/AsylGH/Uvs: judikatur.Bvwg / .Lvwg / .AsylGH / .Uvs with Geschaeftszahl as {item: "..."}
  const judikatur = meta.Judikatur as Record<string, unknown> | undefined;
  if (judikatur) {
    const justiz = (judikatur.Justiz ?? judikatur.Vfgh ?? judikatur.Vwgh ??
      judikatur.Bvwg ?? judikatur.Lvwg ?? judikatur.AsylGH ?? judikatur.Uvs) as
      Record<string, unknown> | undefined;
    if (!justiz) return null;

    // Geschaeftszahl can be string or {item: "..."} or {item: ["...", "..."]}
    const rawGz = judikatur.Geschaeftszahl ?? justiz.Geschaeftszahl;
    let az = "";
    if (typeof rawGz === "string") {
      az = rawGz;
    } else if (rawGz && typeof rawGz === "object") {
      const item = (rawGz as Record<string, unknown>).item;
      if (typeof item === "string") az = item;
      else if (Array.isArray(item)) az = String(item[0] ?? "");
    }

    // ECLI: OGH uses "Ecli", BVwG/LVwG use "EuropeanCaseLawIdentifier"
    const ecli = String(
      judikatur.EuropeanCaseLawIdentifier ?? judikatur.Ecli ?? justiz.Ecli ?? ""
    );

    // Entscheidungsdatum is on judikatur level for BVwG/LVwG, on justiz for OGH
    const decisionDate = String(
      judikatur.Entscheidungsdatum ?? justiz.Entscheidungsdatum ?? ""
    );

    // Schlagworte (keywords) — on judikatur level for BVwG/LVwG
    const keywords: string[] = [];
    const rawSchlagworte = judikatur.Schlagworte ?? justiz.Schlagworte;
    if (rawSchlagworte) {
      const swStr = String(rawSchlagworte);
      for (const kw of swStr.split(/<br\s*\/?>|\n|;/)) {
        const s = kw.trim();
        if (s) keywords.push(s);
      }
    }
    // Also check Rechtssaetze.Keywords (OGH format)
    const rechtssaetze = justiz.Rechtssaetze as Record<string, unknown> | undefined;
    const keywordsRaw = rechtssaetze?.Keywords;
    if (keywordsRaw) {
      const kwArr = Array.isArray(keywordsRaw) ? keywordsRaw : [keywordsRaw];
      for (const kw of kwArr) {
        const s = String((kw as Record<string, unknown>)?.Content ?? kw ?? "").trim();
        if (s && !keywords.includes(s)) keywords.push(s);
      }
    }

    const dokumentUrl = String((meta.Allgemein as Record<string, unknown>)?.DokumentUrl ?? "");
    const url = extractHtmlUrl(ref) || dokumentUrl;

    const courtName = String(justiz.Gericht ?? justiz.Name ?? "");
    const technisch = meta.Technisch as Record<string, unknown> | undefined;
    const organ = String(technisch?.Organ ?? courtName);

    return {
      id: `ris-${az || ecli || url}`,
      court: courtName || organ,
      date: decisionDate || RETRIEVED_AT,
      az: az || null,
      ecli: ecli || null,
      legalArea: String(justiz.Rechtsgebiet ?? justiz.Indizes ?? ""),
      keywords,
      url,
      title: az || ecli || courtName,
    };
  }

  return null;
}

async function fetchRisFullText(htmlUrl: string): Promise<string> {
  if (!htmlUrl) return "";
  try {
    const res = await fetchWithRetry(htmlUrl);
    if (!res.ok) return "";
    const html = await res.text();
    return stripHtmlSimple(html);
  } catch {
    return "";
  }
}

// ── Judikatur: search + fetch ──────────────────────────────────────────

async function fetchJudikaturSearch(
  query: string,
  page: number,
  applikation: string,
  dateFrom?: string,
): Promise<Array<Record<string, unknown>>> {
  const url = new URL(`${RIS_BASE}/judikatur`);
  url.searchParams.set("Applikation", applikation);
  url.searchParams.set("Suchworte", query);
  url.searchParams.set("DokumenteProSeite", "OneHundred");
  url.searchParams.set("Seitennummer", String(page));
  if (dateFrom) url.searchParams.set("EntscheidungsdatumVon", dateFrom);

  const res = await fetchWithRetry(url.toString());
  if (!res.ok) throw new Error(`RIS-OGD HTTP ${res.status} for query "${query}"`);
  const data = (await res.json()) as Record<string, unknown>;
  return extractRisReferences(data);
}

function buildJudikaturMarkdown(doc: JudikaturDoc, courtKey: string): string {
  const title = `${doc.court} — ${doc.az || "Entscheidung"}`;
  const fm = yamlDump(
    {
      type: "court_decision",
      jurisdiction: "at",
      court_type: courtKey,
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
  return `---\n${fm}\n---\n\n# ${title}\n\n${text}\n\n---\n*Quelle: [RIS-OGD](${doc.url})*\n`;
}

async function fetchJudikaturForCourt(courtKey: string, court: CourtConfig): Promise<void> {
  const outDir = join(SERVER_LAW_CORPUS, court.outDir);
  mkdirSync(outDir, { recursive: true });

  // AsylGH-specific search terms (asylum court, 2008-2020)
  const ASYLGH_SEARCH_TERMS = [
    "Asyl", "Fremdenrecht", "Aufenthalt", "Abschiebung",
    "Flüchtling", "subsidiär", "internationaler Schutz",
    "AsylG", "AufenthG", "FPG", "Genfer Flüchtlingskonvention",
    "Dublin", "Verfahren", "B-VG", "Menschenrechte",
  ];
  // Uvs-specific search terms (historical, pre-2014)
  const UVS_SEARCH_TERMS = [
    "AVG", "VStG", "Gewerbe", "Baurecht", "Bau",
    "Fremdenrecht", "Aufenthalt", "Asyl", "SPG",
    "WaffG", "SMG", "StVO", "Wasser", "Abfall",
    "Naturschutz", "Jagd", "Forst", "Schulrecht",
    "Beamte", "Verfassung", "Grundrechte", "AsylG",
  ];

  const searchTerms = courtKey === "asylgh" ? ASYLGH_SEARCH_TERMS
    : courtKey === "uvs" ? UVS_SEARCH_TERMS
    : JUDIKATUR_SEARCH_TERMS;
  const target = court.target;
  const perNormLimit = Math.ceil(target / searchTerms.length) + 10;
  // Historical courts: use earlier date range
  const dateFrom = courtKey === "asylgh" ? "2008-01-01"
    : courtKey === "uvs" ? "2000-01-01"
    : "2015-01-01";

  let totalFetched = 0;
  let totalWritten = 0;
  let totalSkipped = 0;
  const seen = new Set<string>();

  console.log(`\n  Target: ≥${target} decisions | Date: ${dateFrom}→now`);
  console.log(`  Output: ${outDir}`);

  for (const term of searchTerms) {
    if (totalFetched >= target) break;

    let normCount = 0;
    for (let page = 1; page <= 30 && normCount < perNormLimit; page++) {
      if (totalFetched >= target) break;

      let refs: Array<Record<string, unknown>>;
      try {
        refs = await fetchJudikaturSearch(term, page, court.applikation, dateFrom);
      } catch (err) {
        console.error(`  Page ${page} failed: ${err}`);
        break;
      }
      if (refs.length === 0) break;

      for (const ref of refs) {
        if (normCount >= perNormLimit || totalFetched >= target) break;
        const item = mapRisReference(ref);
        if (!item) continue;

        const id = item.id.replace(/^ris-/, "");
        if (seen.has(id)) { totalSkipped++; continue; }
        seen.add(id);
        totalFetched++;
        normCount++;

        const slugDate = item.date.split("T")[0];
        const slugAz = slugify(item.az || id);
        const filename = `${slugDate}-${slugAz}.md`;
        const filepath = join(outDir, filename);

        if (existsSync(filepath)) { totalSkipped++; continue; }

        if (DRY) {
          console.log(`  [DRY] ${item.court} ${item.az} (${slugDate})`);
          totalWritten++;
          continue;
        }

        const fullText = await fetchRisFullText(extractHtmlUrl(ref));

        const doc: JudikaturDoc = {
          id,
          court: item.court,
          date: item.date,
          az: item.az ?? "",
          ecli: item.ecli ?? undefined,
          legalArea: item.legalArea,
          keywords: item.keywords,
          text: fullText,
          url: item.url,
          title: item.title,
        };

        writeFileSync(filepath, buildJudikaturMarkdown(doc, courtKey), "utf-8");
        totalWritten++;

        if (totalWritten % 50 === 0 || totalWritten <= 3) {
          const textPreview = fullText ? `${fullText.length} chars` : "no text";
          console.log(`  [${totalWritten}] ${item.court} ${item.az} (${slugDate}) — ${textPreview}`);
        }

        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
      }

      if (refs.length < 100) break;
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }

    console.log(`  → ${normCount} for ${term} (total: ${totalFetched})`);
    if (totalFetched < target) await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`  ${court.label}: Fetched=${totalFetched} Written=${totalWritten} Skipped=${totalSkipped}`);
}

// ── Staatsverträge: fetch from BrKons ──────────────────────────────────

async function fetchStaatsvertraege(): Promise<void> {
  const outDir = join(FRONTEND_LAW_CORPUS, "at-staatsvertraege");
  mkdirSync(outDir, { recursive: true });

  const searchTerms = [
    "Staatsvertrag", "Übereinkommen", "Abkommen",
    "Konvention", "Protokoll", "Europäische Menschenrechtskonvention",
    "EMRK", "UN-Konvention", "Hague", "Haager",
  ];

  let totalWritten = 0;
  let totalSkipped = 0;
  const seen = new Set<string>();

  console.log(`\n  Output: ${outDir}`);

  for (const term of searchTerms) {
    console.log(`\n  Search: "${term}"`);

    for (let page = 1; page <= 50; page++) {
      const url = new URL(`${RIS_BASE}/Bundesrecht`);
      url.searchParams.set("Applikation", "BrKons");
      url.searchParams.set("Suchworte", term);
      url.searchParams.set("DokumenteProSeite", "OneHundred");
      url.searchParams.set("Seitennummer", String(page));

      let refs: Array<Record<string, unknown>>;
      try {
        const res = await fetchWithRetry(url.toString());
        if (!res.ok) break;
        const data = (await res.json()) as Record<string, unknown>;
        refs = extractRisReferences(data);
      } catch (err) {
        console.error(`  Page ${page} failed: ${err}`);
        break;
      }
      if (refs.length === 0) break;

      for (const ref of refs) {
        const data = (ref.Data ?? {}) as Record<string, unknown>;
        const meta = (data.Metadaten ?? {}) as Record<string, unknown>;
        const bund = (meta.Bundesrecht ?? {}) as Record<string, unknown>;
        if (!bund) continue;

        const gnr = String(bund.Gesetzesnummer ?? "");
        const kurztitel = normalize(String(bund.Kurztitel ?? ""));
        if (!kurztitel) continue;

        // Filter: only Staatsverträge (not regular Gesetze)
        const titleLower = kurztitel.toLowerCase();
        const isStaatsvertrag =
          titleLower.includes("staatsvertrag") ||
          titleLower.includes("übereinkommen") ||
          titleLower.includes("abkommen") ||
          titleLower.includes("konvention") ||
          titleLower.includes("protokoll") ||
          titleLower.includes("emrk") ||
          titleLower.includes("menschenrechtskonvention");
        if (!isStaatsvertrag) continue;

        const id = gnr || kurztitel;
        if (seen.has(id)) { totalSkipped++; continue; }
        seen.add(id);

        const filename = `${slugify(kurztitel)}.md`;
        const filepath = join(outDir, filename);
        if (existsSync(filepath)) { totalSkipped++; continue; }

        if (DRY) {
          console.log(`  [DRY] ${kurztitel}`);
          totalWritten++;
          continue;
        }

        // Fetch full text
        const htmlUrl = extractHtmlUrl(ref);
        let fullText = "";
        if (htmlUrl) {
          fullText = await fetchRisFullText(htmlUrl);
        }

        if (fullText.length < 200) {
          // Try OGD norm-by-norm fallback
          fullText = await fetchStaatsvertragViaOgd(gnr);
        }

        if (fullText.length < 200) {
          console.log(`  ⚠ Skip (too short): ${kurztitel}`);
          totalSkipped++;
          continue;
        }

        if (fullText.length > 4_000_000) fullText = fullText.slice(0, 4_000_000);

        const fm = frontmatter({
          title: kurztitel,
          type: "staatsvertrag",
          jurisdiction: "at",
          abbreviation: kurztitel.split(" ")[0].replace(/[(),.]/g, ""),
          version_date: RETRIEVED_AT,
          retrieved_at: RETRIEVED_AT,
          source_url: htmlUrl || `https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=BrKons&Gesetzesnummer=${gnr}`,
          gesetzesnummer: gnr,
          license: "Quelle: RIS OGD (data.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung.",
        });

        writeFileSync(filepath, `${fm}\n${fullText}\n`, "utf-8");
        totalWritten++;
        console.log(`  [${totalWritten}] ${kurztitel} (${Math.round(fullText.length / 1024)} KB)`);

        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
      }

      if (refs.length < 100) break;
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  console.log(`\n  Staatsverträge: Written=${totalWritten} Skipped=${totalSkipped}`);
}

async function fetchStaatsvertragViaOgd(gnr: string): Promise<string> {
  if (!gnr) return "";
  const allText: string[] = [];

  for (let page = 1; page <= 20; page++) {
    const url = `${RIS_BASE}/Bundesrecht?Applikation=BrKons&Gesetzesnummer=${gnr}&DokumenteProSeite=OneHundred&Seitennummer=${page}`;
    try {
      const res = await fetchWithRetry(url);
      if (!res.ok) break;
      const data = (await res.json()) as Record<string, unknown>;
      const refs = extractRisReferences(data);
      if (refs.length === 0) break;

      for (const ref of refs) {
        const htmlUrl = extractHtmlUrl(ref);
        if (!htmlUrl) continue;
        const htmlRes = await fetchWithRetry(htmlUrl);
        if (!htmlRes.ok) continue;
        const html = await htmlRes.text();
        const text = stripHtmlSimple(html);
        if (text.length > 50) allText.push(text);
      }

      if (refs.length < 100) break;
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      break;
    }
  }

  return allText.join("\n\n---\n\n");
}

// ── Landesrecht: fetch from LrKons API ─────────────────────────────────

async function fetchLandesrecht(): Promise<void> {
  const outDir = join(FRONTEND_LAW_CORPUS, "at-landesrecht");
  mkdirSync(outDir, { recursive: true });

  // Create per-state subdirs
  for (const state of AT_STATES) {
    mkdirSync(join(outDir, state.abbr), { recursive: true });
  }

  let totalWritten = 0;
  let totalSkipped = 0;
  const seen = new Set<string>();
  const stateCounts: Record<string, number> = {};

  console.log(`\n  Paginating through ALL Landesrecht (API doesn't filter by state)\n`);

  for (let page = 1; page <= 500; page++) {
    const url = new URL(`${RIS_BASE}/Landesrecht`);
    url.searchParams.set("Applikation", "LrKons");
    url.searchParams.set("DokumenteProSeite", "OneHundred");
    url.searchParams.set("Seitennummer", String(page));

    let refs: Array<Record<string, unknown>>;
    try {
      const res = await fetchWithRetry(url.toString());
      if (!res.ok) {
        console.log(`  HTTP ${res.status} — stopping`);
        break;
      }
      const data = (await res.json()) as Record<string, unknown>;
      refs = extractRisReferences(data);
    } catch (err) {
      console.error(`  Page ${page} failed: ${err}`);
      break;
    }
    if (refs.length === 0) {
      console.log(`  Page ${page}: no results — done`);
      break;
    }

    let pageCount = 0;
    for (const ref of refs) {
      const data = (ref.Data ?? {}) as Record<string, unknown>;
      const meta = (data.Metadaten ?? {}) as Record<string, unknown>;
      const land = (meta.Landesrecht ?? {}) as Record<string, unknown>;
      if (!land) continue;

      const bundesland = normalize(String(land.Bundesland ?? ""));
      if (!bundesland) continue;

      // Match to our state list
      const stateMatch = AT_STATES.find(s =>
        bundesland.toLowerCase() === s.name.toLowerCase()
      );
      if (!stateMatch) continue;

      const gnr = String(land.Gesetzesnummer ?? "");
      const kurztitel = normalize(String(land.Kurztitel ?? ""));
      if (!kurztitel) continue;

      // Filter: skip very niche/one-off laws
      const titleLower = kurztitel.toLowerCase();
      if (titleLower.includes("covid")) continue;
      if (/^\d+\.\s/.test(titleLower)) continue;
      if (kurztitel.trim().length < 10) continue;

      const id = `${stateMatch.abbr}-${gnr || kurztitel}`;
      if (seen.has(id)) { totalSkipped++; continue; }
      seen.add(id);

      const stateDir = join(outDir, stateMatch.abbr);
      const filename = `${slugify(kurztitel)}.md`;
      const filepath = join(stateDir, filename);
      if (existsSync(filepath)) { totalSkipped++; continue; }

      if (DRY) {
        console.log(`  [DRY] ${stateMatch.abbr}/${kurztitel}`);
        totalWritten++;
        pageCount++;
        continue;
      }

      // Fetch full text
      const htmlUrl = extractHtmlUrl(ref);
      let fullText = "";
      if (htmlUrl) {
        fullText = await fetchRisFullText(htmlUrl);
      }

      if (fullText.length < 200) {
        totalSkipped++;
        continue;
      }

      if (fullText.length > 4_000_000) fullText = fullText.slice(0, 4_000_000);

      const isVerordnung = titleLower.includes("verordnung");
      const fm = frontmatter({
        title: kurztitel,
        type: isVerordnung ? "landesverordnung" : "landesgesetz",
        jurisdiction: "at",
        state: stateMatch.name,
        state_code: stateMatch.abbr,
        abbreviation: kurztitel.split(" ")[0].replace(/[(),.]/g, ""),
        version_date: RETRIEVED_AT,
        retrieved_at: RETRIEVED_AT,
        source_url: htmlUrl || "",
        gesetzesnummer: gnr,
        license: "Quelle: RIS OGD (data.bka.gv.at), Landesrecht konsolidiert — Open Government Data, Namensnennung.",
      });

      writeFileSync(filepath, `${fm}\n${fullText}\n`, "utf-8");
      totalWritten++;
      pageCount++;
      stateCounts[stateMatch.abbr] = (stateCounts[stateMatch.abbr] || 0) + 1;

      if (totalWritten % 50 === 0 || pageCount <= 2) {
        console.log(`  [${totalWritten}] ${stateMatch.abbr}/${kurztitel} (${Math.round(fullText.length / 1024)} KB)`);
      }

      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }

    if (page % 10 === 0) {
      console.log(`  Page ${page}: ${totalWritten} written, ${totalSkipped} skipped`);
    }

    if (refs.length < 100) break;
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  console.log(`\n  Landesrecht Summary:`);
  for (const state of AT_STATES) {
    console.log(`    ${state.name}: ${stateCounts[state.abbr] || 0} files`);
  }
  console.log(`  Total: Written=${totalWritten} Skipped=${totalSkipped}`);
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Subsumio — Fetch Complete AT Legal Corpus               ║");
  console.log("║  BVwG + BFG + LVwG + Staatsverträge + Landesrecht        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log();

  if (DRY) console.log("🚫 DRY RUN — no downloads\n");

  const phases = PHASE === "all" ? ["judikatur", "staatsvertraege", "landesrecht"] : [PHASE];

  // ── Phase 1: Judikatur (BVwG, LVwG, AsylGH, Uvs) ──
  if (phases.includes("judikatur")) {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  PHASE 1: Missing Judikatur Courts");
    console.log("═══════════════════════════════════════════════════════════\n");

    const courtsIdx = args.indexOf("--courts");
    const courtFilter = courtsIdx >= 0 ? args[courtsIdx + 1].split(",") : null;

    for (const [courtKey, court] of Object.entries(NEW_COURTS)) {
      if (courtFilter && !courtFilter.includes(courtKey)) continue;
      console.log(`\n▶ ${court.label} (${courtKey})`);
      await fetchJudikaturForCourt(courtKey, court);
    }
  }

  // ── Phase 2: Staatsverträge ──
  if (phases.includes("staatsvertraege")) {
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  PHASE 2: Staatsverträge");
    console.log("═══════════════════════════════════════════════════════════\n");
    await fetchStaatsvertraege();
  }

  // ── Phase 3: Landesrecht ──
  if (phases.includes("landesrecht")) {
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  PHASE 3: Landesrecht (9 Bundesländer)");
    console.log("═══════════════════════════════════════════════════════════\n");
    await fetchLandesrecht();
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ✅ Complete! Import with:");
  console.log("    gbrain sources add law-at-staatsvertraege law-corpus/at-staatsvertraege");
  console.log("    gbrain sources add law-at-landesrecht law-corpus/at-landesrecht");
  console.log("    gbrain import law-corpus/at-staatsvertraege --source-id law-at-staatsvertraege");
  console.log("    gbrain import law-corpus/at-landesrecht --source-id law-at-landesrecht");
  console.log("    bun scripts/import-judikatur.ts --source bvwg");
  console.log("    bun scripts/import-judikatur.ts --source bfg");
  console.log("    bun scripts/import-judikatur.ts --source lvwg");
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
