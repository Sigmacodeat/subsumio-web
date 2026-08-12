#!/usr/bin/env bun
/**
 * Check for broken frontmatter structure in corpus files.
 *   bun run server/scripts/ris-check-broken.ts
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const corpusDir = "law-corpus/at";
const files = readdirSync(corpusDir).filter(f => f.endsWith(".md"));

let broken = 0;
let normal = 0;
let noFm = 0;
const brokenFiles: string[] = [];

for (const f of files) {
  const content = readFileSync(join(corpusDir, f), "utf-8");
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) { noFm++; continue; }
  const fm = fmMatch[1].trim();
  const afterFm = content.slice(fmMatch[0].length);
  if (afterFm.match(/^title:\s/) && fm.match(/^content_hash:/)) {
    broken++;
    if (brokenFiles.length < 20) brokenFiles.push(f);
  } else {
    normal++;
  }
}

console.log("Normal frontmatter:", normal);
console.log("Broken (content_hash only in fm, title outside):", broken);
console.log("No frontmatter:", noFm);
if (brokenFiles.length > 0) {
  console.log("\nBroken files (first 20):");
  for (const f of brokenFiles) console.log("  " + f);
}
