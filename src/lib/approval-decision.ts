/**
 * Who may decide which Freigabe (Vier-Augen-Prinzip, KI-VO Art. 14).
 *
 * A decision is only valid for a page that IS a Freigabe-Aktion
 * (`agent_action`) and is still `pending` — the decision route must never set
 * a status on an invoice, a matter or a deadline, and never flip an action
 * that was already decided (and possibly executed). The decider is a lawyer
 * or admin (like workflow approvals) and not the person who proposed or
 * submitted the action.
 */

export const APPROVAL_DECIDER_ROLES: ReadonlySet<string> = new Set(["admin", "lawyer"]);

export interface ApprovalDecisionBlock {
  status: number;
  code: string;
  message: string;
}

interface PageLike {
  type?: string;
  frontmatter?: Record<string, unknown>;
}

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

export function canDecideApprovals(role: string | undefined): boolean {
  return !!role && APPROVAL_DECIDER_ROLES.has(role);
}

/** `null` = the user may decide this action now. `page` null = not found. */
export function approvalDecisionBlock(
  page: PageLike | null,
  user: { email: string; role: string }
): ApprovalDecisionBlock | null {
  if (!canDecideApprovals(user.role)) {
    return {
      status: 403,
      code: "approval_forbidden",
      message: "Freigaben entscheiden nur Anwältinnen/Anwälte und Administratoren.",
    };
  }
  if (!page) {
    return { status: 404, code: "not_found", message: "Freigabe nicht gefunden." };
  }
  const fm = page.frontmatter ?? {};
  const type = page.type ?? (typeof fm.type === "string" ? fm.type : "");
  if (type !== "agent_action") {
    return {
      status: 400,
      code: "not_an_approval",
      message: "Diese Seite ist keine Freigabe-Aktion.",
    };
  }
  if ((fm.status ?? "pending") !== "pending") {
    return {
      status: 409,
      code: "approval_already_decided",
      message: "Über diese Freigabe wurde bereits entschieden.",
    };
  }
  const me = norm(user.email);
  const proposers = [norm(fm.proposed_by), norm(fm.submitted_by)].filter(Boolean);
  if (me && proposers.includes(me)) {
    return {
      status: 403,
      code: "approval_self_decision",
      message:
        "Eine Freigabe muss von einer zweiten Person entschieden werden (Vier-Augen-Prinzip).",
    };
  }
  return null;
}
