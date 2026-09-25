import { z } from "zod";
import { createEngineProxy } from "@/lib/api-handler";

export const maxDuration = 60;

const conflictCheckSchema = z.object({
  name: z.string().min(1, "name_required"),
  /** Side of the name in the NEW mandate — decides what is a conflict (§ 10 RAO). */
  side: z.enum(["client", "opponent"]).optional(),
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
    details: { name: b.name, side: b.side },
  }),
});
