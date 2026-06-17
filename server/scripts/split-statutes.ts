/**
 * Statute splitter for law corpus.
 *
 * DE : splits at markdown `## § N — Title` headings → one .md per paragraph
 * AT : splits at inline `§ N.` patterns (RIS PDF-extracted flat text)
 * CH : copies whole file (well-formatted, small)
 *
 * Usage:
 *   bun server/scripts/split-statutes.ts [--out law-corpus-split] [--jur de|at|ch]
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const OUT = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "law-corpus-split";

const JUR_FILTER = process.argv.includes("--jur")
  ? process.argv[process.argv.indexOf("--jur") + 1]
  : null;

// Minimum body content to keep a § page (filter ToC stubs and cross-refs)
const MIN_CONTENT_BYTES = 100;

interface LawFrontmatter {
  title: string;
  type: string;
  jurisdiction: string;
  abbreviation: string;
  version_date: string;
  retrieved_at: string;
  source_url: string;
  license: string;
}

function parseFrontmatter(text: string): { fm: LawFrontmatter; body: string } {
  if (!text.startsWith("---")) throw new Error("Missing frontmatter");
  const endIdx = text.indexOf("---", 3);
  if (endIdx === -1) throw new Error("Unclosed frontmatter");
  const raw = text.slice(3, endIdx).trim();
  const fm: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (m) fm[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  const body = text.slice(endIdx + 3).trimStart();
  return { fm: fm as unknown as LawFrontmatter, body };
}

function slugifyPara(num: string): string {
  return num.replace(/\s+/g, "").toLowerCase();
}

/**
 * Normalize body text for clean RAG chunks:
 * - Strip RIS/BMJ page header/footer noise
 * - Collapse excessive whitespace
 * - Insert line breaks at sentence boundaries (german and english)
 */
function normalizeBody(text: string): string {
  return text
    // Strip RIS (Austria) page markers
    .replace(/Bundesrecht konsolidiert\s+www\.ris\.bka\.gv\.at\s+Seite\s+\d+\s+von\s+\d+\s*/gi, " ")
    // Strip gesetze-im-internet.de table-of-contents lines (short structural lines)
    .replace(/^(Buch|Abschnitt|Titel|Untertitel|Kapitel|Teil|Unterabschnitt)\s+\d+.*$/gm, "")
    // Collapse runs of 3+ spaces to single space
    .replace(/ {3,}/g, " ")
    // Insert newline after sentence end (". " followed by Uppercase or "(")
    .replace(/\.\s+([A-ZÄÖÜ(])/g, ".\n$1")
    // Insert newline before numbered list items "(1) ... (2)"
    .replace(/\s+\((\d+)\)\s+/g, "\n($1) ")
    // Clean up multiple newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildPageContent(fm: LawFrontmatter, abbr: string, paraNum: string, title: string, body: string): string {
  return [
    "---",
    `title: "${title.replace(/"/g, "'")}"`,
    `type: law`,
    `jurisdiction: ${fm.jurisdiction}`,
    `abbreviation: ${abbr}`,
    `parent_law: "${fm.title.replace(/"/g, "'")}"`,
    `paragraph: "${paraNum}"`,
    `version_date: ${fm.version_date || "unknown"}`,
    `retrieved_at: ${fm.retrieved_at || "unknown"}`,
    `source_url: ${fm.source_url || ""}`,
    `license: "${(fm.license || "").replace(/"/g, "'")}"`,
    "---",
    "",
    body,
  ].join("\n");
}

// ── DE: split at markdown `## § N — Title` headings ──────────────────

function splitDeLaw(filePath: string, outDir: string): { count: number; skipped: number } {
  const text = readFileSync(filePath, "utf8");
  const { fm, body } = parseFrontmatter(text);
  const abbr = fm.abbreviation;

  // Match DE heading format: `## § 433 — Vertragstypische Pflichten...`
  const headingRe = /^##\s+§\s*(\d+[a-zA-Z]?)\s*(?:[—\-–]\s*(.+))?$/gm;
  const matches = [...body.matchAll(headingRe)];

  if (matches.length === 0) {
    // Fallback: write whole file
    const slug = basename(filePath, ".md");
    writeFileSync(join(outDir, `${slug}.md`), text);
    return { count: 1, skipped: 0 };
  }

  let written = 0;
  let skipped = 0;
  const slugsSeen = new Set<string>();

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const paraNum = m[1];
    const paraTitle = (m[2] || "").trim();
    const start = m.index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : body.length;
    const rawBody = body.slice(start, end).trim();
    const normalizedBody = normalizeBody(rawBody);

    if (normalizedBody.length < MIN_CONTENT_BYTES) {
      skipped++;
      continue;
    }

    const slug = `${abbr.toLowerCase()}-par-${slugifyPara(paraNum)}`;

    if (slugsSeen.has(slug)) {
      // Duplicate heading (e.g. appears twice in ToC + body): keep first (longer) occurrence
      skipped++;
      continue;
    }
    slugsSeen.add(slug);

    const title = `${abbr} § ${paraNum}${paraTitle ? ` — ${paraTitle}` : ""}`;
    writeFileSync(join(outDir, `${slug}.md`), buildPageContent(fm, abbr, paraNum, title, normalizedBody));
    written++;
  }

  return { count: written, skipped };
}

// ── AT: split at inline `§ N.` patterns (RIS flat text) ──────────────
//
// AT laws from RIS are PDF-extracted single-line text. Format:
//   "§ 1. Title of section. Body text body text § 2. Next section..."
//
// Strategy:
//   1. Strip RIS page markers
//   2. Find all `§ N.` positions
//   3. Extract content between consecutive markers
//   4. Skip entries with too little content (ToC stubs, cross-refs)
//   5. Handle duplicate § numbers (e.g., § 3 in multiple Artikel)

function splitAtLaw(filePath: string, outDir: string): { count: number; skipped: number } {
  const text = readFileSync(filePath, "utf8");
  const { fm, body } = parseFrontmatter(text);
  const abbr = fm.abbreviation;

  // Find all inline § markers with their positions
  const paraRe = /§\s*(\d+[a-zA-Z]?)\./g;
  const positions: { num: string; idx: number }[] = [];
  let matchResult: RegExpExecArray | null;
  while ((matchResult = paraRe.exec(body)) !== null) {
    positions.push({ num: matchResult[1], idx: matchResult.index });
  }

  if (positions.length === 0) {
    const slug = basename(filePath, ".md");
    writeFileSync(join(outDir, `${slug}.md`), text);
    return { count: 1, skipped: 0 };
  }

  let written = 0;
  let skipped = 0;
  // Track slug → occurrence count for dedup
  const slugCount = new Map<string, number>();

  for (let i = 0; i < positions.length; i++) {
    const { num } = positions[i];
    const start = positions[i].idx;
    const end = i + 1 < positions.length ? positions[i + 1].idx : body.length;
    const rawContent = body.slice(start, end);
    const normalized = normalizeBody(rawContent);

    // Skip stubs: ToC refs and mere cross-references have very little content
    if (normalized.length < MIN_CONTENT_BYTES) {
      skipped++;
      continue;
    }

    const baseSlug = `${abbr.toLowerCase()}-par-${slugifyPara(num)}`;
    const occurrences = slugCount.get(baseSlug) ?? 0;
    slugCount.set(baseSlug, occurrences + 1);

    // Append variant suffix for duplicate § numbers across Artikel sections
    const slug = occurrences === 0 ? baseSlug : `${baseSlug}-v${occurrences + 1}`;

    const title = `${abbr} § ${num}`;
    writeFileSync(join(outDir, `${slug}.md`), buildPageContent(fm, abbr, num, title, normalized));
    written++;
  }

  return { count: written, skipped };
}

// ── CH: copy whole (well-formatted, small) ───────────────────────────

function copyWholeLaw(filePath: string, outDir: string): { count: number } {
  const text = readFileSync(filePath, "utf8");
  const slug = basename(filePath, ".md");
  writeFileSync(join(outDir, `${slug}.md`), text);
  return { count: 1 };
}

// ── Main ─────────────────────────────────────────────────────────────

const jurisdictions = (JUR_FILTER ? [JUR_FILTER] : ["de", "at", "ch"]) as string[];
let total = 0;
let splitCount = 0;
let wholeCount = 0;
let skippedCount = 0;

for (const j of jurisdictions) {
  const dir = join("law-corpus", j);
  const outDir = join(OUT, j);
  mkdirSync(outDir, { recursive: true });

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    console.warn(`  Skipping ${dir} (not found)`);
    continue;
  }

  for (const file of files) {
    const filePath = join(dir, file);
    try {
      if (j === "de") {
        const { count, skipped } = splitDeLaw(filePath, outDir);
        total += count;
        splitCount += count;
        skippedCount += skipped;
        console.log(`  de/${file} -> ${count} § pages (${skipped} skipped)`);
      } else if (j === "at") {
        const { count, skipped } = splitAtLaw(filePath, outDir);
        total += count;
        splitCount += count;
        skippedCount += skipped;
        console.log(`  at/${file} -> ${count} § pages (${skipped} skipped)`);
      } else {
        const { count } = copyWholeLaw(filePath, outDir);
        total += count;
        wholeCount += count;
        console.log(`  ${j}/${file} -> 1 whole page`);
      }
    } catch (err) {
      console.error(`  ERROR ${j}/${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

console.log(`\nDone: ${total} pages (${splitCount} split §, ${wholeCount} whole, ${skippedCount} skipped stubs)`);
console.log(`Output: ${OUT}/`);
