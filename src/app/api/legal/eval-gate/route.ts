import { z } from "zod";
import { createHandler } from "@/lib/api-handler";

const postSchema = z.object({
  specialist: z.string().min(1),
  leave_one_out: z.boolean().optional(),
  threshold: z.number().min(0).max(1).optional(),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: postSchema,
  },
  async (_ctx, body) => {
    const result = {
      specialist: body.specialist,
      status: "eval-gate-available",
      message: `Eval gate for "${body.specialist}" is configured. Run with engine + queue to execute.`,
      leave_one_out: body.leave_one_out ?? false,
      threshold: body.threshold ?? 0.8,
      datasets_available: ["on-scanner", "entity-extractor", "forensic-analyst", "legal-critic"],
    };
    return Response.json(result);
  }
);
