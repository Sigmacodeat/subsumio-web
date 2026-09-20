/**
 * E-mail notifications for the client portal, with double opt-in: the client
 * enters an address in the portal, gets a confirmation link, and only a
 * confirmed address is told when the firm replied. The mail carries no
 * content, only the portal link. Entries live on the case page
 * (`frontmatter.portal_notify`) of the firm's brain, with the time of consent.
 */
import { createHash, randomBytes } from "node:crypto";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { sendMail, siteUrl } from "@/lib/mail";

export interface PortalNotifyEntry {
  email: string;
  status: "pending" | "active";
  code_hash?: string;
  /** The portal page the mail links to (/portal/<token>). */
  path: string;
  requested_at: string;
  confirmed_at?: string;
}

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

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
  return Array.isArray(fm.portal_notify) ? (fm.portal_notify as PortalNotifyEntry[]) : [];
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

/** Records the address as pending and mails the confirmation link. */
export async function requestPortalNotify(input: {
  headers: Record<string, string>;
  caseSlug: string;
  token: string;
  email: string;
}): Promise<boolean> {
  const email = input.email.trim().toLowerCase();
  const code = randomBytes(24).toString("base64url");
  const path = `/portal/${encodeURIComponent(input.token)}`;
  const entries = (await readEntries(input.headers, input.caseSlug)).filter(
    (e) => e.email !== email
  );
  entries.push({
    email,
    status: "pending",
    code_hash: hash(code),
    path,
    requested_at: new Date().toISOString(),
  });
  if (!(await writeEntries(input.headers, input.caseSlug, entries.slice(-5)))) return false;
  const confirm = `${siteUrl()}/api/portal/notify/confirm?token=${encodeURIComponent(input.token)}&code=${encodeURIComponent(code)}`;
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
  const entries = await readEntries(headers, caseSlug);
  const entry = entries.find((e) => e.status === "pending" && e.code_hash === hash(code));
  if (!entry) return false;
  entry.status = "active";
  entry.confirmed_at = new Date().toISOString();
  delete entry.code_hash;
  return writeEntries(headers, caseSlug, entries);
}

export async function removePortalNotify(
  headers: Record<string, string>,
  caseSlug: string,
  email: string
): Promise<boolean> {
  const target = email.trim().toLowerCase();
  const entries = await readEntries(headers, caseSlug);
  return writeEntries(
    headers,
    caseSlug,
    entries.filter((e) => e.email !== target)
  );
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
      text: `Ihre Kanzlei hat Ihnen im Mandantenportal geantwortet.\n\nZum Portal: ${siteUrl()}${e.path}\n\nSie erhalten diese E-Mail, weil Sie Benachrichtigungen im Portal eingeschaltet haben; dort können Sie sie auch wieder abschalten.`,
    });
    if (result.sent) sent++;
  }
  return sent;
}
