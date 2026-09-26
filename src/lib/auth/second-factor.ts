/**
 * Second-factor verification shared by login, disable and re-enrolment.
 *
 * - Replay protection (RFC 6238 §5.2): a TOTP time step is accepted at most
 *   once per user — persisted as `twoFactorLastStep` and claimed atomically
 *   in the shared dedupe table, so two parallel requests with the same code
 *   cannot both pass.
 * - Backup codes are single-use (consumed on success).
 * - Failed attempts count per USER (not per challenge token) and lock the
 *   second factor after repeated failures (see lockout.ts).
 */
import { getStore, type User } from "@/lib/auth/store";
import { verifyTOTPStep } from "@/lib/totp";
import { verifyBackupCode } from "@/lib/auth/backup-codes";
import {
  clearSecondFactorLockout,
  isSecondFactorLocked,
  recordFailedSecondFactor,
} from "@/lib/auth/lockout";
import { filterNewIds } from "@/lib/caselaw-dedup";
import { createHash } from "node:crypto";

/** Dedupe scope for authentication claims (not a tenant brain). */
const AUTH_DEDUPE_SCOPE = "auth";

export type SecondFactorResult =
  | { ok: true; method: "totp" | "backup" }
  | { ok: false; reason: "invalid" | "locked"; retryAfterSeconds?: number };

/** Atomically claim a TOTP step for a user; false if already used. */
export async function claimTotpStep(userId: string, step: number): Promise<boolean> {
  const fresh = await filterNewIds(AUTH_DEDUPE_SCOPE, "totp-step", [`${userId}:${step}`]);
  return fresh.size === 1;
}

/** Single-use claim for a 2FA challenge token (stored as a hash only). */
export async function consumeChallengeToken(token: string): Promise<boolean> {
  const digest = createHash("sha256").update(token).digest("hex");
  const fresh = await filterNewIds(AUTH_DEDUPE_SCOPE, "2fa-challenge", [digest]);
  return fresh.size === 1;
}

/**
 * Verify a TOTP or backup code against the user's ACTIVE second factor and
 * record the outcome (last step / consumed backup code / failure counter).
 */
export async function verifySecondFactor(
  user: Pick<User, "id" | "twoFactorSecret" | "twoFactorBackupCodes" | "twoFactorLastStep">,
  code: string,
  opts: { allowBackupCode?: boolean } = {}
): Promise<SecondFactorResult> {
  const lock = await isSecondFactorLocked(user.id);
  if (lock.locked)
    return { ok: false, reason: "locked", retryAfterSeconds: lock.retryAfterSeconds };

  const store = getStore();
  const trimmed = code.trim();

  if (user.twoFactorSecret) {
    const step = await verifyTOTPStep(trimmed, user.twoFactorSecret);
    if (
      step !== null &&
      step > (user.twoFactorLastStep ?? -1) &&
      (await claimTotpStep(user.id, step))
    ) {
      await store.update(user.id, { twoFactorLastStep: step });
      await clearSecondFactorLockout(user.id);
      return { ok: true, method: "totp" };
    }
  }

  if (opts.allowBackupCode !== false && user.twoFactorBackupCodes?.length) {
    const idx = await verifyBackupCode(trimmed, user.twoFactorBackupCodes);
    const claimed =
      idx >= 0 &&
      (
        await filterNewIds(AUTH_DEDUPE_SCOPE, "2fa-backup", [
          `${user.id}:${user.twoFactorBackupCodes[idx]}`,
        ])
      ).size === 1;
    if (claimed) {
      const remaining = user.twoFactorBackupCodes.filter((_, i) => i !== idx);
      await store.update(user.id, { twoFactorBackupCodes: remaining });
      await clearSecondFactorLockout(user.id);
      return { ok: true, method: "backup" };
    }
  }

  const failure = await recordFailedSecondFactor(user.id);
  if (failure.locked) {
    return { ok: false, reason: "locked", retryAfterSeconds: failure.retryAfterSeconds };
  }
  return { ok: false, reason: "invalid" };
}
