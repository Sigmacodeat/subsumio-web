import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 120;

const obligationSchema = z
  .object({
    document_slug: z.string().max(300).optional(),
    text: z.string().max(512_000).optional(),
    jurisdiction: z.enum(["at", "de", "ch", "all"]).optional(),
  })
  .refine((v) => v.document_slug || v.text, { message: "document_slug_or_text_required" });

export const POST = createEngineProxy({
  action: "legal.obligation_extract",
  enginePath: "/api/legal/obligation-extract",
  body: obligationSchema,
  rateTier: "heavy",
  citationGate: true,
  label: "obligation-extract",
  audit: (_ctx, b) => ({
    action: "legal.obligation_extract" as const,
    entityType: "contract",
    details: {
      jurisdiction: b.jurisdiction ?? "all",
      mode: b.document_slug ? "slug" : "text",
    },
  }),
});
