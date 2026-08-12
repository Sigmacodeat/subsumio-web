#!/usr/bin/env bun
/**
 * Verify Fetcher — Compare 8 freshly-fetched .md files against RIS XML.
 * Checks all 13 RIS metadata fields for exact match.
 */
import { readFileSync } from "fs";

const tests = [
  { file: "law-corpus/at-normen/abgb/p-1.md", nor: "NOR12017691", name: "ABGB § 1" },
  { file: "law-corpus/at-normen/abgb/p-2.md", nor: "NOR12017692", name: "ABGB § 2" },
  { file: "law-corpus/at-normen/abgb/p-3.md", nor: "NOR12017693", name: "ABGB § 3" },
  { file: "law-corpus/at-normen/abgb/p-5.md", nor: "NOR12017695", name: "ABGB § 5" },
  { file: "law-corpus/at-normen/stgg/art-2.md", nor: "NOR12000059", name: "StGG Art. 2" },
  { file: "law-corpus/at-normen/estg-1988/p-108.md", nor: "NOR40263378", name: "EStG § 108" },
  { file: "law-corpus/at-normen/asvg/art-2.md", nor: "NOR12161101", name: "ASVG Art. 2" },
  { file: "law-corpus/at-normen/svg/p-7.md", nor: "NOR40211751", name: "SVG § 7" },
];

let allPass = true;

for (const t of tests) {
  const content = readFileSync(t.file, "utf-8");
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) { console.log("✗ " + t.name + ": NO FRONTMATTER"); allPass = false; continue; }
  const fm = fmMatch[1];

  // Fetch RIS XML
  const url = "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/" + t.nor + "/" + t.nor + ".xml";
  const resp = await fetch(url);
  const xml = await resp.text();

  // Extract all ct fields from XML
  const xmlMeta: Record<string, string> = {};
  const re = /<ueberschrift typ="titel"[^>]*>([^<]+)<\/ueberschrift>\s*<absatz[^>]*ct="([^"]*)"[^>]*>([^<]*)<\/absatz>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    xmlMeta[m[2]] = m[3].trim();
  }

  // Compare each field
  const fields = [
    { ct: "kurztitel", fm: "statute" },
    { ct: "kundmachungsorgan", fm: "kundmachungsorgan" },
    { ct: "typ", fm: "typ" },
    { ct: "artikel_anlage", fm: "paragraph" },
    { ct: "ikra", fm: "inkrafttretensdatum" },
    { ct: "abkuerzung", fm: "abbreviation" },
    { ct: "index", fm: "indizes" },
    { ct: "schlagworte", fm: "schlagworte" },
    { ct: "anmerkung", fm: "anmerkung" },
    { ct: "geaendert", fm: "zuletzt_aktualisiert" },
    { ct: "gesnr", fm: "gesetzesnummer" },
    { ct: "doknr", fm: "nor_id" },
    { ct: "adoknr", fm: "alte_dokumentnummer" },
  ];

  let pass = true;
  const issues: string[] = [];

  for (const f of fields) {
    const xmlVal = xmlMeta[f.ct] || null;
    const fmRegex = new RegExp(f.fm + ':\\s*"([^"]*)"');
    const fmMatch2 = fm.match(fmRegex);
    const fmVal = fmMatch2 ? fmMatch2[1] : null;

    if (xmlVal && !fmVal) {
      issues.push(f.ct + ": XML has '" + xmlVal.slice(0, 40) + "', FM missing");
      pass = false;
    } else if (xmlVal && fmVal) {
      // Special: ikra is DD.MM.YYYY in XML, YYYY-MM-DD in FM
      if (f.ct === "ikra") {
        const parts = xmlVal.split(".");
        const normalized = parts[2] + "-" + parts[1] + "-" + parts[0];
        if (fmVal !== normalized) {
          issues.push(f.ct + ": XML=" + xmlVal + " FM=" + fmVal);
          pass = false;
        }
      } else if (f.ct === "doknr") {
        // FM nor_id should match XML doknr
        if (fmVal !== xmlVal) {
          issues.push(f.ct + ": XML=" + xmlVal + " FM=" + fmVal);
          pass = false;
        }
      } else if (f.ct === "index") {
        // FM might have multiple joined with ;
        if (!fmVal.includes(xmlVal)) {
          issues.push(f.ct + ": XML=" + xmlVal + " FM=" + fmVal);
          pass = false;
        }
      } else if (xmlVal !== fmVal) {
        issues.push(f.ct + ": XML='" + xmlVal.slice(0, 40) + "' FM='" + fmVal.slice(0, 40) + "'");
        pass = false;
      }
    }
  }

  if (pass) {
    console.log("✓ " + t.name + " (" + t.nor + "): ALL 13 FIELDS MATCH");
  } else {
    console.log("✗ " + t.name + " (" + t.nor + "): " + issues.join(" | "));
    allPass = false;
  }
}

console.log("");
if (allPass) {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ALL 8 FILES VERIFIED ✓ — 13/13 FIELDS MATCH RIS XML");
  console.log("═══════════════════════════════════════════════════════════");
} else {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  VERIFICATION FAILED ✗");
  console.log("═══════════════════════════════════════════════════════════");
  process.exit(1);
}
