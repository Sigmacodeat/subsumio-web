import { resolvePortalAccess } from "@/lib/portal-access";
import { confirmPortalNotify, lookupPortalNotifyCode } from "@/lib/portal-notify";
import { engineHeadersForBrain } from "@/lib/engine";
import { siteUrl } from "@/lib/mail";
import { PORTAL_SESSION_SLUG } from "@/lib/portal-session";

export const dynamic = "force-dynamic";

/**
 * The confirmation link from the opt-in mail; returns to the portal with the
 * outcome. The link carries only the random code — the matter is found by the
 * code. (Links from before carried the portal token; they still confirm.)
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const legacyToken = url.searchParams.get("token") ?? "";
  let ok = false;
  if (code.length >= 20) {
    const target = await lookupPortalNotifyCode(code);
    if (target) {
      ok = await confirmPortalNotify(engineHeadersForBrain(target.brainId), target.caseSlug, code);
    } else if (legacyToken) {
      const access = await resolvePortalAccess(legacyToken);
      if (access instanceof Response) return access;
      ok = await confirmPortalNotify(access.headers, access.caseSlug, code);
    }
  }
  return Response.redirect(
    `${siteUrl()}/portal/${PORTAL_SESSION_SLUG}?notify=${ok ? "confirmed" : "invalid"}`,
    303
  );
}
