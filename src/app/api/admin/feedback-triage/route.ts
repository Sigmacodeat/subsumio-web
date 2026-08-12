import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import {
  getTriageQueue,
  getTriageStats,
  getTriageById,
  applyTriageDecision,
  createManualCandidate,
  markMined,
  reopenTriage,
  validateTriageDecision,
  ERROR_CLASS_LABELS_DE,
  ROOT_CAUSE_LABELS_DE,
  SEVERITY_LABELS_DE,
  TRIAGE_STATE_LABELS_DE,
  FEEDBACK_SOURCE_LABELS_DE,
  type ErrorClass,
  type RootCause,
  type ErrorSeverity,
  type TriageState,
  type FeedbackSource,
} from "@/lib/feedback-triage";

/**
 * GET /api/admin/feedback-triage
 * Query params:
 *   action=queue (default) — get triage queue with filters
 *   action=stats — get triage statistics
 *   action=entry&id=... — get single triage entry
 *   action=labels — get all German labels for dropdowns
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

    const action = (query.action as string) ?? "queue";
    const orgId = ctx.user.orgId ?? "default";

    switch (action) {
      case "stats": {
        const stats = getTriageStats(orgId);
        return apiSuccess(stats);
      }

      case "entry": {
        const id = query.id as string;
        if (!id) return apiError("bad_request", "id parameter required", 400);
        const entry = getTriageById(id);
        if (!entry) return apiError("not_found", "Triage entry not found", 404);
        return apiSuccess(entry);
      }

      case "labels": {
        return apiSuccess({
          error_classes: ERROR_CLASS_LABELS_DE,
          root_causes: ROOT_CAUSE_LABELS_DE,
          severities: SEVERITY_LABELS_DE,
          triage_states: TRIAGE_STATE_LABELS_DE,
          feedback_sources: FEEDBACK_SOURCE_LABELS_DE,
        });
      }

      case "queue":
      default: {
        const filters: Record<string, unknown> = {};
        if (query.state) filters.state = query.state as TriageState;
        if (query.error_class) filters.error_class = query.error_class as ErrorClass;
        if (query.root_cause) filters.root_cause = query.root_cause as RootCause;
        if (query.severity) filters.severity = query.severity as ErrorSeverity;
        if (query.jurisdiction) filters.jurisdiction = query.jurisdiction as "DE" | "AT" | "CH";
        if (query.source) filters.source = query.source as FeedbackSource;
        if (query.limit) filters.limit = parseInt(query.limit as string, 10);
        if (query.offset) filters.offset = parseInt(query.offset as string, 10);

        const entries = getTriageQueue(filters, orgId);
        return apiSuccess({ entries, total: entries.length });
      }
    }
  }
);

/**
 * POST /api/admin/feedback-triage
 * Body: { action: "create" | "decide" | "reopen" | "mine", ... }
 */
export const POST = createHandler(
  {
    action: "connector.write",
    rateTier: "standard",
    audit: (ctx, body) => ({
      action: "admin.feedback_triage" as const,
      entityType: "feedback",
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
      case "create": {
        const input = (body ?? {}) as {
          query: string;
          answer_excerpt: string;
          user_verdict?: "correct" | "incorrect" | "incomplete";
          user_comment?: string;
          flagged_citations?: string[];
          jurisdiction?: "DE" | "AT" | "CH";
          source?: FeedbackSource;
        };
        if (!input.query || !input.answer_excerpt) {
          return apiError("bad_request", "query and answer_excerpt are required", 400);
        }
        const entry = createManualCandidate({
          query: input.query,
          answer_excerpt: input.answer_excerpt,
          user_verdict: input.user_verdict,
          user_comment: input.user_comment,
          flagged_citations: input.flagged_citations,
          jurisdiction: input.jurisdiction,
          source: input.source,
          org_id: orgId,
        });
        return apiSuccess({ id: entry.id, created_at: entry.created_at });
      }

      case "decide": {
        const decision = (body ?? {}) as {
          triage_id: string;
          decision: "confirm" | "reject" | "needs_info";
          error_class?: ErrorClass;
          root_cause?: RootCause;
          severity?: ErrorSeverity;
          correction?: string;
          review_notes?: string;
        };

        const triageDecision = {
          ...decision,
          reviewer_id: ctx.user.id,
        };

        const errors = validateTriageDecision(triageDecision);
        if (errors.length > 0) {
          return apiError("bad_request", errors.join("; "), 400);
        }

        try {
          const entry = applyTriageDecision(triageDecision);
          return apiSuccess({
            id: entry.id,
            triage_state: entry.triage_state,
            reviewed_at: entry.reviewed_at,
          });
        } catch (err) {
          return apiError("bad_request", err instanceof Error ? err.message : "Unknown error", 400);
        }
      }

      case "reopen": {
        const input = (body ?? {}) as { triage_id: string; additional_info: string };
        if (!input.triage_id) {
          return apiError("bad_request", "triage_id is required", 400);
        }
        try {
          const entry = reopenTriage(input.triage_id, input.additional_info);
          return apiSuccess({ id: entry.id, triage_state: entry.triage_state });
        } catch (err) {
          return apiError("bad_request", err instanceof Error ? err.message : "Unknown error", 400);
        }
      }

      case "mine": {
        const input = (body ?? {}) as { triage_id: string };
        if (!input.triage_id) {
          return apiError("bad_request", "triage_id is required", 400);
        }
        try {
          const entry = markMined(input.triage_id);
          return apiSuccess({ id: entry.id, mined_to_fixture: entry.mined_to_fixture });
        } catch (err) {
          return apiError("bad_request", err instanceof Error ? err.message : "Unknown error", 400);
        }
      }

      default:
        return apiError("bad_request", `Unknown action: ${action}`, 400);
    }
  }
);
