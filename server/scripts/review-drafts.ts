#!/usr/bin/env bun
/**
 * review-drafts — CLI helper for reviewing draft gold questions.
 *
 * Usage:
 *   bun run server/scripts/review-drafts.ts --stats
 *   bun run server/scripts/review-drafts.ts --domain="Strafrecht"
 *   bun run server/scripts/review-drafts.ts --show=42
 *   bun run server/scripts/review-drafts.ts --approve=42 --reviewer="Max"
 *   bun run server/scripts/review-drafts.ts --promote
 *
 * All operations read/write pending-review.ts and corpus.ts directly.
 * No LLM, no API keys — deterministic and offline.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { splitStatute } from "../src/core/legal/split-statute.ts";

const REPO = join(import.meta.dir, "..", "..");
const CORPUS = join(REPO, "law-corpus");
const PENDING_FILE = join(REPO, "server", "test", "fixtures", "retrieval-quality", "legal-at", "pending-review.ts");
const CORPUS_FILE = join(REPO, "server", "test", "fixtures", "retrieval-quality", "legal-at", "corpus.ts");

// ── Types ────────────────────────────────────────────────────────────────────

interface Ref {
  jur: "at" | "de";
  file: string;
  abbr: string;
  ref: string;
}

interface DraftEntry {
  query: string;
  family: string;
  at: Ref;
  de?: Ref;
  domain: string;
  status: "draft" | "reviewed";
  reviewed_by?: string;
  reviewed_at?: string;
}

// ── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name: string): string | null {
  const flag = `--${name}=`;
  const found = args.find((a) => a.startsWith(flag));
  return found ? found.slice(flag.length) : null;
}
function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

// ── File parsing ─────────────────────────────────────────────────────────────

function parsePendingFile(): DraftEntry[] {
  const raw = readFileSync(PENDING_FILE, "utf8");
  // Extract entries from the LEGAL_AT_PENDING array
  const entries: DraftEntry[] = [];
  const lines = raw.split("\n");
  let inArray = false;
  let currentDomain = "";

  for (const line of lines) {
    if (line.includes("export const LEGAL_AT_PENDING")) {
      inArray = true;
      continue;
    }
    if (inArray && line.trim() === "];") {
      break;
    }
    if (!inArray) continue;

    // Track domain from comments
    const domMatch = line.match(/\/\/ ── (.+?) \(/);
    if (domMatch) {
      currentDomain = domMatch[1];
      continue;
    }

    // Parse entry lines — handle both with and without reviewed_by/reviewed_at
    const entryMatch = line.match(
      /\{\s*query:\s*"(.*?)",\s*family:\s*"(.*?)",\s*at:\s*A\("(.*?)",\s*"(.*?)",\s*"(.*?)"\)(?:,\s*de:\s*D\("(.*?)",\s*"(.*?)",\s*"(.*?)"\))?,\s*domain:\s*"(.*?)",\s*status:\s*"(.*?)"(?:,\s*reviewed_by:\s*"(.*?)")?(?:,\s*reviewed_at:\s*"(.*?)")?\s*\},?/,
    );
    if (entryMatch) {
      const [
        , query, family, atFile, atAbbr, atRef, deFile, deAbbr, deRef, domain, status, reviewedBy, reviewedAt,
      ] = entryMatch;
      entries.push({
        query,
        family,
        at: { jur: "at", file: atFile, abbr: atAbbr, ref: atRef },
        de: deFile ? { jur: "de", file: deFile, abbr: deAbbr, ref: deRef } : undefined,
        domain,
        status: status as "draft" | "reviewed",
        reviewed_by: reviewedBy || undefined,
        reviewed_at: reviewedAt || undefined,
      });
    }
  }
  return entries;
}

function writePendingFile(entries: DraftEntry[]): void {
  const raw = readFileSync(PENDING_FILE, "utf8");
  // Preserve header up to the array
  const arrayStart = raw.indexOf("export const LEGAL_AT_PENDING");
  const header = raw.slice(0, arrayStart);

  const lines: string[] = [header];

  // Group by domain
  const byDomain = new Map<string, DraftEntry[]>();
  for (const e of entries) {
    const list = byDomain.get(e.domain) ?? [];
    list.push(e);
    byDomain.set(e.domain, list);
  }

  lines.push("export const LEGAL_AT_PENDING: DraftEntry[] = [");
  for (const [domain, domainEntries] of byDomain) {
    lines.push(`  // ── ${domain} (${domainEntries.length} questions) ────────────────────────────`);
    for (const e of domainEntries) {
      const at = `A("${e.at.file}", "${e.at.abbr}", "${e.at.ref}")`;
      const de = e.de ? `, de: D("${e.de.file}", "${e.de.abbr}", "${e.de.ref}")` : "";
      const reviewed = e.reviewed_by
        ? `, status: "${e.status}", reviewed_by: "${e.reviewed_by}", reviewed_at: "${e.reviewed_at}"`
        : `, status: "${e.status}"`;
      lines.push(
        `  { query: "${e.query.replace(/"/g, '\\"')}", family: "${e.family}", at: ${at}${de}, domain: "${e.domain}"${reviewed} },`,
      );
    }
    lines.push("");
  }
  lines.push("];");
  lines.push("");
  lines.push("/** Draft entries with reviewed_by + reviewed_at, ready for promotion to corpus.ts. */");
  lines.push("export const LEGAL_AT_REVIEWED: DraftEntry[] = LEGAL_AT_PENDING.filter(");
  lines.push('  (e) => e.status === "reviewed" && e.reviewed_by && e.reviewed_at');
  lines.push(");");
  lines.push("");

  writeFileSync(PENDING_FILE, lines.join("\n"), "utf8");
}

// ── Section text extraction ──────────────────────────────────────────────────

const splitCache = new Map<string, ReturnType<typeof splitStatute>>();

function getSectionText(file: string, ref: string): { title: string; body: string } | null {
  let split = splitCache.get(file);
  if (!split) {
    try {
      split = splitStatute(readFileSync(join(CORPUS, file), "utf8"));
      splitCache.set(file, split);
    } catch {
      return null;
    }
  }
  const sec = split.sections.find((s) => {
    if (s.ref !== ref && s.id !== `p-${ref}`) return false;
    const body = s.body.trim();
    if (body.length < 50) return false;
    if (/^## Inkrafttretensdatum\s+\d/.test(body) && body.length < 200) return false;
    return true;
  });
  if (!sec) return null;
  return { title: sec.title || "", body: sec.body.trim() };
}

// ── Commands ─────────────────────────────────────────────────────────────────

function cmdStats(): void {
  const entries = parsePendingFile();
  const byDomain = new Map<string, { total: number; draft: number; reviewed: number }>();
  for (const e of entries) {
    const stats = byDomain.get(e.domain) ?? { total: 0, draft: 0, reviewed: 0 };
    stats.total++;
    if (e.status === "reviewed") stats.reviewed++;
    else stats.draft++;
    byDomain.set(e.domain, stats);
  }

  console.log("\n┌─ Draft Review Stats ─────────────────────────────────────────┐");
  console.log("│ Domain                              Total  Draft  Reviewed  │");
  console.log("│ ──────────────────────────────────  ─────  ─────  ────────  │");
  let totalAll = 0, draftAll = 0, reviewedAll = 0;
  for (const [domain, stats] of byDomain) {
    const pad = domain.padEnd(36);
    console.log(`│ ${pad}  ${String(stats.total).padStart(5)}  ${String(stats.draft).padStart(5)}  ${String(stats.reviewed).padStart(8)}  │`);
    totalAll += stats.total;
    draftAll += stats.draft;
    reviewedAll += stats.reviewed;
  }
  console.log("│ ──────────────────────────────────  ─────  ─────  ────────  │");
  console.log(`│ ${"TOTAL".padEnd(36)}  ${String(totalAll).padStart(5)}  ${String(draftAll).padStart(5)}  ${String(reviewedAll).padStart(8)}  │`);
  console.log("└──────────────────────────────────────────────────────────────┘\n");
}

function cmdListDomain(domain: string): void {
  const entries = parsePendingFile();
  const filtered = entries.filter((e) => e.domain === domain);
  if (filtered.length === 0) {
    console.log(`\nNo entries found for domain "${domain}".`);
    console.log("Available domains:");
    const domains = new Set(entries.map((e) => e.domain));
    for (const d of domains) console.log(`  - ${d}`);
    return;
  }

  console.log(`\n┌─ ${domain} (${filtered.length} entries) ────────────────────────────────┐`);
  filtered.forEach((e, i) => {
    const idx = entries.indexOf(e);
    const status = e.status === "reviewed" ? "✓" : "○";
    const deTag = e.de ? ` [DE: ${e.de.abbr} § ${e.de.ref}]` : "";
    console.log(`  ${status} #${idx}  ${e.query}${deTag}`);
  });
  console.log("└──────────────────────────────────────────────────────────────┘\n");
}

function cmdShow(indexStr: string): void {
  const index = parseInt(indexStr, 10);
  const entries = parsePendingFile();
  if (index < 0 || index >= entries.length) {
    console.log(`\nInvalid index ${index}. Valid range: 0–${entries.length - 1}.`);
    return;
  }

  const e = entries[index];
  console.log("\n┌─ Entry #" + index + " ──────────────────────────────────────────────┐");
  console.log(`│ Domain:   ${e.domain}`);
  console.log(`│ Query:    ${e.query}`);
  console.log(`│ Family:   ${e.family}`);
  console.log(`│ Status:   ${e.status}${e.reviewed_by ? ` (by ${e.reviewed_by} at ${e.reviewed_at})` : ""}`);
  console.log("│");

  // AT section text
  const atText = getSectionText(e.at.file, e.at.ref);
  console.log(`│ ── AT: ${e.at.abbr.toUpperCase()} § ${e.at.ref} (${e.at.file}) ──`);
  if (atText) {
    const body = atText.body.slice(0, 500);
    for (const line of body.split("\n").slice(0, 10)) {
      console.log(`│   ${line}`);
    }
    if (atText.body.length > 500) console.log("│   [...] truncated");
  } else {
    console.log("│   [NOT FOUND]");
  }

  // DE section text (if present)
  if (e.de) {
    console.log("│");
    const deText = getSectionText(e.de.file, e.de.ref);
    console.log(`│ ── DE: ${e.de.abbr.toUpperCase()} § ${e.de.ref} (${e.de.file}) ──`);
    if (deText) {
      const body = deText.body.slice(0, 500);
      for (const line of body.split("\n").slice(0, 10)) {
        console.log(`│   ${line}`);
      }
      if (deText.body.length > 500) console.log("│   [...] truncated");
    } else {
      console.log("│   [NOT FOUND]");
    }
  }
  console.log("└──────────────────────────────────────────────────────────────┘\n");
}

function cmdApprove(indexStr: string, reviewer: string): void {
  const index = parseInt(indexStr, 10);
  const entries = parsePendingFile();
  if (index < 0 || index >= entries.length) {
    console.log(`\nInvalid index ${index}. Valid range: 0–${entries.length - 1}.`);
    return;
  }

  const e = entries[index];
  e.status = "reviewed";
  e.reviewed_by = reviewer;
  e.reviewed_at = new Date().toISOString().slice(0, 10);

  writePendingFile(entries);
  console.log(`\n✓ Approved entry #${index}: "${e.query}"`);
  console.log(`  Reviewer: ${e.reviewed_by}, Date: ${e.reviewed_at}`);
  console.log(`  Written to: ${PENDING_FILE}\n`);
}

function cmdPromote(): void {
  const entries = parsePendingFile();
  const reviewed = entries.filter((e) => e.status === "reviewed" && e.reviewed_by && e.reviewed_at);
  if (reviewed.length === 0) {
    console.log("\nNo reviewed entries to promote. Use --approve=<index> --reviewer=\"<name>\" first.\n");
    return;
  }

  // Read corpus.ts and find where to insert
  const corpusRaw = readFileSync(CORPUS_FILE, "utf8");
  const arrayEnd = corpusRaw.lastIndexOf("];");

  // Build new gold entries
  const newEntries: string[] = [];
  for (const e of reviewed) {
    const at = `A("${e.at.file}", "${e.at.abbr}", "${e.at.ref}")`;
    const de = e.de ? `, de: D("${e.de.file}", "${e.de.abbr}", "${e.de.ref}")` : "";
    newEntries.push(
      `  { query: "${e.query.replace(/"/g, '\\"')}", family: "${e.family}", at: ${at}${de} },`,
    );
  }

  // Insert before the closing ];
  const updated = corpusRaw.slice(0, arrayEnd) +
    "  // ── Promoted from pending-review.ts ────────────────────────────\n" +
    newEntries.join("\n") + "\n" +
    corpusRaw.slice(arrayEnd);

  writeFileSync(CORPUS_FILE, updated, "utf8");

  // Remove promoted entries from pending-review.ts
  const remaining = entries.filter((e) => !(e.status === "reviewed" && e.reviewed_by && e.reviewed_at));
  writePendingFile(remaining);

  console.log(`\n✓ Promoted ${reviewed.length} reviewed entries to corpus.ts (LEGAL_AT_GOLD).`);
  console.log(`  Remaining in pending-review.ts: ${remaining.length}`);
  console.log(`  Corpus file: ${CORPUS_FILE}`);
  console.log(`  Pending file: ${PENDING_FILE}\n`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

if (hasFlag("stats")) {
  cmdStats();
} else if (getArg("domain")) {
  cmdListDomain(getArg("domain")!);
} else if (getArg("show")) {
  cmdShow(getArg("show")!);
} else if (getArg("approve") && getArg("reviewer")) {
  cmdApprove(getArg("approve")!, getArg("reviewer")!);
} else if (hasFlag("promote")) {
  cmdPromote();
} else {
  console.log(`
review-drafts — CLI helper for reviewing draft gold questions

Usage:
  bun run server/scripts/review-drafts.ts --stats
    Show review progress per domain.

  bun run server/scripts/review-drafts.ts --domain="Strafrecht"
    List all draft entries for a domain.

  bun run server/scripts/review-drafts.ts --show=42
    Show entry #42 with AT and DE § text side-by-side.

  bun run server/scripts/review-drafts.ts --approve=42 --reviewer="Max"
    Mark entry #42 as reviewed by Max.

  bun run server/scripts/review-drafts.ts --promote
    Move all reviewed entries from pending-review.ts to corpus.ts.

Available domains:
  Zivilrecht/Schadenersatz, Mietrecht, Arbeitsrecht, Gesellschaftsrecht,
  Insolvenzrecht, Strafrecht, Zivilverfahren/Exekution, Verwaltung/Verfassung,
  Konsumentenschutz/E-Commerce
`);
}
