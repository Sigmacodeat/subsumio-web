import { z } from "zod";
import { ENGINE_URL, enginePatchPage, engineHeadersWithCaseJurisdiction } from "@/lib/engine";
import { createHandler, recordCreditConsumption } from "@/lib/api-handler";
import { apiError } from "@/lib/api-response";
import { groundCitations } from "@/lib/legal-grounding";
import { encodeSlugPath } from "@/lib/utils";
import type { RawCitation } from "@/lib/types";

import { buildAnalysisPrompt } from "@/lib/legal/analysis-prompt";
import {
  buildEmptyResult,
  safeParseJson,
  ENGINE_FETCH_TIMEOUT,
  MAX_ANALYSIS_CHARS,
} from "@/lib/legal/analysis-utils";
import { findRelevantPrecedents } from "@/lib/legal/precedent-search";
import { writeSuggestedDeadlinesAndParties } from "@/lib/legal/case-writeback";
import { normalizeAnalysisParties } from "@/lib/legal/case-suggestions";
import { checkCaseContradictions } from "@/lib/legal/contradiction-check";

import { createHash } from "node:crypto";
import { hit } from "@/lib/auth/rate-limit";
import { deductCredits } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/credit-constants";

import { logger } from "@/lib/logger";
const log = logger("api/legal/analyze");

/**
 * Background analyses (upload outbox, retry cron, messenger intake) run
 * without a user session. Per firm and day at most this many run without a
 * billing owner to book them on — a guard against runaway model costs.
 */
const INTERNAL_ANALYSIS_DAILY_CAP = Number(process.env.SUBSUMIO_INTERNAL_ANALYSIS_DAILY_CAP ?? 300);

/** Short content fingerprint: an unchanged document is never analysed twice. */
/** Best-effort: record on the document why its analysis did not complete. */
async function markAnalysisFailed(
  headers: Record<string, string>,
  slug: string,
  reason: string,
  retryOwner?: string
): Promise<void> {
  try {
    const res = await enginePatchPage(headers, {
      slug,
      frontmatter: {
        analysis_status: "failed",
        analysis_failed_at: new Date().toISOString(),
        analysis_error: reason,
        ...(retryOwner ? { analysis_retry_owner: retryOwner } : {}),
      },
    });
    if (!res.ok) log.error(`[analyze] failed to persist failure for ${slug}: HTTP ${res.status}`);
  } catch (err) {
    log.error("[analyze] failed to persist failure status:", err);
  }
}

function analysisContentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export const maxDuration = 120;

/**
 * The engine's document analysis reports dates as `key_dates` [{date, what}],
 * while the case writeback expects `deadlines` [{label, date, urgency, source}].
 * Without this bridge no uploaded document ever produced a deadline
 * suggestion. Past dates (service dates, hearings held) are not deadlines.
 */
export function withDeadlinesFromKeyDates(
  parsed: Record<string, unknown>
): Record<string, unknown> {
  if (Array.isArray(parsed.deadlines) && parsed.deadlines.length > 0) return parsed;
  if (!Array.isArray(parsed.key_dates)) return parsed;
  const today = new Date().toISOString().slice(0, 10);
  const deadlines = (parsed.key_dates as Array<Record<string, unknown>>)
    .filter(
      (k) => typeof k?.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(k.date) && k.date >= today
    )
    .map((k) => {
      const what =
        typeof k.what === "string"
          ? k.what
          : typeof k.label === "string"
            ? k.label
            : "Erkannter Termin";
      const urgent =
        /frist|binnen|spätestens|einzubringen|einbringen|erheben|tagsatzung|verhandlung|termin/i.test(
          what
        );
      return {
        label: what,
        date: String(k.date).slice(0, 10),
        urgency: urgent ? "high" : "normal",
        source: what,
      };
    });
  return deadlines.length > 0 ? { ...parsed, deadlines } : parsed;
}

const analyzeSchema = z
  .object({
    document_slug: z.string().optional(),
    text: z.string().max(512_000).optional(),
    jurisdiction: z.string().optional(),
    brain_id: z.string().optional(),
    /** Re-run even though an analysis of this exact content exists. */
    force: z.boolean().optional(),
    /** Internal callers: billing owner of the document's upload. */
    owner_id: z.string().max(200).optional(),
    owner_type: z.enum(["user", "org"]).optional(),
    /** Internal callers: which background job retries a failure ("outbox" | "cron"). */
    retry_owner: z.enum(["outbox", "cron"]).optional(),
  })
  .passthrough();

export const POST = createHandler(
  {
    action: "legal.document_review",
    rateTier: "heavy",
    quota: "queries",
    credits: "document_analysis",
    body: analyzeSchema,
    maxDuration: 120,
    allowInternal: true,
    audit: (_ctx, b) => ({
      action: "legal.document_review" as const,
      entityType: "document",
      details: {
        documentSlug: typeof b.document_slug === "string" ? b.document_slug : undefined,
        jurisdiction: typeof b.jurisdiction === "string" ? b.jurisdiction : undefined,
        hasInlineText: typeof b.text === "string" && b.text.length > 0,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    const isInternal = ctx.brainId === "internal";
    let engineHeaders: Record<string, string> = ctx.headers;

    const documentSlug = typeof body.document_slug === "string" ? body.document_slug.trim() : "";
    const jurisdiction =
      typeof body.jurisdiction === "string" ? body.jurisdiction.toLowerCase() : "all";

    if (isInternal) {
      const brainId = typeof body.brain_id === "string" ? body.brain_id : "";
      if (brainId) {
        engineHeaders = { ...engineHeaders, "x-subsumio-source": brainId };
      }
    }

    // ── 1. Fetch document text ──────────────────────────────────────────
    const warnings: string[] = [];
    let text = "";
    let documentCaseSlug: string | undefined;
    let documentFm: Record<string, unknown> = {};

    if (documentSlug) {
      try {
        const pageRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlugPath(documentSlug)}`, {
          headers: engineHeaders,
          signal: AbortSignal.timeout(ENGINE_FETCH_TIMEOUT),
        });
        if (pageRes.ok) {
          const page = (await pageRes.json()) as {
            content?: string;
            title?: string;
            frontmatter?: Record<string, unknown>;
          };
          text = [page.title, page.content].filter(Boolean).join("\n\n");
          documentFm = page.frontmatter ?? {};
          documentCaseSlug =
            typeof page.frontmatter?.case_slug === "string"
              ? page.frontmatter.case_slug
              : undefined;
        } else {
          log.error(`[analyze] page fetch for ${documentSlug} returned ${pageRes.status}`);
          warnings.push("document_fetch_failed");
        }
      } catch (err) {
        log.error(
          `[analyze] page fetch for ${documentSlug} failed:`,
          err instanceof Error ? err.message : String(err)
        );
        warnings.push("document_fetch_failed");
      }
    }

    if (!text && typeof body.text === "string") {
      text = body.text;
    }

    if (!text.trim()) {
      // The document must not stay "Analyse ausstehend" for ever: say why.
      if (documentSlug) {
        await markAnalysisFailed(
          engineHeaders,
          documentSlug,
          warnings.includes("document_fetch_failed") ? "document_fetch_failed" : "document_empty",
          body.retry_owner
        );
      }
      return apiError("document_not_found_or_empty", "Document not found or empty", 404);
    }

    // Idempotent per document content: an analysis of exactly this text is
    // returned as stored instead of calling the model again (outbox re-runs,
    // overlapping retries, repeated clicks). `force` re-runs on purpose.
    const contentHash = analysisContentHash(text);
    if (documentSlug && body.force !== true && documentFm.analysis_status === "completed") {
      const stored = documentFm.auto_analysis;
      const storedHash = documentFm.analysis_content_hash;
      // Analyses stored before the fingerprint existed count as current for
      // background jobs only — a user can still ask again.
      const sameContent = storedHash ? storedHash === contentHash : isInternal;
      if (sameContent && stored && typeof stored === "object") {
        return Response.json({ ...(stored as Record<string, unknown>), _cached: true });
      }
    }

    // Background analyses without a session: bounded per firm and day.
    if (isInternal && documentSlug) {
      const brainKey = typeof body.brain_id === "string" && body.brain_id ? body.brain_id : "none";
      const budget = await hit(
        `internal-analysis:${brainKey}`,
        INTERNAL_ANALYSIS_DAILY_CAP,
        24 * 60 * 60_000
      );
      if (!budget.ok) {
        log.warn(`[analyze] internal analysis budget reached for ${brainKey}`);
        return apiError(
          "internal_analysis_budget_exhausted",
          "Tageskontingent für Hintergrundanalysen erreicht",
          429
        );
      }
    }

    if (text.length > MAX_ANALYSIS_CHARS) {
      text = text.slice(0, MAX_ANALYSIS_CHARS) + "\n\n[... document truncated for analysis]";
    }

    // ── 2. AI analysis (Route A: engine-native, Route B: /api/think) ────
    // Resolve case jurisdiction from the document's case_slug (if any)
    // so the engine scopes law corpus to the case's country.
    const caseScopedHeaders = await engineHeadersWithCaseJurisdiction(
      engineHeaders,
      documentCaseSlug
    );
    let parsed: Record<string, unknown>;
    try {
      if (documentSlug) {
        const analyzeRes = await fetch(`${ENGINE_URL}/api/legal/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...caseScopedHeaders },
          body: JSON.stringify({ slug: documentSlug }),
          signal: AbortSignal.timeout(ENGINE_FETCH_TIMEOUT),
        });
        if (!analyzeRes.ok) throw new Error(`Engine legal/analyze ${analyzeRes.status}`);
        parsed = (await analyzeRes.json()) as Record<string, unknown>;
      } else {
        const thinkRes = await fetch(`${ENGINE_URL}/api/think`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...caseScopedHeaders },
          body: JSON.stringify({
            query: buildAnalysisPrompt(text, jurisdiction),
            mode: "balanced",
          }),
          signal: AbortSignal.timeout(ENGINE_FETCH_TIMEOUT),
        });
        if (!thinkRes.ok) throw new Error(`Engine think ${thinkRes.status}`);
        const raw = await thinkRes.text();
        let answer = "";
        for (const line of raw.split("\n")) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const evt = JSON.parse(line.slice(6)) as { chunk?: string };
            if (evt.chunk) answer += evt.chunk;
          } catch {
            /* skip malformed lines */
          }
        }
        parsed = safeParseJson(answer || "{}");
      }
    } catch (err) {
      log.error("[analyze] AI step failed:", err instanceof Error ? err.message : String(err));
      if (documentSlug) {
        try {
          const failedPatch = await enginePatchPage(engineHeaders, {
            slug: documentSlug,
            frontmatter: {
              analysis_status: "failed",
              analysis_failed_at: new Date().toISOString(),
              analysis_error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
              // One job retries a failure: the outbox while its task lives,
              // otherwise the hourly retry cron.
              ...(body.retry_owner ? { analysis_retry_owner: body.retry_owner } : {}),
            },
          });
          if (!failedPatch.ok)
            log.error(`[analyze] failed to persist failure status: HTTP ${failedPatch.status}`);
        } catch (patchErr) {
          log.error("[analyze] failed to persist failure status:", patchErr);
        }
      }
      const empty = buildEmptyResult("Analyse fehlgeschlagen \u2014 Engine nicht verf\u00fcgbar.");
      empty._warnings = [...warnings, "ai_analysis_failed"];
      empty._degraded = true;
      return Response.json(empty, { status: 502 });
    }

    // Charged once the AI step succeeded. A background analysis is booked on
    // the firm that uploaded the document, once per document content.
    if (!isInternal) {
      void recordCreditConsumption(ctx, "document_analysis", documentCaseSlug);
    } else if (documentSlug && body.owner_id && body.owner_type) {
      void deductCredits(body.owner_id, body.owner_type, CREDIT_COSTS.document_analysis, {
        operation: "document_analysis",
        caseSlug: documentCaseSlug,
        idempotencyKey: `document_analysis:${body.brain_id ?? ""}:${documentSlug}:${contentHash}`,
      }).catch((err) =>
        log.error(
          "[analyze] background analysis booking failed:",
          err instanceof Error ? err.message : String(err)
        )
      );
    }

    // One party shape for every consumer (analysis page, contradiction
    // check, strategy): [{name, role}] — the engine reports names as strings
    // and roles separately in `party_roles`.
    parsed.parties = normalizeAnalysisParties(parsed);

    // ── 3. Grounding + Precedent search (parallel) ──────────────────────
    const rawCitations = Array.isArray(parsed.cited_statutes)
      ? (parsed.cited_statutes as RawCitation[])
      : [];

    const [groundedCitations, suggestedPrecedents] = await Promise.all([
      groundCitations(rawCitations),
      findRelevantPrecedents(parsed, jurisdiction),
    ]);

    parsed.cited_statutes = groundedCitations;
    const verified = groundedCitations.filter((c) => c.verified).length;
    const unverified = groundedCitations.filter((c) => !c.verified).length;
    parsed._grounding = {
      citations_verified: verified,
      citations_unverified: unverified,
      corpus_checked: true,
      analyzed_at: new Date().toISOString(),
    };

    if (suggestedPrecedents.length > 0) {
      parsed.suggested_precedents = suggestedPrecedents;
    }

    // ── 4. Persist analysis to document frontmatter ─────────────────────
    if (documentSlug) {
      try {
        const docType = typeof parsed.document_type === "string" ? parsed.document_type : undefined;
        const docFrontmatter: Record<string, unknown> = {
          auto_analysis: parsed,
          analyzed_at: new Date().toISOString(),
          analysis_status: "completed",
          analysis_retry_count: 0,
          analysis_content_hash: contentHash,
        };
        if (docType && docType !== "unknown") {
          docFrontmatter.document_type = docType;
        }
        if (parsed.privilege && typeof parsed.privilege === "object") {
          const priv = parsed.privilege as { is_privileged?: boolean; privilege_type?: string };
          if (priv.is_privileged) {
            docFrontmatter.privileged = true;
            docFrontmatter.privilege_type = priv.privilege_type ?? "attorney_client";
          }
        }
        const docPatch = await enginePatchPage(
          engineHeaders,
          { slug: documentSlug, frontmatter: docFrontmatter },
          { timeoutMs: ENGINE_FETCH_TIMEOUT }
        );
        if (!docPatch.ok)
          throw new Error(`HTTP ${docPatch.status}: ${(await docPatch.text()).slice(0, 300)}`);
      } catch (err) {
        log.error(
          `[analyze] failed to persist analysis for ${documentSlug}:`,
          err instanceof Error ? err.message : String(err)
        );
        await markAnalysisFailed(
          engineHeaders,
          documentSlug,
          "analysis_persistence_failed",
          body.retry_owner
        );
        return Response.json(
          {
            ...parsed,
            error: "analysis_persistence_failed",
            _warnings: [...warnings, "analysis_persistence_failed"],
          },
          { status: 503 }
        );
      }
    }

    // ── 5. Fire-and-forget: case writeback + contradictions check ───────
    if (documentCaseSlug) {
      void writeSuggestedDeadlinesAndParties(
        engineHeaders,
        documentCaseSlug,
        withDeadlinesFromKeyDates(parsed),
        documentSlug
      );

      // Called in-process with the same engine headers (same brain, same
      // access) — no HTTP round trip back into this app. The upload outbox
      // runs its own contradiction task for the matter; running it here too
      // probed every upload twice.
      if (body.retry_owner !== "outbox") {
        void checkCaseContradictions(engineHeaders, documentCaseSlug).catch((err) => {
          // Best-effort — contradictions check failure must not block analysis response
          log.warn("contradictions check failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }

    if (warnings.length > 0) {
      parsed._warnings = warnings;
    }

    return Response.json(parsed);
  }
);
