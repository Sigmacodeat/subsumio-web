import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 300;

const tabularReviewSchema = z.object({
  questions: z
    .array(z.string().max(2000))
    .min(1, "questions_required")
    .max(50, "too_many_questions"),
  slugs: z.array(z.string().max(300)).max(500).optional(),
  /** Legacy alias for `slugs` — mapped onto `slugs` before proxying. */
  document_slugs: z.array(z.string().max(300)).max(500).optional(),
  type: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  case_slug: z.string().optional(),
});

export const POST = createEngineProxy({
  action: "legal.tabular",
  enginePath: "/api/legal/tabular-review",
  body: tabularReviewSchema,
  quota: "queries",
  credits: "document_analysis",
  // Book the real LLM cost driver: the number of documents reviewed
  // (one LLM call bundle per document). Primary source is the engine's
  // `document_count`; fall back to the requested slugs, then questions.
  quotaAmountFromResponse: (result, b) => {
    const documentCount = result.document_count;
    if (typeof documentCount === "number" && documentCount > 0) return documentCount;
    const slugs = b.slugs ?? b.document_slugs;
    return slugs?.length ?? b.questions.length;
  },
  // The engine sync route only understands {questions, slugs?, type?, limit?}.
  // `document_slugs` is folded into `slugs` here. `case_slug` is deliberately
  // NOT forwarded — the sync route does not support it; it only feeds the
  // jurisdiction header via caseSlugField below. Engine-side `case_slug`
  // support exists only on the async start route (./start).
  transformBody: (b) => {
    const slugs = b.slugs ?? b.document_slugs;
    return {
      questions: b.questions,
      ...(slugs ? { slugs } : {}),
      ...(b.type ? { type: b.type } : {}),
      ...(b.limit !== undefined ? { limit: b.limit } : {}),
    };
  },
  citationGate: true,
  label: "tabular-review",
  caseSlugField: "case_slug",
  audit: (_ctx, b) => ({
    action: "legal.tabular" as const,
    entityType: "document",
    details: {
      questionCount: b.questions.length,
      documentCount: (b.slugs ?? b.document_slugs)?.length ?? b.limit ?? 25,
    },
  }),
});
