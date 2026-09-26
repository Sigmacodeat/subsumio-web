/**
 * Client-portal session: the link a client gets (/portal/<token>) is only the
 * way in. On opening it, the portal exchanges the token for an HttpOnly,
 * SameSite=Strict cookie and moves to /portal/meine-akte, so the token leaves
 * the address bar and the browser history. Portal routes then take the token
 * from the request (links and e-mails still carry it) or, for the placeholder
 * `meine-akte`, from the cookie.
 *
 * The installed app (manifest start URL) and e-mail/push links keep the real
 * token: an installed iPhone app does not share Safari's cookies.
 */
export const PORTAL_SESSION_COOKIE = "subsumio_portal";
/** Stands in for the token in URLs and requests once the session cookie is set. */
export const PORTAL_SESSION_SLUG = "meine-akte";
/** Header carrying the portal token on uploads, so access is checked before the body is read. */
export const PORTAL_TOKEN_HEADER = "x-portal-token";

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) {
      try {
        return decodeURIComponent(v.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** The portal token of a request: the one given, else the session cookie's. */
export function portalToken(req: Request, provided?: string | null): string {
  if (provided && provided !== PORTAL_SESSION_SLUG) return provided;
  return readCookie(req, PORTAL_SESSION_COOKIE) ?? "";
}

function secure(): string {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

export function portalSessionCookie(token: string, maxAgeSeconds: number): string {
  return `${PORTAL_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure()}`;
}

export function clearPortalSessionCookie(): string {
  return `${PORTAL_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure()}`;
}
