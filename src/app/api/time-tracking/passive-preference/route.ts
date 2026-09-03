import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

const schema = z.object({ enabled: z.boolean() });

export const GET = createHandler({ action: "brain.read", rateTier: "standard" }, async (ctx) => {
  const params = new URLSearchParams({ type: "passive_time_preference", limit: "500" });
  const response = await fetch(`${ENGINE_URL}/api/pages?${params}`, { headers: ctx.headers });
  if (!response.ok) return apiError("engine_error", "Einstellung konnte nicht geladen werden", 502);
  const data = await response.json();
  const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
    frontmatter?: Record<string, unknown>;
  }>;
  const preference = pages.find(
    (page) => page.frontmatter?.user_email === ctx.user.email
  )?.frontmatter;
  return apiSuccess({ enabled: preference?.enabled === true });
});

export const PUT = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: schema,
    audit: (_ctx, body) => ({
      action: "time_tracking.passive_preference" as const,
      entityType: "passive_time_preference",
      details: {
        enabled: body.enabled,
      },
    }),
  },
  async (ctx, body) => {
    const userKey = encodeURIComponent(ctx.user.email.toLowerCase());
    const response = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/settings/passive-time/${userKey}`,
        title: "Passive Zeiterfassung",
        type: "passive_time_preference",
        frontmatter: {
          type: "passive_time_preference",
          user_email: ctx.user.email,
          enabled: body.enabled,
          consent_updated_at: new Date().toISOString(),
        },
      }),
    });
    if (!response.ok)
      return apiError("engine_error", "Einstellung konnte nicht gespeichert werden", 502);
    return apiSuccess({ enabled: body.enabled });
  }
);
