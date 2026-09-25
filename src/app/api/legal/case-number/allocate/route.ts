import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { allocateCaseNumber, CaseNumberAllocationError } from "@/lib/case-numbering";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  prefix: z.string().max(20).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: bodySchema,
    audit: () => ({
      action: "case.update" as const,
      entityType: "case_number_counter",
    }),
  },
  async (ctx, body) => {
    try {
      const caseNumber = await allocateCaseNumber(ctx.headers, ctx.brainId, body.prefix);
      return apiSuccess({ caseNumber });
    } catch (err) {
      if (err instanceof CaseNumberAllocationError) {
        return apiError(
          "case_number_allocation_failed",
          "Aktenzeichen konnte nicht vergeben werden — bitte erneut versuchen.",
          409
        );
      }
      throw err;
    }
  }
);
