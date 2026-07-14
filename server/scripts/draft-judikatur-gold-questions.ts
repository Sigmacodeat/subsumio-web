#!/usr/bin/env bun
/**
 * draft-judikatur-gold-questions — generate validated draft retrieval
 * questions for the AT judikatur (OGH) gold set from the real corpus.
 *
 *   bun run server/scripts/draft-judikatur-gold-questions.ts
 *
 * Reads server/law-corpus/at-judikatur/*.md (RIS Rechtssatz exports: each
 * file has a `Norm` field — the statute/§ interpreted — and a `Rechtssatz`
 * field — the legal principle in natural German prose, describing the
 * decision WITHOUT naming its own Geschäftszahl/case number).
 *
 * LEAKAGE RULE (2026-07-14 audit finding, same class as the statute gold-set
 * bug fixed the same day): a query must NEVER contain the target decision's
 * Geschäftszahl (case number, e.g. "6Ob26/66") or ECLI. The § / statute
 * abbreviation from the Norm field IS allowed (that's the legal concept
 * being searched for, not the answer's identifier) — same convention as the
 * existing 20 hand-curated entries in corpus.ts ("OGH ZPO Berufung
 * Beweiswürdigung §292" is fine; the case number is not in the query).
 *
 * No LLM, no API keys — deterministic and offline. Output is DRAFT status;
 * a human reviewer (draft-gold-questions.ts's pending-review.ts pattern)
 * must set reviewed_by + reviewed_at before any entry counts as gold.
 */

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";

const REPO = join(import.meta.dir, "..", "..");
const JUDIKATUR_DIR = join(REPO, "server", "law-corpus", "at-judikatur");
const OUT_FILE = join(
  REPO,
  "server",
  "test",
  "fixtures",
  "retrieval-quality",
  "legal-at-judikatur",
  "pending-review.ts"
);
const TARGET_COUNT = 30;

// Existing gold refs (from corpus.ts) — never duplicate a target decision.
const EXISTING_GOLD_FILES = new Set([
  "1979-06-12-6ob154-61",
  "1986-04-24-6ob657-85",
  "1995-05-24-4ob149-61",
  "1992-10-21-9oba256-92",
  "1983-03-22-9os18-83",
  "1985-05-30-12os42-85",
  "1989-06-29-12os32-89",
  "1983-03-22-11os29-79",
  "1983-12-20-10os182-83",
  "1982-10-14-12os70-77",
  "1986-02-12-9os2-86",
  "1985-09-19-10os29-77",
  "1985-09-19-12os99-85",
  "1989-01-19-12os179-83",
  "1961-02-16-2ob31-61",
  "1964-10-23-7ob157-64",
  "1971-07-08-2ob314-70",
  "1978-10-19-7ob85-69",
  "1981-11-17-4ob547-81-4ob548-81",
  "1987-04-07-5ob39-87",
]);

// Diverse target statutes — spread the draft set across legal domains
// instead of letting the Zivilrecht-heavy corpus (9853/10807 files) dominate.
const TARGET_NORM_ABBRS = [
  "ABGB",
  "StGB",
  "StPO",
  "ZPO",
  "EO",
  "UGB",
  "ASVG",
  "ArbVG",
  "KSchG",
  "MRG",
  "AußStrG",
  "IO",
];

interface DecisionMeta {
  fileBase: string;
  caseNumber: string;
  ecli: string | null;
  legalArea: string;
  normLine: string | null;
  normAbbr: string | null;
  rechtssatz: string;
}

function extractField(content: string, label: string): string | null {
  const re = new RegExp(`^${label}\\n([\\s\\S]*?)(?=\\n[A-ZÄÖÜ][a-zA-Zäöüß]*\\n|\\n$)`, "m");
  const m = re.exec(content);
  return m ? m[1].trim() : null;
}

function parseDecision(fileBase: string): DecisionMeta | null {
  const raw = readFileSync(join(JUDIKATUR_DIR, `${fileBase}.md`), "utf8");
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  const fm = fmMatch ? fmMatch[1] : "";
  const caseNumberM = /^case_number:\s*(.+)$/m.exec(fm);
  const ecliM = /^ecli:\s*(.+)$/m.exec(fm);
  const areaM = /^legal_area:\s*(.+)$/m.exec(fm);
  if (!caseNumberM) return null;

  const body = raw.slice(fmMatch ? fmMatch[0].length : 0);
  const normRaw = extractField(body, "Norm");
  const rechtssatz = extractField(body, "Rechtssatz");
  if (!rechtssatz || rechtssatz.length < 40) return null;

  const normLine = normRaw ? normRaw.split("\n")[0].trim() : null;
  const normAbbrM = normLine ? /^([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.-]*)/.exec(normLine) : null;

  return {
    fileBase,
    caseNumber: caseNumberM[1].trim(),
    ecli: ecliM ? ecliM[1].trim() : null,
    legalArea: areaM ? areaM[1].trim() : "Unbekannt",
    normLine,
    normAbbr: normAbbrM ? normAbbrM[1].trim() : null,
    rechtssatz: rechtssatz.split("\n")[0].trim(), // first (unspaced) sentence variant
  };
}

const STOPWORDS = new Set([
  "der",
  "die",
  "das",
  "und",
  "oder",
  "ist",
  "sind",
  "ein",
  "eine",
  "einer",
  "eines",
  "einem",
  "einen",
  "wird",
  "wurde",
  "werden",
  "dass",
  "wenn",
  "auch",
  "nur",
  "nicht",
  "sich",
  "von",
  "mit",
  "auf",
  "für",
  "zu",
  "im",
  "in",
  "an",
  "bei",
  "als",
  "es",
  "hat",
  "kann",
  "muss",
  "dann",
  "so",
  "diese",
  "dieser",
  "dieses",
  "durch",
  "nach",
  "vor",
  "unter",
  "über",
  "andernfalls",
]);

/** Extract 4-6 salient German keywords from the Rechtssatz sentence, never
 *  including the case number (the sentence describes the LEGAL PRINCIPLE,
 *  not its own citation, so this is leakage-safe by construction). */
function extractKeywords(sentence: string): string[] {
  const words = sentence
    .replace(/[§.,;:()"']/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !STOPWORDS.has(w.toLowerCase()));
  // Prefer longer, more specific words (legal terms tend to be compounds).
  const sorted = [...new Set(words)].sort((a, b) => b.length - a.length);
  return sorted.slice(0, 5);
}

function craftQuery(d: DecisionMeta): string | null {
  const kws = extractKeywords(d.rechtssatz);
  if (kws.length < 3) return null;
  const parts = ["OGH", ...kws.slice(0, 4)];
  if (d.normAbbr) parts.push(d.normAbbr);
  const query = parts.join(" ");
  // Leakage guard: the case number (any form: spaced, unspaced, slash-less)
  // must not appear in the crafted query.
  const caseNumNorm = d.caseNumber.toLowerCase().replace(/[\s/]/g, "");
  const queryNorm = query.toLowerCase().replace(/[\s/]/g, "");
  if (caseNumNorm.length > 0 && queryNorm.includes(caseNumNorm)) return null;
  return query;
}

function generate(): Array<{
  query: string;
  fileBase: string;
  caseNumber: string;
  legalArea: string;
  normAbbr: string;
}> {
  const files = readdirSync(JUDIKATUR_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
    .filter((base) => !EXISTING_GOLD_FILES.has(base));

  const byAbbr = new Map<string, DecisionMeta[]>();
  for (const base of files) {
    let meta: DecisionMeta | null;
    try {
      meta = parseDecision(base);
    } catch {
      continue;
    }
    if (!meta || !meta.normAbbr) continue;
    if (!TARGET_NORM_ABBRS.includes(meta.normAbbr)) continue;
    const list = byAbbr.get(meta.normAbbr) ?? [];
    list.push(meta);
    byAbbr.set(meta.normAbbr, list);
  }

  const perAbbrTarget = Math.ceil(TARGET_COUNT / TARGET_NORM_ABBRS.length);
  const out: Array<{
    query: string;
    fileBase: string;
    caseNumber: string;
    legalArea: string;
    normAbbr: string;
  }> = [];
  const usedQueries = new Set<string>();

  for (const abbr of TARGET_NORM_ABBRS) {
    const candidates = byAbbr.get(abbr) ?? [];
    let added = 0;
    for (const c of candidates) {
      if (added >= perAbbrTarget) break;
      const query = craftQuery(c);
      if (!query || usedQueries.has(query)) continue;
      usedQueries.add(query);
      out.push({
        query,
        fileBase: c.fileBase,
        caseNumber: c.caseNumber,
        legalArea: c.legalArea,
        normAbbr: abbr,
      });
      added++;
    }
  }
  return out;
}

function writeOutput(drafts: ReturnType<typeof generate>): void {
  const lines: string[] = [
    "/**",
    " * AT judikatur (OGH) retrieval gold set — PENDING REVIEW (draft questions).",
    " *",
    " * Generated by server/scripts/draft-judikatur-gold-questions.ts from the",
    " * real at-judikatur/ RIS Rechtssatz corpus. Every file existence-checked.",
    " *",
    " * LEAKAGE RULE: no query contains the target decision's Geschäftszahl",
    " * (case number) or ECLI — queries are built from the Rechtssatz legal-",
    " * principle text + the interpreted statute's abbreviation, never the",
    " * decision's own citation.",
    " *",
    " * Review workflow (matches server/test/fixtures/retrieval-quality/legal-at/",
    " * pending-review.ts): review each entry, set reviewed_by + reviewed_at,",
    " * then move approved entries into corpus.ts's JUDIKATUR_GOLD.",
    " *",
    " * DO NOT move entries to the gold set without reviewed_by + reviewed_at.",
    " */",
    "",
    "export interface JudikaturDraftEntry {",
    "  query: string;",
    "  fileBase: string;",
    "  caseNumber: string;",
    "  legalArea: string;",
    "  normAbbr: string;",
    '  status: "draft" | "reviewed";',
    "  reviewed_by?: string;",
    "  reviewed_at?: string;",
    "}",
    "",
    "export const JUDIKATUR_PENDING: JudikaturDraftEntry[] = [",
  ];
  for (const d of drafts) {
    lines.push(
      `  { query: "${d.query.replace(/"/g, '\\"')}", fileBase: "${d.fileBase}", caseNumber: "${d.caseNumber}", legalArea: "${d.legalArea}", normAbbr: "${d.normAbbr}", status: "draft" },`
    );
  }
  lines.push("];");
  lines.push("");
  writeFileSync(OUT_FILE, lines.join("\n"), "utf8");
}

const drafts = generate();
writeOutput(drafts);

console.log(`Generated ${drafts.length} draft judikatur questions:\n`);
const perAbbr = new Map<string, number>();
for (const d of drafts) perAbbr.set(d.normAbbr, (perAbbr.get(d.normAbbr) ?? 0) + 1);
for (const [abbr, n] of perAbbr) console.log(`  ${abbr}: ${n}`);
console.log(`\nTotal: ${drafts.length} (existing gold: ${EXISTING_GOLD_FILES.size})`);
console.log(`Output: ${OUT_FILE}`);
