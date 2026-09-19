import { resolvePortalAccess } from "@/lib/portal-access";
import { confirmPortalNotify } from "@/lib/portal-notify";
import { siteUrl } from "@/lib/mail";

export const dynamic = "force-dynamic";

/** The confirmation link from the opt-in mail; returns to the portal with the outcome. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const access = await resolvePortalAccess(token);
  if (access instanceof Response) return access;
  const ok =
    code.length >= 20 && (await confirmPortalNotify(access.headers, access.caseSlug, code));
  return Response.redirect(
    `${siteUrl()}/portal/${encodeURIComponent(token)}?notify=${ok ? "confirmed" : "invalid"}`,
    303
  );
}
