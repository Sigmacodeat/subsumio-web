import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 60;

const anonymizeSchema = z.object({
  text: z.string().min(1, "text_required").max(100_000, "text_too_long"),
  types: z.array(z.string()).optional(),
});

export const POST = createEngineProxy({
  action: "legal.anonymize",
  enginePath: "/api/legal/anonymize",
  body: anonymizeSchema,
  citationGate: true,
  label: "anonymize",
  audit: (_ctx, b) => ({
    action: "legal.anonymize" as const,
    entityType: "document",
    details: { textLength: b.text.length, types: b.types },
  }),
});
