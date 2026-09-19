/**
 * Firm model profile — which model tier each work area runs on.
 *
 * Proxies the engine (server/src/core/model-profile.ts), which stores the
 * profile per tenant source and enforces floors and locked areas. Reading is
 * open to every member; changing it is admin-only (settings.write) and
 * audited.
 */
import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { can } from "@/lib/permissions";
import { getStore } from "@/lib/auth/store";
import { logger } from "@/lib/logger";
import { AREA_CHOICES, MODEL_AREAS, type ModelProfileResponse } from "@/lib/model-profile-types";
import type { HandlerContext } from "@/lib/api-handler";

const log = logger("api/settings/model-profile");

const ENGINE_PATH = "/api/settings/model-profile";

const choice = z.enum(AREA_CHOICES);
const putSchema = z.object({
  areas: z
    .object(
      Object.fromEntries(MODEL_AREAS.map((a) => [a, choice.optional()])) as Record<
        (typeof MODEL_AREAS)[number],
        z.ZodOptional<typeof choice>
      >
    )
    .strict()
    .refine((a) => Object.values(a).some((v) => v !== undefined), "no_areas"),
});

type EngineView = Omit<ModelProfileResponse, "updatedByName" | "canEdit">;

async function withWebFields(ctx: HandlerContext, view: EngineView): Promise<ModelProfileResponse> {
  let updatedByName: string | null = null;
  if (view.profile.updated_by) {
    const user = await getStore()
      .getById(view.profile.updated_by)
      .catch(() => null);
    updatedByName = user?.name || user?.email || null;
  }
  return { ...view, updatedByName, canEdit: can(ctx.user, "settings.write") };
}

async function engineRequest(
  ctx: HandlerContext,
  init: RequestInit
): Promise<{ ok: true; view: EngineView } | { ok: false; response: Response }> {
  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}${ENGINE_PATH}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...ctx.headers },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    log.warn("engine unreachable", { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, response: apiError("service_unavailable", "Engine nicht erreichbar", 503) };
  }
  const body = (await res.json().catch(() => null)) as
    | (EngineView & { error?: string; message?: string })
    | null;
  if (!res.ok || !body) {
    if (res.status === 400 && body?.error) {
      // Floor / locked-area / unknown-area rejections from the engine.
      return { ok: false, response: apiError(body.error, body.message ?? body.error, 400) };
    }
    log.warn("engine model-profile request failed", { status: res.status, error: body?.error });
    return {
      ok: false,
      response: apiError("engine_error", `Engine returned ${res.status}`, 502),
    };
  }
  return { ok: true, view: body };
}

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
  },
  async (ctx) => {
    const r = await engineRequest(ctx, { method: "GET" });
    if (!r.ok) return r.response;
    return Response.json(await withWebFields(ctx, r.view));
  }
);

export const PUT = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: putSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "model_profile",
      entityId: ctx.brainId,
      details: { areas: body.areas },
    }),
  },
  async (ctx, body) => {
    const r = await engineRequest(ctx, {
      method: "PUT",
      body: JSON.stringify({ areas: body.areas, updated_by: ctx.user.id }),
    });
    if (!r.ok) return r.response;
    return Response.json(await withWebFields(ctx, r.view));
  }
);
