#!/usr/bin/env bun
/**
 * Analyze corpus files without gesetzesnummer — categorize how to fix them.
 *   bun run server/scripts/ris-corpus-analyze.ts
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const corpusDir = "law-corpus/at";
const files = readdirSync(corpusDir).filter(f => f.endsWith(".md"));

let withExplicitGnr = 0;
let withGnrInPath = 0;
let withGnrInParam = 0;
let withoutAnyGnr = 0;
let noSourceUrl = 0;
let noFrontmatter = 0;

const noGnrFiles: { name: string; sourceUrl?: string; title?: string }[] = [];

for (const f of files) {
  const content = readFileSync(join(corpusDir, f), "utf-8");
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) { noFrontmatter++; continue; }
  const fm = fmMatch[1];

  const hasGnr = fm.match(/gesetzesnummer:\s*"?(\d+)"?/);
  if (hasGnr) { withExplicitGnr++; continue; }

  const urlMatch = fm.match(/source_url:\s*"?([^"\n]+)"?/);
  const titleMatch = fm.match(/title:\s*"?([^"\n]+)"?/);
  const sourceUrl = urlMatch?.[1];
  const title = titleMatch?.[1];

  if (sourceUrl) {
    const gnrInPath = sourceUrl.match(/\/(\d{8})\//);
    const gnrInParam = sourceUrl.match(/Gesetzesnummer=(\d+)/);
    if (gnrInPath) { withGnrInPath++; continue; }
    if (gnrInParam) { withGnrInParam++; continue; }
    noGnrFiles.push({ name: f, sourceUrl, title });
    withoutAnyGnr++;
  } else {
    noSourceUrl++;
    noGnrFiles.push({ name: f, title });
    withoutAnyGnr++;
  }
}

console.log("=== CORPUS STRUCTURE ANALYSIS ===");
console.log("Total files:", files.length);
console.log("With explicit gesetzesnummer:", withExplicitGnr);
console.log("With gnr in source_url path:", withGnrInPath);
console.log("With gnr in OGD API URL param:", withGnrInParam);
console.log("Without any gnr:", withoutAnyGnr);
console.log("  - has source_url but no gnr pattern:", noGnrFiles.filter(f => f.sourceUrl).length);
console.log("  - no source_url at all:", noSourceUrl);
console.log("No frontmatter:", noFrontmatter);

console.log("\n=== FILES WITHOUT ANY GNR (first 40) ===");
for (const f of noGnrFiles.slice(0, 40)) {
  console.log("  " + f.name + "  url=" + (f.sourceUrl || "NONE").slice(0, 80));
}
if (noGnrFiles.length > 40) console.log("  ... and " + (noGnrFiles.length - 40) + " more");
