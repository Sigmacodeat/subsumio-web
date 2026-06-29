import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 300;

const caseScannerSchema = z.object({
  look_ahead_days: z.number().int().min(1).max(90).optional(),
  evidence_threshold: z.number().int().min(0).max(10).optional(),
  max_cases: z.number().int().min(1).max(500).optional(),
});

export const POST = createEngineProxy({
  action: "legal.case_scanner",
  enginePath: "/api/legal/case-scanner",
  body: caseScannerSchema,
  rateTier: "heavy",
  citationGate: true,
  label: "case-scanner",
  audit: (_ctx, b) => ({
    action: "legal.case_scanner" as const,
    entityType: "case",
    details: {
      lookAheadDays: b.look_ahead_days ?? 7,
      evidenceThreshold: b.evidence_threshold ?? 1,
      maxCases: b.max_cases ?? 50,
    },
  }),
});
