import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { getStore } from "@/lib/auth/store";
import { isStaffRole, visibleOrgMembers } from "@/lib/team-visibility";
import { listAuditLogs, logAudit } from "@/lib/audit";
import {
  activeGrant,
  matterAccessLevel,
  type MatterGrant,
  type MatterPermissions,
} from "@/lib/matter-access";
import { matterAccessUserFor } from "@/lib/support-session-policy";

export const dynamic = "force-dynamic";

/**
 * Who may see and change a matter: visibility, matter team, grants with an
 * optional expiry, and the ethical wall. The engine enforces these rules on
 * every request (server/src/core/matter-access.ts); this route is the only
 * way to change them — the engine keeps `permissions` unchanged on any other
 * page write.
 *
 * Admins manage everything. Anyone who may change the matter can give a
 * colleague read or write access (never more than their own) and take back
 * the grants they gave.
 */

const grantSchema = z.object({
  user_id: z.string().min(1).max(200),
  level: z.enum(["read", "write"]),
  expires_at: z.string().datetime().optional(),
  granted_by: z.string().optional(),
  granted_at: z.string().optional(),
});

const putSchema = z.object({
  case_slug: z.string().min(1).max(300),
  visibility: z.enum(["full", "restricted", "confidential"]).optional(),
  allowed_users: z.array(z.string().min(1).max(200)).max(200).optional(),
  blocked_users: z.array(z.string().min(1).max(200)).max(200).optional(),
  grants: z.array(grantSchema).max(200).optional(),
  /** Deliberate confirmation to give a client account access to a matter it
   *  is not linked to as the client. */
  confirm_client_access: z.boolean().optional(),
});

const querySchema = z.object({ case_slug: z.string().min(1).max(300) });

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
}

async function firmMembers(user: { id: string; orgId?: string | null }): Promise<Member[]> {
  const all = await getStore().list();
  return all
    .filter((u) => (user.orgId ? u.orgId === user.orgId : u.id === user.id))
    .filter((u) => !u.deactivatedAt)
    .map((u) => ({ id: u.id, name: u.name ?? u.email, email: u.email, role: u.role }));
}

async function loadPermissions(
  headers: Record<string, string>,
  caseSlug: string
): Promise<{
  permissions: MatterPermissions;
  title: string;
  frontmatter: Record<string, unknown>;
} | null> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(caseSlug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const page = (await res.json()) as {
    title?: string;
    type?: string;
    frontmatter?: Record<string, unknown>;
  };
  const fm = page.frontmatter ?? {};
  if ((page.type ?? fm.type) !== "legal_case") return null;
  const raw = fm.permissions;
  return {
    permissions: raw && typeof raw === "object" ? (raw as MatterPermissions) : {},
    title: String(page.title ?? caseSlug),
    frontmatter: fm,
  };
}

/** Roles that may open a matter to a client account. */
const CLIENT_GRANT_ROLES = new Set(["admin", "lawyer"]);

function normEmail(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/**
 * Is this client account the matter's client? True when its e-mail is the
 * matter's client e-mail or the e-mail of the matter's client contact. A
 * contact that cannot be read counts as "not linked" (fail-closed: the grant
 * then needs the explicit confirmation).
 */
async function clientLinkedToMatter(
  headers: Record<string, string>,
  fm: Record<string, unknown>,
  client: Member
): Promise<boolean> {
  const email = normEmail(client.email);
  if (!email) return false;
  if (normEmail(fm.client_email) === email) return true;
  const contactSlug = typeof fm.client_slug === "string" ? fm.client_slug : "";
  if (!contactSlug) return false;
  try {
    const res = await fetch(
      `${ENGINE_URL}/api/pages/${contactSlug.split("/").map(encodeURIComponent).join("/")}`,
      { headers, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return false;
    const contact = (await res.json()) as { frontmatter?: Record<string, unknown> };
    return normEmail(contact.frontmatter?.email) === email;
  } catch {
    return false;
  }
}

function grantKey(g: MatterGrant): string {
  return `${g.user_id}|${g.level}|${g.expires_at ?? ""}|${g.granted_by ?? ""}`;
}

export const GET = createHandler(
  { action: "brain.read", rateTier: "standard", query: querySchema },
  async (ctx, _body, query) => {
    const caseSlug = query!.case_slug;
    const loaded = await loadPermissions(ctx.headers, caseSlug);
    if (!loaded) return apiError("case_not_found", "Akte nicht gefunden", 404);
    const me = matterAccessUserFor(ctx);
    const myLevel = matterAccessLevel(me, loaded.permissions);
    // Client accounts never see other accounts or the access history.
    const staff = isStaffRole(ctx.user.role);
    const audit = staff
      ? await listAuditLogs({
          brainId: ctx.brainId,
          entityType: "matter_access",
          entityId: caseSlug,
          limit: 50,
        })
      : [];
    return apiSuccess({
      case_slug: caseSlug,
      title: loaded.title,
      permissions: loaded.permissions,
      my_level: myLevel,
      can_manage: ctx.user.role === "admin" && !ctx.supportSession,
      can_grant: myLevel === "write" && ctx.user.role !== "client_viewer",
      // Opening the matter to a client account: lawyer/admin with write access.
      can_grant_clients:
        myLevel === "write" && CLIENT_GRANT_ROLES.has(ctx.user.role) && !ctx.supportSession,
      me: ctx.user.id,
      // Staff may grant access to client accounts, so they see them here.
      members: visibleOrgMembers(ctx.user, await firmMembers(ctx.user), { includeClients: true }),
      audit: audit.map((e) => ({
        at: e.timestamp,
        by: e.userEmail ?? e.userId ?? "",
        details: e.details ?? {},
      })),
    });
  }
);

export const PUT = createHandler(
  { action: "brain.write", rateTier: "standard", body: putSchema },
  async (ctx, body) => {
    const loaded = await loadPermissions(ctx.headers, body.case_slug);
    if (!loaded) return apiError("case_not_found", "Akte nicht gefunden", 404);
    const current = loaded.permissions;
    // Support sessions never get the firm-admin powers over matter access.
    const isAdmin = ctx.user.role === "admin" && !ctx.supportSession;
    const myLevel = matterAccessLevel(matterAccessUserFor(ctx), current);
    if (myLevel !== "write") {
      return apiError("forbidden", "Sie dürfen den Zugriff auf diese Akte nicht ändern.", 403);
    }

    const members = await firmMembers(ctx.user);
    const memberIds = new Set(members.map((m) => m.id));
    const unknown = [
      ...(body.allowed_users ?? []),
      ...(body.blocked_users ?? []),
      ...(body.grants ?? []).map((g) => g.user_id),
    ].filter((id) => !memberIds.has(id));
    if (unknown.length > 0) {
      return apiError(
        "unknown_member",
        "Nur Mitglieder der Kanzlei können eingetragen werden.",
        400
      );
    }

    const changesStructure =
      body.visibility !== undefined ||
      body.allowed_users !== undefined ||
      body.blocked_users !== undefined;
    if (changesStructure && !isAdmin) {
      return apiError(
        "admin_required",
        "Sichtbarkeit, Aktenteam und Chinese Walls ändern nur Administratoren.",
        403
      );
    }

    // Client accounts (Mandant lesend) newly on the team or granted access:
    // only a lawyer/admin opens a matter to a client, and only the matter
    // where the account is the client — or after an explicit confirmation.
    const clientById = new Map(
      members.filter((m) => m.role === "client_viewer").map((m) => [m.id, m])
    );
    const beforeIds = new Set([
      ...(current.allowed_users ?? []),
      ...(current.grants ?? []).filter((g) => activeGrant(g)).map((g) => g.user_id),
    ]);
    const newClientIds = [
      ...new Set(
        [...(body.allowed_users ?? []), ...(body.grants ?? []).map((g) => g.user_id)].filter(
          (id) => clientById.has(id) && !beforeIds.has(id)
        )
      ),
    ];
    let unlinkedClientsConfirmed: string[] = [];
    if (newClientIds.length > 0) {
      if (!CLIENT_GRANT_ROLES.has(ctx.user.role) || ctx.supportSession) {
        return apiError(
          "client_grant_forbidden",
          "Zugriff für Mandantenkonten erteilen nur Anwältinnen/Anwälte oder Administratoren.",
          403
        );
      }
      const unlinked: string[] = [];
      for (const id of newClientIds) {
        if (!(await clientLinkedToMatter(ctx.headers, loaded.frontmatter, clientById.get(id)!))) {
          unlinked.push(id);
        }
      }
      if (unlinked.length > 0 && body.confirm_client_access !== true) {
        return apiError(
          "client_not_linked",
          "Dieses Mandantenkonto ist nicht als Mandant dieser Akte hinterlegt. Bitte ausdrücklich bestätigen, dass es diese Akte sehen soll.",
          409,
          { client_ids: unlinked }
        );
      }
      unlinkedClientsConfirmed = unlinked;
    }

    const next: MatterPermissions = { ...current };
    if (body.visibility !== undefined) next.visibility = body.visibility;
    if (body.allowed_users !== undefined) next.allowed_users = [...new Set(body.allowed_users)];
    if (body.blocked_users !== undefined) next.blocked_users = [...new Set(body.blocked_users)];

    if (body.grants !== undefined) {
      const before = current.grants ?? [];
      const beforeKeys = new Set(before.map(grantKey));
      const now = new Date().toISOString();
      const kept: MatterGrant[] = [];
      const added: MatterGrant[] = [];
      for (const g of body.grants) {
        if (beforeKeys.has(grantKey(g))) kept.push(g);
        else {
          if (g.expires_at && !activeGrant(g)) {
            return apiError("grant_expired", "Das Ablaufdatum liegt in der Vergangenheit.", 400);
          }
          added.push({
            user_id: g.user_id,
            level: g.level,
            ...(g.expires_at ? { expires_at: g.expires_at } : {}),
            granted_by: ctx.user.id,
            granted_at: now,
          });
        }
      }
      const keptKeys = new Set(kept.map(grantKey));
      const removed = before.filter((g) => !keptKeys.has(grantKey(g)));
      if (!isAdmin && removed.some((g) => g.granted_by !== ctx.user.id)) {
        return apiError(
          "grant_not_yours",
          "Sie können nur Freigaben zurücknehmen, die Sie selbst erteilt haben.",
          403
        );
      }
      next.grants = [...kept.filter((g) => activeGrant(g)), ...added];
    }

    // Nobody can lock themselves out of a matter they are managing.
    if (matterAccessLevel(matterAccessUserFor(ctx), next) !== "write") {
      return apiError(
        "self_lockout",
        "Mit dieser Änderung hätten Sie selbst keinen Zugriff mehr. Nehmen Sie sich ins Aktenteam auf oder lassen Sie die Wall weg.",
        400
      );
    }

    const res = await enginePatchPage(
      { ...ctx.headers, "x-subsumio-matter-permissions": "write" },
      {
        slug: body.case_slug,
        frontmatter: { permissions: next, updated_at: new Date().toISOString() },
      }
    );
    if (!res.ok) return apiError("update_failed", "Zugriff konnte nicht gespeichert werden", 502);

    void logAudit("matter.access_update", "matter_access", {
      entityId: body.case_slug,
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details: {
        visibility: { from: current.visibility ?? "full", to: next.visibility ?? "full" },
        team: next.allowed_users ?? [],
        walls: next.blocked_users ?? [],
        grants: (next.grants ?? []).map((g) => ({
          user_id: g.user_id,
          level: g.level,
          expires_at: g.expires_at,
        })),
        ...(newClientIds.length > 0
          ? {
              client_access_added: newClientIds,
              client_access_confirmed_unlinked: unlinkedClientsConfirmed,
            }
          : {}),
      },
    });

    return apiSuccess({ case_slug: body.case_slug, permissions: next });
  }
);
