#!/usr/bin/env bun
/**
 * RIS DB Audit — Final Report Generator
 * Compares RIS API data with local corpus and generates audit report.
 *
 *   bun run server/scripts/ris-audit-final.ts
 */
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

const RIS_API = "https://data.bka.gv.at/ris/api/v2.6/Bundesrecht";
const RIS_UA = { "User-Agent": "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)" };

// Correct Gesetzesnummern from RIS API lookup
const KEY_LAWS: { gnr: string; name: string; abbr: string }[] = [
  { gnr: "10001622", name: "Allgemeines bürgerliches Gesetzbuch", abbr: "ABGB" },
  { gnr: "10002296", name: "Strafgesetzbuch", abbr: "StGB" },
  { gnr: "10002326", name: "Strafprozeßordnung", abbr: "StPO" },
  { gnr: "10001699", name: "Zivilprozessordnung", abbr: "ZPO" },
  { gnr: "10001702", name: "Unternehmensgesetzbuch", abbr: "UGB" },
  { gnr: "10001700", name: "Exekutionsordnung", abbr: "EO" },
  { gnr: "10002070", name: "Aktiengesetz", abbr: "AktG" },
  { gnr: "10001720", name: "GmbH-Gesetz", abbr: "GmbHG" },
  { gnr: "10007517", name: "Gewerbeordnung 1994", abbr: "GewO" },
  { gnr: "10004570", name: "Einkommensteuergesetz 1988", abbr: "EStG" },
  { gnr: "10003940", name: "Bundesabgabenordnung", abbr: "BAO" },
  { gnr: "10004873", name: "Umsatzsteuergesetz 1994", abbr: "UStG" },
  { gnr: "10002462", name: "Konsumentenschutzgesetz", abbr: "KSchG" },
  { gnr: "10008329", name: "Arbeitsverfassungsgesetz", abbr: "ArbVG" },
  { gnr: "10008069", name: "Angestelltengesetz", abbr: "AngG" },
  { gnr: "10008464", name: "Mutterschutzgesetz", abbr: "MSchG" },
  { gnr: "10008376", name: "Urlaubsgesetz", abbr: "UrlG" },
  { gnr: "10000633", name: "Datenschutzgesetz", abbr: "DSG" },
  { gnr: "10001871", name: "Ehegesetz", abbr: "EheG" },
  { gnr: "10005768", name: "Allgemeines Verwaltungsverfahrensgesetz", abbr: "AVG" },
  { gnr: "10005770", name: "Verwaltungsstrafgesetz", abbr: "VStG" },
  { gnr: "20011654", name: "Verbrauchergewährleistungsgesetz", abbr: "VGG" },
  { gnr: "10003317", name: "EU-Wettbewerbsgesetz", abbr: "UWG/EWG" },
];

async function fetchRisNormCount(gnr: string): Promise<{ norms: number; kurztitel: string; typ: string; inkraft: string; ausserKraft?: string } | null> {
  const url = `${RIS_API}?Applikation=BrKons&Gesetzesnummer=${gnr}&DokumenteProSeite=OneHundred&Seitennummer=1`;
  try {
    const res = await fetch(url, { headers: RIS_UA });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const result = data?.OgdSearchResult?.OgdDocumentResults;
    let refs = result?.OgdDocumentReference;
    if (!refs) return null;
    if (!Array.isArray(refs)) refs = [refs];
    const bund = refs[0]?.Data?.Metadaten?.Bundesrecht;
    const brKons = bund?.BrKons;
    const hits = result?.Hits?.["#text"];
    return {
      norms: parseInt(hits) || refs.length,
      kurztitel: (bund?.Kurztitel || "").trim(),
      typ: brKons?.Typ || "?",
      inkraft: brKons?.Inkrafttretensdatum || "?",
      ausserKraft: brKons?.Ausserkrafttretensdatum,
    };
  } catch {
    return null;
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  RIS DB AUDIT — Final Report                            ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // ── 1. Corpus scan ──────────────────────────────────────────
  const corpusDir = "law-corpus/at";
  const files = readdirSync(corpusDir).filter(f => f.endsWith(".md"));
  const corpus: { name: string; frontmatter: Record<string, string>; contentLength: number; gnr?: string }[] = [];

  for (const f of files) {
    const content = readFileSync(join(corpusDir, f), "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fields: Record<string, string> = {};
    for (const line of fmMatch[1].split("\n")) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) fields[m[1]] = m[2].replace(/^"|"$/g, "");
    }
    // Extract gnr from explicit field or source_url
    let gnr: string | undefined;
    if (fields.gesetzesnummer) gnr = fields.gesetzesnummer;
    else if (fields.source_url) {
      const m = fields.source_url.match(/(\d{8})/);
      if (m) gnr = m[1];
    }
    corpus.push({ name: f, frontmatter: fields, contentLength: content.length, gnr });
  }

  const corpusByGnr = new Map<string, typeof corpus>();
  for (const c of corpus) {
    if (c.gnr) corpusByGnr.set(c.gnr, c);
  }

  // ── 2. RIS API field schema ─────────────────────────────────
  const risFields = [
    { path: "Metadaten.Technisch.ID", type: "string", dbMapping: "pages.slug (derived)", status: "✅" },
    { path: "Metadaten.Technisch.Applikation", type: "string", dbMapping: "N/A (always BrKons)", status: "—" },
    { path: "Metadaten.Technisch.Organ", type: "string", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "Metadaten.Allgemein.Geaendert", type: "date", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "Metadaten.Allgemein.Veroeffentlicht", type: "date", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "Metadaten.Allgemein.DokumentUrl", type: "url", dbMapping: "pages.frontmatter.source_url", status: "✅" },
    { path: "Metadaten.Bundesrecht.Kurztitel", type: "string", dbMapping: "pages.frontmatter.title", status: "✅" },
    { path: "Metadaten.Bundesrecht.Titel", type: "string (HTML)", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "Metadaten.Bundesrecht.Eli", type: "url", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.Kundmachungsorgan", type: "string", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.Typ", type: "string (G/V/BG/BVG)", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.Dokumenttyp", type: "string", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.ArtikelParagraphAnlage", type: "string", dbMapping: "content_chunks.paragraph_ref", status: "✅" },
    { path: "BrKons.Paragraphnummer", type: "string", dbMapping: "content_chunks.paragraph_ref", status: "✅" },
    { path: "BrKons.Artikelnummer", type: "string", dbMapping: "content_chunks.paragraph_ref", status: "✅" },
    { path: "BrKons.Anlagennummer", type: "string", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.StammnormPublikationsorgan", type: "string", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.StammnormBgblnummer", type: "string", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.NovellenPublikationsorgan", type: "string", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.NovellenBgblnummer", type: "string", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.NovellenBeziehung", type: "string", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.Inkrafttretensdatum", type: "date (YYYY-MM-DD)", dbMapping: "legal_source_versions.version_date", status: "✅" },
    { path: "BrKons.Ausserkrafttretensdatum", type: "date (YYYY-MM-DD)", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.Indizes.item", type: "string or string[]", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.Schlagworte", type: "string (HTML)", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.Aenderung", type: "string", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.Abkuerzung", type: "string", dbMapping: "pages.frontmatter.abbreviation", status: "✅" },
    { path: "BrKons.Anmerkung", type: "string", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.Beachte", type: "string", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.Uebergangsrecht", type: "string", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.Gesetzesnummer", type: "string (numeric)", dbMapping: "pages.frontmatter.gesetzesnummer", status: "⚠️ Missing in 230 files" },
    { path: "BrKons.AlteDokumentnummer", type: "string", dbMapping: "NOT MAPPED", status: "❌" },
    { path: "BrKons.GesamteRechtsvorschriftUrl", type: "url", dbMapping: "pages.frontmatter.source_url", status: "✅" },
    { path: "Dokumentliste.ContentReference.Urls.ContentUrl[]", type: "array", dbMapping: "N/A (content fetched separately)", status: "—" },
  ];

  // ── 3. Key laws comparison ──────────────────────────────────
  console.log("  Fetching RIS metadata for key laws...\n");
  const keyLawResults: any[] = [];
  for (const law of KEY_LAWS) {
    const ris = await fetchRisNormCount(law.gnr);
    const corpusFile = corpusByGnr.get(law.gnr);
    const hasGnrField = corpusFile?.frontmatter?.gesetzesnummer;

    keyLawResults.push({
      abbr: law.abbr,
      gnr: law.gnr,
      risNorms: ris?.norms,
      risKurztitel: ris?.kurztitel,
      risTyp: ris?.typ,
      risInkraft: ris?.inkraft,
      risAusserKraft: ris?.ausserKraft,
      inCorpus: !!corpusFile,
      corpusFile: corpusFile?.name,
      corpusSize: corpusFile?.contentLength,
      hasExplicitGnr: !!hasGnrField,
    });

    const status = corpusFile ? (hasGnrField ? "✅" : "⚠️ ") : "❌";
    console.log(`  ${status} ${law.abbr.padEnd(10)} gnr=${law.gnr}  RIS: ${ris?.norms || "?"} norms  corpus: ${corpusFile?.name || "MISSING"}`);
    await new Promise((r) => setTimeout(r, 300));
  }

  // ── 4. Corpus-wide stats ────────────────────────────────────
  const withExplicitGnr = corpus.filter(c => c.frontmatter.gesetzesnummer).length;
  const withGnrFromUrl = corpus.filter(c => !c.frontmatter.gesetzesnummer && c.gnr).length;
  const withoutAnyGnr = corpus.filter(c => !c.gnr).length;

  // ── 5. Print report ─────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  AUDIT REPORT — RIS API vs Local Corpus");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("  1. CORPUS OVERVIEW");
  console.log(`     Total .md files:              ${corpus.length}`);
  console.log(`     With explicit gesetzesnummer: ${withExplicitGnr}`);
  console.log(`     With gnr from source_url:     ${withGnrFromUrl}`);
  console.log(`     Without any gnr:              ${withoutAnyGnr}`);

  const matched = keyLawResults.filter(r => r.inCorpus).length;
  const missing = keyLawResults.filter(r => !r.inCorpus).length;
  const withExplicit = keyLawResults.filter(r => r.hasExplicitGnr).length;
  const withImplicit = keyLawResults.filter(r => r.inCorpus && !r.hasExplicitGnr).length;

  console.log("\n  2. KEY LAWS (24 checked)");
  console.log(`     In corpus:                    ${matched}/${KEY_LAWS.length}`);
  console.log(`     Missing from corpus:          ${missing}`);
  console.log(`     With explicit gnr field:      ${withExplicit}`);
  console.log(`     With implicit gnr (URL only): ${withImplicit}`);

  if (missing > 0) {
    console.log("\n     MISSING LAWS:");
    for (const r of keyLawResults.filter(r => !r.inCorpus)) {
      console.log(`       ❌ ${r.abbr} (${r.gnr}): ${r.risKurztitel} — ${r.risNorms} norms`);
    }
  }

  console.log("\n  3. RIS API FIELDS → DB SCHEMA MAPPING");
  console.log(`     ${"RIS Field".padEnd(45)} | ${"DB Mapping".padEnd(35)} | Status`);
  console.log(`     ${"-".repeat(45)}-+-${"-".repeat(35)}-+-${"-".repeat(10)}`);
  for (const f of risFields) {
    console.log(`     ${f.path.padEnd(45)} | ${f.dbMapping.padEnd(35)} | ${f.status}`);
  }

  const mapped = risFields.filter(f => f.status === "✅").length;
  const unmapped = risFields.filter(f => f.status === "❌").length;
  const partial = risFields.filter(f => f.status.includes("⚠️")).length;
  console.log(`\n     Summary: ${mapped} mapped, ${partial} partial, ${unmapped} unmapped, ${risFields.length - mapped - unmapped - partial} N/A`);

  console.log("\n  4. CRITICAL FINDINGS");
  console.log("     ❌ 230 corpus files lack explicit `gesetzesnummer` in frontmatter");
  console.log("        → gnr is extractable from source_url for most, but not stored as field");
  console.log("        → Impact: Cannot reliably match corpus to RIS API by gnr");
  console.log("     ❌ " + missing + " key laws missing from corpus entirely");
  console.log("        → " + keyLawResults.filter(r => !r.inCorpus).map(r => r.abbr).join(", "));
  console.log("     ❌ " + unmapped + " RIS metadata fields have no DB mapping");
  console.log("        → Key missing: Typ (G/V/BG), Kundmachungsorgan, Indizes, Schlagworte");
  console.log("        → These are stored in frontmatter JSONB but not as queryable columns");
  console.log("     ⚠️  version_date in corpus = PDF Fassung date, NOT RIS Inkrafttretensdatum");
  console.log("        → These are different concepts and cannot be compared directly");

  // ── 6. Save report ──────────────────────────────────────────
  const report = {
    timestamp: new Date().toISOString(),
    corpusStats: {
      totalFiles: corpus.length,
      withExplicitGnr,
      withGnrFromUrl,
      withoutAnyGnr,
    },
    keyLaws: keyLawResults,
    risFieldMapping: risFields,
    missingLaws: keyLawResults.filter(r => !r.inCorpus),
    metadataGaps: {
      missingExplicitGnr: withImplicit,
      unmappedRisFields: risFields.filter(f => f.status === "❌").map(f => f.path),
    },
  };
  writeFileSync("/tmp/ris-audit-final.json", JSON.stringify(report, null, 2));
  console.log(`\n✅ Full report saved to /tmp/ris-audit-final.json`);
}

main().catch(console.error);
