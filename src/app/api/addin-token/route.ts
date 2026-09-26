import { createHandler, apiError } from "@/lib/api-handler";
import { getApiKeyStore } from "@/lib/api-key-store";
import {
  ADDIN_TOKEN_SCOPES,
  issueAddinToken,
  isStoredKeyUsable,
  revokeAddinToken,
  revokeAddinTokens,
} from "@/lib/addin-token";
import { parseAddinClient } from "@/lib/addin-dialog";
import type { EngineContext } from "@/lib/engine";

export const dynamic = "force-dynamic";

/** Add-in tokens are issued only from a signed-in browser session — never by
 *  presenting an API key or another add-in token. */
function sessionOnly(ctx: EngineContext): Response | null {
  return ctx.apiKey
    ? apiError("session_required", "Nur aus einer angemeldeten Browser-Sitzung möglich.", 403)
    : null;
}

/** The caller's current add-in token (metadata only — the secret is shown once). */
export const GET = createHandler({ action: "brain.read", rateTier: "standard" }, async (ctx) => {
  const refused = sessionOnly(ctx);
  if (refused) return refused;
  const active = (await getApiKeyStore().listByOwner(ctx.user.id)).filter(
    (k) => k.kind === "addin" && isStoredKeyUsable(k)
  );
  return Response.json({
    active: active.map((k) => ({ id: k.id, prefix: k.prefix, expires_at: k.expiresAt })),
  });
});

/**
 * Issue a 24-hour add-in token. Called from the dashboard panel and from the
 * Office dialog page (/addin-connect), which names the add-in; a new token
 * replaces the earlier one of the same add-in.
 */
export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "settings.update" as const,
      entityType: "api_key",
      details: { kind: "addin", owner: ctx.user.id },
    }),
  },
  async (ctx, body) => {
    const refused = sessionOnly(ctx);
    if (refused) return refused;
    // Optional `{ client: "word" | "outlook" }`; anything else means "shared".
    const client = parseAddinClient((body as { client?: unknown } | undefined)?.client);
    const issued = await issueAddinToken(
      getApiKeyStore(),
      { id: ctx.user.id, email: ctx.user.email },
      Date.now(),
      client
    );
    return Response.json(
      {
        token: issued.token,
        expires_at: issued.expiresAt,
        scopes: ADDIN_TOKEN_SCOPES,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
);

/**
 * Revoke add-in tokens. From a browser session: all of the caller's add-in
 * tokens (e.g. lost or shared computer). From an add-in ("Abmelden"): only
 * the presented add-in token itself. A permanent API key cannot revoke.
 */
export const DELETE = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "settings.update" as const,
      entityType: "api_key",
      details: { kind: "addin", revoked: true, owner: ctx.user.id },
    }),
  },
  async (ctx) => {
    if (ctx.apiKey?.kind === "addin") {
      const revoked = await revokeAddinToken(getApiKeyStore(), ctx.user.id, ctx.apiKey.id);
      return Response.json({ revoked });
    }
    const refused = sessionOnly(ctx);
    if (refused) return refused;
    const revoked = await revokeAddinTokens(getApiKeyStore(), ctx.user.id);
    return Response.json({ revoked });
  }
);
