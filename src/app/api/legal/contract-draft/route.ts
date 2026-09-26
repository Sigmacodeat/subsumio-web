import { createEngineProxy } from "@/lib/api-handler";
import { contractDraftSchema } from "@/lib/legal/contract-draft-schema";

export const maxDuration = 300;

export const POST = createEngineProxy({
  action: "legal.contract_draft",
  enginePath: "/api/legal/contract-draft",
  body: contractDraftSchema,
  quota: "queries",
  credits: "agent",
  stream: true,
  citationGate: true,
  receiptProductType: "draft",
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
