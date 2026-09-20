import { getStore } from "@/lib/auth/store";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { buildFeedToken, createFeedSecret, feedUrl, hashFeedSecret } from "@/lib/calendar-feed";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function baseUrl(req: Request): string {
  const configured = env("NEXT_PUBLIC_APP_URL") || env("APP_URL");
  if (configured) return configured;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

/** Whether a subscription link exists, and since when. The secret is gone for good. */
export const GET = createHandler({ action: "settings.read", rateTier: "standard" }, async (ctx) => {
  const user = await getStore().getById(ctx.user.id);
  return apiSuccess({
    active: Boolean(user?.calendarFeedTokenHash),
    createdAt: user?.calendarFeedCreatedAt ?? null,
    lastUsedAt: user?.calendarFeedLastUsedAt ?? null,
  });
});

/**
 * Creates a subscription link, replacing any earlier one. The full URL is
 * returned exactly once — only its hash is stored.
 */
export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "settings.update" as const,
      entityType: "calendar_feed",
      entityId: ctx.user.id,
      details: { operation: "create" },
    }),
  },
  async (ctx, _body, _query, req) => {
    const secret = createFeedSecret();
    await getStore().update(ctx.user.id, {
      calendarFeedTokenHash: await hashFeedSecret(secret),
      calendarFeedCreatedAt: new Date().toISOString(),
      calendarFeedLastUsedAt: null,
    });
    return apiSuccess({
      url: feedUrl(baseUrl(req), buildFeedToken(ctx.user.id, secret)),
    });
  }
);

/** Revokes the link; subscribed calendars stop receiving entries. */
export const DELETE = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "settings.update" as const,
      entityType: "calendar_feed",
      entityId: ctx.user.id,
      details: { operation: "revoke" },
    }),
  },
  async (ctx) => {
    await getStore().update(ctx.user.id, {
      calendarFeedTokenHash: null,
      calendarFeedCreatedAt: null,
      calendarFeedLastUsedAt: null,
    });
    return apiSuccess({ active: false });
  }
);
