/**
 * CSRF protection using double-submit cookie pattern.
 *
 * On any state-changing request (POST/PUT/PATCH/DELETE), the client must
 * send an `x-csrf-token` header matching the `sb_csrf` cookie value.
 * The cookie is intentionally NOT httpOnly — client JS must read it to
 * include it in the header. Security comes from the SameSite policy
 * (prevents cross-origin submission) + the fact that a cross-origin
 * attacker cannot read the cookie value even if the browser sends it.
 */

const CSRF_COOKIE = "sb_csrf";
const CSRF_HEADER = "x-csrf-token";

/** Generate a new CSRF token using Web Crypto (edge-compatible). */
export function generateCsrfToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cookie name for the CSRF token. */
export const CSRF_COOKIE_NAME = CSRF_COOKIE;

/** Header name for the CSRF token. */
export const CSRF_HEADER_NAME = CSRF_HEADER;

/**
 * Validate that a request includes a valid CSRF token.
 * Returns true if the request method is safe (GET/HEAD/OPTIONS)
 * or if the header matches the cookie.
 */
export function validateCsrf(req: Request, cookieValue: string | undefined): boolean {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  const headerToken = req.headers.get(CSRF_HEADER);
  if (!headerToken || !cookieValue) return false;

  // Timing-safe comparison
  if (headerToken.length !== cookieValue.length) return false;
  let diff = 0;
  for (let i = 0; i < headerToken.length; i++) {
    diff |= headerToken.charCodeAt(i) ^ cookieValue.charCodeAt(i);
  }
  return diff === 0;
}

/** Read the CSRF token from the cookie (browser-only). Returns undefined on server or if cookie is missing. */
export function getCsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const csrfCookie = document.cookie.split("; ").find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  return csrfCookie?.split("=")[1];
}

/**
 * Browser-side fetch wrapper that automatically attaches the CSRF token
 * header for state-changing requests (POST/PUT/PATCH/DELETE).
 * Use this instead of raw fetch() in dashboard components.
 */
export async function csrfFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isStateChanging = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

  const headers = new Headers(init?.headers);

  if (isStateChanging) {
    const token = getCsrfToken();
    if (token) {
      headers.set(CSRF_HEADER, token);
    } else if (typeof window !== "undefined") {
      // CSRF cookie missing — server will likely reject. Log for debugging.
      console.warn(`[csrf] No CSRF token for ${method} request — server may reject`);
    }
  }

  // Default 30s timeout; caller can override by passing their own signal
  const signal = init?.signal ?? AbortSignal.timeout(30_000);

  return fetch(input, { ...init, headers, signal });
}
