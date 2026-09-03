import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getCaseStatus, isConfigured } from "@/lib/rciid";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const feedbackSchema = z.object({
  rciidCaseId: z.string().min(1).max(200),
});

/**
 * GET: Retrieve data quality feedback for a RCIID case.
 * Returns the quality score (1-5), missing data hints, and suggestions.
 */
export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: feedbackSchema,
    audit: (_ctx, body) => ({
      action: "rciid.quality_feedback" as const,
      entityType: "case",
      entityId: body.rciidCaseId,
      details: {},
    }),
  },
  async (_ctx, body) => {
    if (!isConfigured()) {
      return apiError("rciid_not_configured", "RCIID Integration ist nicht konfiguriert.", 503);
    }

    try {
      const status = await getCaseStatus(body.rciidCaseId);

      if (!status.data_quality) {
        return apiSuccess({
          ok: true,
          caseId: status.case_id,
          score: null,
          missingData: [],
          suggestions: [],
          automatablePercentage: 0,
          message: "Noch kein Datenqualitäts-Feedback von RCIID erhalten.",
        });
      }

      return apiSuccess({
        ok: true,
        caseId: status.case_id,
        score: status.data_quality.score,
        missingData: status.data_quality.missing_data,
        suggestions: status.data_quality.suggestions,
        automatablePercentage: status.data_quality.automatable_percentage,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return apiError(
        "rciid_feedback_failed",
        `RCIID Feedback-Abfrage fehlgeschlagen: ${msg}`,
        502
      );
    }
  }
);
