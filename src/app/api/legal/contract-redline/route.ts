
import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 300;

const contractRedlineSchema = z.object({
  original_text: z.string().min(1, "original_text_required").max(100_000, "text_too_long"),
  counterparty_text: z.string().max(100_000).optional(),
  playbook_slug: z.string().optional(),
  contract_type: z.string().max(100).optional(),
  jurisdiction: z.enum(["at", "de", "ch", "all"]).default("all"),
  perspective: z.enum(["client", "counterparty", "neutral"]).default("client"),
  language: z.enum(["de", "en"]).default("de"),
});

export const POST = createEngineProxy({
  action: "legal.redline",
  enginePath: "/api/legal/contract-redline",
  body: contractRedlineSchema,
  quota: "queries",
  stream: true,
  label: "contract-redline",
  transformBody: (b) => ({
    original_text: b.original_text,
    counterparty_text: b.counterparty_text || undefined,
    playbook_slug: b.playbook_slug || undefined,
    contract_type: b.contract_type || undefined,
    jurisdiction: b.jurisdiction,
    perspective: b.perspective,
    language: b.language,
  }),
  audit: (_ctx, b) => ({
    action: "legal.redline" as const,
    entityType: "document",
    details: { jurisdiction: b.jurisdiction, perspective: b.perspective, contractType: b.contract_type, hasCounterparty: Boolean(b.counterparty_text) },
  }),
});
