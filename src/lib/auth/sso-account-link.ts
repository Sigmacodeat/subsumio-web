/**
 * Decides whether a WorkOS authentication may sign into an EXISTING
 * Subsumio account. Matching by e-mail alone is not enough: any WorkOS
 * connection (a social login, another customer's SAML tenant) can assert an
 * arbitrary address. Rules, fail-closed:
 *
 *  1. The firm has an SSO tenant (`org.workosOrganizationId`): WorkOS must
 *     have authenticated the user inside exactly that organization. The
 *     organization only exists for this firm's IdP connection, so the IdP
 *     vouches for the identity; the account may be (re)bound to it.
 *  2. No SSO tenant configured: only the WorkOS identity the account is
 *     already bound to (`user.workosUserId`, set when the account was
 *     provisioned through SSO) may sign in. An e-mail match never links a
 *     new WorkOS identity to an existing account.
 *
 * Binding a (new) WorkOS identity to an account additionally requires the
 * WorkOS profile e-mail to be verified.
 */
import type { Org, User } from "@/lib/auth/store";

export type SsoLinkDecision =
  | { ok: true; bind: boolean }
  | { ok: false; reason: "email_unverified" | "org_mismatch" | "not_linked" };

export function decideSsoAccountLink(input: {
  user: Pick<User, "workosUserId">;
  org: Pick<Org, "workosOrganizationId"> | null;
  workosUserId: string;
  emailVerified: boolean;
  /** Organization WorkOS authenticated the user in (absent for social logins). */
  authOrganizationId: string | null | undefined;
}): SsoLinkDecision {
  const tenant = input.org?.workosOrganizationId?.trim() || null;
  if (tenant) {
    if (!input.authOrganizationId || input.authOrganizationId !== tenant) {
      return { ok: false, reason: "org_mismatch" };
    }
    const bind = input.user.workosUserId !== input.workosUserId;
    if (bind && input.emailVerified !== true) return { ok: false, reason: "email_unverified" };
    return { ok: true, bind };
  }
  if (input.user.workosUserId && input.user.workosUserId === input.workosUserId) {
    return { ok: true, bind: false };
  }
  return { ok: false, reason: "not_linked" };
}
