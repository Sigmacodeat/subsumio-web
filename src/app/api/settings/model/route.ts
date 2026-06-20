import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { AI_MODELS, isValidModelId, DEFAULT_MODEL_ID, getModelById } from "@/lib/model-config";

const modelPatchSchema = z.object({
  modelId: z.string().min(1).max(100),
});

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, _req) => {
    const store = getStore();
    const user = await store.getById(ctx.user.id);
    if (!user) return apiError("user_not_found", "User not found", 404);

    const preferredModelId = user.preferredModel ?? DEFAULT_MODEL_ID;
    const preferredModel = getModelById(preferredModelId);

    return apiSuccess({
      models: AI_MODELS,
      preferredModelId,
      preferredModel: preferredModel ?? null,
      brainId: ctx.brainId,
    });
  },
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
    // "auto" means no explicit preference — use the default model
    const modelId = body.modelId === "auto" ? DEFAULT_MODEL_ID : body.modelId;

    if (!isValidModelId(modelId)) {
      return apiError(
        "invalid_model",
        `Unknown model ID: ${body.modelId}`,
        400,
        { availableModels: [...AI_MODELS.map((m) => m.id), "auto"] },
      );
    }

    const store = getStore();
    const updated = await store.update(ctx.user.id, {
      preferredModel: modelId,
    });

    if (!updated) return apiError("user_not_found", "User not found", 404);

    const model = getModelById(modelId);

    return apiSuccess({
      preferredModelId: modelId,
      preferredModel: model ?? null,
      brainId: ctx.brainId,
    });
  },
);
