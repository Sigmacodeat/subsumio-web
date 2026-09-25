/**
 * MCP tokens minted in the firm settings (`access_tokens` rows named
 * `web-mcp:<source>:<label>`, see web-api /api/mcp-tokens).
 *
 * Such a token acts for the web user who created it, never for the whole
 * firm: it is bound to that user and the firm's source at creation
 * (`permissions.web_mcp`), and every request resolves the user afresh —
 *
 *   - the web app confirms the account still exists, is active and still
 *     belongs to this firm (GET /api/internal/engine-user-status); a
 *     deleted, deactivated or suspended user, or one who left the firm,
 *     makes the token stop working;
 *   - the matter access rules (walls, restricted matters, grants, private
 *     conversations — core/matter-access.ts) are evaluated for that user
 *     with the current case pages, so revoked access also narrows the token.
 *
 * Tokens without a recorded creator (minted before this binding existed)
 * are refused: they would otherwise read the whole firm brain.
 */
import type { BrainEngine } from "./engine.ts";
import type { AuthInfo } from "./operations.ts";
import type { MatterScope } from "./matter-access.ts";
import { callerMatterScope, loadSourceMatterAccess } from "./matter-access-db.ts";
import { sharedReadSourcesFromEnv } from "./shared-read-sources.ts";

export const WEB_MCP_PREFIX = "web-mcp:";

export interface WebMcpBinding {
  sourceId: string;
  userId?: string;
}

/** The binding stored on a `web-mcp:` token, or null for any other token. */
export function readWebMcpBinding(name: string, permissions: unknown): WebMcpBinding | null {
  if (!name.startsWith(WEB_MCP_PREFIX)) return null;
  const perms =
    typeof permissions === "string"
      ? (() => {
          try {
            return JSON.parse(permissions) as unknown;
          } catch {
            return null;
          }
        })()
      : permissions;
  const bound =
    perms && typeof perms === "object"
      ? ((perms as Record<string, unknown>).web_mcp as Record<string, unknown> | undefined)
      : undefined;
  const sourceId = typeof bound?.source_id === "string" ? bound.source_id : "";
  // The name carries the source too; both must agree.
  if (!sourceId || !name.startsWith(`${WEB_MCP_PREFIX}${sourceId}:`)) {
    return { sourceId: "", userId: undefined };
  }
  const userId =
    typeof bound?.user_id === "string" && bound.user_id.length > 0 ? bound.user_id : undefined;
  return { sourceId, userId };
}

/** The `permissions` value stored for a new web MCP token. */
export function webMcpPermissions(sourceId: string, userId: string): Record<string, unknown> {
  return { takes_holders: ["world"], web_mcp: { source_id: sourceId, user_id: userId } };
}

export interface WebUserStatus {
  active: boolean;
  role?: string;
}

export type WebUserStatusFetcher = (userId: string, sourceId: string) => Promise<WebUserStatus>;

/**
 * Ask the web app whether `userId` may still work in the firm `sourceId`.
 * Answers are cached briefly (a deactivation takes effect within the TTL).
 * Without configuration, or on any error, the answer is "inactive".
 */
export function makeWebUserStatusFetcher(
  opts: {
    baseUrl?: string;
    key?: string;
    fetchImpl?: typeof fetch;
    ttlMs?: number;
  } = {}
): WebUserStatusFetcher {
  const cache = new Map<string, { at: number; status: WebUserStatus }>();
  const ttl = opts.ttlMs ?? 60_000;
  return async (userId, sourceId) => {
    const base = (
      opts.baseUrl ??
      process.env.ENGINE_BILLING_URL ??
      process.env.SUBSUMIO_WEB_URL ??
      ""
    ).replace(/\/$/, "");
    const key = opts.key ?? process.env.ENGINE_WEBHOOK_API_KEY ?? "";
    if (!base || !key) {
      console.error(
        "[web-mcp] user status check not configured (SUBSUMIO_WEB_URL / ENGINE_WEBHOOK_API_KEY) — token refused"
      );
      return { active: false };
    }
    const cacheKey = `${sourceId}\u0000${userId}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < ttl) return hit.status;
    let status: WebUserStatus = { active: false };
    try {
      const url = `${base}/api/internal/engine-user-status?uid=${encodeURIComponent(
        userId
      )}&source=${encodeURIComponent(sourceId)}`;
      const res = await (opts.fetchImpl ?? fetch)(url, {
        headers: { "x-engine-webhook-key": key },
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const body = (await res.json()) as { active?: unknown; role?: unknown };
        status = {
          active: body.active === true,
          ...(typeof body.role === "string" ? { role: body.role } : {}),
        };
      }
    } catch (e) {
      console.error(
        `[web-mcp] user status check failed: ${e instanceof Error ? e.message : String(e)}`
      );
      return { active: false }; // not cached: a blip must not lock out for the TTL
    }
    cache.set(cacheKey, { at: Date.now(), status });
    return status;
  };
}

export interface WebMcpAccess {
  sourceId: string;
  userId: string;
  role?: string;
  /** Always an explicit list, so the matter guard applies even without walls. */
  matterScope: string[];
  readOnly: string[];
}

export type WebMcpRejection = "owner_missing" | "owner_inactive";

/** Resolve a `web-mcp:` token row to the access of its user right now. */
export async function resolveWebMcpToken(
  engine: BrainEngine,
  binding: WebMcpBinding,
  userStatus: WebUserStatusFetcher
): Promise<WebMcpAccess | WebMcpRejection> {
  if (!binding.sourceId || !binding.userId) return "owner_missing";
  const status = await userStatus(binding.userId, binding.sourceId);
  if (!status.active) return "owner_inactive";
  const known = await loadSourceMatterAccess(engine, binding.sourceId);
  const { scope, readOnly } = callerMatterScope(
    "all",
    { userId: binding.userId, role: status.role },
    known
  );
  const matterScope: MatterScope = scope === "all" ? ["*"] : scope;
  return {
    sourceId: binding.sourceId,
    userId: binding.userId,
    ...(status.role ? { role: status.role } : {}),
    matterScope: matterScope as string[],
    readOnly,
  };
}

/** The AuthInfo fields for a resolved web MCP token. */
export function webMcpAuthFields(
  access: WebMcpAccess,
  sharedReadSources: string[] = sharedReadSourcesFromEnv()
): Partial<AuthInfo> {
  return {
    // Firm tokens read and write pages; admin operations stay closed.
    scopes: ["read", "write"],
    sourceId: access.sourceId,
    // Explicit read grant: the firm's own source only. Several firms share
    // one database, so a token never reads another firm's source — not by
    // default scope, not via `__all__`, not by naming it in `source_id`.
    allowedSources: [access.sourceId],
    // The shared law corpus may be named explicitly per call (read-only).
    sharedReadSources: sharedReadSources.filter((s) => s !== access.sourceId),
    matterScope: access.matterScope,
    matterReadOnly: access.readOnly,
    webUserId: access.userId,
  };
}
