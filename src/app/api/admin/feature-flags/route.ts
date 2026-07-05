import { createHandler, apiError } from "@/lib/api-handler";
import {
  listFeatureFlags,
  upsertFeatureFlag,
  createFeatureFlag,
  deleteFeatureFlag,
} from "@/lib/feature-flags";
import { z } from "zod";

export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
  },
  async () => {
    const flags = await listFeatureFlags();
    return Response.json({ flags });
  }
);

const createSchema = z.object({
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional().default(""),
  enabled: z.boolean().optional().default(false),
  rolloutPercentage: z.number().min(0).max(100).optional().default(100),
  allowedPlans: z.array(z.string()).optional().default([]),
  allowedRoles: z.array(z.string()).optional().default([]),
});

export const POST = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    body: createSchema,
  },
  async (ctx, body) => {
    const flag = await createFeatureFlag(
      {
        key: body.key,
        name: body.name,
        description: body.description,
        enabled: body.enabled,
        rolloutPercentage: body.rolloutPercentage,
        allowedPlans: body.allowedPlans,
        allowedRoles: body.allowedRoles,
      },
      ctx.user.email
    );
    return Response.json({ ok: true, flag });
  }
);

const patchSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  rolloutPercentage: z.number().min(0).max(100).optional(),
  allowedPlans: z.array(z.string()).optional(),
  allowedRoles: z.array(z.string()).optional(),
});

export const PATCH = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    body: patchSchema,
  },
  async (ctx, body) => {
    const { key, ...updates } = body;
    const flag = await upsertFeatureFlag(key, updates, ctx.user.email);
    if (!flag) return apiError("not_found", "Feature flag not found", 404);
    return Response.json({ ok: true, flag });
  }
);

const deleteSchema = z.object({
  key: z.string().min(1),
});

export const DELETE = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    body: deleteSchema,
  },
  async (ctx, body) => {
    const deleted = await deleteFeatureFlag(body.key);
    if (!deleted) return apiError("not_found", "Feature flag not found", 404);
    return Response.json({ ok: true });
  }
);
