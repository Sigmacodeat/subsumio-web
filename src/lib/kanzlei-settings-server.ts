// Server-only Kanzlei-settings reads for route handlers and cron jobs.
// kanzlei-settings.ts's loadKanzleiSettings() goes through src/lib/api.ts,
// which is a browser fetch wrapper (cookies, redirect-on-401) — unusable on
// the server: it reaches the engine without API key or tenant header, gets a
// 401 and silently falls back to empty defaults (so the reminder cron never
// saw a firm's SMTP settings and never mailed a reminder). This talks to the
// engine directly with trusted server-side headers for a known brainId, the
// same pattern as cron jobs (engineHeadersForBrain).
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage, firmBrainIdFor } from "@/lib/engine";
import { encrypt, isEncryptionEnabled } from "@/lib/encryption";
import { withKeyedLock } from "@/lib/keyed-lock";
import { logAudit } from "@/lib/audit";
import {
  DEFAULT_KANZLEI_SETTINGS,
  KANZLEI_SETTINGS_SLUG,
  normalizeKanzleiSettings,
  type KanzleiSettings,
} from "@/lib/kanzlei-settings";
import type { User } from "@/lib/auth/store";
import {
  SMTP_PASSWORD_ENC_FIELD,
  SMTP_PASSWORD_FIELD,
  revealSmtpPassword,
} from "@/lib/kanzlei-settings-secrets";
import { logger } from "@/lib/logger";

const log = logger("lib/kanzlei-settings-server");

/**
 * Outcome of reading the firm-wide 2FA requirement.
 *  - "required"     — the firm's settings page has require2FA === true
 *  - "not_required" — the settings page exists without it, or does not exist
 *                     at all (404: the firm never saved settings)
 *  - "unknown"      — the settings could not be read (engine unreachable,
 *                     timeout, 5xx/401/403, unreadable body, store error)
 */
export type TwoFactorPolicy = "required" | "not_required" | "unknown";

/**
 * Reads the Kanzlei-wide require2FA flag from a brain. Fail-CLOSED: a read
 * error is reported as "unknown", never silently as "not required" — the
 * caller decides how to refuse. Nothing is cached, so the next call
 * re-evaluates and a transient engine outage cannot outlive the outage.
 */
export async function readTwoFactorPolicy(brainId: string): Promise<TwoFactorPolicy> {
  try {
    const res = await fetch(
      `${ENGINE_URL}/api/pages/${encodeURIComponent(KANZLEI_SETTINGS_SLUG)}`,
      {
        headers: engineHeadersForBrain(brainId),
        signal: AbortSignal.timeout(5_000),
      }
    );
    if (res.status === 404) return "not_required";
    if (!res.ok) {
      log.warn(`[kanzlei-settings-server] 2FA policy read returned ${res.status}`);
      return "unknown";
    }
    const page = (await res.json()) as { frontmatter?: Record<string, unknown> } | null;
    return page?.frontmatter?.require2FA === true ? "required" : "not_required";
  } catch (err) {
    log.warn(
      "[kanzlei-settings-server] 2FA policy read failed:",
      err instanceof Error ? err.message : String(err)
    );
    return "unknown";
  }
}

/**
 * The 2FA requirement that applies to this user: read from the FIRM's brain
 * (org.brainId) for a team member — the member's own user.brainId is their
 * unused personal workspace — or from their own brain when working alone.
 * A store error while resolving the firm is "unknown" as well.
 */
export async function twoFactorPolicyFor(
  user: Pick<User, "brainId" | "orgId">
): Promise<TwoFactorPolicy> {
  let brainId: string | null;
  try {
    brainId = await firmBrainIdFor(user);
  } catch (err) {
    log.warn(
      "[kanzlei-settings-server] firm lookup for 2FA policy failed:",
      err instanceof Error ? err.message : String(err)
    );
    return "unknown";
  }
  // Suspended firm: the login route refuses such accounts before this point
  // (isAccountBlocked); never report a policy for it.
  if (!brainId) return "unknown";
  return readTwoFactorPolicy(brainId);
}

/** The settings page could not be read (engine unreachable, 5xx/401/403, bad body). */
export class KanzleiSettingsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KanzleiSettingsUnavailableError";
  }
}

/**
 * The Kanzlei settings of ONE firm, read server-side from its own brain with
 * trusted headers (engineHeadersForBrain). The caller must own the brainId —
 * a route passes ctx.brainId, a cron job the brain it is iterating.
 *
 *  - 404 (the firm never saved settings) → the defaults, like the browser path.
 *  - Any other failure throws KanzleiSettingsUnavailableError: a failed read
 *    must never be mistaken for "SMTP not configured" — the caller decides
 *    whether to report it or fall back.
 */
export async function loadKanzleiSettingsForBrain(
  brainId: string,
  opts: { timeoutMs?: number } = {}
): Promise<KanzleiSettings> {
  const path = KANZLEI_SETTINGS_SLUG.split("/").map(encodeURIComponent).join("/");
  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
  } catch (err) {
    throw new KanzleiSettingsUnavailableError(
      `kanzlei settings read failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (res.status === 404) return normalizeKanzleiSettings(DEFAULT_KANZLEI_SETTINGS);
  if (!res.ok) {
    throw new KanzleiSettingsUnavailableError(`kanzlei settings read returned HTTP ${res.status}`);
  }
  let page: { frontmatter?: Record<string, unknown> } | null;
  try {
    page = (await res.json()) as { frontmatter?: Record<string, unknown> } | null;
  } catch {
    throw new KanzleiSettingsUnavailableError("kanzlei settings body unreadable");
  }
  const fm = page?.frontmatter ?? null;
  // A password saved before encryption existed is sealed on this first
  // server read. Never fails the read — the next read simply tries again.
  if (hasLegacyPlaintext(fm)) {
    try {
      await sealLegacySmtpPassword(brainId, { trigger: "read" });
    } catch (err) {
      log.warn(
        "[kanzlei-settings-server] sealing the stored SMTP password failed:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }
  const settings = normalizeKanzleiSettings(fm as Partial<KanzleiSettings> | null);
  // The SMTP password is stored encrypted (kanzlei-settings-secrets.ts).
  const smtpPassword = await revealSmtpPassword(fm);
  const out = { ...settings, smtpPassword } as KanzleiSettings & Record<string, unknown>;
  delete out[SMTP_PASSWORD_ENC_FIELD];
  return out;
}

function hasLegacyPlaintext(fm: Record<string, unknown> | null | undefined): boolean {
  const v = fm?.[SMTP_PASSWORD_FIELD];
  return typeof v === "string" && v.length > 0;
}

function encryptionKeyAvailable(): boolean {
  try {
    return isEncryptionEnabled();
  } catch {
    return false;
  }
}

/** Serialises every sealing run for one firm — across server instances with Postgres. */
export function kanzleiSettingsSealLockKey(brainId: string): string {
  return `kanzlei-settings-smtp-seal:${brainId}`;
}

/**
 * Outcome of sealing a firm's stored SMTP password.
 *  - "sealed"        plaintext was encrypted into smtpPasswordEnc and removed
 *  - "cleared"       ciphertext already existed; the leftover plaintext was removed
 *  - "would_seal"    dry run: plaintext found, nothing written
 *  - "not_needed"    no plaintext stored (or no settings page)
 *  - "no_key"        plaintext found, but no encryption key is configured —
 *                    nothing is written (it would only be marked, not encrypted)
 *  - "failed"        the page could not be read or written
 */
export type SmtpSealOutcome =
  | "sealed"
  | "cleared"
  | "would_seal"
  | "not_needed"
  | "no_key"
  | "failed";

/**
 * Encrypts a plaintext SMTP password left on a firm's settings page by a
 * save from before encryption. Idempotent: it re-reads the page under a lock
 * (parallel runs for the same firm wait for each other; the second finds
 * nothing left to do), keeps an existing ciphertext, and only removes the
 * plaintext key. Each write is recorded in the firm's audit log.
 */
export async function sealLegacySmtpPassword(
  brainId: string,
  opts: { dryRun?: boolean; trigger: "read" | "migration"; timeoutMs?: number }
): Promise<SmtpSealOutcome> {
  if (!opts.dryRun && !encryptionKeyAvailable()) return "no_key";
  const headers = engineHeadersForBrain(brainId);
  const path = KANZLEI_SETTINGS_SLUG.split("/").map(encodeURIComponent).join("/");
  const timeout = opts.timeoutMs ?? 10_000;

  return withKeyedLock(kanzleiSettingsSealLockKey(brainId), async () => {
    let fm: Record<string, unknown> | null;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
        headers,
        signal: AbortSignal.timeout(timeout),
      });
      if (res.status === 404) return "not_needed";
      if (!res.ok) return "failed";
      const page = (await res.json()) as { frontmatter?: Record<string, unknown> } | null;
      fm = page?.frontmatter ?? null;
    } catch {
      return "failed";
    }
    if (!hasLegacyPlaintext(fm)) return "not_needed";
    if (opts.dryRun) return encryptionKeyAvailable() ? "would_seal" : "no_key";

    const hasCipher =
      typeof fm?.[SMTP_PASSWORD_ENC_FIELD] === "string" &&
      (fm[SMTP_PASSWORD_ENC_FIELD] as string).length > 0;
    const storedVersion = Number(fm?.version);
    const frontmatter: Record<string, unknown> = {
      // null removes the key on a merge write.
      [SMTP_PASSWORD_FIELD]: null,
      // Advance the version like every settings save, so an open settings
      // form holding the old copy notices the change.
      version: (Number.isFinite(storedVersion) ? storedVersion : 0) + 1,
    };
    if (!hasCipher) {
      frontmatter[SMTP_PASSWORD_ENC_FIELD] = await encrypt(fm![SMTP_PASSWORD_FIELD] as string);
    }
    let ok = false;
    try {
      const res = await enginePatchPage(
        headers,
        { slug: KANZLEI_SETTINGS_SLUG, frontmatter },
        { timeoutMs: timeout }
      );
      ok = res.ok;
    } catch {
      ok = false;
    }
    if (!ok) return "failed";

    const outcome: SmtpSealOutcome = hasCipher ? "cleared" : "sealed";
    await logAudit("settings.update", "kanzlei_settings", {
      brainId,
      entityId: KANZLEI_SETTINGS_SLUG,
      details: {
        field: SMTP_PASSWORD_FIELD,
        change: `smtp_password_${outcome}`,
        trigger: opts.trigger,
      },
    }).catch(() => {});
    return outcome;
  });
}

/** SMTP credentials complete enough to send mail. */
export function isSmtpConfigured(settings: Partial<KanzleiSettings>): boolean {
  return !!(settings.smtpHost && settings.smtpUser && settings.smtpPassword);
}
