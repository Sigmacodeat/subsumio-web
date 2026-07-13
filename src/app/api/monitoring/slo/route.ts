import { createHandler } from "@/lib/api-handler";
import {
  evaluateAllSLOs,
  getSLOsForWorkflow,
  getSLOSummary,
  generateAlerts,
} from "@/lib/slo-monitor-client";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * GET /api/monitoring/slo — SLO status for all workflows.
 *
 * Returns SLO definitions, current status (met/breached/no_data),
 * and active alerts. Supports ?workflow=think filter.
 *
 * Requires admin role.
 */

export const GET = createHandler(
  {
    action: "admin.*" as never,
    cacheMaxAge: 0,
  },
  async (_ctx, _body, _query, req) => {
    const workflow = new URL(req.url).searchParams.get("workflow");

    const sloStatuses = workflow ? getSLOsForWorkflow(workflow) : evaluateAllSLOs();

    const alerts = generateAlerts();
    const summary = getSLOSummary();

    return Response.json({
      timestamp: new Date().toISOString(),
      summary,
      slo_statuses: sloStatuses,
      alerts,
    });
  }
);
