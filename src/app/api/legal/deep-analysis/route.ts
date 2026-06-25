import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 300;

const deepAnalysisSchema = z.object({
  slugs: z.array(z.string()).min(1).max(25),
  prompt: z.string().max(2000).optional(),
  jurisdiction: z.enum(["at", "de", "ch", "all"]).default("all"),
});

export const POST = createEngineProxy({
  action: "legal.deep_analysis",
  enginePath: "/api/legal/deep-analysis",
  body: deepAnalysisSchema,
  quota: "queries",
  citationGate: true,
  label: "deep-analysis",
  transformBody: (b) => ({
    slugs: b.slugs,
    prompt: b.prompt || undefined,
    jurisdiction: b.jurisdiction,
  }),
  audit: (_ctx, b) => ({
    action: "legal.deep_analysis" as const,
    entityType: "document",
    details: {
      documentCount: b.slugs.length,
      jurisdiction: b.jurisdiction,
      hasPrompt: Boolean(b.prompt),
    },
  }),
});
