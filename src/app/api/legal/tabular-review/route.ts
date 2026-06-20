
import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 300;

const tabularReviewSchema = z.object({
  questions: z.array(z.string()).min(1, "questions_required").max(50, "too_many_questions"),
  document_slugs: z.array(z.string()).optional(),
  case_slug: z.string().optional(),
});

export const POST = createEngineProxy({
  action: "legal.tabular",
  enginePath: "/api/legal/tabular-review",
  body: tabularReviewSchema,
  quota: "queries",
  quotaAmount: (b) => b.questions.length,
  citationGate: true,
  label: "tabular-review",
  audit: (_ctx, b) => ({
    action: "legal.tabular" as const,
    entityType: "document",
    details: { questionCount: b.questions.length },
  }),
});
