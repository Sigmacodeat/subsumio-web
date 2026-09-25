// Server-only: the SMTP password of the Kanzlei settings.
//
// The settings live on an ordinary brain page (legal/settings/kanzlei), which
// every role with read access can fetch. The SMTP password therefore never
// sits on that page in plaintext: the web page routes encrypt it into
// `smtpPasswordEnc` on write (src/lib/encryption.ts, AES-256-GCM), remove it
// from every read (only `smtpPasswordSet: true|false` is returned), and only
// the server-side settings loader decrypts it for sending mail.
import { decrypt, encrypt, isEncryptionEnabled } from "@/lib/encryption";
import type { CurrentPageLike } from "@/lib/page-write-guards";

export const SMTP_PASSWORD_FIELD = "smtpPassword";
export const SMTP_PASSWORD_ENC_FIELD = "smtpPasswordEnc";
export const SMTP_PASSWORD_SET_FIELD = "smtpPasswordSet";

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/**
 * Frontmatter to store for a settings write.
 *
 *  - a non-empty `smtpPassword` → encrypted into `smtpPasswordEnc`
 *  - `smtpPassword: null`       → the stored password is removed
 *  - empty / absent             → the stored password is kept (the client never
 *                                 receives it, so it cannot send it back)
 *
 * Plaintext is never forwarded; a legacy plaintext value on the stored page is
 * encrypted on this write and its plaintext key cleared.
 */
export async function sealKanzleiSettingsFrontmatter(
  incoming: Record<string, unknown>,
  stored: Record<string, unknown> | null | undefined
): Promise<Record<string, unknown>> {
  const next: Record<string, unknown> = { ...incoming };
  const password = next[SMTP_PASSWORD_FIELD];
  // Client-supplied cipher text or flags are never trusted.
  delete next[SMTP_PASSWORD_ENC_FIELD];
  delete next[SMTP_PASSWORD_SET_FIELD];
  delete next[SMTP_PASSWORD_FIELD];

  if (nonEmpty(password)) {
    // Throws in production without SUBSUMIO_ENCRYPTION_KEY — the write fails
    // rather than storing the password unprotected.
    isEncryptionEnabled();
    next[SMTP_PASSWORD_ENC_FIELD] = await encrypt(password);
  } else if (password === null) {
    next[SMTP_PASSWORD_ENC_FIELD] = null;
  } else if (nonEmpty(stored?.[SMTP_PASSWORD_ENC_FIELD])) {
    next[SMTP_PASSWORD_ENC_FIELD] = stored[SMTP_PASSWORD_ENC_FIELD];
  } else if (nonEmpty(stored?.[SMTP_PASSWORD_FIELD])) {
    next[SMTP_PASSWORD_ENC_FIELD] = await encrypt(stored[SMTP_PASSWORD_FIELD] as string);
  }
  // Clears a legacy plaintext value on a merge; harmless on a full write.
  next[SMTP_PASSWORD_FIELD] = null;
  return next;
}

/** Remove the SMTP secret from a settings frontmatter for any client read. */
export function redactKanzleiSettingsFrontmatter(
  fm: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...fm };
  const set = nonEmpty(out[SMTP_PASSWORD_ENC_FIELD]) || nonEmpty(out[SMTP_PASSWORD_FIELD]);
  delete out[SMTP_PASSWORD_FIELD];
  delete out[SMTP_PASSWORD_ENC_FIELD];
  out[SMTP_PASSWORD_SET_FIELD] = set;
  return out;
}

function isSettingsPage(page: CurrentPageLike & { slug?: string }): boolean {
  const fmType = page.frontmatter?.type;
  return (
    page.slug === "legal/settings/kanzlei" ||
    page.type === "kanzlei_settings" ||
    fmType === "kanzlei_settings"
  );
}

/**
 * Read-path filter for the generic page API: a Kanzlei-settings page (single
 * page, list entry, batch entry) is returned without its SMTP secret. Any
 * other value passes through unchanged.
 */
export function redactPageSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redactPageSecrets(v)) as unknown as T;
  if (!value || typeof value !== "object") return value;
  const page = value as unknown as CurrentPageLike & { slug?: string };
  if (!page.frontmatter || typeof page.frontmatter !== "object") return value;
  if (!isSettingsPage(page)) return value;
  return {
    ...(value as object),
    frontmatter: redactKanzleiSettingsFrontmatter(page.frontmatter),
  } as T;
}

/** Server-side: the usable SMTP password of a stored settings frontmatter. */
export async function revealSmtpPassword(
  fm: Record<string, unknown> | null | undefined
): Promise<string | undefined> {
  if (!fm) return undefined;
  if (nonEmpty(fm[SMTP_PASSWORD_ENC_FIELD])) {
    return (await decrypt(fm[SMTP_PASSWORD_ENC_FIELD] as string)) ?? undefined;
  }
  // Legacy plaintext (written before encryption) until the next save.
  return nonEmpty(fm[SMTP_PASSWORD_FIELD]) ? (fm[SMTP_PASSWORD_FIELD] as string) : undefined;
}
