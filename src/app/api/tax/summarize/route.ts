import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 120;

const summarizeSchema = z
  .object({
    document_slug: z.string().optional(),
    text: z.string().max(100_000).optional(),
    type: z
      .enum([
        "tax_notice",
        "tax_return",
        "appeal",
        "audit_report",
        "annual_report",
        "payroll",
        "vat_return",
        "correspondence",
        "general",
      ])
      .default("general"),
    depth: z.enum(["brief", "standard", "detailed"]).default("standard"),
    focus: z.string().max(200).optional(),
    language: z.enum(["de", "en"]).default("de"),
  })
  .refine((data) => data.document_slug || (data.text && data.text.trim()), {
    message: "document_slug_or_text_required",
  });

export const POST = createEngineProxy({
  action: "tax.summarize",
  enginePath: "/api/legal/summarize",
  body: summarizeSchema,
  quota: "queries",
  stream: true,
  citationGate: true,
  label: "tax_summarize",
  transformBody: (b) => ({
    document_slug: b.document_slug || undefined,
    text: b.text || undefined,
    type: b.type === "general" ? "general" : "document",
    depth: b.depth,
    focus: b.focus || undefined,
    language: b.language,
  }),
  audit: (_ctx, b) => ({
    action: "tax.summarize" as const,
    entityType: "document",
    details: {
      action: "tax_summarize",
      docType: b.type,
      depth: b.depth,
      hasSlug: Boolean(b.document_slug),
    },
  }),
});
