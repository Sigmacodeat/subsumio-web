/**
 * GET /api/insights — Returns generated insights for the current brain.
 *
 * TODO 8: Insights-Engine API endpoint.
 * Collects cases, judgements, and documents from the engine,
 * then runs the rule-based insights generator.
 */
import { listEnginePages } from "@/lib/engine-pages";
import { NextResponse } from "next/server";
import { createHandler } from "@/lib/api-handler";
import { generateInsights, type InsightInput } from "@/lib/insights-engine";
import type { BrainPage } from "@/lib/types";
import { z } from "zod";

import { logger } from "@/lib/logger";
const log = logger("api/insights");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  caseSlug: z.string().max(500).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "heavy",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    try {
      // Fetch cases, judgements, and documents in parallel. The engine has no
      // /api/pages/batch-list and answers /api/pages with a bare array — the
      // old calls silently produced an empty insights page.
      const [casePages, judgementPages, legalDocs, plainDocs] = await Promise.all([
        listEnginePages(ctx.headers, "legal_case", 200),
        listEnginePages(ctx.headers, "legal_judgement", 50),
        listEnginePages(ctx.headers, "legal_document", 100),
        listEnginePages(ctx.headers, "document", 100),
      ]);
      const casesData = { results: { legal_case: casePages } };
      const judgementsData = { pages: judgementPages };
      const docsData = { results: { legal_document: legalDocs, document: plainDocs } };

      const cases = ((casesData.results?.legal_case ?? []) as BrainPage[]).map((p) => ({
        slug: p.slug,
        title: p.title,
        frontmatter: p.frontmatter,
      }));

      const judgements = ((judgementsData.pages ?? []) as BrainPage[]).map((p) => ({
        slug: p.slug,
        title: p.title,
        frontmatter: p.frontmatter,
      }));

      const docs = [
        ...((docsData.results?.legal_document ?? []) as BrainPage[]),
        ...((docsData.results?.document ?? []) as BrainPage[]),
      ].map((p) => ({
        slug: p.slug,
        title: p.title,
        frontmatter: p.frontmatter,
      }));

      const input: InsightInput = {
        cases,
        judgements,
        recentDocuments: docs,
      };

      const allInsights = generateInsights(input);
      const insights = query.caseSlug
        ? allInsights.filter((i) => i.caseSlug === query.caseSlug)
        : allInsights;

      return NextResponse.json({ insights, count: insights.length });
    } catch (err) {
      log.error("[insights] Failed to generate:", err);
      return NextResponse.json(
        {
          error: "insights_generation_failed",
          message: "Insights konnten nicht generiert werden.",
        },
        { status: 500 }
      );
    }
  }
);
