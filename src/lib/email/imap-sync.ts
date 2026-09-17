// IMAP sync for a connected firm mailbox.
//
// fetch new messages → parse → store in the firm's mailbox → assign to a
// matter → triage (urgency, action, detected deadlines). Nothing is sent,
// moved or deleted on the mail server: the connection is read-only, messages
// are fetched with BODY.PEEK semantics (imapflow does not set \Seen on fetch).

import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { resolveEmailImport, type EmailHeaders } from "@/lib/email-threading";
import { triageMessage } from "@/lib/triage";
import { detectDeadlines } from "@/lib/ai-deadline-detect";
import {
  extractDeadlinesWithLLM,
  isLLMDeadlineExtractionAvailable,
} from "@/lib/llm-deadline-extract";
import { logger } from "@/lib/logger";
import {
  getMailAccountSecrets,
  recordSyncResult,
  type MailAccount,
} from "@/lib/email/imap-accounts";
import {
  setMailTriage,
  storeInboundExternalEmail,
  type ExternalInboundEmail,
} from "@/lib/email/mailbox";

const log = logger("imap-sync");

/** First sync looks back this far instead of importing the whole mailbox. */
export const FIRST_SYNC_DAYS = 14;
/** Upper bound per run so one huge mailbox cannot starve the others. */
export const MAX_MESSAGES_PER_RUN = 150;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export interface ImapConnectionConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

export interface SyncResult {
  accountId: string;
  fetched: number;
  stored: number;
  assigned: number;
  error?: string;
}

interface MatterRef {
  slug: string;
  title: string;
  case_number?: string;
  client_name?: string;
  client_slug?: string;
  opponent_name?: string;
}

function newClient(cfg: ImapConnectionConfig): ImapFlow {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
    socketTimeout: 45_000,
    greetingTimeout: 15_000,
  });
}

/** Human-readable reason for a failed login — never echoes the password. */
export function describeImapError(err: unknown): string {
  const e = err as { authenticationFailed?: boolean; code?: string; message?: string };
  if (e?.authenticationFailed) return "Anmeldung abgelehnt — Benutzername oder Passwort prüfen.";
  if (e?.code === "ENOTFOUND") return "Server nicht gefunden — Hostname prüfen.";
  if (e?.code === "ECONNREFUSED") return "Verbindung abgelehnt — Port und Verschlüsselung prüfen.";
  if (e?.code === "ETIMEDOUT" || e?.code === "ETIMEOUT")
    return "Zeitüberschreitung — Server oder Port nicht erreichbar.";
  if (/certificate|self.signed|TLS|SSL/i.test(e?.message ?? ""))
    return "TLS-Fehler — Verschlüsselungseinstellung oder Zertifikat prüfen.";
  return "Verbindung fehlgeschlagen.";
}

/** Log in, open the folder, log out. Used before an account is saved. */
export async function testImapConnection(
  cfg: ImapConnectionConfig,
  folder = "INBOX"
): Promise<{ ok: true; messages: number } | { ok: false; error: string }> {
  const client = newClient(cfg);
  try {
    await client.connect();
    const box = await client.mailboxOpen(folder, { readOnly: true });
    const messages = box.exists;
    await client.logout();
    return { ok: true, messages };
  } catch (err) {
    try {
      client.close();
    } catch {
      /* already closed */
    }
    return { ok: false, error: describeImapError(err) };
  }
}

function addresses(obj: AddressObject | AddressObject[] | undefined): string[] {
  const list = Array.isArray(obj) ? obj : obj ? [obj] : [];
  return list
    .flatMap((o) => o.value)
    .map((a) => (a.address ?? "").toLowerCase())
    .filter(Boolean);
}

/** Pure mapping from a parsed message to the mailbox input — unit tested. */
export function toInboundEmail(
  account: Pick<MailAccount, "id" | "brainId" | "email">,
  uid: number,
  mail: ParsedMail
): ExternalInboundEmail {
  const fromAddr = mail.from?.value?.[0];
  const refs = Array.isArray(mail.references)
    ? mail.references.join(" ")
    : (mail.references ?? null);
  const messageId = mail.messageId ?? null;
  return {
    providerId: `imap:${account.id}:${messageId ?? `uid-${uid}`}`,
    brainId: account.brainId,
    fromEmail: (fromAddr?.address ?? "").toLowerCase(),
    fromName: fromAddr?.name || null,
    to: addresses(mail.to),
    cc: addresses(mail.cc),
    subject: mail.subject ?? "",
    text: mail.text ?? null,
    html: typeof mail.html === "string" ? mail.html : null,
    messageId,
    inReplyTo: mail.inReplyTo ?? null,
    references: refs,
    receivedAt: (mail.date ?? new Date()).toISOString(),
    caseSlug: null,
    raw: {
      provider: "imap",
      account_id: account.id,
      account_email: account.email,
      uid,
      attachments: (mail.attachments ?? []).map((a) => ({
        filename: a.filename ?? null,
        contentType: a.contentType,
        size: a.size,
      })),
    },
  };
}

async function loadMatters(brainId: string): Promise<MatterRef[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=legal_case&limit=1000`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { pages?: Array<Record<string, unknown>> } | unknown[];
    const pages = Array.isArray(data) ? data : (data.pages ?? []);
    return (pages as Array<Record<string, unknown>>).map((p) => {
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
      return {
        slug: String(p.slug),
        title: String(p.title ?? ""),
        case_number: str(fm.case_number),
        client_name: str(fm.client_name) ?? str(fm.mandant),
        client_slug: str(fm.client_slug),
        opponent_name: str(fm.opponent_name) ?? str(fm.gegner),
      };
    });
  } catch {
    return [];
  }
}

/** Matter for a message: unique match only — ambiguous mail stays unassigned for a human. */
export function resolveMatter(email: ExternalInboundEmail, matters: MatterRef[]): string | null {
  if (matters.length === 0) return null;
  const headers: EmailHeaders = {
    subject: email.subject,
    from: email.fromEmail,
    body: email.text ?? "",
    date: email.receivedAt,
    messageId: email.messageId ?? undefined,
    inReplyTo: email.inReplyTo ?? undefined,
    references: email.references ?? undefined,
  };
  const result = resolveEmailImport(headers, matters);
  return result.status === "matched" && result.matchedCaseSlug ? result.matchedCaseSlug : null;
}

async function triageFor(
  email: ExternalInboundEmail,
  caseSlug: string | null
): Promise<Record<string, unknown>> {
  const body = email.text ?? "";
  const card = triageMessage({
    source: "email",
    subject: email.subject,
    body,
    sender: email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail,
    date: email.receivedAt,
    suggestedCaseSlug: caseSlug ?? undefined,
  });
  let deadlines = detectDeadlines(`${email.subject}\n${body}`).slice(0, 5);
  // Mail that talks about a deadline without a parseable date ("binnen vier
  // Wochen ab Zustellung") goes to the model once. Suggestions only — a lawyer
  // confirms every deadline before it enters the Fristenbuch.
  if (deadlines.length === 0 && card.actionType === "frist" && isLLMDeadlineExtractionAvailable()) {
    try {
      deadlines = (
        await extractDeadlinesWithLLM(`${email.subject}\n${body}`.slice(0, 8000), {
          headers: engineHeadersForBrain(email.brainId),
        })
      ).slice(0, 5);
    } catch {
      /* triage stays rule-based */
    }
  }
  return {
    urgency: card.urgency,
    actionType: card.actionType,
    legalArea: card.legalArea ?? null,
    summary: card.summary,
    deadline: card.deadline ?? null,
    confidence: card.confidence,
    deadlines,
    triagedAt: new Date().toISOString(),
  };
}

export async function syncImapAccount(account: MailAccount): Promise<SyncResult> {
  const result: SyncResult = { accountId: account.id, fetched: 0, stored: 0, assigned: 0 };
  const secrets = await getMailAccountSecrets(account.id);
  if (!secrets) {
    result.error = "Zugangsdaten konnten nicht entschlüsselt werden.";
    await recordSyncResult(account.id, { error: result.error });
    return result;
  }

  const client = newClient({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    user: account.imapUser,
    password: secrets.imapPassword,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(account.folder, { readOnly: true });
    try {
      const box = client.mailbox;
      const uidValidity = box && typeof box !== "boolean" ? String(box.uidValidity) : null;
      const resumable =
        account.lastUid != null && uidValidity != null && uidValidity === account.uidValidity;

      let uids: number[];
      if (resumable) {
        const found = await client.search(
          { uid: `${(account.lastUid ?? 0) + 1}:*` },
          { uid: true }
        );
        uids = (found || []).filter((u) => u > (account.lastUid ?? 0));
      } else {
        const since = new Date(Date.now() - FIRST_SYNC_DAYS * 86_400_000);
        uids = (await client.search({ since }, { uid: true })) || [];
      }
      uids.sort((a, b) => a - b);
      if (uids.length > MAX_MESSAGES_PER_RUN) uids = uids.slice(0, MAX_MESSAGES_PER_RUN);

      let maxUid = account.lastUid ?? 0;
      if (uids.length > 0) {
        const matters = await loadMatters(account.brainId);
        for await (const msg of client.fetch(
          uids,
          { uid: true, source: true, size: true },
          { uid: true }
        )) {
          result.fetched += 1;
          maxUid = Math.max(maxUid, msg.uid);
          if (!msg.source || (msg.size ?? 0) > MAX_SOURCE_BYTES) continue;
          const parsed = await simpleParser(msg.source);
          const email = toInboundEmail(account, msg.uid, parsed);
          email.caseSlug = resolveMatter(email, matters);
          const stored = await storeInboundExternalEmail(email);
          if (!stored?.created) continue;
          result.stored += 1;
          if (stored.message.caseSlug) result.assigned += 1;
          await setMailTriage(
            stored.message.id,
            await triageFor(email, stored.message.caseSlug ?? null)
          );
        }
      }
      await recordSyncResult(account.id, {
        lastUid: maxUid > 0 ? maxUid : null,
        uidValidity,
        error: null,
      });
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    try {
      client.close();
    } catch {
      /* already closed */
    }
    result.error = describeImapError(err);
    log.warn("imap sync failed", { account: account.id, reason: result.error });
    await recordSyncResult(account.id, { error: result.error });
  }
  return result;
}
