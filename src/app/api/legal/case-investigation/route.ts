import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 300;

const caseInvestigationSchema = z.object({
  case_slug: z.string().min(1),
  pruefauftrag: z.string().max(2000).optional(),
  jurisdiction: z.enum(["at", "de", "ch"]).default("at"),
  incremental: z.boolean().optional(),
});

export const POST = createEngineProxy({
  action: "legal.case_investigation",
  enginePath: "/api/legal/case-investigation",
  body: caseInvestigationSchema,
  quota: "queries",
  credits: "subsumption",
  citationGate: true,
  label: "case-investigation",
  caseSlugField: "case_slug",
  transformBody: (b) => ({
    case_slug: b.case_slug,
    pruefauftrag: b.pruefauftrag || undefined,
    jurisdiction: b.jurisdiction,
    incremental: b.incremental,
  }),
  audit: (_ctx, b) => ({
    action: "legal.case_investigation" as const,
    entityType: "case",
    entityId: b.case_slug,
    details: {
      jurisdiction: b.jurisdiction,
      hasPruefauftrag: Boolean(b.pruefauftrag),
      incremental: Boolean(b.incremental),
    },
  }),
});
