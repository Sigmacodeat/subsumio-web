import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getUnminedConfirmedErrors, getTriageStats } from "@/lib/feedback-triage";
import {
  mineFixturesFromTriage,
  exportFixturesAsJSONL,
  exportFixturesForEvalHarness,
  verifyBatchNoPII,
  computeMiningStats,
  _resetRegressionStore,
} from "@/lib/regression-mining";

/**
 * GET /api/admin/regression-mining
 * Query params:
 *   action=stats (default) — get mining statistics
 *   action=export — export mined fixtures as JSONL
 *   action=export-eval — export in eval-harness format
 */
export const GET = createHandler(
  {
    action: "connector.read",
    rateTier: "standard",
  },
  async (ctx, _body, query) => {
    if (ctx.user.role !== "admin") {
      return apiError("forbidden", "Admin access required", 403);
    }

    const action = (query.action as string) ?? "stats";
    const orgId = ctx.user.orgId ?? "default";

    switch (action) {
      case "export": {
        const unmined = getUnminedConfirmedErrors(orgId);
        const { fixtures } = mineFixturesFromTriage(unmined);
        const jsonl = exportFixturesAsJSONL(fixtures);
        const privacyCheck = verifyBatchNoPII(fixtures);

        return apiSuccess({
          fixtures: jsonl,
          count: fixtures.length,
          privacy_clean: privacyCheck.clean,
          privacy_violations: privacyCheck.violations,
        });
      }

      case "export-eval": {
        const unmined = getUnminedConfirmedErrors(orgId);
        const { fixtures } = mineFixturesFromTriage(unmined);
        const evalFixtures = exportFixturesForEvalHarness(fixtures);

        return apiSuccess({
          fixtures: evalFixtures,
          count: evalFixtures.length,
        });
      }

      case "stats":
      default: {
        const triageStats = getTriageStats(orgId);
        return apiSuccess({
          unmined_confirmed: triageStats.unmined_confirmed,
          mined_count: triageStats.mined_count,
          ready_for_mining: triageStats.unmined_confirmed > 0,
        });
      }
    }
  }
);

/**
 * POST /api/admin/regression-mining
 * Body: { action: "mine" } — mine all unmined confirmed errors into fixtures
 */
export const POST = createHandler(
  {
    action: "connector.write",
    rateTier: "standard",
    audit: (ctx, body) => ({
      action: "admin.regression_mining" as const,
      entityType: "regression",
      details: { action: ((body as unknown as Record<string, unknown>)?.action), user: ctx.user.email },
    }),
  },
  async (ctx, body) => {
    if (ctx.user.role !== "admin") {
      return apiError("forbidden", "Admin access required", 403);
    }

    const action = ((body ?? {}) as Record<string, unknown>).action as string;
    const orgId = ctx.user.orgId ?? "default";

    switch (action) {
      case "mine": {
        const unmined = getUnminedConfirmedErrors(orgId);
        if (unmined.length === 0) {
          return apiSuccess({ mined_count: 0, message: "No unmined confirmed errors found" });
        }

        const result = mineFixturesFromTriage(unmined);
        const privacyCheck = verifyBatchNoPII(result.fixtures);
        const stats = computeMiningStats(result.fixtures);

        return apiSuccess({
          mined_count: result.mined_count,
          skipped_count: result.skipped_count,
          errors: result.errors,
          privacy_clean: privacyCheck.clean,
          privacy_violations: privacyCheck.violations,
          stats,
        });
      }

      default:
        return apiError("bad_request", `Unknown action: ${action}`, 400);
    }
  }
);
