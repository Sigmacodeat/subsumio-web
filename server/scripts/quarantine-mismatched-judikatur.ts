#!/usr/bin/env bun
/**
 * One-off remediation for the 2026-07-15 backfill-corpus-text.ts incident:
 * the RIS Dokument.wxe fallback returned HTTP 200 with unrelated content for
 * 10-77% of files across BVwG/LVwG/VfGH/VwGH/AsylGH/UVS (see
 * contentMatchesDocument() in backfill-corpus-text.ts for the root cause).
 *
 * This scans the affected directories, and for any file whose body does NOT
 * contain its own case_number or ecli, resets the body to the placeholder
 * text so the (now-fixed) backfill-corpus-text.ts picks it up again on the
 * next run and re-fetches it correctly. Does not touch files whose frontmatter
 * has no case_number/ecli to check against (nothing to validate) or files
 * that are already placeholders.
 *
 * Usage:
 *   bun scripts/quarantine-mismatched-judikatur.ts [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const DRY = process.argv.includes("--dry-run");
const _scriptDir = dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");

const AFFECTED_DIRS = [
  "at-judikatur-bvwg",
  "at-judikatur-lvwg",
  "at-judikatur-vfgh",
  "at-judikatur-vwgh",
  "at-judikatur-asylgh",
  "at-judikatur-uvs",
];

function parseFrontmatter(content: string): { fm: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { fm: "", body: content };
  return { fm: match[1], body: content.slice(match[0].length) };
}

function extractCaseNumber(fm: string): string {
  const match = fm.match(/case_number:\s*"?([^\n"]+)"?/);
  return match ? match[1].trim() : "";
}

function extractEcli(fm: string): string {
  const match = fm.match(/ecli:\s*"?([^\n"]*)"?/);
  return match ? match[1].trim() : "";
}

function isPlaceholder(body: string): boolean {
  return body.includes("Volltext nicht abrufbar") || body.trim().length < 50;
}

/**
 * Strip the leading "# Title" heading before checking. The heading is always
 * regenerated from the file's OWN (correct) title on every backfill run —
 * see backfillFile()'s `newBody = "# ${title}\n\n${text}..."` — so it always
 * contains the right case number/ECLI even when the body text below it was
 * swapped for a different document. Checking the full body (heading + text)
 * makes every file look "verified" via the heading alone; only the text
 * AFTER the heading was actually fetched from RIS and needs validating.
 */
function stripLeadingHeading(body: string): string {
  return body.replace(/^\s*#\s+.+\n+/, "");
}

function contentMatchesDocument(bodyWithoutHeading: string, fm: string): boolean {
  const caseNum = extractCaseNumber(fm);
  const ecli = extractEcli(fm);
  const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const normText = normalize(bodyWithoutHeading);
  if (caseNum && normText.includes(normalize(caseNum))) return true;
  if (ecli && normText.includes(normalize(ecli))) return true;
  if (!caseNum && !ecli) return true;
  return false;
}

let totalScanned = 0;
let totalMismatched = 0;
let totalAlreadyPlaceholder = 0;
let totalUnverifiable = 0;

for (const dirName of AFFECTED_DIRS) {
  const dir = join(CORPUS_ROOT, dirName);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    console.log(`  (skip, dir not found: ${dirName})`);
    continue;
  }

  let mismatched = 0;
  let alreadyPlaceholder = 0;
  let unverifiable = 0;

  for (const f of files) {
    const filepath = join(dir, f);
    const content = readFileSync(filepath, "utf-8");
    const { fm, body } = parseFrontmatter(content);

    if (isPlaceholder(body)) {
      alreadyPlaceholder++;
      continue;
    }

    const caseNum = extractCaseNumber(fm);
    const ecli = extractEcli(fm);
    if (!caseNum && !ecli) {
      unverifiable++;
      continue;
    }

    if (!contentMatchesDocument(stripLeadingHeading(body), fm)) {
      mismatched++;
      if (!DRY) {
        const titleMatch = body.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : "";
        const newBody = `# ${title}\n\n*Volltext nicht abrufbar — siehe Quelle.*\n`;
        const newContent = `---\n${fm}\n---\n\n${newBody}\n`;
        writeFileSync(filepath, newContent, "utf-8");
      }
    }
  }

  totalScanned += files.length;
  totalMismatched += mismatched;
  totalAlreadyPlaceholder += alreadyPlaceholder;
  totalUnverifiable += unverifiable;

  console.log(
    `${dirName}: ${files.length} files, ${mismatched} mismatched${DRY ? " (dry-run, not reset)" : " (reset to placeholder)"}, ${alreadyPlaceholder} already placeholder, ${unverifiable} unverifiable (no case_number/ecli)`
  );
}

console.log(
  `\nTotal: ${totalScanned} scanned, ${totalMismatched} mismatched, ${totalAlreadyPlaceholder} already placeholder, ${totalUnverifiable} unverifiable`
);
if (DRY)
  console.log(
    "Dry run — no files were changed. Re-run without --dry-run to reset mismatched files."
  );
