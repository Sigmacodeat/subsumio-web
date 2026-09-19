import { z } from "zod";
import { ENGINE_URL, engineHeadersWithCaseJurisdiction } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { mapContradictionFinding } from "@/lib/cron-utils";

export const maxDuration = 30;

const schema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
});

/**
 * GET /api/legal/contradiction-probe?case_slug=...
 *
 * Retrieves semantic contradiction findings from the GBrain engine's
 * eval_contradictions_runs table (populated by the nightly contradiction
 * probe cron). Returns findings filtered by the case slug.
 *
 * Unlike /api/legal/contradictions (which cross-checks structured document
 * analysis fields), this surfaces LLM-judge verdicts on chunk pairs —
 * semantic contradictions that keyword matching can't catch.
 */

export const GET = createHandler(
  {
    action: "legal.contradictions",
    rateTier: "standard",
    query: schema,
  },
  async (ctx, _body, query) => {
    // Full request headers (tenant source, API key, identity token) plus the
    // matter's jurisdiction — never a hardcoded fallback source.
    const caseScopedHeaders = await engineHeadersWithCaseJurisdiction(
      ctx.headers,
      query?.case_slug
    );

    // Source-scoped probe findings (only pairs whose pages this firm owns).
    const res = await fetch(
      `${ENGINE_URL}/api/legal/contradictions/latest?slug=${encodeURIComponent(
        query?.case_slug ?? ""
      )}&limit=50`,
      { headers: caseScopedHeaders, signal: AbortSignal.timeout(25_000) }
    );

    if (!res.ok) {
      return apiError(
        "engine_error",
        "Widerspruchsprüfung derzeit nicht verfügbar. Bitte später erneut versuchen.",
        502
      );
    }

    const data = (await res.json()) as {
      findings?: Array<Record<string, unknown>>;
      last_run?: { run_id?: string; ran_at?: string | null } | null;
    };
    const lastRun = data.last_run ?? null;
    const findings = (Array.isArray(data.findings) ? data.findings : []).map((f) =>
      mapContradictionFinding(f, lastRun?.ran_at ?? new Date().toISOString())
    );

    return Response.json({
      findings: findings.map((f) => ({
        chunk_a: f.chunk_a,
        chunk_b: f.chunk_b,
        severity: f.severity,
        axis: f.explanation ?? null,
        explanation: f.explanation ?? "",
        slug: f.case_slug || (query?.case_slug ?? ""),
      })),
      total: findings.length,
      last_run: lastRun,
      probe_available: findings.length > 0 || lastRun !== null,
    });
  }
);
