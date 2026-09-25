// Server-side gates for sending a court filing via beA (send + retry).
//
// The verification state of the filed draft is read from the STORED draft
// page, never from the request body: a missing or unreadable state counts as
// NEEDS_HUMAN_REVIEW (fail-closed), so a filing without a verified receipt
// only goes out with an attorney override (reason + audit). The sender of the
// XJustiz message comes from the firm settings, not from the client.

import { createHash } from "node:crypto";
import { apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  assertOutputActionAllowed,
  buildPolicyOutput,
  VerificationPolicyError,
  type AttorneyOverride,
} from "@/lib/verification-policy";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";

type VerificationState =
  | "VERIFIED"
  | "VERIFIED_WITH_WARNINGS"
  | "NEEDS_HUMAN_REVIEW"
  | "BLOCKED"
  | "VERIFIER_ERROR";

const KNOWN_STATES: ReadonlySet<string> = new Set([
  "VERIFIED",
  "VERIFIED_WITH_WARNINGS",
  "NEEDS_HUMAN_REVIEW",
  "BLOCKED",
  "VERIFIER_ERROR",
]);

export interface GuardCtx {
  headers: Record<string, string>;
  brainId: string;
  user: { id: string; email?: string };
}

export interface StoredDraftVerification {
  state: VerificationState;
  contentHash: string;
  receiptHash?: string;
  title?: string;
}

/** Reads the verification state stored on the draft page; null = draft not found. */
export async function loadDraftVerification(
  headers: Record<string, string>,
  draftSlug: string
): Promise<StoredDraftVerification | null> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(draftSlug)}`, {
    headers: { "Content-Type": "application/json", ...headers },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const page = (await res.json().catch(() => null)) as {
    title?: string;
    status?: string;
    compiled_truth?: string;
    content?: string;
    frontmatter?: Record<string, unknown>;
  } | null;
  if (!page || page.status === "tombstoned") return null;
  const fm = page.frontmatter ?? {};
  const rawState = typeof fm.verification_state === "string" ? fm.verification_state : "";
  const state = (KNOWN_STATES.has(rawState) ? rawState : "NEEDS_HUMAN_REVIEW") as VerificationState;
  const body = String(page.compiled_truth ?? page.content ?? "");
  const contentHash = createHash("sha256").update(body).digest("hex");
  const receipt =
    typeof fm.verification_content_hash === "string" &&
    /^[a-f0-9]{64}$/.test(fm.verification_content_hash)
      ? fm.verification_content_hash
      : undefined;
  return {
    state,
    contentHash,
    receiptHash: receipt,
    title: typeof page.title === "string" ? page.title : undefined,
  };
}

/**
 * Runs the file_court policy for the stored draft. Returns an error Response
 * when the filing must not go out, or null when it may.
 */
export async function enforceFileCourtPolicy(
  ctx: GuardCtx,
  draftSlug: string,
  overrideReason: string | undefined
): Promise<Response | null> {
  const stored = await loadDraftVerification(ctx.headers, draftSlug);
  if (!stored) return apiError("draft_not_found", "Entwurf nicht gefunden", 404);
  const output = buildPolicyOutput(draftSlug, stored.state, stored.contentHash, {
    receipt_hash: stored.receiptHash,
    title: stored.title,
  });
  const reason = overrideReason?.trim();
  const override: AttorneyOverride | undefined = reason
    ? {
        user_id: ctx.user.id,
        reason,
        timestamp: new Date().toISOString(),
        output_hash: stored.contentHash,
      }
    : undefined;
  try {
    await assertOutputActionAllowed(
      output,
      "file_court",
      { user_id: ctx.user.id, user_email: ctx.user.email, brain_id: ctx.brainId },
      override
    );
    return null;
  } catch (err) {
    if (err instanceof VerificationPolicyError) {
      const fatal = stored.state === "BLOCKED" || stored.state === "VERIFIER_ERROR";
      const invalidated = err.decision.receipt_invalidated === true;
      return apiError(
        "verification_denied",
        invalidated
          ? "Der Entwurf wurde nach der Prüfung geändert — bitte erneut prüfen lassen."
          : fatal
            ? "Der Entwurf ist als gesperrt markiert und kann nicht eingereicht werden — bitte korrigieren und erneut prüfen."
            : "Der Entwurf ist nicht geprüft. Eine Einreichung ist nur mit anwaltlicher Freigabe samt Begründung möglich.",
        403,
        {
          state: stored.state,
          override_possible: !fatal && !invalidated,
        }
      );
    }
    throw err;
  }
}

/**
 * The XJustiz sender: the firm name from the settings (never a client-sent
 * placeholder). Returns an error Response when no firm name is configured.
 */
export async function resolveFilingSender(
  brainId: string,
  envSenderId: string | undefined
): Promise<{ name: string; id?: string } | Response> {
  let name = "";
  try {
    const s = await loadKanzleiSettingsForBrain(brainId);
    name = (s.kanzleiName || s.anwaltName || "").trim();
  } catch {
    return apiError(
      "settings_unavailable",
      "Die Kanzlei-Einstellungen konnten nicht geladen werden. Bitte erneut versuchen.",
      503
    );
  }
  if (!name) {
    return apiError(
      "sender_missing",
      "Bitte zuerst den Kanzleinamen in den Einstellungen hinterlegen — er wird als Absender übermittelt.",
      422
    );
  }
  return { name, id: envSenderId || undefined };
}

/** A real court name — not empty and not a UI placeholder such as "—". */
export function hasCourtName(court: string | undefined): boolean {
  return /\p{L}{2,}/u.test(court ?? "");
}
