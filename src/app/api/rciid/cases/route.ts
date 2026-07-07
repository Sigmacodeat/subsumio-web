import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { listCases, isConfigured, type RciidCaseStatus } from "@/lib/rciid";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const listSchema = z.object({
  status: z
    .enum([
      "none",
      "submitted",
      "received",
      "investigating",
      "tracing",
      "analyzing",
      "reporting",
      "completed",
      "rejected",
    ])
    .optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: listSchema,
  },
  async (_ctx, _body, query) => {
    if (!isConfigured()) {
      return apiError("rciid_not_configured", "RCIID Integration ist nicht konfiguriert.", 503);
    }

    try {
      const result = await listCases({
        status: query?.status as RciidCaseStatus | undefined,
        limit: query?.limit,
        offset: query?.offset,
      });
      return apiSuccess({
        ok: true,
        cases: result.cases,
        total: result.total,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return apiError("rciid_list_failed", `RCIID Case-Liste fehlgeschlagen: ${msg}`, 502);
    }
  }
);
