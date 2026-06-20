import { createHandler, apiSuccess } from "@/lib/api-handler";
import {
  HARNESS_REGISTRY,
  getEnabledHarnesses,
  getBlockingHarnesses,
  getHarnessStats,
  evaluateGate,
  type HarnessId,
  type HarnessResult,
} from "@/lib/eval-harness-reuse";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (_ctx, _body, _query, _req) => {
    const stats = getHarnessStats();

    return apiSuccess({
      registry: HARNESS_REGISTRY,
      stats,
      enabled: getEnabledHarnesses().map((h) => ({
        id: h.id,
        name: h.name,
        description: h.description,
        source: h.source,
        blocking: h.blocking,
      })),
      blocking: getBlockingHarnesses().map((h) => h.id),
    });
  },
);
