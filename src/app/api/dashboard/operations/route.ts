import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { fetchOperationsData } from "@/lib/operations-data";

export const dynamic = "force-dynamic";

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(200) });

export const GET = createHandler(
  { action: "brain.read", rateTier: "standard", query: querySchema },
  async (ctx, _body, query) => {
    try {
      const data = await fetchOperationsData(ctx.headers, query.limit);
      return apiSuccess(data);
    } catch (error) {
      return apiError(
        "operations_unavailable",
        error instanceof Error ? error.message : "Operationsdaten konnten nicht geladen werden.",
        502
      );
    }
  }
);
