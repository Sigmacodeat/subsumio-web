
import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 300;

const documentReviewSchema = z.object({
  document_slug: z.string().optional(),
  text: z.string().max(100_000).optional(),
  questions: z.array(z.string()).max(20).default([]),
  focus: z.enum(["clauses", "risks", "compliance", "general"]).default("general"),
  jurisdiction: z.enum(["at", "de", "ch", "all"]).default("all"),
}).refine(
  (data) => data.document_slug || (data.text && data.text.trim()),
  { message: "document_slug_or_text_required" },
);

export const POST = createEngineProxy({
  action: "legal.document_review",
  enginePath: "/api/legal/document-review",
  body: documentReviewSchema,
  quota: "queries",
  stream: true,
  label: "document-review",
  transformBody: (b) => ({
    document_slug: b.document_slug || undefined,
    text: b.text || undefined,
    questions: b.questions,
    focus: b.focus,
    jurisdiction: b.jurisdiction,
  }),
  audit: (_ctx, b) => ({
    action: "legal.document_review" as const,
    entityType: "document",
    details: { focus: b.focus, jurisdiction: b.jurisdiction, hasText: Boolean(b.text), documentSlug: b.document_slug },
  }),
});
