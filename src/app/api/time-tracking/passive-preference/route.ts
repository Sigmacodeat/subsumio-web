import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";

const schema = z.object({ enabled: z.boolean() });

export const GET = createHandler({ action: "brain.read", rateTier: "standard" }, async (ctx) => {
  // All preferences (one per user) — a single engine batch stops at 100.
  let pages: Array<{ frontmatter?: Record<string, unknown> }>;
  try {
    pages = await listEnginePages(ctx.headers, "passive_time_preference", 10_000, {
      strict: true,
    });
  } catch {
    return apiError("engine_error", "Einstellung konnte nicht geladen werden", 502);
  }
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
