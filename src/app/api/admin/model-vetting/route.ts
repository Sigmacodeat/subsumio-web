import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";

const adminBodySchema = z
  .record(z.unknown())
  .refine((v) => JSON.stringify(v).length < 50000, "Body too large (max 50KB)");
import {
  createVettingReport,
  getVettingReport,
  getAllVettingReports,
  getVettingStats,
  startShadowMode,
  completeShadowMode,
  promoteModel,
  compareModels,
  VETTING_STATE_LABELS_DE,
  VETTING_DIMENSION_LABELS_DE,
  DEFAULT_THRESHOLDS,
  type VettingMetrics,
} from "@/lib/model-vetting";

/**
 * GET /api/admin/model-vetting
 * Query params:
 *   action=list (default) — list all vetting reports
 *   action=stats — get vetting statistics
 *   action=entry&id=... — get single report
 *   action=labels — get German labels
 *   action=thresholds — get default thresholds
 */
export const GET = createHandler(
  {
    action: "connector.read",
    rateTier: "standard",
    admin: true,
  },
  async (ctx, _body, query) => {
    if (ctx.user.role !== "admin") {
      return apiError("forbidden", "Admin access required", 403);
    }

    const action = (query.action as string) ?? "list";

    switch (action) {
      case "stats": {
        return apiSuccess(getVettingStats());
      }

      case "entry": {
        const id = query.id as string;
        if (!id) return apiError("bad_request", "id parameter required", 400);
        const report = getVettingReport(id);
        if (!report) return apiError("not_found", "Vetting report not found", 404);
        return apiSuccess(report);
      }

      case "labels": {
        return apiSuccess({
          states: VETTING_STATE_LABELS_DE,
          dimensions: VETTING_DIMENSION_LABELS_DE,
        });
      }

      case "thresholds": {
        return apiSuccess(DEFAULT_THRESHOLDS);
      }

      case "list":
      default: {
        return apiSuccess({ reports: getAllVettingReports() });
      }
    }
  }
);

/**
 * POST /api/admin/model-vetting
 * Body: { action: "create" | "shadow_start" | "shadow_complete" | "promote" | "compare", ... }
 */
export const POST = createHandler(
  {
    action: "connector.write",
    rateTier: "standard",
    admin: true,
    body: adminBodySchema,
    audit: (ctx, body) => ({
      action: "admin.model_vetting" as const,
      entityType: "model",
      details: {
        action: (body as unknown as Record<string, unknown>)?.action,
        user: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    if (ctx.user.role !== "admin") {
      return apiError("forbidden", "Admin access required", 403);
    }

    const data = (body ?? {}) as Record<string, unknown>;
    const action = data.action as string;

    switch (action) {
      case "create": {
        const input = (body ?? {}) as {
          model_id: string;
          model_name: string;
          baseline_model_id: string;
          test_set: string;
          test_cases_count: number;
          metrics: VettingMetrics;
        };
        if (!input.model_id || !input.metrics) {
          return apiError("bad_request", "model_id and metrics are required", 400);
        }
        const report = createVettingReport(input);
        return apiSuccess({
          id: report.id,
          state: report.state,
          overall_passed: report.overall_passed,
        });
      }

      case "shadow_start": {
        const input = (body ?? {}) as {
          report_id: string;
          traffic_percentage: number;
          duration_hours: number;
          compare_dimensions: string[];
        };
        if (!input.report_id) {
          return apiError("bad_request", "report_id is required", 400);
        }
        try {
          const report = startShadowMode(input.report_id, {
            traffic_percentage: input.traffic_percentage,
            duration_hours: input.duration_hours,
            compare_dimensions: input.compare_dimensions as never[],
          });
          return apiSuccess({ id: report.id, state: report.state });
        } catch (err) {
          return apiError("bad_request", err instanceof Error ? err.message : "Unknown error", 400);
        }
      }

      case "shadow_complete": {
        const input = (body ?? {}) as {
          report_id: string;
          total_shadow_requests: number;
          total_baseline_requests: number;
          divergence_rate: number;
          citation_divergence_rate: number;
          latency_diff_ms: number;
          cost_diff_per_1k: number;
          satisfaction_diff: number;
          recommendation: "promote" | "keep_shadow" | "rollback";
        };
        if (!input.report_id) {
          return apiError("bad_request", "report_id is required", 400);
        }
        try {
          const report = completeShadowMode(input.report_id, {
            total_shadow_requests: input.total_shadow_requests,
            total_baseline_requests: input.total_baseline_requests,
            divergence_rate: input.divergence_rate,
            citation_divergence_rate: input.citation_divergence_rate,
            latency_diff_ms: input.latency_diff_ms,
            cost_diff_per_1k: input.cost_diff_per_1k,
            satisfaction_diff: input.satisfaction_diff,
            recommendation: input.recommendation,
          });
          return apiSuccess({ id: report.id, state: report.state });
        } catch (err) {
          return apiError("bad_request", err instanceof Error ? err.message : "Unknown error", 400);
        }
      }

      case "promote": {
        const input = (body ?? {}) as { report_id: string; notes?: string };
        if (!input.report_id) {
          return apiError("bad_request", "report_id is required", 400);
        }
        try {
          const report = promoteModel(input.report_id, ctx.user.id, input.notes);
          return apiSuccess({ id: report.id, state: report.state });
        } catch (err) {
          return apiError("bad_request", err instanceof Error ? err.message : "Unknown error", 400);
        }
      }

      case "compare": {
        const input = (body ?? {}) as { baseline: VettingMetrics; candidate: VettingMetrics };
        if (!input.baseline || !input.candidate) {
          return apiError("bad_request", "baseline and candidate metrics are required", 400);
        }
        const comparison = compareModels(input.baseline, input.candidate);
        return apiSuccess(comparison);
      }

      default:
        return apiError("bad_request", `Unknown action: ${action}`, 400);
    }
  }
);
