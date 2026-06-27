import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 300;

const contractDraftSchema = z.object({
  type: z.string().min(1, "type_required").max(100),
  jurisdiction: z.enum(["at", "de", "ch"]),
  parties: z.object({
    a: z.string().min(1).max(300),
    b: z.string().min(1).max(300),
  }),
  instructions: z.string().max(5000).optional().default(""),
  template_slug: z.string().max(200).optional(),
  language: z.enum(["de", "en"]).default("de"),
});

export const POST = createEngineProxy({
  action: "legal.contract_draft",
  enginePath: "/api/legal/contract-draft",
  body: contractDraftSchema,
  quota: "queries",
  stream: true,
  citationGate: true,
  label: "contract-draft",
  transformBody: (b) => ({
    type: b.type,
    jurisdiction: b.jurisdiction,
    parties: b.parties,
    instructions: b.instructions,
    language: b.language,
    template_slug: b.template_slug,
  }),
  audit: (_ctx, b) => ({
    action: "legal.contract_draft" as const,
    entityType: "contract",
    details: {
      contractType: b.type,
      jurisdiction: b.jurisdiction,
      parties: b.parties,
    },
  }),
});
