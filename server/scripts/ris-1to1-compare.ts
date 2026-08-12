#!/usr/bin/env bun
/**
 * RIS vs Corpus — 1:1 comparison for key Austrian laws.
 * Fetches full metadata from RIS API for specific Gesetzesnummern,
 * then compares with local corpus frontmatter.
 *
 *   bun run server/scripts/ris-1to1-compare.ts
 */
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

const RIS_API = "https://data.bka.gv.at/ris/api/v2.6/Bundesrecht";
const RIS_UA = {
  "User-Agent": "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)",
};

const KEY_LAWS: { gnr: string; name: string }[] = [
  { gnr: "10001622", name: "ABGB" },
  { gnr: "20009477", name: "StGB" },
  { gnr: "20009463", name: "StPO" },
  { gnr: "10001699", name: "ZPO" },
  { gnr: "10001702", name: "UGB" },
  { gnr: "10003317", name: "UWG/EWG" },
  { gnr: "10001916", name: "EO" },
  { gnr: "10002070", name: "AktG" },
  { gnr: "10001720", name: "GmbHG" },
  { gnr: "10001869", name: "HGB" },
  { gnr: "20008831", name: "GewO" },
  { gnr: "20001857", name: "EStG" },
  { gnr: "10003940", name: "BAO" },
  { gnr: "20010496", name: "UStG" },
  { gnr: "10002462", name: "KSchG" },
  { gnr: "10008329", name: "ArbVG" },
  { gnr: "10008069", name: "AngG" },
  { gnr: "10008464", name: "MSchG" },
  { gnr: "10008376", name: "UrlG" },
  { gnr: "10000633", name: "DSG" },
  { gnr: "10001871", name: "EheG" },
  { gnr: "20011654", name: "VGG" },
  { gnr: "10005221", name: "AVG" },
  { gnr: "10005220", name: "VStG" },
];

interface RisLawMeta {
  gesetzesnummer: string;
  kurztitel: string;
  titel?: string;
  typ: string;
  dokumenttyp: string;
  inkrafttretensdatum: string;
  ausserkrafttretensdatum?: string;
  stammnormBgblnummer: string;
  kundmachungsorgan: string;
  gesamtUrl: string;
  eli?: string;
  anzahlNormen: number;
}

async function fetchRisLaw(gnr: string): Promise<{ meta: RisLawMeta; norms: any[] } | null> {
  const allNorms: any[] = [];
  let meta: RisLawMeta | null = null;

  for (let pageNo = 1; pageNo <= 50; pageNo++) {
    const url = `${RIS_API}?Applikation=BrKons&Gesetzesnummer=${gnr}&DokumenteProSeite=OneHundred&Seitennummer=${pageNo}`;
    try {
      const res = await fetch(url, { headers: RIS_UA });
      if (!res.ok) break;
      const data = await res.json() as any;
      const result = data?.OgdSearchResult?.OgdDocumentResults;
      let refs = result?.OgdDocumentReference;
      if (!refs) break;
      if (!Array.isArray(refs)) refs = [refs];

      for (const ref of refs) {
        const d = ref?.Data;
        if (!d) continue;
        const bund = d?.Metadaten?.Bundesrecht;
        const brKons = bund?.BrKons;
        if (!meta && brKons) {
          meta = {
            gesetzesnummer: brKons.Gesetzesnummer,
            kurztitel: (bund.Kurztitel || "").trim(),
            titel: bund.Titel,
            typ: brKons.Typ,
            dokumenttyp: brKons.Dokumenttyp,
            inkrafttretensdatum: brKons.Inkrafttretensdatum,
            ausserkrafttretensdatum: brKons.Ausserkrafttretensdatum,
            stammnormBgblnummer: brKons.StammnormBgblnummer,
            kundmachungsorgan: brKons.Kundmachungsorgan,
            gesamtUrl: brKons.GesamteRechtsvorschriftUrl,
            eli: bund.Eli,
            anzahlNormen: 0,
          };
        }
        allNorms.push(ref);
      }

      if (refs.length < 100) break;
      await new Promise((r) => setTimeout(r, 300));
    } catch {
      break;
    }
  }

  if (!meta) return null;
  meta.anzahlNormen = allNorms.length;
  return { meta, norms: allNorms };
}

function findCorpusFile(gnr: string): { name: string; frontmatter: Record<string, string>; contentLength: number } | null {
  const corpusDir = "law-corpus/at";
  const files = readdirSync(corpusDir).filter(f => f.endsWith(".md"));
  for (const f of files) {
    const content = readFileSync(join(corpusDir, f), "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1];
    // Match by explicit gesetzesnummer field OR by gnr in source_url
    if (fm.includes(`gesetzesnummer: ${gnr}`) || fm.includes(`gesetzesnummer: "${gnr}"`) || fm.includes(`/${gnr}/`)) {
      const fields: Record<string, string> = {};
      for (const line of fm.split("\n")) {
        const m = line.match(/^(\w+):\s*(.*)$/);
        if (m) fields[m[1]] = m[2].replace(/^"|"$/g, "");
      }
      return { name: f, frontmatter: fields, contentLength: content.length };
    }
  }
  return null;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  RIS vs Corpus — 1:1 Comparison for Key Laws            ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const results: any[] = [];

  for (const { gnr, name } of KEY_LAWS) {
    process.stdout.write(`  ${name} (${gnr})...`);
    const ris = await fetchRisLaw(gnr);
    if (!ris) {
      console.log(" ❌ NOT FOUND in RIS");
      results.push({ name, gnr, status: "not_in_ris" });
      continue;
    }

    const corpus = findCorpusFile(gnr);
    if (!corpus) {
      console.log(` ❌ NOT IN CORPUS (RIS: ${ris.meta.kurztitel}, ${ris.meta.anzahlNormen} norms)`);
      results.push({ name, gnr, status: "missing_from_corpus", risMeta: ris.meta });
      continue;
    }

    const fm = corpus.frontmatter;
    const mismatches: string[] = [];

    if (!fm.gesetzesnummer) mismatches.push("gesetzesnummer: MISSING from frontmatter");

    // Also check if gnr is in source_url as fallback
    const gnrInUrl = fm.source_url?.includes(gnr);
    if (!fm.gesetzesnummer && gnrInUrl) {
      mismatches.push("gesetzesnummer: extractable from source_url but not explicit field");
    }

    const status = mismatches.length === 0 ? "✅ MATCH" : `⚠️  ${mismatches.length} issues`;
    console.log(` ${status} — corpus: ${corpus.name} (${(corpus.contentLength / 1024).toFixed(0)} KB), RIS: ${ris.meta.anzahlNormen} norms, Typ: ${ris.meta.typ}`);

    results.push({
      name,
      gnr,
      status: mismatches.length === 0 ? "match" : "mismatch",
      mismatches,
      risMeta: ris.meta,
      corpusFile: corpus.name,
      corpusFrontmatter: fm,
      corpusSize: corpus.contentLength,
    });

    await new Promise((r) => setTimeout(r, 300));
  }

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");
  const matched = results.filter(r => r.status === "match").length;
  const missing = results.filter(r => r.status === "missing_from_corpus").length;
  const mismatched = results.filter(r => r.status === "mismatch").length;
  const notInRis = results.filter(r => r.status === "not_in_ris").length;
  console.log(`  Total checked:          ${results.length}`);
  console.log(`  ✅ Matched:              ${matched}`);
  console.log(`  ⚠️  Mismatched:           ${mismatched}`);
  console.log(`  ❌ Missing from corpus:  ${missing}`);
  console.log(`  ❌ Not in RIS:           ${notInRis}`);

  if (mismatched > 0) {
    console.log("\n  MISMATCH DETAILS:");
    for (const r of results.filter(r => r.status === "mismatch")) {
      console.log(`    ${r.name} (${r.gnr}): ${r.mismatches.join(", ")}`);
    }
  }

  if (missing > 0) {
    console.log("\n  MISSING FROM CORPUS:");
    for (const r of results.filter(r => r.status === "missing_from_corpus")) {
      console.log(`    ${r.name} (${r.gnr}): ${r.risMeta.kurztitel} — ${r.risMeta.anzahlNormen} norms`);
    }
  }

  // Print full RIS metadata for first matched law
  const firstMatch = results.find(r => r.status === "match" || r.status === "mismatch");
  if (firstMatch) {
    console.log(`\n=== FULL RIS METADATA: ${firstMatch.name} ===`);
    console.log(JSON.stringify(firstMatch.risMeta, null, 2));
    console.log(`\n=== CORPUS FRONTMATTER: ${firstMatch.name} ===`);
    console.log(JSON.stringify(firstMatch.corpusFrontmatter, null, 2));
  }

  const report = { timestamp: new Date().toISOString(), results };
  writeFileSync("/tmp/ris-1to1-compare.json", JSON.stringify(report, null, 2));
  console.log(`\n✅ Report saved to /tmp/ris-1to1-compare.json`);
}

main().catch(console.error);
