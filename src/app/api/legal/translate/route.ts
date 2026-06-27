import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 120;

const translateSchema = z
  .object({
    document_slug: z.string().max(300).optional(),
    text: z.string().max(512_000).optional(),
    source_language: z.string().max(10).optional(),
    target_language: z.string().min(2).max(10),
    legal_terminology: z.boolean().optional(),
    preserve_formatting: z.boolean().optional(),
  })
  .refine((v) => v.document_slug || v.text, { message: "document_slug_or_text_required" });

export const POST = createEngineProxy({
  action: "legal.document_review",
  enginePath: "/api/legal/translate",
  body: translateSchema,
  rateTier: "heavy",
  citationGate: true,
  label: "translate",
  audit: (_ctx, b) => ({
    action: "legal.document_review" as const,
    entityType: "document",
    details: {
      targetLanguage: b.target_language,
      sourceLanguage: b.source_language ?? "auto",
      mode: b.document_slug ? "slug" : "text",
    },
  }),
});
