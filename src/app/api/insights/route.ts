/**
 * GET /api/insights — Returns generated insights for the current brain.
 *
 * Collects cases, judgements, documents and the Fristen read model from the
 * engine, then runs the rule-based insights generator. `partial: true` when a
 * list failed to load.
 */
import { listEnginePages } from "@/lib/engine-pages";
import { getEnginePage } from "@/lib/engine-page-io";
import { DEADLINE_SOURCES, loadFristenReadModel } from "@/lib/fristen-read-model";
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
      // A failed read is never passed off as "no insights": every list is
      // read strictly and a failure sets `partial: true` for the UI.
      let partial = false;
      const strictList = async (type: string, limit: number) => {
        try {
          return await listEnginePages(ctx.headers, type, limit, { strict: true });
        } catch {
          partial = true;
          return [];
        }
      };
      // One matter: read exactly that matter, not the most recently edited
      // matters of the firm filtered afterwards.
      const loadCases = async (): Promise<BrainPage[]> => {
        if (!query.caseSlug) {
          // Every matter, complete — a list cut at a fixed bound drops the
          // oldest matters; reaching the safety stop marks the answer partial.
          try {
            return (await listEnginePages(ctx.headers, "legal_case", 100_000, {
              strict: true,
              failOnTruncate: true,
            })) as unknown as BrainPage[];
          } catch {
            partial = true;
            return [];
          }
        }
        try {
          const page = await getEnginePage(ctx.headers, query.caseSlug);
          return page ? [page] : [];
        } catch {
          partial = true;
          return [];
        }
      };
      // Deadline insights come from the Fristen read model (Fristenbuch,
      // deadline pages, deadlines in matters) with its central status rules.
      const [casePages, judgementPages, legalDocs, plainDocs, fristenModel] = await Promise.all([
        loadCases(),
        strictList("legal_judgement", 50),
        strictList("legal_document", 100),
        strictList("document", 100),
        loadFristenReadModel(ctx.headers, { caseFilter: query.caseSlug }),
      ]);
      const deadlinesIncomplete = fristenModel.failedSources.some((src) =>
        DEADLINE_SOURCES.includes(src)
      );
      if (deadlinesIncomplete) partial = true;

      const cases = casePages.map((p) => ({
        slug: p.slug,
        title: p.title,
        frontmatter: p.frontmatter,
      }));

      const judgements = (judgementPages as BrainPage[]).map((p) => ({
        slug: p.slug,
        title: p.title,
        frontmatter: p.frontmatter,
      }));

      const docs = [...(legalDocs as BrainPage[]), ...(plainDocs as BrainPage[])].map((p) => ({
        slug: p.slug,
        title: p.title,
        frontmatter: p.frontmatter,
      }));

      const input: InsightInput = {
        // Incomplete deadline data: no "Keine Fristen gesetzt" from a list
        // that is missing entries — fall back to the matters' own deadlines.
        deadlines: deadlinesIncomplete ? undefined : fristenModel.fristen,
        cases,
        judgements,
        recentDocuments: docs,
      };

      const allInsights = generateInsights(input);
      const insights = query.caseSlug
        ? allInsights.filter((i) => i.caseSlug === query.caseSlug)
        : allInsights;

      return NextResponse.json({
        insights,
        count: insights.length,
        ...(partial ? { partial: true } : {}),
      });
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
