/**
 * Server-side: issue a fresh, registered client-portal link for a matter —
 * for messages sent without a person at the screen (e.g. reminders). The
 * token goes only into the outgoing message; the matter's link registry keeps
 * its hash, so the link can be listed and revoked. Nothing readable is stored.
 */
import { ENGINE_URL } from "@/lib/engine";
import { siteUrl } from "@/lib/mail";
import { signPortalToken, verifyPortalToken } from "@/lib/portal-token";
import { registerPortalLink } from "@/lib/portal-links";
import { matterAccessLevel, type MatterPermissions } from "@/lib/matter-access";

/**
 * A new portal link for `caseSlug`, or null when the matter cannot be read,
 * is archived, or is not released for the portal.
 */
export async function issueRegisteredPortalLink(input: {
  headers: Record<string, string>;
  brainId: string;
  caseSlug: string;
  createdBy: string;
  purpose?: string;
}): Promise<string | null> {
  const res = await fetch(
    `${ENGINE_URL}/api/pages/${input.caseSlug.split("/").map(encodeURIComponent).join("/")}`,
    { headers: input.headers, signal: AbortSignal.timeout(10_000) }
  ).catch(() => null);
  if (!res?.ok) return null;
  const page = (await res.json().catch(() => null)) as {
    frontmatter?: Record<string, unknown>;
  } | null;
  const fm = page?.frontmatter ?? {};
  if (fm.status === "archived" || !fm.portal_enabled) return null;

  const token = await signPortalToken(input.caseSlug, undefined, input.brainId);
  const issued = await verifyPortalToken(token);
  await registerPortalLink(input.headers, input.caseSlug, {
    token,
    created_at: new Date().toISOString(),
    created_by: input.createdBy,
    expires_at: new Date((issued?.exp ?? 0) * 1000 || Date.now()).toISOString(),
    ...(input.purpose ? { purpose: input.purpose } : {}),
  });
  return `${siteUrl()}/portal/${token}`;
}

/**
 * Who may create or send a portal link for a matter: a lawyer or admin, or a
 * member with WRITE access to the matter (team entry / write grant; a
 * read-only grant is not enough). What the link shows was already released
 * by a lawyer (portal switch, summary and documents are lawyer/admin-only),
 * so the Sekretariat may hand the link out on the matters it works on.
 */
export function mayIssuePortalLink(
  user: { id: string; role: string },
  caseFrontmatter: Record<string, unknown> | undefined
): boolean {
  if (user.role === "admin" || user.role === "lawyer") return true;
  if (user.role !== "assistant") return false;
  return (
    matterAccessLevel(
      { userId: user.id, role: user.role },
      (caseFrontmatter?.permissions ?? null) as MatterPermissions | null
    ) === "write"
  );
}

export const PORTAL_LINK_FORBIDDEN = {
  error: "portal_link_forbidden",
  message:
    "Portal-Links erstellen Anwältinnen/Anwälte, Administratoren oder Mitglieder mit Schreibzugriff auf die Akte.",
} as const;
