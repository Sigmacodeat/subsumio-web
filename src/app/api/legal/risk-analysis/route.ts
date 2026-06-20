
import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 180;

const riskAnalysisSchema = z.object({
  document_slug: z.string().optional(),
  text: z.string().max(100_000).optional(),
  contract_type: z.string().optional(),
  jurisdiction: z.enum(["at", "de", "ch", "all"]).default("all"),
  perspective: z.enum(["party_a", "party_b", "neutral"]).default("neutral"),
}).refine(
  (data) => data.document_slug || (data.text && data.text.trim()),
  { message: "document_slug_or_text_required" },
);

export const POST = createEngineProxy({
  action: "legal.risk_analysis",
  enginePath: "/api/legal/risk-analysis",
  body: riskAnalysisSchema,
  quota: "queries",
  label: "risk-analysis",
  transformBody: (b) => ({
    document_slug: b.document_slug || undefined,
    text: b.text || undefined,
    contract_type: b.contract_type || undefined,
    jurisdiction: b.jurisdiction,
    perspective: b.perspective,
  }),
  audit: (_ctx, b) => ({
    action: "legal.risk_analysis" as const,
    entityType: "document",
    details: {
      jurisdiction: b.jurisdiction,
      perspective: b.perspective,
      contractType: b.contract_type,
      documentSlug: b.document_slug,
    },
  }),
});
