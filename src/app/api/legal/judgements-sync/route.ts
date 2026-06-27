import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 120;

const judgementsSyncSchema = z.object({
  jurisdiction: z.enum(["at", "de", "ch", "all"]).optional(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const POST = createEngineProxy({
  action: "legal.judgements",
  enginePath: "/api/legal/judgements-sync",
  body: judgementsSyncSchema,
  label: "judgements-sync",
  audit: (_ctx, b) => ({
    action: "legal.judgements_sync" as const,
    entityType: "judgement",
    details: { jurisdiction: b.jurisdiction },
  }),
});
