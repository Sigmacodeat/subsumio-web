// API-key scopes — dependency-free so createHandler (src/lib/api-handler.ts)
// and tests can use it without the key store.
//
// A key is created with one or more of read / write / admin
// (src/app/api/api-keys/route.ts). They are ordered: write includes read,
// admin includes write. The scope a request needs follows from what the
// route already declares — its RouteAction and the HTTP method — so no route
// has to opt in:
//   admin — admin routes (`admin: true` or an `admin*` action) and actions
//           that change firm settings, team, billing, connectors, SCIM or a
//           user's 2FA (ADMIN_SCOPE_ACTIONS)
//   write — every other state-changing method (POST/PUT/PATCH/DELETE)
//   read  — GET / HEAD / OPTIONS
// Role rights (can()) still apply on top: a scope never grants what the
// key owner's role could not do.

export type ApiKeyScope = "read" | "write" | "admin";

const SCOPE_RANK: Record<ApiKeyScope, number> = { read: 1, write: 2, admin: 3 };

const ADMIN_SCOPE_ACTIONS: ReadonlySet<string> = new Set([
  "settings.write",
  "team.role_change",
  "billing.write",
  "connector.write",
  "scim.write",
  "auth.2fa",
]);

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The scope a request needs, from the route's declared action + method. */
export function requiredApiKeyScope(
  action: string,
  method: string,
  adminRoute = false
): ApiKeyScope {
  if (adminRoute || action.startsWith("admin") || ADMIN_SCOPE_ACTIONS.has(action)) return "admin";
  return READ_METHODS.has(method.toUpperCase()) ? "read" : "write";
}

/** Does the key carry the required scope (or a higher one)? Unknown scope strings grant nothing. */
export function apiKeyHasScope(
  scopes: readonly string[] | null | undefined,
  required: ApiKeyScope
): boolean {
  const need = SCOPE_RANK[required];
  return (scopes ?? []).some((s) => (SCOPE_RANK[s as ApiKeyScope] ?? 0) >= need);
}
