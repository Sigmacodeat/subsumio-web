import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import {
  evaluateGate,
  HARNESS_REGISTRY,
  type HarnessResult,
  type HarnessId,
} from "@/lib/eval-harness-reuse";
import { getFeedbackStats, getFeedbackForOrg } from "@/lib/retrieval-feedback";

/**
 * GET /api/admin/eval-gate
 * Returns the unified eval gate status by aggregating all harness results.
 *
 * Phase 1: Returns harness registry with "not_run" status for unconfigured
 * harnesses, plus live feedback stats from the retrieval feedback store.
 * As each harness gets wired to its data source, it will produce live results.
 */
export const GET = createHandler(
  {
    action: "connector.read",
    rateTier: "standard",
  },
  async (ctx) => {
    if (ctx.user.role !== "admin") {
      return apiError("forbidden", "Admin access required", 403);
    }

    // Collect live results from available harnesses
    const results: Partial<Record<HarnessId, HarnessResult>> = {};

    // Feedback harness — live from in-memory store
    const orgFeedback = getFeedbackForOrg(ctx.user.orgId ?? "default");
    const feedbackStats = getFeedbackStats(orgFeedback);
    results.feedback = {
      harness_id: "feedback",
      name: "Retrieval Feedback",
      description: "User Feedback als Eval-Signal — Satisfaction Rate, Problematic Results/Queries",
      status: orgFeedback.length > 0 ? "pass" : "not_run",
      metrics: {
        total_feedback: feedbackStats.total_feedback,
        satisfaction_rate: feedbackStats.satisfaction_rate,
        unique_queries: feedbackStats.unique_queries,
        unique_results: feedbackStats.unique_results,
      },
      last_run: orgFeedback.length > 0 ? new Date().toISOString() : undefined,
    };

    // Evaluate the gate
    const gateResult = evaluateGate(results);

    // Add registry info for UI display
    const harnessesWithMeta = gateResult.harnesses.map((h) => {
      const def = HARNESS_REGISTRY.find((d) => d.id === h.harness_id);
      return {
        ...h,
        blocking: def?.blocking ?? false,
        source: def?.source ?? "",
      };
    });

    return apiSuccess({
      ...gateResult,
      harnesses: harnessesWithMeta,
    });
  }
);
