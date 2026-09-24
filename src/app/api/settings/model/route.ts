import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getStore, getOrgStore } from "@/lib/auth/store";
import { ENGINE_URL } from "@/lib/engine";
import { logger } from "@/lib/logger";
import type { ModelProfileChatLimit } from "@/lib/model-profile-types";
import {
  AI_MODELS,
  isValidModelId,
  AUTO_MODEL_ID,
  getModelById,
  isModelAllowedForPolicy,
  modelsForPolicy,
} from "@/lib/model-config";

const modelPatchSchema = z.object({
  modelId: z.string().min(1).max(100),
});

const log = logger("api/settings/model");

/**
 * The firm's chat minimum from the engine's model profile. A pick below it is
 * refused by think anyway, so the picker greys those models out. When the
 * engine cannot be reached the picker stays fully open — the engine still
 * enforces the floor on the answer itself.
 */
async function chatLimit(headers: Record<string, string>): Promise<ModelProfileChatLimit | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/settings/model-profile`, {
      headers,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<ModelProfileChatLimit>;
    if (!body.chatMinimumTier || !Array.isArray(body.allowedChatPicks)) return null;
    return { chatMinimumTier: body.chatMinimumTier, allowedChatPicks: body.allowedChatPicks };
  } catch (err) {
    log.warn("chat minimum unavailable", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** The calling user's org-wide model policy ("any" when not in an org). */
async function resolveModelPolicy(orgId: string | null | undefined) {
  if (!orgId) return "any" as const;
  const org = await getOrgStore().getById(orgId);
  return org?.modelPolicy ?? "any";
}

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    const store = getStore();
    const user = await store.getById(ctx.user.id);
    if (!user) return apiError("user_not_found", "User not found", 404);

    const policy = await resolveModelPolicy(user.orgId);
    // A stored pick that is no longer offered (retired model) reads as "auto".
    const stored = user.preferredModel ?? AUTO_MODEL_ID;
    const preferredModelId = isValidModelId(stored) ? stored : AUTO_MODEL_ID;
    const preferredModel = getModelById(preferredModelId);

    const limit = await chatLimit(ctx.headers);

    return apiSuccess({
      models: modelsForPolicy(policy),
      modelPolicy: policy,
      preferredModelId,
      preferredModel: preferredModel ?? null,
      brainId: ctx.brainId,
      chatMinimumTier: limit?.chatMinimumTier ?? null,
      allowedChatPicks: limit?.allowedChatPicks ?? null,
    });
  }
);

export const PATCH = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: modelPatchSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "model_preference",
      entityId: ctx.user.id,
      details: { modelId: body.modelId },
    }),
  },
  async (ctx, body, _query, _req) => {
    const store = getStore();

    // "auto" clears the pick: the engine then routes by question complexity.
    if (body.modelId === AUTO_MODEL_ID) {
      const cleared = await store.update(ctx.user.id, { preferredModel: null });
      if (!cleared) return apiError("user_not_found", "User not found", 404);
      return apiSuccess({
        preferredModelId: AUTO_MODEL_ID,
        preferredModel: null,
        brainId: ctx.brainId,
      });
    }

    const modelId = body.modelId;

    if (!isValidModelId(modelId)) {
      return apiError("invalid_model", `Unknown model ID: ${body.modelId}`, 400, {
        availableModels: [...AI_MODELS.map((m) => m.id), AUTO_MODEL_ID],
      });
    }

    const user = await store.getById(ctx.user.id);
    if (!user) return apiError("user_not_found", "User not found", 404);

    const model = getModelById(modelId)!;

    // A saved preference below the firm's chat minimum would be refused on
    // every answer — reject it here instead of storing a pick that never runs.
    const limit = await chatLimit(ctx.headers);
    if (limit && !limit.allowedChatPicks.includes(modelId)) {
      return apiError(
        "below_firm_minimum",
        `Die Kanzlei verlangt für Antworten mindestens die Stufe "${limit.chatMinimumTier}".`,
        400,
        { chatMinimumTier: limit.chatMinimumTier, allowedChatPicks: limit.allowedChatPicks }
      );
    }

    const policy = await resolveModelPolicy(user.orgId);
    if (!isModelAllowedForPolicy(model, policy)) {
      return apiError(
        "model_not_allowed_by_policy",
        `Model "${modelId}" is not allowed under this organization's model policy (${policy}).`,
        403,
        { policy, availableModels: modelsForPolicy(policy).map((m) => m.id) }
      );
    }

    const updated = await store.update(ctx.user.id, {
      preferredModel: modelId,
    });

    if (!updated) return apiError("user_not_found", "User not found", 404);

    return apiSuccess({
      preferredModelId: modelId,
      preferredModel: model,
      brainId: ctx.brainId,
    });
  }
);
