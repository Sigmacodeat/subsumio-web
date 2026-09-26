// Contract acceptance: AGB, Datenschutzerklärung and AVV (Art. 28 DSGVO).
//
// A self-service account is concluded electronically at signup (Art. 28 (9)
// DSGVO allows the electronic form for the AVV). Accounts that existed before
// — or whose recorded versions are older than the current texts — confirm
// once on their next dashboard visit (blocking dialog). The record is kept
// server-side on the user (current + history) and in the firm's audit log.
//
// Who binds the firm: the AVV is concluded by the firm (Verantwortlicher).
// A person who signs up creates their own firm and administers it (role
// "admin"), so admins accept all three documents on the firm's behalf. Team
// members without admin rights confirm AGB and Datenschutzerklärung only.

import type { KanzleiRole, User } from "@/lib/auth/store";

/**
 * Current versions of the legal texts. Bump a value whenever the text of that
 * document changes materially — every affected account is asked again.
 * The pages show the same value ("Fassung vom …").
 */
export const LEGAL_VERSIONS = {
  terms: "2026-09-26",
  privacy: "2026-09-01",
  dpa: "2026-09-26",
} as const;

export interface LegalAcceptance {
  termsVersion: string;
  privacyVersion: string;
  /** null when the person accepted without binding the firm (team member). */
  dpaVersion: string | null;
  /** ISO timestamp, set by the server. */
  acceptedAt: string;
  /** Where the acceptance happened. */
  method: "signup" | "prompt";
  /** true when accepted as the firm's administrator (AVV concluded). */
  onBehalfOfFirm: boolean;
  /** Firm context at the time of acceptance. */
  orgId: string | null;
  brainId: string;
  role: KanzleiRole;
}

/** Roles that must confirm the contract texts at all (portal viewers do not). */
function mustConfirm(role: KanzleiRole | undefined): boolean {
  return role !== "client_viewer";
}

/** The firm's AVV is concluded by its administrators. */
export function bindsFirm(user: Pick<User, "role">): boolean {
  return user.role === "admin";
}

/** True when this account has to (re-)confirm before using the dashboard. */
export function legalAcceptanceRequired(
  user: Pick<User, "role"> & { legalAcceptance?: LegalAcceptance | null }
): boolean {
  if (!mustConfirm(user.role)) return false;
  const rec = user.legalAcceptance;
  if (!rec) return true;
  if (rec.termsVersion !== LEGAL_VERSIONS.terms) return true;
  if (rec.privacyVersion !== LEGAL_VERSIONS.privacy) return true;
  if (bindsFirm(user) && rec.dpaVersion !== LEGAL_VERSIONS.dpa) return true;
  return false;
}

/** Builds the record for the current versions. Timestamp is the server's. */
export function buildLegalAcceptance(
  user: Pick<User, "role" | "orgId" | "brainId">,
  method: LegalAcceptance["method"],
  now: Date = new Date()
): LegalAcceptance {
  const firm = bindsFirm(user);
  return {
    termsVersion: LEGAL_VERSIONS.terms,
    privacyVersion: LEGAL_VERSIONS.privacy,
    dpaVersion: firm ? LEGAL_VERSIONS.dpa : null,
    acceptedAt: now.toISOString(),
    method,
    onBehalfOfFirm: firm,
    orgId: user.orgId ?? null,
    brainId: user.brainId,
    role: user.role,
  };
}

/** Store patch: current record + append-only history on the user. */
export function legalAcceptancePatch(
  user: { legalAcceptanceHistory?: LegalAcceptance[] | null },
  record: LegalAcceptance
): { legalAcceptance: LegalAcceptance; legalAcceptanceHistory: LegalAcceptance[] } {
  return {
    legalAcceptance: record,
    legalAcceptanceHistory: [...(user.legalAcceptanceHistory ?? []), record],
  };
}

/** Formats a version (YYYY-MM-DD) as "26.09.2026" for the legal pages. */
export function formatLegalVersion(version: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(version);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : version;
}
