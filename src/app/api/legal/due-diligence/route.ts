
import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 300;

const dueDiligenceSchema = z.object({
  case_slug: z.string().optional(),
  document_slugs: z.array(z.string()).max(50).default([]),
  category: z.enum(["m_and_a", "real_estate", "financing", "general"]).default("general"),
  jurisdiction: z.enum(["at", "de", "ch"]).default("de"),
  checklist: z.array(z.string()).max(100).optional(),
  language: z.enum(["de", "en"]).default("de"),
}).refine(
  (data) => data.case_slug || data.document_slugs.length > 0,
  { message: "case_slug_or_document_slugs_required" },
);

export const POST = createEngineProxy({
  action: "legal.due_diligence",
  enginePath: "/api/legal/due-diligence",
  body: dueDiligenceSchema,
  quota: "queries",
  stream: true,
  label: "due-diligence",
  transformBody: (b) => ({
    case_slug: b.case_slug || undefined,
    document_slugs: b.document_slugs.length > 0 ? b.document_slugs : undefined,
    category: b.category,
    jurisdiction: b.jurisdiction,
    checklist: b.checklist && b.checklist.length > 0 ? b.checklist : undefined,
    language: b.language,
  }),
  audit: (_ctx, b) => ({
    action: "legal.due_diligence" as const,
    entityType: "case",
    entityId: b.case_slug || b.document_slugs[0],
    details: { category: b.category, jurisdiction: b.jurisdiction, docCount: b.document_slugs.length || "from_case" },
  }),
});
