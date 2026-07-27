import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 60;

const tabularReviewStartSchema = z.object({
  questions: z
    .array(z.string().max(2000))
    .min(1, "questions_required")
    .max(50, "too_many_questions"),
  slugs: z.array(z.string().max(300)).max(500).optional(),
  case_slug: z.string().optional(),
  type: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  title: z.string().max(300).optional(),
  concurrency: z.number().int().min(1).max(8).optional(),
});

export const POST = createEngineProxy({
  action: "legal.tabular",
  enginePath: "/api/legal/tabular-review/start",
  body: tabularReviewStartSchema,
  quota: "queries",
  credits: "document_analysis",
  // Book the number of documents the run will process (= LLM call bundles).
  // The start response carries the authoritative `document_count`; when it is
  // missing, estimate from the requested slugs / limit (engine default: 25).
  quotaAmountFromResponse: (result, b) => {
    const documentCount = result.document_count;
    if (typeof documentCount === "number" && documentCount > 0) return documentCount;
    return b.slugs?.length ?? b.limit ?? 25;
  },
  label: "tabular-review-start",
  caseSlugField: "case_slug",
  audit: (_ctx, b) => ({
    action: "legal.tabular" as const,
    entityType: "document",
    details: {
      questionCount: b.questions.length,
      documentCount: b.slugs?.length ?? b.limit ?? 25,
      mode: "async",
    },
  }),
});
