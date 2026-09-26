/**
 * Anwaltliche Freigabe von KI-Text vor Export und Versand.
 *
 * KI-generierter Text (Schriftsatz, Memo, Berufung, Chronologie, Chat) darf die
 * Kanzlei als Word-Datei, E-Mail-Anhang oder Portal-Dokument erst verlassen,
 * wenn (1) die Zitatprüfung serverseitig für GENAU diesen Text gelaufen ist und
 * (2) eine Anwältin/ein Anwalt (admin/lawyer) ihn freigegeben hat. Bei nicht
 * verifizierten Zitaten ist die Freigabe nur mit Begründung möglich
 * (AttorneyOverride der Verification-Policy, protokolliert).
 *
 * Die Freigabe ist eine signierte Quittung (HMAC mit dem Auth-Secret), gebunden
 * an Kanzlei (brain) und SHA-256 des Textes. Jede Änderung des Textes macht sie
 * ungültig. Der Client kann sie weder fälschen noch auf anderen Text
 * übertragen; ob Text KI-Herkunft hat, entscheidet der Server (gespeicherte
 * Seite: `ai_generated`; freier Markdown-Export: immer KI, siehe
 * api/word-export).
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "@/lib/auth/session-core";
import type { GroundingMetadata } from "@/lib/citation-gate-client";

export type ReleaseState =
  | "VERIFIED"
  | "VERIFIED_WITH_WARNINGS"
  | "NEEDS_HUMAN_REVIEW"
  | "BLOCKED"
  | "VERIFIER_ERROR";

/** Frontmatter key holding the signed release of a stored page. */
export const AI_RELEASE_FM_KEY = "ai_release";

export interface AiRelease {
  /** Brain (Kanzlei) the release belongs to. */
  brainId: string;
  /** SHA-256 (hex) of the released text. */
  contentHash: string;
  state: ReleaseState;
  releasedBy: string;
  releasedByEmail?: string;
  releasedAt: string;
  /** Present when unverified citations were released with a reason. */
  overrideReason?: string;
  citationsVerified: number;
  citationsUnverified: number;
}

export function contentHashOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The text a stored page exports — the same field every export path reads. */
export function pageBody(page: { compiled_truth?: unknown; content?: unknown }): string {
  return String(page.compiled_truth ?? page.content ?? "");
}

/** Server-side AI origin of a stored page (never the client's claim). */
export function isAiPage(frontmatter: Record<string, unknown> | undefined | null): boolean {
  return !!frontmatter && frontmatter.ai_generated === true;
}

/**
 * Verification state of a text from the server-side citation check.
 * A failed/incomplete check is VERIFIER_ERROR (no release possible, retry);
 * unverified or misattributed citations need an attorney override.
 */
export function stateFromGrounding(g: GroundingMetadata): ReleaseState {
  if (g.check_failed || !g.corpus_checked) return "VERIFIER_ERROR";
  if (g.citations_unverified > 0 || (g.citations_misgrounded ?? 0) > 0) {
    return "NEEDS_HUMAN_REVIEW";
  }
  return "VERIFIED";
}

function sign(body: string): string {
  return createHmac("sha256", `ai-release:${getAuthSecret()}`).update(body).digest("base64url");
}

export function signRelease(release: AiRelease): string {
  const body = Buffer.from(JSON.stringify(release)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export type ReleaseCheck =
  | { ok: true; release: AiRelease }
  | { ok: false; reason: "missing" | "invalid" | "other_brain" | "content_changed" };

/** Checks a release token for this brain and exactly this text. */
export function verifyRelease(
  token: unknown,
  expected: { brainId: string; contentHash: string }
): ReleaseCheck {
  if (typeof token !== "string" || !token) return { ok: false, reason: "missing" };
  const [body, sig] = token.split(".");
  if (!body || !sig) return { ok: false, reason: "invalid" };
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    return { ok: false, reason: "invalid" };
  }
  let release: AiRelease;
  try {
    release = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AiRelease;
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (release.brainId !== expected.brainId) return { ok: false, reason: "other_brain" };
  if (release.contentHash !== expected.contentHash) return { ok: false, reason: "content_changed" };
  // Only releasable states can carry a release (BLOCKED/VERIFIER_ERROR never do).
  if (
    release.state !== "VERIFIED" &&
    release.state !== "VERIFIED_WITH_WARNINGS" &&
    !(release.state === "NEEDS_HUMAN_REVIEW" && release.overrideReason)
  ) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, release };
}

/** User-facing message for an export/send refused for lack of a release. */
export function releaseRequiredMessage(reason: string): string {
  return reason === "content_changed"
    ? "Der KI-Text wurde nach der Freigabe geändert. Bitte erneut prüfen und freigeben lassen."
    : "KI-Text verlässt die Kanzlei erst nach Zitatprüfung und anwaltlicher Freigabe. Bitte zuerst „Prüfen und freigeben“.";
}
