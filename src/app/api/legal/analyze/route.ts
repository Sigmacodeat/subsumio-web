import { z } from "zod";
import { ENGINE_URL, enginePatchPage, engineHeadersWithCaseJurisdiction } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";
import { apiError } from "@/lib/api-response";
import { env } from "@/lib/env";
import { groundCitations } from "@/lib/legal-grounding";
import { encodeSlugPath } from "@/lib/utils";
import type { RawCitation } from "@/lib/types";

import { buildAnalysisPrompt } from "@/lib/legal/analysis-prompt";
import {
  buildEmptyResult,
  safeParseJson,
  ENGINE_FETCH_TIMEOUT,
  MAX_ANALYSIS_CHARS,
  CONTRADICTIONS_TIMEOUT,
} from "@/lib/legal/analysis-utils";
import { findRelevantPrecedents } from "@/lib/legal/precedent-search";
import { writeSuggestedDeadlinesAndParties } from "@/lib/legal/case-writeback";

export const maxDuration = 120;

const analyzeSchema = z
  .object({
    document_slug: z.string().optional(),
    text: z.string().max(512_000).optional(),
    jurisdiction: z.string().optional(),
    brain_id: z.string().optional(),
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
    let targetBrainId = ctx.brainId;

    const documentSlug = typeof body.document_slug === "string" ? body.document_slug.trim() : "";
    const jurisdiction =
      typeof body.jurisdiction === "string" ? body.jurisdiction.toLowerCase() : "all";

    if (isInternal) {
      const brainId = typeof body.brain_id === "string" ? body.brain_id : "";
      if (brainId) {
        targetBrainId = brainId;
        engineHeaders = { ...engineHeaders, "x-subsumio-source": brainId };
      }
    }

    // ── 1. Fetch document text ──────────────────────────────────────────
    const warnings: string[] = [];
    let text = "";
    let documentCaseSlug: string | undefined;

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
          documentCaseSlug =
            typeof page.frontmatter?.case_slug === "string"
              ? page.frontmatter.case_slug
              : undefined;
        } else {
          console.error(`[analyze] page fetch for ${documentSlug} returned ${pageRes.status}`);
          warnings.push("document_fetch_failed");
        }
      } catch (err) {
        console.error(
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
      return apiError("document_not_found_or_empty", "Document not found or empty", 404);
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
      console.error("[analyze] AI step failed:", err instanceof Error ? err.message : String(err));
      if (documentSlug) {
        try {
          const failedPatch = await enginePatchPage(engineHeaders, {
            slug: documentSlug,
            frontmatter: {
              analysis_status: "failed",
              analysis_failed_at: new Date().toISOString(),
              analysis_error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
            },
          });
          if (!failedPatch.ok)
            console.error(`[analyze] failed to persist failure status: HTTP ${failedPatch.status}`);
        } catch (patchErr) {
          console.error("[analyze] failed to persist failure status:", patchErr);
        }
      }
      const empty = buildEmptyResult("Analyse fehlgeschlagen \u2014 Engine nicht verf\u00fcgbar.");
      empty._warnings = [...warnings, "ai_analysis_failed"];
      empty._degraded = true;
      return Response.json(empty, { status: 502 });
    }

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
        console.error(
          `[analyze] failed to persist analysis for ${documentSlug}:`,
          err instanceof Error ? err.message : String(err)
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
      void writeSuggestedDeadlinesAndParties(engineHeaders, documentCaseSlug, parsed, documentSlug);

      void (async () => {
        try {
          const internalSecret = env("SUBSUMIO_INTERNAL_SECRET");
          if (!internalSecret) return;
          await fetch(`/api/legal/contradictions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": internalSecret,
            },
            body: JSON.stringify({ case_slug: documentCaseSlug, brain_id: targetBrainId }),
            signal: AbortSignal.timeout(CONTRADICTIONS_TIMEOUT),
          });
        } catch {
          // Best-effort — contradictions check failure must not block analysis response
        }
      })();
    }

    if (warnings.length > 0) {
      parsed._warnings = warnings;
    }

    return Response.json(parsed);
  }
);
