import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import {
  createGateRequest,
  approveGate,
  rejectGate,
  reevaluateGate,
  getGateRequest,
  getAllGateRequests,
  getGateRequestsByComponent,
  getGateRequestsByState,
  getGateStats,
  registerHoldoutHash,
  verifyHoldoutIntegrity,
  getRegisteredHoldoutHash,
  DEFAULT_GATE_CONFIG,
  COMPONENT_LABELS_DE,
  GATE_STATE_LABELS_DE,
  type FineTunableComponent,
} from "@/lib/fine-tuning-gate";
import { getVettingReport } from "@/lib/model-vetting";

/**
 * GET /api/admin/fine-tuning-gate
 * Query params:
 *   action=list (default) — list all gate requests
 *   action=stats — get gate statistics
 *   action=entry&id=... — get single request
 *   action=labels — get German labels
 *   action=config — get default gate config
 *   action=holdout&test_set=... — get registered holdout hash
 *   action=verify-holdout&test_set=...&hash=... — verify holdout integrity
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

    const action = (query.action as string) ?? "list";

    switch (action) {
      case "stats": {
        return apiSuccess(getGateStats());
      }

      case "entry": {
        const id = query.id as string;
        if (!id) return apiError("bad_request", "id parameter required", 400);
        const req = getGateRequest(id);
        if (!req) return apiError("not_found", "Gate request not found", 404);
        return apiSuccess(req);
      }

      case "labels": {
        return apiSuccess({
          components: COMPONENT_LABELS_DE,
          states: GATE_STATE_LABELS_DE,
        });
      }

      case "config": {
        return apiSuccess(DEFAULT_GATE_CONFIG);
      }

      case "holdout": {
        const testSet = query.test_set as string;
        if (!testSet) return apiError("bad_request", "test_set parameter required", 400);
        const hash = getRegisteredHoldoutHash(testSet);
        return apiSuccess({ test_set: testSet, registered_hash: hash });
      }

      case "verify-holdout": {
        const testSet = query.test_set as string;
        const hash = query.hash as string;
        if (!testSet || !hash)
          return apiError("bad_request", "test_set and hash parameters required", 400);
        const valid = verifyHoldoutIntegrity(testSet, hash);
        return apiSuccess({ test_set: testSet, hash, valid });
      }

      case "by-component": {
        const component = query.component as FineTunableComponent;
        if (!component) return apiError("bad_request", "component parameter required", 400);
        return apiSuccess({ requests: getGateRequestsByComponent(component) });
      }

      case "by-state": {
        const state = query.state as string;
        if (!state) return apiError("bad_request", "state parameter required", 400);
        return apiSuccess({ requests: getGateRequestsByState(state as never) });
      }

      case "list":
      default: {
        return apiSuccess({ requests: getAllGateRequests() });
      }
    }
  }
);

/**
 * POST /api/admin/fine-tuning-gate
 * Body: { action: "create" | "approve" | "reject" | "reevaluate" | "register-holdout", ... }
 */
export const POST = createHandler(
  {
    action: "connector.write",
    rateTier: "standard",
    audit: (ctx, body) => ({
      action: "admin.fine_tuning_gate" as const,
      entityType: "fine_tuning",
      details: { action: ((body as unknown as Record<string, unknown>)?.action), user: ctx.user.email },
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
          component: FineTunableComponent;
          model_id: string;
          baseline_vetting_report_id: string;
          confirmed_data_count: number;
          mined_fixture_count: number;
          holdout_hash: string;
          last_recorded_holdout_hash: string;
          hyperparameters: {
            learning_rate: number;
            batch_size: number;
            epochs: number;
            warmup_steps: number;
            weight_decay: number;
          };
          objective: string;
        };
        if (!input.component || !input.model_id) {
          return apiError("bad_request", "component and model_id are required", 400);
        }

        const vettingReport = input.baseline_vetting_report_id
          ? getVettingReport(input.baseline_vetting_report_id)
          : undefined;

        const request = createGateRequest(
          {
            ...input,
            requester_id: ctx.user.id,
          },
          DEFAULT_GATE_CONFIG,
          vettingReport
        );
        return apiSuccess({
          id: request.id,
          gate_state: request.gate_state,
          evaluation: request.evaluation,
        });
      }

      case "approve": {
        const input = (body ?? {}) as { request_id: string; notes?: string };
        if (!input.request_id) {
          return apiError("bad_request", "request_id is required", 400);
        }
        try {
          const req = approveGate(input.request_id, ctx.user.id, input.notes);
          return apiSuccess({ id: req.id, gate_state: req.gate_state });
        } catch (err) {
          return apiError("bad_request", err instanceof Error ? err.message : "Unknown error", 400);
        }
      }

      case "reject": {
        const input = (body ?? {}) as { request_id: string; notes?: string };
        if (!input.request_id) {
          return apiError("bad_request", "request_id is required", 400);
        }
        try {
          const req = rejectGate(input.request_id, ctx.user.id, input.notes);
          return apiSuccess({ id: req.id, gate_state: req.gate_state });
        } catch (err) {
          return apiError("bad_request", err instanceof Error ? err.message : "Unknown error", 400);
        }
      }

      case "reevaluate": {
        const input = (body ?? {}) as {
          request_id: string;
          confirmed_data_count?: number;
          mined_fixture_count?: number;
          holdout_hash?: string;
          last_recorded_holdout_hash?: string;
          hyperparameters?: {
            learning_rate: number;
            batch_size: number;
            epochs: number;
            warmup_steps: number;
            weight_decay: number;
          };
          baseline_vetting_report_id?: string;
        };
        if (!input.request_id) {
          return apiError("bad_request", "request_id is required", 400);
        }
        try {
          const vettingReport = input.baseline_vetting_report_id
            ? getVettingReport(input.baseline_vetting_report_id)
            : undefined;
          const { request_id, baseline_vetting_report_id, ...updates } = input;
          const req = reevaluateGate(request_id, updates, DEFAULT_GATE_CONFIG, vettingReport);
          return apiSuccess({ id: req.id, gate_state: req.gate_state, evaluation: req.evaluation });
        } catch (err) {
          return apiError("bad_request", err instanceof Error ? err.message : "Unknown error", 400);
        }
      }

      case "register-holdout": {
        const input = (body ?? {}) as { test_set: string; hash: string };
        if (!input.test_set || !input.hash) {
          return apiError("bad_request", "test_set and hash are required", 400);
        }
        registerHoldoutHash(input.test_set, input.hash);
        return apiSuccess({ test_set: input.test_set, hash: input.hash });
      }

      default:
        return apiError("bad_request", `Unknown action: ${action}`, 400);
    }
  }
);
