import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 300;

const schriftsatzSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  document_type: z
    .enum([
      "klage",
      "klageerwiderung",
      "berufung",
      "revision",
      "beschwerde",
      "antrag",
      "antwortschrift",
      "schriftsatz",
    ])
    .default("schriftsatz"),
  court: z.string().max(300).optional(),
  file_number: z.string().max(200).optional(),
  instructions: z.string().min(1, "instructions_required").max(10_000, "instructions_too_long"),
  jurisdiction: z.enum(["at", "de", "ch"]),
  language: z.enum(["de", "en"]).default("de"),
  template_slug: z.string().max(200).optional(),
});

export const POST = createEngineProxy({
  action: "legal.schriftsatz",
  enginePath: "/api/legal/schriftsatz",
  body: schriftsatzSchema,
  quota: "queries",
  credits: "agent",
  stream: true,
  citationGate: true,
  receiptProductType: "schriftsatz",
  receiptProductRef: (b) => `${b.case_slug}/schriftsatz`,
  label: "schriftsatz",
  caseSlugField: "case_slug",
  transformBody: (b) => ({
    case_slug: b.case_slug,
    document_type: b.document_type,
    court: b.court || undefined,
    file_number: b.file_number || undefined,
    instructions: b.instructions,
    jurisdiction: b.jurisdiction,
    language: b.language,
    template_slug: b.template_slug || undefined,
  }),
  audit: (_ctx, b) => ({
    action: "legal.schriftsatz" as const,
    entityType: "document",
    details: {
      case_slug: b.case_slug,
      document_type: b.document_type,
      jurisdiction: b.jurisdiction,
      hasCourt: Boolean(b.court),
    },
  }),
});
