
import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

const precedentSearchSchema = z.object({
  query: z.string().min(1, "query_required").max(2_000),
  jurisdiction: z.enum(["at", "de", "ch"]).optional(),
  legal_area: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const POST = createEngineProxy({
  action: "legal.document_review",
  enginePath: "/api/legal/precedent-search",
  body: precedentSearchSchema,
  rateTier: "search",
  label: "precedent-search",
  audit: (_ctx, b) => ({
    action: "legal.document_review" as const,
    entityType: "precedent",
    details: {
      query: b.query.slice(0, 100),
      jurisdiction: b.jurisdiction,
      legalArea: b.legal_area,
    },
  }),
});
