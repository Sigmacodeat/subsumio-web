import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getCaseStatus, isConfigured } from "@/lib/rciid";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const statusSchema = z.object({
  rciidCaseId: z.string().min(1).max(200),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: statusSchema,
  },
  async (_ctx, body) => {
    if (!isConfigured()) {
      return apiError("rciid_not_configured", "RCIID Integration ist nicht konfiguriert.", 503);
    }

    try {
      const status = await getCaseStatus(body.rciidCaseId);
      return apiSuccess({
        ok: true,
        caseId: status.case_id,
        status: status.status,
        progressPercent: status.progress_percent,
        currentPhase: status.current_phase,
        estimatedCompletionDays: status.estimated_completion_days,
        pricing: status.pricing,
        timeline: status.timeline,
        updatedAt: status.updated_at,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return apiError("rciid_status_failed", `RCIID Status-Abfrage fehlgeschlagen: ${msg}`, 502);
    }
  }
);
