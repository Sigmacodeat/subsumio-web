/**
 * Widerspruchsprüfung einer Akte: vergleicht die Auto-Analysen aller
 * zugeordneten Dokumente (Parteien, Daten, Kernaussagen) und schreibt die
 * Befunde in die Akte. Eine Funktion für die Route
 * (POST /api/legal/contradictions) und für den direkten Aufruf nach einer
 * Dokumentanalyse — serverseitig ohne HTTP-Umweg.
 */
import { enginePatchPage } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { headersCacheKey } from "@/lib/server-ttl-cache";

interface DocumentAnalysis {
  slug: string;
  title: string;
  analysis?: {
    document_type?: string;
    parties?: Array<{ name?: string; role?: string }>;
    key_dates?: Array<{ label?: string; date?: string }>;
    key_facts?: string[];
    risks?: Array<{ description?: string; severity?: string }>;
    issues?: Array<{ description?: string; severity?: string }>;
    summary?: string;
  };
}

export interface ContradictionFinding {
  doc_a_slug: string;
  doc_b_slug: string;
  field: string;
  value_a: string;
  value_b: string;
  severity: "high" | "medium" | "low";
  description: string;
}

export type ContradictionCheckResult =
  | {
      contradictions: ContradictionFinding[];
      documents_checked: number;
      checked_at: string;
    }
  | {
      contradictions: [];
      documents_checked: number;
      message: string;
    };

/** Safety stop for one matter's documents (engine-filtered by case_slug). */
const MATTER_DOCUMENTS_MAX = 10_000;

/**
 * Per matter and caller, at most one check runs at a time; calls arriving
 * meanwhile share it and schedule exactly one follow-up run that sees every
 * document uploaded in between. A batch upload of 300 documents runs the
 * check a handful of times, not 300 times in parallel.
 */
const running = new Map<
  string,
  { rerun: boolean; promise: Promise<ContradictionCheckResult> }
>();

/**
 * Run the check for one matter with the given engine headers (they decide
 * the brain and the caller's access). Throws when the documents cannot be
 * read completely — then nothing is persisted, so earlier findings on the
 * matter stay; persisting the findings is otherwise best effort.
 */
export function checkCaseContradictions(
  headers: Record<string, string>,
  caseSlug: string
): Promise<ContradictionCheckResult> {
  // Keyed by brain + access: only calls with the same access coalesce.
  const key = `${headersCacheKey(headers)}\u0000${caseSlug}`;
  const current = running.get(key);
  if (current) {
    current.rerun = true;
    return current.promise;
  }
  const state = { rerun: false, promise: undefined as unknown as Promise<ContradictionCheckResult> };
  state.promise = (async () => {
    try {
      let result: ContradictionCheckResult;
      do {
        state.rerun = false;
        result = await runContradictionCheck(headers, caseSlug);
      } while (state.rerun);
      return result;
    } finally {
      running.delete(key);
    }
  })();
  running.set(key, state);
  return state.promise;
}

async function runContradictionCheck(
  headers: Record<string, string>,
  caseSlug: string
): Promise<ContradictionCheckResult> {
  // Only this matter's documents — selected by the engine (frontmatter
  // case_slug), complete or an error: a partial basis could report "no
  // contradictions" and overwrite earlier findings.
  const data = await listEnginePages(headers, "document", MATTER_DOCUMENTS_MAX, {
    strict: true,
    failOnTruncate: true,
    timeoutMs: 30_000,
    frontmatter: { case_slug: caseSlug },
  });

  const caseDocs: DocumentAnalysis[] = data
    .filter((p) => {
      const fm = p.frontmatter ?? {};
      return (
        fm.case_slug === caseSlug &&
        fm.assignment_status !== "unassigned" &&
        fm.status !== "tombstoned"
      );
    })
    .map((p) => ({
      slug: p.slug,
      title: p.title ?? p.slug,
      analysis: (p.frontmatter?.auto_analysis as DocumentAnalysis["analysis"]) ?? undefined,
    }));

  if (caseDocs.length < 2) {
    return {
      contradictions: [],
      documents_checked: caseDocs.length,
      message: "Need at least 2 documents to check for contradictions",
    };
  }

  const contradictions = findContradictions(caseDocs);

  // Persist contradictions to case frontmatter
  try {
    await enginePatchPage(
      headers,
      {
        slug: caseSlug,
        frontmatter: {
          contradictions,
          contradictions_checked_at: new Date().toISOString(),
          contradiction_count: contradictions.length,
        },
      },
      { timeoutMs: 15_000 }
    );
  } catch {
    // Best-effort persistence — the response still carries the findings
  }

  return {
    contradictions,
    documents_checked: caseDocs.length,
    checked_at: new Date().toISOString(),
  };
}

// Cross-check: compare parties, dates and key facts across documents.
function findContradictions(caseDocs: DocumentAnalysis[]): ContradictionFinding[] {
  const contradictions: ContradictionFinding[] = [];

  for (let i = 0; i < caseDocs.length; i++) {
    for (let j = i + 1; j < caseDocs.length; j++) {
      const a = caseDocs[i];
      const b = caseDocs[j];
      if (!a.analysis || !b.analysis) continue;

      // Check party name contradictions
      const aParties = a.analysis.parties ?? [];
      const bParties = b.analysis.parties ?? [];
      for (const pa of aParties) {
        for (const pb of bParties) {
          if (pa.role && pb.role && pa.role === pb.role && pa.name && pb.name) {
            if (normalizeName(pa.name) !== normalizeName(pb.name)) {
              contradictions.push({
                doc_a_slug: a.slug,
                doc_b_slug: b.slug,
                field: `party.${pa.role}`,
                value_a: pa.name,
                value_b: pb.name,
                severity: "high",
                description: `Widersprüchliche ${pa.role}-Angabe: "${pa.name}" vs. "${pb.name}"`,
              });
            }
          }
        }
      }

      // Check date contradictions for same label
      const aDates = a.analysis.key_dates ?? [];
      const bDates = b.analysis.key_dates ?? [];
      for (const da of aDates) {
        for (const db of bDates) {
          if (da.label && db.label && da.label === db.label && da.date && db.date) {
            if (normalizeDate(da.date) !== normalizeDate(db.date)) {
              contradictions.push({
                doc_a_slug: a.slug,
                doc_b_slug: b.slug,
                field: `date.${da.label}`,
                value_a: da.date,
                value_b: db.date,
                severity: "high",
                description: `Widersprüchliches Datum (${da.label}): "${da.date}" vs. "${db.date}"`,
              });
            }
          }
        }
      }

      // Check contradictory key facts (heuristic: same topic, opposite statements)
      const aFacts = a.analysis.key_facts ?? [];
      const bFacts = b.analysis.key_facts ?? [];
      for (const fa of aFacts) {
        for (const fb of bFacts) {
          if (areContradictoryFacts(fa, fb)) {
            contradictions.push({
              doc_a_slug: a.slug,
              doc_b_slug: b.slug,
              field: "key_facts",
              value_a: fa,
              value_b: fb,
              severity: "medium",
              description: `Mögliche Widersprüchlichkeit: "${fa.slice(0, 80)}" vs. "${fb.slice(0, 80)}"`,
            });
          }
        }
      }
    }
  }
  return contradictions;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeDate(date: string): string {
  // Normalize various date formats to YYYY-MM-DD
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date.trim();
  return d.toISOString().slice(0, 10);
}

function areContradictoryFacts(a: string, b: string): boolean {
  // Heuristic: check for negation patterns
  const negationWords = ["nicht", "kein", "nein", "no", "not", "never", "ohne"];
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  // Check if one statement negates the other
  for (const neg of negationWords) {
    if (aLower.includes(neg) && !bLower.includes(neg)) {
      // Check if the rest of the statements are similar
      const aWithout = aLower.replace(neg, "").trim();
      if (levenshteinRatio(aWithout, bLower) > 0.6) return true;
    }
    if (bLower.includes(neg) && !aLower.includes(neg)) {
      const bWithout = bLower.replace(neg, "").trim();
      if (levenshteinRatio(aLower, bWithout) > 0.6) return true;
    }
  }
  return false;
}

function levenshteinRatio(a: string, b: string): number {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}
