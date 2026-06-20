
import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 300;

const memoSchema = z.object({
  question: z.string().min(1, "question_required").max(2_000, "question_too_long"),
  facts: z.string().min(1, "facts_required").max(10_000, "facts_too_long"),
  jurisdiction: z.enum(["at", "de", "ch"]),
  legal_area: z.string().max(100).optional(),
  case_slug: z.string().optional(),
  language: z.enum(["de", "en"]).default("de"),
  depth: z.enum(["brief", "standard", "comprehensive"]).default("standard"),
});

export const POST = createEngineProxy({
  action: "legal.memo",
  enginePath: "/api/legal/memo",
  body: memoSchema,
  quota: "queries",
  stream: true,
  citationGate: true,
  label: "memo",
  transformBody: (b) => ({
    question: b.question,
    facts: b.facts,
    jurisdiction: b.jurisdiction,
    legal_area: b.legal_area || undefined,
    case_slug: b.case_slug || undefined,
    language: b.language,
    depth: b.depth,
  }),
  audit: (_ctx, b) => ({
    action: "legal.memo" as const,
    entityType: "document",
    details: {
      jurisdiction: b.jurisdiction,
      legalArea: b.legal_area,
      depth: b.depth,
      hasCaseSlug: Boolean(b.case_slug),
    },
  }),
});
