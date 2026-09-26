// Pure policy for support sessions — kept free of server imports so the
// engine context can use it without pulling in the session store.

export type SupportSessionMode = "read" | "write";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * True when a request must be refused because the operator's support session
 * is read-only. The operator's own session controls (end the session) and
 * sign-in/-out stay reachable.
 */
export function supportSessionBlocksRequest(
  session: { mode: SupportSessionMode } | undefined,
  method: string,
  action: string
): boolean {
  if (!session || session.mode === "write") return false;
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  if (action === "platform.operator" || action === "platform.support_session") return false;
  if (action.startsWith("auth.")) return false;
  return true;
}

/**
 * The role the ENGINE sees for an operator inside a support session. The web
 * side keeps the firm-admin view (settings, members), but the engine — the
 * enforcement point for matter access and document ACLs — never gets
 * "admin": that role would open matters the firm set to "restricted" and
 * bypass document ACL groups. A read session is read-only in the engine as
 * well ("support" has read level); a write session gets lawyer level, still
 * without the admin exceptions. Matters behind a wall or with restricted
 * visibility stay closed unless the firm puts the operator on the team or
 * grants access explicitly.
 */
export function supportEngineRole(mode: SupportSessionMode): "support" | "lawyer" {
  return mode === "write" ? "lawyer" : "support";
}

/**
 * Whether this request inside a support session still needs a firm-visible
 * access entry: one per session, method and path (polling does not flood the
 * firm's audit trail). Session controls are not logged. `seen` is updated by
 * the caller only after the entry was stored.
 */
export function supportAccessLogKey(
  session: { id: string } | undefined,
  method: string,
  pathname: string,
  action: string
): string | null {
  if (!session) return null;
  if (action === "platform.operator" || action === "platform.support_session") return null;
  if (action.startsWith("auth.")) return null;
  return `${session.id} ${method.toUpperCase()} ${pathname}`;
}
