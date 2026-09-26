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
