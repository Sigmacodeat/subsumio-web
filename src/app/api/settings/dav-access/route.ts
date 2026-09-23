import { getStore } from "@/lib/auth/store";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { buildFeedToken, createFeedSecret, hashFeedSecret } from "@/lib/calendar-feed";

export const dynamic = "force-dynamic";

/**
 * The WebDAV/CalDAV access token for the read-only drive bridge
 * (scripts/dav-server.ts, docs/deploy/DAV_BRIDGE.md). Deliberately separate
 * from the calendar subscription link (/api/settings/calendar-feed): that
 * link goes to Google/Outlook and only opens the deadline feed, while this
 * token also opens the document archive — see src/lib/feed-auth.ts.
 */

/** Whether a DAV token exists, and since when. The secret is gone for good. */
export const GET = createHandler({ action: "settings.read", rateTier: "standard" }, async (ctx) => {
  const user = await getStore().getById(ctx.user.id);
  return apiSuccess({
    active: Boolean(user?.davTokenHash),
    createdAt: user?.davTokenCreatedAt ?? null,
    lastUsedAt: user?.davTokenLastUsedAt ?? null,
  });
});

/**
 * Creates a DAV access token, replacing any earlier one. The token (the
 * Basic-auth password for the bridge) is returned exactly once — only its
 * hash is stored.
 */
export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "settings.update" as const,
      entityType: "dav_access",
      entityId: ctx.user.id,
      details: { operation: "create" },
    }),
  },
  async (ctx) => {
    const secret = createFeedSecret();
    await getStore().update(ctx.user.id, {
      davTokenHash: await hashFeedSecret(secret),
      davTokenCreatedAt: new Date().toISOString(),
      davTokenLastUsedAt: null,
    });
    return apiSuccess({ token: buildFeedToken(ctx.user.id, secret) });
  }
);

/** Revokes the DAV token; mounted drives and DAV calendars stop working. */
export const DELETE = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "settings.update" as const,
      entityType: "dav_access",
      entityId: ctx.user.id,
      details: { operation: "revoke" },
    }),
  },
  async (ctx) => {
    await getStore().update(ctx.user.id, {
      davTokenHash: null,
      davTokenCreatedAt: null,
      davTokenLastUsedAt: null,
    });
    return apiSuccess({ active: false });
  }
);
