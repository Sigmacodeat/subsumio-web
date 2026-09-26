/**
 * E-mail notifications for the client portal, with double opt-in: the client
 * enters an address in the portal, gets a confirmation link, and only a
 * confirmed address is told when the firm replied. The mail carries no
 * content and no access token — only the portal's session address
 * (/portal/meine-akte); the client opens the matter with the link the firm
 * sent. Entries live on the case page (`frontmatter.portal_notify`) of the
 * firm's brain, with the time of consent; they never hold a portal token.
 */
import { createHash, randomBytes } from "node:crypto";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { sendMail, siteUrl } from "@/lib/mail";
import { withKeyedLock } from "@/lib/keyed-lock";
import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { PORTAL_SESSION_SLUG } from "@/lib/portal-session";

export interface PortalNotifyEntry {
  email: string;
  status: "pending" | "active";
  code_hash?: string;
  requested_at: string;
  confirmed_at?: string;
}

/** Unconfirmed requests kept per matter; confirmed addresses are never displaced by them. */
const MAX_PENDING = 5;
const MAX_ACTIVE = 20;
/** How long a confirmation link stays valid. */
const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/** The portal address in notification mails: no token, the session cookie opens the matter. */
export function portalNotifyLandingUrl(): string {
  return `${siteUrl()}/portal/${PORTAL_SESSION_SLUG}`;
}

// Confirmation codes → (brain, matter): the confirmation link carries only the
// random code, never the portal token.
const ensureCodeSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_portal_notify_codes (
    code_hash text PRIMARY KEY,
    brain_id text NOT NULL,
    case_slug text NOT NULL,
    expires_at timestamptz NOT NULL
  )
`);
const memoryCodes = new Map<string, { brainId: string; caseSlug: string; expiresAt: number }>();

async function saveConfirmCode(codeHash: string, brainId: string, caseSlug: string) {
  const expiresAt = Date.now() + CONFIRM_TTL_MS;
  const pool = getSharedPgPool();
  if (!pool) {
    memoryCodes.set(codeHash, { brainId, caseSlug, expiresAt });
    return;
  }
  await ensureCodeSchema();
  await pool.query(
    `INSERT INTO subsumio_portal_notify_codes (code_hash, brain_id, case_slug, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (code_hash) DO NOTHING`,
    [codeHash, brainId, caseSlug, new Date(expiresAt).toISOString()]
  );
}

/** The matter a confirmation code belongs to, or null (unknown / expired). */
export async function lookupPortalNotifyCode(
  code: string
): Promise<{ brainId: string; caseSlug: string } | null> {
  const codeHash = hash(code);
  const pool = getSharedPgPool();
  if (!pool) {
    const hit = memoryCodes.get(codeHash);
    if (!hit || hit.expiresAt < Date.now()) return null;
    return { brainId: hit.brainId, caseSlug: hit.caseSlug };
  }
  await ensureCodeSchema();
  const { rows } = await pool.query<{ brain_id: string; case_slug: string }>(
    `SELECT brain_id, case_slug FROM subsumio_portal_notify_codes
      WHERE code_hash = $1 AND expires_at > now()`,
    [codeHash]
  );
  return rows[0] ? { brainId: rows[0].brain_id, caseSlug: rows[0].case_slug } : null;
}

async function dropConfirmCode(code: string): Promise<void> {
  const codeHash = hash(code);
  const pool = getSharedPgPool();
  if (!pool) {
    memoryCodes.delete(codeHash);
    return;
  }
  await ensureCodeSchema();
  await pool.query("DELETE FROM subsumio_portal_notify_codes WHERE code_hash = $1", [codeHash]);
}

async function readEntries(
  headers: Record<string, string>,
  caseSlug: string
): Promise<PortalNotifyEntry[]> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(caseSlug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const fm = ((await res.json()) as { frontmatter?: Record<string, unknown> }).frontmatter ?? {};
  if (!Array.isArray(fm.portal_notify)) return [];
  // Older entries carried the portal link (with its token) — never keep it.
  return (fm.portal_notify as Array<PortalNotifyEntry & { path?: unknown }>).map(
    ({ path: _path, ...rest }) => rest
  );
}

async function writeEntries(
  headers: Record<string, string>,
  caseSlug: string,
  entries: PortalNotifyEntry[]
): Promise<boolean> {
  const res = await enginePatchPage(headers, {
    slug: caseSlug,
    frontmatter: { portal_notify: entries },
  });
  return res.ok;
}

/**
 * Read-modify-write of the matter's list, serialised per matter of one firm
 * (engine source header) — equal slugs in different firms don't contend.
 */
export function portalNotifyLockKey(headers: Record<string, string>, caseSlug: string): string {
  return `portal-notify:${headers["x-subsumio-source"] ?? ""}:${caseSlug}`;
}

function withNotifyLock<T>(
  headers: Record<string, string>,
  caseSlug: string,
  fn: () => Promise<T>
): Promise<T> {
  return withKeyedLock(portalNotifyLockKey(headers, caseSlug), fn);
}

/**
 * Bounds the list: every confirmed address stays (up to MAX_ACTIVE); only the
 * newest MAX_PENDING unconfirmed requests are kept.
 */
export function capPortalNotifyEntries(entries: PortalNotifyEntry[]): PortalNotifyEntry[] {
  const active = entries.filter((e) => e.status === "active").slice(-MAX_ACTIVE);
  const pending = entries.filter((e) => e.status !== "active").slice(-MAX_PENDING);
  const keep = new Set([...active, ...pending]);
  return entries.filter((e) => keep.has(e));
}

/** Records the address as pending and mails the confirmation link. */
export async function requestPortalNotify(input: {
  headers: Record<string, string>;
  brainId: string;
  caseSlug: string;
  email: string;
}): Promise<boolean> {
  const email = input.email.trim().toLowerCase();
  const code = randomBytes(24).toString("base64url");
  const saved = await withNotifyLock(input.headers, input.caseSlug, async () => {
    const current = await readEntries(input.headers, input.caseSlug);
    // A confirmed address stays confirmed; asking again changes nothing.
    if (current.some((e) => e.email === email && e.status === "active")) return "active";
    const entries = current.filter((e) => e.email !== email);
    entries.push({
      email,
      status: "pending",
      code_hash: hash(code),
      requested_at: new Date().toISOString(),
    });
    return (await writeEntries(input.headers, input.caseSlug, capPortalNotifyEntries(entries)))
      ? "pending"
      : "failed";
  });
  if (saved === "failed") return false;
  if (saved === "active") return true;
  await saveConfirmCode(hash(code), input.brainId, input.caseSlug);
  const confirm = `${siteUrl()}/api/portal/notify/confirm?code=${encodeURIComponent(code)}`;
  await sendMail({
    to: email,
    subject: "Bitte bestätigen: Benachrichtigungen aus dem Mandantenportal",
    text: `Sie möchten per E-Mail erfahren, wenn Ihre Kanzlei Ihnen im Mandantenportal antwortet.\n\nBitte bestätigen Sie das hier: ${confirm}\n\nWenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.`,
  });
  return true;
}

/** Confirms a pending address by its code. */
export async function confirmPortalNotify(
  headers: Record<string, string>,
  caseSlug: string,
  code: string
): Promise<boolean> {
  const ok = await withNotifyLock(headers, caseSlug, async () => {
    const entries = await readEntries(headers, caseSlug);
    const entry = entries.find((e) => e.status === "pending" && e.code_hash === hash(code));
    if (!entry) return false;
    entry.status = "active";
    entry.confirmed_at = new Date().toISOString();
    delete entry.code_hash;
    return writeEntries(headers, caseSlug, capPortalNotifyEntries(entries));
  });
  if (ok) await dropConfirmCode(code).catch(() => undefined);
  return ok;
}

export async function removePortalNotify(
  headers: Record<string, string>,
  caseSlug: string,
  email: string
): Promise<boolean> {
  const target = email.trim().toLowerCase();
  return withNotifyLock(headers, caseSlug, async () => {
    const entries = await readEntries(headers, caseSlug);
    return writeEntries(
      headers,
      caseSlug,
      entries.filter((e) => e.email !== target)
    );
  });
}

/** Mails every confirmed address of the matter; returns how many were sent. */
export async function mailPortalClients(
  headers: Record<string, string>,
  caseSlug: string
): Promise<number> {
  let sent = 0;
  for (const e of await readEntries(headers, caseSlug)) {
    if (e.status !== "active") continue;
    const result = await sendMail({
      to: e.email,
      subject: "Neue Nachricht Ihrer Kanzlei",
      text: `Ihre Kanzlei hat Ihnen im Mandantenportal geantwortet.\n\nZum Portal: ${portalNotifyLandingUrl()}\n(Falls das Portal nicht direkt öffnet, verwenden Sie bitte den Link, den Ihnen Ihre Kanzlei geschickt hat.)\n\nSie erhalten diese E-Mail, weil Sie Benachrichtigungen im Portal eingeschaltet haben; dort können Sie sie auch wieder abschalten.`,
    });
    if (result.sent) sent++;
  }
  return sent;
}
