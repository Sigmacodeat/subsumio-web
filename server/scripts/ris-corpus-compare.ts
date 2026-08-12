#!/usr/bin/env bun
/**
 * Compare RIS API probe data against local corpus.
 *   bun run server/scripts/ris-corpus-compare.ts
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const probe = JSON.parse(readFileSync("/tmp/ris-api-probe.json", "utf8"));
const risGnrs = new Set(probe.uniqueGesetzesnummern);

const corpusDir = "law-corpus/at";
const files = readdirSync(corpusDir).filter((f: string) => f.endsWith(".md"));
const corpusGnrs = new Set<string>();
const corpusFiles: { name: string; gnr?: string; abbr?: string; versionDate?: string }[] = [];
let noGnr = 0;

for (const f of files) {
  const content = readFileSync(join(corpusDir, f), "utf-8");
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) continue;
  const fm = fmMatch[1];
  const gnrMatch = fm.match(/gesetzesnummer:\s*"?(\d+)"?/);
  const abbrMatch = fm.match(/abbreviation:\s*"?([^"\n]+)"?/);
  const vdMatch = fm.match(/version_date:\s*"?(\d{4}-\d{2}-\d{2})"?/);
  const entry: { name: string; gnr?: string; abbr?: string; versionDate?: string } = { name: f };
  if (gnrMatch) { corpusGnrs.add(gnrMatch[1]); entry.gnr = gnrMatch[1]; }
  else noGnr++;
  if (abbrMatch) entry.abbr = abbrMatch[1].trim();
  if (vdMatch) entry.versionDate = vdMatch[1];
  corpusFiles.push(entry);
}

console.log("=== CORPUS STATS ===");
console.log("Total .md files:", files.length);
console.log("Files with gesetzesnummer:", corpusGnrs.size);
console.log("Files WITHOUT gesetzesnummer:", noGnr);

console.log("\n=== RIS SAMPLE vs CORPUS ===");
let matched = 0, missing = 0;
const missingLaws: string[] = [];
for (const gnr of risGnrs) {
  if (corpusGnrs.has(gnr)) matched++;
  else { missing++; missingLaws.push(gnr); }
}
console.log("RIS unique Gesetzesnummern (sample):", risGnrs.size);
console.log("Matched in corpus:", matched);
console.log("Missing from corpus:", missing);
console.log("Missing Gnrs:", missingLaws.slice(0, 30));

// Show which RIS laws are missing
const risByGnr = new Map<string, string>();
for (const law of probe.sampleLaws) {
  const meta = (law as any).Data?.Metadaten?.Bundesrecht;
  const gnr = meta?.BrKons?.Gesetzesnummer;
  const kt = meta?.Kurztitel;
  if (gnr && kt) risByGnr.set(gnr, kt);
}
// Build from all fields — use uniqueGesetzesnummern + uniqueKurztitel
console.log("\n=== MISSING LAWS DETAIL ===");
for (const gnr of missingLaws.slice(0, 20)) {
  console.log(`  ${gnr}`);
}

// Corpus files without gesetzesnummer
console.log("\n=== CORPUS FILES WITHOUT GESETZESNUMMER (first 30) ===");
let count = 0;
for (const cf of corpusFiles) {
  if (!cf.gnr) {
    if (count < 30) console.log(`  ${cf.name}  (abbr: ${cf.abbr ?? "none"})`);
    count++;
  }
}
console.log("Total without gesetzesnummer:", count);

// Version date analysis
console.log("\n=== VERSION DATE DISTRIBUTION ===");
const yearCounts: Record<string, number> = {};
for (const cf of corpusFiles) {
  if (cf.versionDate) {
    const y = cf.versionDate.slice(0, 4);
    yearCounts[y] = (yearCounts[y] ?? 0) + 1;
  }
}
for (const [year, cnt] of Object.entries(yearCounts).sort()) {
  console.log(`  ${year}: ${cnt}`);
}
