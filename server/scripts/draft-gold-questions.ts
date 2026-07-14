#!/usr/bin/env bun
/**
 * draft-gold-questions — generate validated draft questions for the AT legal
 * retrieval gold set from the real statute corpus.
 *
 *   bun run server/scripts/draft-gold-questions.ts
 *
 * Reads law-corpus/at/*.md + law-corpus/de/*.md, splits each into per-§
 * sections via splitStatute, crafts natural-language queries, finds DE
 * distractors, validates every § against law-corpus-split/at/, and writes
 * the output to server/test/fixtures/retrieval-quality/legal-at/pending-review.ts.
 *
 * No LLM, no API keys — deterministic and offline.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, basename } from "path";
import { splitStatute, type StatuteSection } from "../src/core/legal/split-statute.ts";

const REPO = join(import.meta.dir, "..", "..");
const CORPUS = join(REPO, "law-corpus");
const SPLIT_CORPUS_AT = join(REPO, "law-corpus-split", "at");
const SPLIT_CORPUS_DE = join(REPO, "law-corpus-split", "de");
const OUT_FILE = join(REPO, "server", "test", "fixtures", "retrieval-quality", "legal-at", "pending-review.ts");

// ── Types (mirrors corpus.ts) ────────────────────────────────────────────────

interface Ref {
  jur: "at" | "de";
  file: string;
  abbr: string;
  ref: string;
}

type Family = "concept" | "keyword" | "code-scoped";

interface DraftEntry {
  query: string;
  family: Family;
  at: Ref;
  de?: Ref;
  domain: string;
  status: "draft";
  reviewed_by?: string;
  reviewed_at?: string;
}

// ── Domain configuration ─────────────────────────────────────────────────────

interface DomainConfig {
  name: string;
  laws: { file: string; abbr: string; deLaw?: { file: string; abbr: string } }[];
  count: number;
}

const DOMAINS: DomainConfig[] = [
  {
    name: "Zivilrecht/Schadenersatz",
    laws: [{ file: "at/abgb.md", abbr: "abgb", deLaw: { file: "de/bgb.md", abbr: "bgb" } }],
    count: 25,
  },
  {
    name: "Mietrecht",
    laws: [
      { file: "at/mrg.md", abbr: "mrg", deLaw: { file: "de/bgb.md", abbr: "bgb" } },
      { file: "at/weg.md", abbr: "weg", deLaw: { file: "de/bgb.md", abbr: "bgb" } },
    ],
    count: 15,
  },
  {
    name: "Arbeitsrecht",
    laws: [
      { file: "at/angg.md", abbr: "angg", deLaw: { file: "de/betrvg.md", abbr: "betrvg" } },
      { file: "at/arbvg.md", abbr: "arbvg", deLaw: { file: "de/betrvg.md", abbr: "betrvg" } },
      { file: "at/avrag.md", abbr: "avrag", deLaw: { file: "de/betrvg.md", abbr: "betrvg" } },
      { file: "at/azg.md", abbr: "azg", deLaw: { file: "de/betrvg.md", abbr: "betrvg" } },
    ],
    count: 20,
  },
  {
    name: "Gesellschaftsrecht",
    laws: [
      { file: "at/ugb.md", abbr: "ugb", deLaw: { file: "de/hgb.md", abbr: "hgb" } },
      { file: "at/gmbhg-at.md", abbr: "gmbhg", deLaw: { file: "de/gmbhg.md", abbr: "gmbhg" } },
      { file: "at/aktg-at.md", abbr: "aktg", deLaw: { file: "de/hgb.md", abbr: "hgb" } },
    ],
    count: 20,
  },
  {
    name: "Insolvenzrecht",
    laws: [{ file: "at/io.md", abbr: "io", deLaw: { file: "de/inso.md", abbr: "inso" } }],
    count: 15,
  },
  {
    name: "Strafrecht",
    laws: [
      { file: "at/stgb-at.md", abbr: "stgb", deLaw: { file: "de/stgb.md", abbr: "stgb" } },
      { file: "at/stpo-at.md", abbr: "stpo", deLaw: { file: "de/stpo.md", abbr: "stpo" } },
    ],
    count: 20,
  },
  {
    name: "Zivilverfahren/Exekution",
    laws: [
      { file: "at/zpo-at.md", abbr: "zpo", deLaw: { file: "de/zpo.md", abbr: "zpo" } },
      { file: "at/eo.md", abbr: "eo", deLaw: { file: "de/zpo.md", abbr: "zpo" } },
      { file: "at/au-strg.md", abbr: "au-strg", deLaw: { file: "de/zpo.md", abbr: "zpo" } },
    ],
    count: 15,
  },
  {
    name: "Verwaltung/Verfassung",
    laws: [
      { file: "at/avg.md", abbr: "avg", deLaw: { file: "de/vwgo.md", abbr: "vwgo" } },
      { file: "at/b-vg.md", abbr: "b-vg", deLaw: { file: "de/gg.md", abbr: "gg" } },
    ],
    count: 10,
  },
  {
    name: "Konsumentenschutz/E-Commerce",
    laws: [
      { file: "at/kschg.md", abbr: "kschg", deLaw: { file: "de/bgb.md", abbr: "bgb" } },
      { file: "at/ecg.md", abbr: "ecg", deLaw: { file: "de/bgb.md", abbr: "bgb" } },
      { file: "at/dsg-at.md", abbr: "dsg", deLaw: { file: "de/bdsg.md", abbr: "bdsg" } },
    ],
    count: 10,
  },
];

// ── Existing gold refs (to skip duplicates) ──────────────────────────────────

const EXISTING_GOLD_REFS = new Set<string>([
  "at:abgb:1489", "at:abgb:922", "at:abgb:918", "at:abgb:1295", "at:abgb:1053", "at:abgb:914",
  "at:mrg:30", "at:gmbhg:6", "at:io:66", "at:stgb:127", "at:stgb:75",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

const splitCache = new Map<string, StatuteSection[]>();

function loadSplit(file: string): StatuteSection[] {
  let cached = splitCache.get(file);
  if (!cached) {
    const raw = readFileSync(join(CORPUS, file), "utf8");
    cached = splitStatute(raw).sections;
    splitCache.set(file, cached);
  }
  return cached;
}

/** Check that a § exists in law-corpus-split/{at,de}/ with substantive body text.
 *  Uses the filename basename (e.g. "stgb-at") not the abbr (e.g. "stgb").
 *  Falls back to splitStatute validation for laws without pre-split files. */
function validateSplitRef(file: string, ref: string, jurisdiction: "at" | "de" = "at"): boolean {
  const baseName = basename(file, ".md");
  const splitDir = jurisdiction === "at" ? SPLIT_CORPUS_AT : SPLIT_CORPUS_DE;
  const splitFile = join(splitDir, `${baseName}-par-${ref}.md`);
  if (!existsSync(splitFile)) {
    // Fallback: validate via splitStatute on the source file
    const sections = loadSplit(file);
    // Find the first substantive section matching this ref (B-VG has duplicate refs)
    const sec = sections.find((s) => (s.ref === ref || s.id === `p-${ref}`) && isSubstantive(s));
    if (!sec) return false;
    return true;
  }
  const raw = readFileSync(splitFile, "utf8");
  // Strip frontmatter, check body has substantive text (>50 chars)
  const fmEnd = raw.indexOf("\n---", 3);
  const body = fmEnd >= 0 ? raw.slice(fmEnd + 4).trim() : raw.trim();
  if (body.length < 50) return false;
  // Skip repealed/empty sections
  if (/^(aufgehoben|weggefallen|§\s*\d+\.?\s*$)/i.test(body)) return false;
  return true;
}

/** Extract meaningful keywords from a section title + body snippet. */
function extractKeywords(title: string, body: string): string[] {
  const text = `${title} ${body.slice(0, 300)}`.toLowerCase();
  // German legal stop words
  const stop = new Set([
    "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "eines", "einem", "einen",
    "und", "oder", "aber", "nicht", "ist", "wird", "werden", "wurde", "worden", "hat", "haben",
    "hatte", "gehabt", "kann", "könne", "darf", "soll", "muss", "müsse", "auf", "in", "an", "bei",
    "mit", "von", "zu", "zur", "zum", "nach", "vor", "über", "unter", "durch", "für", "gegen",
    "ohne", "um", "als", "wie", "so", "auch", "nur", "noch", "schon", "wenn", "dann", "hier",
    "dort", "dies", "diese", "dieser", "dieses", "jenem", "welcher", "welche", "welches",
    "sich", "sein", "seine", "ihre", "ihrem", "ihren", "ihres", "einem", "welche", "wer",
    "etwa", "jedenfalls", "insbesondere", "jedoch", "jede", "jeder", "jedes", "alle", "aller",
    "abs", "satz", "ziffer", "lit", "nr", "punkt", "paragraph", "§",
  ]);
  const words = text
    .replace(/[§\d.,;:!?()«»"\-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stop.has(w));
  // Dedupe + return top 5
  const seen = new Set<string>();
  const result: string[] = [];
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      result.push(w);
      if (result.length >= 5) break;
    }
  }
  return result;
}

/** Query pattern templates by legal topic.
 *  These prepend a concept phrase to the body keywords for better retrieval.
 *  The body keywords are critical for hybrid search — templates alone are too generic. */
const QUERY_PATTERNS: { match: RegExp; prefix: string }[] = [
  { match: /verjähr|verjaehr/i, prefix: "Verjährung" },
  { match: /gewähr|mängel|maengel/i, prefix: "Gewährleistung Mängel" },
  { match: /schadenersatz|schadensersatz|ersatz.*schaden/i, prefix: "Schadenersatz" },
  { match: /kündigung|kuendigung|beendigung|auflösung|aufloesung/i, prefix: "Kündigung Beendigung" },
  { match: /haftung|haftet|haftbar/i, prefix: "Haftung" },
  { match: /vertrag|vertrags/i, prefix: "Vertrag" },
  { match: /eigentum|besitz/i, prefix: "Eigentum Besitz" },
  { match: /insolvenz|konkurs|sanierung/i, prefix: "Insolvenz" },
  { match: /strafbar|strafe|strafbestimmung|bestraft/i, prefix: "Strafe Strafbarkeit" },
  { match: /beweis|beweisaufnahme/i, prefix: "Beweis" },
  { match: /frist|termin|fällig|faellig/i, prefix: "Frist" },
  { match: /zuständig|zustaendig|gericht/i, prefix: "Zuständigkeit Gericht" },
  { match: /vollstreck|exekution|pfändung|pfaendung/i, prefix: "Exekution Vollstreckung" },
  { match: /datenschutz|daten|verarbeitung/i, prefix: "Datenschutz" },
  { match: /verbraucher|konsument/i, prefix: "Verbraucherschutz" },
  { match: /gesellschaft|geschäftsführer|gesellschafter|aufsichtsrat/i, prefix: "Gesellschaftsrecht" },
  { match: /arbeitszeit|urlaub|dienstverhältnis|arbeitnehmer|angestellte/i, prefix: "Arbeitsrecht" },
  { match: /verwaltungsverfahren|bescheid|behörde/i, prefix: "Verwaltungsverfahren" },
  { match: /verfassung|gesetzgebung|nationalrat|bundespräsident/i, prefix: "Verfassung" },
];

/**
 * Generate a realistic German legal query from a section.
 *
 * LEAKAGE RULE (audit 2026-07-14): the query must NEVER contain the § number.
 * A query that already cites "ABGB § 138" measures citation-string matching,
 * not concept→norm retrieval — hit@1 on such a set is meaningless. The code
 * abbreviation alone is allowed in the "code-scoped" family only (lawyers do
 * scope searches to a code: "Kündigungsfristen AngG"), never the § ref.
 *
 * Returns null when no §-free query can be built (the section is skipped).
 */
function craftQuery(
  section: StatuteSection,
  abbr: string,
  index: number
): { query: string; family: Family } | null {
  const abbrUpper = abbr.toUpperCase().replace(/-AT$/, "");
  const kws = extractKeywords(section.title, section.body);
  const titleBody = `${section.title} ${section.body.slice(0, 200)}`;

  // Find matching concept prefix (if any)
  let prefix = "";
  for (const p of QUERY_PATTERNS) {
    if (p.match.test(titleBody)) {
      prefix = p.prefix;
      break;
    }
  }

  // Body keywords are essential for hybrid search — they come from the actual § text
  const kwPart = kws.slice(0, 3).join(" ");

  // Every 5th question: code-scoped (keywords + code abbreviation, NO § ref)
  if (index % 5 === 4 && kws.length >= 2) {
    return { query: `${kwPart} ${abbrUpper}`, family: "code-scoped" };
  }

  if (prefix && kws.length >= 2) {
    // Every 3rd question: concept-first
    if (index % 3 === 0) {
      return { query: `${prefix} ${kwPart}`, family: "concept" };
    }
    // Otherwise: keywords-first
    return { query: `${kwPart} ${prefix}`, family: "keyword" };
  }

  if (kws.length >= 2) {
    return { query: kwPart, family: "keyword" };
  }

  // Fallback: use title if it is a real concept phrase
  if (section.title && section.title.length > 3) {
    return { query: section.title.trim(), family: "keyword" };
  }

  // Nothing usable without leaking the § ref — skip this section.
  return null;
}

/** Find the best DE distractor § by title keyword overlap. */
function findDeDistractor(
  deSections: StatuteSection[],
  atSection: StatuteSection,
  usedDeRefs: Set<string>,
): Ref | undefined {
  const atKws = new Set(extractKeywords(atSection.title, atSection.body));
  if (atKws.size === 0) return undefined;

  let best: { ref: string; score: number } | null = null;
  for (const ds of deSections) {
    if (usedDeRefs.has(ds.ref)) continue;
    if (ds.body.length < 50) continue;
    const deKws = new Set(extractKeywords(ds.title, ds.body));
    let score = 0;
    for (const k of atKws) {
      if (deKws.has(k)) score++;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { ref: ds.ref, score };
    }
  }

  if (!best || best.score < 1) return undefined;
  usedDeRefs.add(best.ref);
  return { jur: "de", file: "", abbr: "", ref: best.ref };
}

/** Check if a section body is substantive (not just repealed/heading/metadata). */
function isSubstantive(section: StatuteSection): boolean {
  const body = section.body.trim();
  if (body.length < 80) return false;
  if (/^(aufgehoben|weggefallen|—\s*$)/i.test(body)) return false;
  if (/^\(.*aufgehoben.*\)$/i.test(body)) return false;
  // Filter out B-VG metadata stubs (just dates + headers, no actual legal text)
  if (/^## Inkrafttretensdatum\s+\d/.test(body) && body.length < 200) return false;
  return true;
}

/** Evenly distribute question count across laws in a domain. */
function distributeCount(laws: { file: string; abbr: string }[], total: number): Map<string, number> {
  const result = new Map<string, number>();
  const per = Math.floor(total / laws.length);
  const remainder = total - per * laws.length;
  laws.forEach((law, i) => {
    result.set(law.file, per + (i < remainder ? 1 : 0));
  });
  return result;
}

// ── Main generation ──────────────────────────────────────────────────────────

function generate(): DraftEntry[] {
  const allDrafts: DraftEntry[] = [];
  const usedQueries = new Set<string>();

  for (const domain of DOMAINS) {
    const counts = distributeCount(domain.laws, domain.count);

    for (const law of domain.laws) {
      const target = counts.get(law.file) ?? 0;
      if (target === 0) continue;

      const sections = loadSplit(law.file);
      const deLaw = law.deLaw;
      const deSections = deLaw ? loadSplit(deLaw.file) : [];
      const usedDeRefs = new Set<string>();

      // Filter to substantive sections, skip existing gold refs
      const candidates = sections.filter((s) => {
        const key = `at:${law.abbr}:${s.ref}`;
        if (EXISTING_GOLD_REFS.has(key)) return false;
        return isSubstantive(s);
      });

      // Evenly sample across the law (not just first N)
      const step = Math.max(1, Math.floor(candidates.length / target));
      const selected: StatuteSection[] = [];
      for (let i = 0; i < candidates.length && selected.length < target; i += step) {
        selected.push(candidates[i]);
      }
      // If step sampling didn't fill, grab from the front
      for (let i = 0; i < candidates.length && selected.length < target; i++) {
        if (!selected.includes(candidates[i])) {
          selected.push(candidates[i]);
        }
      }

      let qIdx = 0;
      for (const section of selected) {
        // Validate AT ref against split corpus (use filename, not abbr)
        if (!validateSplitRef(law.file, section.ref, "at")) continue;

        const crafted = craftQuery(section, law.abbr, qIdx++);
        // No §-free query possible, or duplicate query → ambiguous gold label.
        if (!crafted || usedQueries.has(crafted.query)) continue;
        usedQueries.add(crafted.query);
        const atRef: Ref = { jur: "at", file: law.file, abbr: law.abbr, ref: section.ref };

        // Find DE distractor and validate it against DE split corpus
        let deRef: Ref | undefined;
        if (deLaw && deSections.length > 0) {
          const candidate = findDeDistractor(deSections, section, usedDeRefs);
          if (candidate) {
            // Validate DE ref exists with substantive text
            if (validateSplitRef(deLaw.file, candidate.ref, "de")) {
              deRef = candidate;
              deRef.file = deLaw.file;
              deRef.abbr = deLaw.abbr;
            } else {
              // Try to find another DE distractor
              usedDeRefs.delete(candidate.ref);
              const candidate2 = findDeDistractor(deSections, section, usedDeRefs);
              if (candidate2 && validateSplitRef(deLaw.file, candidate2.ref, "de")) {
                deRef = candidate2;
                deRef.file = deLaw.file;
                deRef.abbr = deLaw.abbr;
              }
            }
          }
        }

        allDrafts.push({
          query: crafted.query,
          family: crafted.family,
          at: atRef,
          de: deRef,
          domain: domain.name,
          status: "draft",
        });
      }
    }
  }

  return allDrafts;
}

// ── Output writer ────────────────────────────────────────────────────────────

function writeOutput(drafts: DraftEntry[]): void {
  const lines: string[] = [
    "/**",
    " * AT legal retrieval gold set — PENDING REVIEW (draft questions).",
    " *",
    " * Generated by server/scripts/draft-gold-questions.ts from the real AT",
    " * statute corpus. Every § has been validated against law-corpus-split/at/.",
    " *",
    " * LEAKAGE RULE: no query contains its answer's § number (a query citing",
    " * \"ABGB § 138\" would measure citation-string matching, not retrieval).",
    " * Only the code-scoped family may name the code — never the § ref.",
    " *",
    " * Review workflow:",
    " *   1. Review each entry for legal accuracy and query quality.",
    " *   2. Set reviewed_by + reviewed_at for approved entries.",
    " *   3. Move approved entries to corpus.ts (LEGAL_AT_GOLD).",
    " *",
    " * DO NOT move entries to the gold set without reviewed_by + reviewed_at.",
    " */",
    "",
    'import type { NamedThingQuestion } from "../../../../src/eval/retrieval-quality/harness.ts";',
    "",
    "interface Ref {",
    '  jur: "at" | "de";',
    "  file: string;",
    "  abbr: string;",
    "  ref: string;",
    "}",
    "",
    "interface DraftEntry {",
    "  query: string;",
    "  family: NamedThingQuestion[\"family\"];",
    "  at: Ref;",
    "  de?: Ref;",
    "  domain: string;",
    '  status: "draft" | "reviewed";',
    "  reviewed_by?: string;",
    "  reviewed_at?: string;",
    "}",
    "",
    "const A = (file: string, abbr: string, ref: string): Ref => ({ jur: \"at\", file, abbr, ref });",
    "const D = (file: string, abbr: string, ref: string): Ref => ({ jur: \"de\", file, abbr, ref });",
    "",
    "export const LEGAL_AT_PENDING: DraftEntry[] = [",
  ];

  // Group by domain for readability
  const byDomain = new Map<string, DraftEntry[]>();
  for (const d of drafts) {
    const list = byDomain.get(d.domain) ?? [];
    list.push(d);
    byDomain.set(d.domain, list);
  }

  for (const [domain, entries] of byDomain) {
    lines.push(`  // ── ${domain} (${entries.length} questions) ────────────────────────────`);
    for (const e of entries) {
      const at = `A("${e.at.file}", "${e.at.abbr}", "${e.at.ref}")`;
      const de = e.de ? `, de: D("${e.de.file}", "${e.de.abbr}", "${e.de.ref}")` : "";
      lines.push(
        `  { query: "${e.query.replace(/"/g, '\\"')}", family: "${e.family}", at: ${at}${de}, domain: "${e.domain}", status: "draft" },`
      );
    }
    lines.push("");
  }

  // Close array
  lines.push("];");
  lines.push("");
  lines.push("/** Draft entries with reviewed_by + reviewed_at, ready for promotion to corpus.ts. */");
  lines.push("export const LEGAL_AT_REVIEWED: DraftEntry[] = LEGAL_AT_PENDING.filter(");
  lines.push("  (e) => e.status === \"reviewed\" && e.reviewed_by && e.reviewed_at");
  lines.push(");");
  lines.push("");

  writeFileSync(OUT_FILE, lines.join("\n"), "utf8");
}

// ── Entry point ──────────────────────────────────────────────────────────────

const drafts = generate();
const byDomain = new Map<string, number>();
for (const d of drafts) {
  byDomain.set(d.domain, (byDomain.get(d.domain) ?? 0) + 1);
}

// eslint-disable-next-line no-console
console.log(`\nGenerated ${drafts.length} draft questions:\n`);
for (const [domain, count] of byDomain) {
  // eslint-disable-next-line no-console
  console.log(`  ${domain}: ${count}`);
}
// eslint-disable-next-line no-console
console.log(`\nTotal: ${drafts.length}`);
// eslint-disable-next-line no-console
console.log(`Output: ${OUT_FILE}\n`);

writeOutput(drafts);
