import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

export const maxDuration = 120;

const contradictionsSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
});

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

interface ContradictionFinding {
  doc_a_slug: string;
  doc_b_slug: string;
  field: string;
  value_a: string;
  value_b: string;
  severity: "high" | "medium" | "low";
  description: string;
}

export const POST = createHandler(
  {
    action: "legal.contradictions",
    rateTier: "heavy",
    body: contradictionsSchema,
    allowInternal: true,
    audit: (_ctx, body) => ({
      action: "legal.contradictions" as const,
      entityType: "contradiction_check",
      details: { case_slug: body.case_slug },
    }),
  },
  async (ctx, body, _query, _req) => {
    // Fetch all documents for this case from the engine
    let caseDocs: DocumentAnalysis[] = [];
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages?type=document&limit=200`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return apiError("engine_error", `Engine returned ${res.status}`, res.status);
      const data = await res.json();
      if (!Array.isArray(data)) {
        return Response.json({
          contradictions: [],
          documents_checked: 0,
          message: "No documents found",
        });
      }

      caseDocs = (
        data as Array<{
          slug: string;
          title: string;
          frontmatter?: Record<string, unknown>;
        }>
      )
        .filter((p) => {
          const fm = p.frontmatter ?? {};
          return (
            fm.case_slug === body.case_slug &&
            fm.assignment_status !== "unassigned" &&
            fm.status !== "tombstoned"
          );
        })
        .map((p) => ({
          slug: p.slug,
          title: p.title ?? p.slug,
          analysis: (p.frontmatter?.auto_analysis as DocumentAnalysis["analysis"]) ?? undefined,
        }));
    } catch (err) {
      return apiError(
        "engine_unreachable",
        err instanceof Error ? err.message : "Engine nicht erreichbar",
        503
      );
    }

    if (caseDocs.length < 2) {
      return Response.json({
        contradictions: [],
        documents_checked: caseDocs.length,
        message: "Need at least 2 documents to check for contradictions",
      });
    }

    // Cross-check: compare parties, dates, key facts, and risks across documents
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

    // Persist contradictions to case frontmatter
    const fmUpdate: Record<string, unknown> = {
      contradictions,
      contradictions_checked_at: new Date().toISOString(),
      contradiction_count: contradictions.length,
    };
    try {
      await enginePatchPage(
        ctx.headers,
        {
          slug: body.case_slug,
          frontmatter: fmUpdate,
        },
        { timeoutMs: 15_000 }
      );
    } catch {
      // Best-effort persistence — the response still carries the findings
    }

    return Response.json({
      contradictions,
      documents_checked: caseDocs.length,
      checked_at: new Date().toISOString(),
    });
  }
);

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
