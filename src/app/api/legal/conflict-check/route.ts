
import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

const conflictCheckSchema = z.object({
  name: z.string().min(1, "name_required"),
});

export const POST = createEngineProxy({
  action: "legal.conflict",
  enginePath: "/api/legal/conflict-check",
  body: conflictCheckSchema,
  rateTier: "standard",
  label: "conflict-check",
  audit: (_ctx, b) => ({
    action: "conflict.check" as const,
    entityType: "conflict_check",
    details: { name: b.name },
  }),
});
