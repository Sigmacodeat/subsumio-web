/**
 * Name matching against the sanctions list.
 *
 * A firm needs two things from this: no listed person slips through because the
 * spelling differs, and no daily flood of nonsense hits. So matching is token
 * based (order does not matter), tolerates one typo per longer token, and needs
 * either every query token to be covered or a full single-name match. A hit is
 * never a verdict — it is a candidate a lawyer has to look at.
 */

import type { SanctionsEntry } from "./eu-list";

export interface NameMatch {
  reference: string;
  entityType: SanctionsEntry["entityType"];
  /** The spelling on the list that matched. */
  matchedName: string;
  primaryName: string;
  programmes: string[];
  birthDates: string[];
  /** 1 = every token identical, lower = fuzzy or extra tokens on the list side. */
  score: number;
  kind: "exact" | "strong" | "weak";
}

const NOISE = new Set([
  "dr",
  "mag",
  "mmag",
  "ing",
  "dipl",
  "prof",
  "herr",
  "frau",
  "mr",
  "mrs",
  "ms",
  "gmbh",
  "ag",
  "kg",
  "og",
  "ltd",
  "limited",
  "inc",
  "co",
  "company",
  "corp",
  "sa",
  "srl",
  "bv",
  "nv",
  "plc",
  "llc",
  "und",
  "and",
  "der",
  "die",
  "das",
  "van",
  "von",
  "de",
  "del",
  "di",
  "al",
]);

/** Lower case, no diacritics, no punctuation; German umlauts spelled out. */
export function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(value: string): string[] {
  return normaliseName(value)
    .split(" ")
    .filter((t) => t.length > 1 && !NOISE.has(t));
}

/** True when the two tokens differ by at most one edit (typo, transliteration). */
export function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length === b.length) {
      i++;
      j++;
    } else if (a.length > b.length) i++;
    else j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function scoreAgainst(queryTokens: string[], listName: string): { score: number; exact: boolean } {
  const listTokens = tokens(listName);
  if (queryTokens.length === 0 || listTokens.length === 0) return { score: 0, exact: false };
  let matched = 0;
  let fuzzy = 0;
  const used = new Set<number>();
  for (const q of queryTokens) {
    const idx = listTokens.findIndex((l, i) => !used.has(i) && (l === q || nearlyEqual(l, q)));
    if (idx >= 0) {
      used.add(idx);
      matched++;
      if (listTokens[idx] !== q) fuzzy++;
    }
  }
  if (matched < queryTokens.length)
    return { score: matched / queryTokens.length / 2, exact: false };
  // Every query token is covered; extra tokens on the list side lower the score.
  const extra = listTokens.length - matched;
  const score = 1 - fuzzy * 0.1 - Math.min(extra, 3) * 0.08;
  return { score: Math.max(0.5, score), exact: fuzzy === 0 && extra === 0 };
}

export interface MatchOptions {
  /** Below this score a candidate is not reported. Default 0.75. */
  minScore?: number;
  /** Date of birth of the person being checked, narrows person hits. */
  birthDate?: string;
  /** Most candidates to return. Default 20. */
  limit?: number;
}

/**
 * Candidates for one name. A single token (e.g. only a surname) matches only
 * when a listing carries exactly that one name, so "Müller" alone does not
 * report every listed person whose name contains Müller.
 */
export function matchName(
  name: string,
  entries: SanctionsEntry[],
  opts: MatchOptions = {}
): NameMatch[] {
  const minScore = opts.minScore ?? 0.75;
  const queryTokens = tokens(name);
  if (queryTokens.length === 0) return [];
  const singleToken = queryTokens.length === 1;
  const out: NameMatch[] = [];

  for (const entry of entries) {
    let best: { score: number; exact: boolean; name: string } | null = null;
    for (const listName of entry.names) {
      if (singleToken && tokens(listName).length > 1) continue;
      const { score, exact } = scoreAgainst(queryTokens, listName);
      if (!best || score > best.score) best = { score, exact, name: listName };
    }
    if (!best || best.score < minScore) continue;
    let score = best.score;
    let exact = best.exact;
    if (opts.birthDate && entry.birthDates.length > 0) {
      const day = opts.birthDate.slice(0, 10);
      const year = day.slice(0, 4);
      const hit = entry.birthDates.some((b) => b.slice(0, 10) === day || b.slice(0, 4) === year);
      // A different date of birth makes a same-name person a weaker candidate,
      // but never removes it: the list's dates are often incomplete.
      score = hit ? Math.min(1, score + 0.1) : score - 0.2;
      // A different date of birth means this is somebody else with the same name.
      if (!hit) exact = false;
      if (score < minScore) continue;
    }
    out.push({
      reference: entry.reference,
      entityType: entry.entityType,
      matchedName: best.name,
      primaryName: entry.primaryName,
      programmes: entry.programmes,
      birthDates: entry.birthDates,
      score: Math.round(score * 100) / 100,
      kind: exact ? "exact" : score >= 0.85 ? "strong" : "weak",
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 20);
}
