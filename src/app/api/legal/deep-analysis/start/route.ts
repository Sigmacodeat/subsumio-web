import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 60;

const startSchema = z.object({
  slugs: z.array(z.string().max(300)).min(1).max(25),
  prompt: z.string().max(2000).optional(),
  jurisdiction: z.enum(["at", "de", "ch", "all"]).default("all"),
  case_slug: z.string().max(300).optional(),
  title: z.string().max(200).optional(),
});

/**
 * Start a deep analysis as a background job. Returns the run immediately; the
 * browser polls /api/legal/deep-analysis/run/<id>. Credits are booked here,
 * like the synchronous route, because the queued job will spend them.
 */
export const POST = createEngineProxy({
  action: "legal.deep_analysis",
  enginePath: "/api/legal/deep-analysis/start",
  body: startSchema,
  quota: "queries",
  credits: "subsumption",
  label: "deep-analysis-start",
  caseSlugField: "case_slug",
  transformBody: (b) => ({
    slugs: b.slugs,
    prompt: b.prompt || undefined,
    jurisdiction: b.jurisdiction,
    case_slug: b.case_slug || undefined,
    title: b.title || undefined,
  }),
  audit: (_ctx, b) => ({
    action: "legal.deep_analysis" as const,
    entityType: "document",
    details: {
      documentCount: b.slugs.length,
      jurisdiction: b.jurisdiction,
      hasPrompt: Boolean(b.prompt),
      mode: "async",
    },
  }),
});
