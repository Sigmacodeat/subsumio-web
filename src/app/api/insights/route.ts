/**
 * GET /api/insights — Returns generated insights for the current brain.
 *
 * TODO 8: Insights-Engine API endpoint.
 * Collects cases, judgements, and documents from the engine,
 * then runs the rule-based insights generator.
 */
import { NextResponse } from "next/server";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";
import { generateInsights, type InsightInput } from "@/lib/insights-engine";
import type { BrainPage } from "@/lib/types";
import { z } from "zod";

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
      // Fetch cases, judgements, and documents in parallel
      const [casesRes, judgementsRes, docsRes] = await Promise.all([
        fetch(`${ENGINE_URL}/api/pages/batch-list?types=legal_case&limit=200`, {
          headers: ctx.headers,
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null),
        fetch(`${ENGINE_URL}/api/pages?type=legal_judgement&limit=50`, {
          headers: ctx.headers,
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null),
        fetch(`${ENGINE_URL}/api/pages/batch-list?types=legal_document,document&limit=100`, {
          headers: ctx.headers,
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null),
      ]);

      const casesData = casesRes?.ok ? await casesRes.json() : { results: { legal_case: [] } };
      const judgementsData = judgementsRes?.ok ? await judgementsRes.json() : { pages: [] };
      const docsData = docsRes?.ok
        ? await docsRes.json()
        : { results: { legal_document: [], document: [] } };

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
      console.error("[insights] Failed to generate:", err);
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
