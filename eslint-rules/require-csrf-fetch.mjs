/**
 * Flags raw `fetch()` calls that issue state-changing requests (POST/PUT/
 * PATCH/DELETE) against `/api/*`. Browser writes must go through
 * `csrfFetch` (src/lib/csrf.ts) so the double-submit token header is
 * attached — the middleware rejects cookie-authenticated writes without it.
 *
 * Exemptions mirror the middleware CSRF allowlist: anonymous/public
 * endpoints that authenticate without a session cookie (portal tokens,
 * public intake/booking, concierge, demo session, webhooks).
 */

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const EXEMPT_EXACT = new Set([
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/register",
  "/api/auth/forgot",
  "/api/auth/reset",
  "/api/auth/2fa/login-verify",
  "/api/realtime/presence",
  "/api/billing/pipeline-reserve",
  "/api/billing/pipeline-settle",
  "/api/concierge",
  "/api/concierge/lead",
  "/api/intake/public",
  "/api/booking/public",
  "/api/cti/webhook",
  "/api/demo/session",
]);

const EXEMPT_PREFIXES = ["/api/portal/", "/api/cron/", "/api/webhooks/"];

function staticUrl(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  if (node.type === "TemplateLiteral") {
    return node.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

function writeMethod(init) {
  if (!init || init.type !== "ObjectExpression") return null;
  for (const prop of init.properties) {
    if (prop.type !== "Property" || prop.computed) continue;
    const key = prop.key.type === "Identifier" ? prop.key.name : prop.key.value;
    if (key !== "method") continue;
    const value =
      prop.value.type === "Literal"
        ? prop.value.value
        : prop.value.type === "TemplateLiteral" && prop.value.expressions.length === 0
          ? prop.value.quasis[0]?.value.cooked
          : null;
    if (typeof value === "string") return value.toUpperCase();
  }
  return null;
}

function isExempt(url) {
  return EXEMPT_EXACT.has(url) || EXEMPT_PREFIXES.some((p) => url.startsWith(p));
}

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Require csrfFetch for browser POST/PUT/PATCH/DELETE calls to /api/",
    },
    messages: {
      useCsrfFetch:
        "Use csrfFetch() from @/lib/csrf for state-changing /api/ requests — the CSRF middleware rejects raw fetch() writes with 403.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        const isFetch =
          (callee.type === "Identifier" && callee.name === "fetch") ||
          (callee.type === "MemberExpression" &&
            callee.property.type === "Identifier" &&
            callee.property.name === "fetch");
        if (!isFetch) return;

        const url = staticUrl(node.arguments[0]);
        if (!url || !url.startsWith("/api/") || isExempt(url)) return;

        const method = writeMethod(node.arguments[1]);
        if (method && WRITE_METHODS.has(method)) {
          context.report({ node, messageId: "useCsrfFetch" });
        }
      },
    };
  },
};
