/**
 * The WhatsApp side of the Freigabe queue — same rules as the dashboard.
 *
 *  - Deciding goes through approvalDecisionBlock (src/lib/approval-decision.ts):
 *    only lawyers/admins, only a pending `agent_action`, never the person who
 *    proposed it (Vier-Augen). The decider is the linked user account of the
 *    WhatsApp number, so `proposed_by` (an email) is compared like on the web.
 *  - Reads run with the decider's signed identity (see runAsEngineCaller), and
 *    a Freigabe tied to a matter the decider cannot open is treated as absent.
 *  - Notifications about a new Freigabe go to the responsible lawyer(s) of
 *    the matter who have a linked WhatsApp number — never to the proposer and
 *    never to a client.
 */

import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { readCurrentPage } from "@/lib/page-write-guards";
import { withKeyedLock } from "@/lib/keyed-lock";
import { approvalDecisionBlock, canDecideApprovals } from "@/lib/approval-decision";
import { getStore, type User } from "@/lib/auth/store";
import { logAudit } from "@/lib/audit";
import type { ActionType } from "@/lib/approval";
import { getWhatsAppIdentityStore } from "./identity-store";
import type { WhatsAppIdentity } from "./types";

export interface PendingWhatsAppApproval {
  action_slug: string;
  action_type: ActionType;
  summary?: string;
}

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/** The matter a Freigabe concerns, if any. */
function approvalCaseSlug(fm: Record<string, unknown>): string | undefined {
  const payload = (fm.payload ?? {}) as Record<string, unknown>;
  for (const v of [payload.case_slug, fm.case_slug, fm.target_slug]) {
    if (typeof v === "string" && v.startsWith("legal/cases/")) return v;
  }
  return undefined;
}

async function caseVisible(
  headers: Record<string, string>,
  caseSlug: string | undefined,
  cache: Map<string, boolean>
): Promise<boolean> {
  if (!caseSlug) return true;
  const hit = cache.get(caseSlug);
  if (hit !== undefined) return hit;
  const read = await readCurrentPage(ENGINE_URL, headers, caseSlug);
  const visible = read.kind === "found";
  cache.set(caseSlug, visible);
  return visible;
}

/**
 * Pending Freigaben this person could decide right now: visible to them (the
 * engine applies their walls/teams through `headers`) and not proposed by them.
 */
export async function listDecidableApprovals(
  headers: Record<string, string>,
  decider: Pick<WhatsAppIdentity, "role" | "email">
): Promise<PendingWhatsAppApproval[]> {
  if (!canDecideApprovals(decider.role)) return [];
  const pages = await listEnginePages(headers, "agent_action", 2000, {
    frontmatter: { status: "pending" },
  });
  const me = norm(decider.email);
  const cache = new Map<string, boolean>();
  const out: PendingWhatsAppApproval[] = [];
  for (const page of pages) {
    const fm = page.frontmatter ?? {};
    const actionType = fm.action_type as ActionType | undefined;
    if (!actionType || fm.status !== "pending") continue;
    if (me && [norm(fm.proposed_by), norm(fm.submitted_by)].includes(me)) continue;
    if (!(await caseVisible(headers, approvalCaseSlug(fm), cache))) continue;
    out.push({
      action_slug: page.slug,
      action_type: actionType,
      summary: typeof fm.summary === "string" ? fm.summary : undefined,
    });
  }
  return out;
}

export type WhatsAppDecisionResult = { ok: true } | { ok: false; message: string };

/** Decide one Freigabe with exactly the dashboard's rules (one decision per action). */
export async function decideWhatsAppApproval(input: {
  headers: Record<string, string>;
  brainId: string;
  actionSlug: string;
  status: "approved" | "rejected";
  decider: Pick<WhatsAppIdentity, "role" | "email" | "userId">;
  rejectReason?: string;
}): Promise<WhatsAppDecisionResult> {
  return withKeyedLock(`approval:${input.brainId}:${input.actionSlug}`, async () => {
    const read = await readCurrentPage(ENGINE_URL, input.headers, input.actionSlug);
    if (read.kind === "error") {
      return {
        ok: false,
        message: "Die Freigabe konnte nicht geprüft werden. Bitte erneut versuchen.",
      };
    }
    const page = read.kind === "found" ? read.page : null;
    const block = approvalDecisionBlock(page, {
      email: input.decider.email ?? "",
      role: input.decider.role ?? "",
    });
    if (block) return { ok: false, message: block.message };
    const fm = (page?.frontmatter ?? {}) as Record<string, unknown>;
    if (!(await caseVisible(input.headers, approvalCaseSlug(fm), new Map()))) {
      return { ok: false, message: "Freigabe nicht gefunden." };
    }
    const decidedBy = input.decider.email || input.decider.userId || "whatsapp";
    const res = await enginePatchPage(
      input.headers,
      {
        slug: input.actionSlug,
        frontmatter: {
          status: input.status,
          decided_at: new Date().toISOString(),
          decided_by: decidedBy,
          decided_via: "whatsapp",
          ...(input.status === "rejected" && input.rejectReason
            ? { reject_reason: input.rejectReason }
            : {}),
        },
      },
      { timeoutMs: 15_000 }
    );
    if (!res.ok) {
      return { ok: false, message: "Die Freigabe konnte nicht gespeichert werden." };
    }
    await logAudit(
      input.status === "approved" ? "approval.approve" : "approval.reject",
      "agent_action",
      {
        brainId: input.brainId,
        entityId: input.actionSlug,
        userId: input.decider.userId,
        userEmail: input.decider.email,
        details: { decided_by: decidedBy, channel: "whatsapp" },
      }
    ).catch(() => undefined);
    return { ok: true };
  });
}

export interface ApprovalRecipient {
  userId: string;
  phone: string;
}

export interface RecipientDeps {
  listIdentities?: (orgId: string) => Promise<WhatsAppIdentity[]>;
  getUser?: (id: string) => Promise<User | null>;
  readCase?: (caseSlug: string) => Promise<Record<string, unknown> | null>;
}

/**
 * Who is told about a new Freigabe over WhatsApp: the matter's responsible
 * lawyer (`own_lawyer_id`, user id or email), otherwise the lawyers/admins of
 * the matter team (`permissions.allowed_users`) — each only with an active,
 * linked lawyer/admin account, a stored number, not walled off, and never the
 * proposer. Without a matter nobody is messaged; the queue in the dashboard
 * remains the place to look.
 */
export async function approvalNotificationRecipients(
  input: {
    orgId: string;
    caseSlug?: string;
    excludeUserId?: string;
  },
  deps: RecipientDeps
): Promise<ApprovalRecipient[]> {
  if (!input.caseSlug || !deps.readCase) return [];
  const listIdentities =
    deps.listIdentities ?? ((orgId: string) => getWhatsAppIdentityStore().listByOrg(orgId));
  const getUser = deps.getUser ?? ((id: string) => getStore().getById(id));

  const fm = await deps.readCase(input.caseSlug).catch(() => null);
  if (!fm) return [];
  const permissions = (fm.permissions ?? {}) as {
    allowed_users?: unknown;
    blocked_users?: unknown;
  };
  const blocked = new Set(
    Array.isArray(permissions.blocked_users) ? permissions.blocked_users.map(String) : []
  );
  const responsible = norm(fm.own_lawyer_id);
  const team = new Set(
    Array.isArray(permissions.allowed_users) ? permissions.allowed_users.map(String) : []
  );

  const candidates: Array<{ user: User; phone: string }> = [];
  for (const identity of await listIdentities(input.orgId)) {
    if (identity.status !== "active" || identity.userLinked !== true || !identity.userId) continue;
    if (!identity.phone || identity.userId === input.excludeUserId) continue;
    const user = await getUser(identity.userId);
    if (!user || user.deactivatedAt || !canDecideApprovals(user.role)) continue;
    if (blocked.has(user.id) || blocked.has(user.email)) continue;
    candidates.push({ user, phone: identity.phone });
  }

  const byResponsible = candidates.filter(
    (c) => responsible && (norm(c.user.id) === responsible || norm(c.user.email) === responsible)
  );
  const chosen =
    byResponsible.length > 0
      ? byResponsible
      : candidates.filter((c) => team.has(c.user.id) || team.has(c.user.email));
  return chosen.map((c) => ({ userId: c.user.id, phone: c.phone }));
}
