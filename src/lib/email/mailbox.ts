import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Webhook } from "svix";
import { getSharedPgPool } from "@/lib/auth/store";
import { externalFetchTimeout } from "@/lib/retry";
import { sendMail, type MailInput } from "@/lib/mail";
import { generateTrackingId, logTrackingEvent } from "@/lib/email/tracking";
import { createSchemaInit } from "@/lib/schema-init";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { getMailAccountSecrets, getSendingAccount } from "@/lib/email/imap-accounts";

const log = logger("mailbox");

export type MailDirection = "inbound" | "outbound";
export type MailStatus = "received" | "sent" | "failed";

export type TrackingStatus = "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained";

export interface MailMessage {
  id: string;
  providerId: string | null;
  direction: MailDirection;
  status: MailStatus;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
  text: string | null;
  html: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  userId: string | null;
  brainId: string | null;
  /** Matter this message is filed under (null = unassigned). */
  caseSlug?: string | null;
  raw: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  trackingId?: string | null;
  trackingStatus?: TrackingStatus;
  firstOpenedAt?: string | null;
  lastOpenedAt?: string | null;
  openCount?: number;
  clickCount?: number;
  forwarded?: boolean;
  folder?: MailFolder;
  isRead?: boolean;
  readAt?: string | null;
}

export interface MailDraftInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  replyToMessageId?: string;
  /** File the sent message under this matter. Replies inherit the parent's matter. */
  caseSlug?: string;
}

export type MailFolder = "inbox" | "sent" | "archive" | "spam" | "trash";

export interface MailListFilters {
  limit?: number;
  direction?: MailDirection;
  folder?: MailFolder;
  search?: string;
  unreadOnly?: boolean;
  /** Only messages filed under this matter. */
  caseSlug?: string;
}

/**
 * Whose mail a request may see. Mail belongs to a firm brain: every member of
 * the firm sees the firm's mail, plus messages they sent themselves. There is
 * deliberately no role-based bypass — a firm admin must never see other firms'
 * correspondence. The operator support mailbox is just another brain scope
 * (see src/lib/email/mailbox-scope.ts).
 */
export interface MailboxScope {
  userId: string;
  brainId: string;
}

interface ResendReceivedEmail {
  id?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  text?: string | null;
  html?: string | null;
  message_id?: string;
  headers?: Record<string, string>;
  attachments?: unknown[];
  created_at?: string;
}

interface ResendWebhookEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    message_id?: string;
    created_at?: string;
  };
}

const MAILBOX_DATA_DIR = env("SUBSUMIO_DATA_DIR") || path.join(process.cwd(), ".data");
const MAILBOX_FILE = path.join(MAILBOX_DATA_DIR, "mailbox.json");
const allowFileMailbox = env("SUBSUMIO_ALLOW_FILE_MAILBOX_IN_PRODUCTION") === "true";

let mailboxCache: MailMessage[] | null = null;
let mailboxWriteQueue: Promise<void> = Promise.resolve();

const ensureMailboxSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_mail_messages (
    id text PRIMARY KEY,
    provider_id text UNIQUE,
    direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    status text NOT NULL CHECK (status IN ('received', 'sent', 'failed')),
    from_email text NOT NULL,
    from_name text,
    to_emails text[] NOT NULL DEFAULT '{}',
    cc_emails text[] NOT NULL DEFAULT '{}',
    bcc_emails text[] NOT NULL DEFAULT '{}',
    subject text NOT NULL DEFAULT '',
    text_body text,
    html_body text,
    message_id text,
    in_reply_to text,
    user_id text,
    brain_id text,
    raw jsonb NOT NULL DEFAULT '{}'::jsonb,
    folder text NOT NULL DEFAULT 'inbox',
    is_read boolean NOT NULL DEFAULT false,
    read_at timestamptz,
    tracking_id text,
    tracking_status text,
    first_opened_at timestamptz,
    last_opened_at timestamptz,
    open_count integer NOT NULL DEFAULT 0,
    click_count integer NOT NULL DEFAULT 0,
    forwarded boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  "CREATE INDEX IF NOT EXISTS subsumio_mail_messages_user_idx ON subsumio_mail_messages (user_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS subsumio_mail_messages_brain_idx ON subsumio_mail_messages (brain_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS subsumio_mail_messages_message_id_idx ON subsumio_mail_messages (message_id)",
  "CREATE INDEX IF NOT EXISTS subsumio_mail_messages_folder_idx ON subsumio_mail_messages (folder, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS subsumio_mail_messages_is_read_idx ON subsumio_mail_messages (is_read) WHERE is_read = false",
  "CREATE INDEX IF NOT EXISTS subsumio_mail_messages_tracking_id_idx ON subsumio_mail_messages (tracking_id) WHERE tracking_id IS NOT NULL",
  // Migration: add columns if they don't exist (for existing databases)
  "ALTER TABLE subsumio_mail_messages ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'inbox'",
  "ALTER TABLE subsumio_mail_messages ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false",
  "ALTER TABLE subsumio_mail_messages ADD COLUMN IF NOT EXISTS read_at timestamptz",
  "ALTER TABLE subsumio_mail_messages ADD COLUMN IF NOT EXISTS tracking_id text",
  "ALTER TABLE subsumio_mail_messages ADD COLUMN IF NOT EXISTS tracking_status text",
  "ALTER TABLE subsumio_mail_messages ADD COLUMN IF NOT EXISTS first_opened_at timestamptz",
  "ALTER TABLE subsumio_mail_messages ADD COLUMN IF NOT EXISTS last_opened_at timestamptz",
  "ALTER TABLE subsumio_mail_messages ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0",
  "ALTER TABLE subsumio_mail_messages ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0",
  "ALTER TABLE subsumio_mail_messages ADD COLUMN IF NOT EXISTS forwarded boolean NOT NULL DEFAULT false",
  "ALTER TABLE subsumio_mail_messages ADD COLUMN IF NOT EXISTS case_slug text",
  "CREATE INDEX IF NOT EXISTS subsumio_mail_messages_case_idx ON subsumio_mail_messages (brain_id, case_slug, created_at DESC) WHERE case_slug IS NOT NULL",
]);

async function ensureMailboxReady(): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) {
    if (env("NODE_ENV") === "production" && !allowFileMailbox) {
      throw new Error("mailbox_database_not_configured");
    }
    return;
  }
  await ensureMailboxSchema();
}

async function loadLocalMailbox(): Promise<MailMessage[]> {
  if (mailboxCache) return mailboxCache;
  try {
    const raw = await fs.readFile(MAILBOX_FILE, "utf8");
    mailboxCache = JSON.parse(raw) as MailMessage[];
  } catch {
    mailboxCache = [];
  }
  return mailboxCache;
}

async function persistLocalMailbox(messages: MailMessage[]): Promise<void> {
  mailboxCache = messages;
  mailboxWriteQueue = mailboxWriteQueue.then(async () => {
    await fs.mkdir(MAILBOX_DATA_DIR, { recursive: true });
    const tmp = `${MAILBOX_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(messages, null, 2), "utf8");
    await fs.rename(tmp, MAILBOX_FILE);
  });
  return mailboxWriteQueue;
}

function rowToMessage(row: Record<string, unknown>): MailMessage {
  return {
    id: String(row.id),
    providerId: row.provider_id ? String(row.provider_id) : null,
    direction: row.direction as MailDirection,
    status: row.status as MailStatus,
    fromEmail: String(row.from_email ?? ""),
    fromName: row.from_name ? String(row.from_name) : null,
    toEmails: Array.isArray(row.to_emails) ? row.to_emails.map(String) : [],
    ccEmails: Array.isArray(row.cc_emails) ? row.cc_emails.map(String) : [],
    bccEmails: Array.isArray(row.bcc_emails) ? row.bcc_emails.map(String) : [],
    subject: String(row.subject ?? ""),
    text: row.text_body ? String(row.text_body) : null,
    html: row.html_body ? String(row.html_body) : null,
    messageId: row.message_id ? String(row.message_id) : null,
    inReplyTo: row.in_reply_to ? String(row.in_reply_to) : null,
    userId: row.user_id ? String(row.user_id) : null,
    brainId: row.brain_id ? String(row.brain_id) : null,
    caseSlug: row.case_slug ? String(row.case_slug) : null,
    raw: (row.raw && typeof row.raw === "object" ? row.raw : {}) as Record<string, unknown>,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    trackingId: row.tracking_id ? String(row.tracking_id) : null,
    trackingStatus: row.tracking_status as TrackingStatus | undefined,
    firstOpenedAt: row.first_opened_at ? new Date(String(row.first_opened_at)).toISOString() : null,
    lastOpenedAt: row.last_opened_at ? new Date(String(row.last_opened_at)).toISOString() : null,
    openCount: typeof row.open_count === "number" ? row.open_count : undefined,
    clickCount: typeof row.click_count === "number" ? row.click_count : undefined,
    forwarded: typeof row.forwarded === "boolean" ? row.forwarded : undefined,
    folder: (row.folder as MailFolder) ?? "inbox",
    isRead: typeof row.is_read === "boolean" ? row.is_read : false,
    readAt: row.read_at ? new Date(String(row.read_at)).toISOString() : null,
  };
}

function localSort(messages: MailMessage[]) {
  return [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function mailboxMatchesScope(message: MailMessage, scope: MailboxScope) {
  return message.brainId === scope.brainId || message.userId === scope.userId;
}

function headerValue(headers: Record<string, string> | undefined, name: string): string | null {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  const value = key ? headers[key]?.trim() : "";
  return value || null;
}

function parseAddress(input: string | undefined): { email: string; name: string | null } {
  const raw = (input ?? "").trim();
  const angle = raw.match(/^(.*?)<([^>]+)>$/);
  if (angle)
    return {
      name: angle[1].trim().replace(/^"|"$/g, "") || null,
      email: angle[2].trim().toLowerCase(),
    };
  return { email: raw.toLowerCase(), name: null };
}

/** Brain id that holds the Subsumio support mailbox (unaddressed inbound mail). */
export function supportMailboxBrainId(): string {
  return env("EMAIL_INBOUND_DEFAULT_BRAIN_ID") || "subsumio-support";
}

function baseMailboxAddress(): string {
  const raw = (env("MAIL_REPLY_TO") || env("MAIL_FROM") || "Subsumio <hello@subsum.io>").trim();
  const angle = raw.match(/<([^>]+)>/);
  return (angle ? angle[1] : raw).trim().toLowerCase();
}

/**
 * Inbound address of a firm: plus-addressing on the shared mailbox
 * (hello+<brainId>@domain). Mail sent there — including client replies to
 * messages sent from Subsumio — is routed to that firm's brain.
 */
export function mailboxAddressForBrain(brainId: string): string {
  const base = baseMailboxAddress();
  if (brainId === supportMailboxBrainId()) return base;
  const at = base.indexOf("@");
  if (at <= 0) return base;
  const local = base.slice(0, at).split("+")[0];
  const safeBrain = brainId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return safeBrain ? `${local}+${safeBrain}${base.slice(at)}` : base;
}

function mailboxBrainId(recipients: string[]): string | null {
  for (const recipient of recipients) {
    const address = parseAddress(recipient).email;
    const plus = address.match(/^[^+@]+\+([^@]+)@/);
    const brain = plus?.[1]?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    if (brain) return brain;
  }
  return supportMailboxBrainId();
}

export function normalizeMailRecipients(value: unknown, field: string): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const recipients = raw.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  if (recipients.length === 0 && field === "to") throw new Error("to_required");
  const invalid = recipients.find((item) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
  if (invalid) throw new Error(`${field}_invalid`);
  return recipients;
}

export function buildMailDraft(body: unknown, replyToMessageId?: string): MailDraftInput {
  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const subject = String(payload.subject ?? "")
    .trim()
    .slice(0, 500);
  const text = typeof payload.text === "string" ? payload.text.trim().slice(0, 100_000) : "";
  const html = typeof payload.html === "string" ? payload.html.trim().slice(0, 500_000) : "";
  if (!subject) throw new Error("subject_required");
  if (!text && !html) throw new Error("body_required");
  const to = normalizeMailRecipients(payload.to, "to");
  if (to.length > 50) throw new Error("too_many_recipients");
  const cc = normalizeMailRecipients(payload.cc, "cc");
  const bcc = normalizeMailRecipients(payload.bcc, "bcc");
  if (cc.length + bcc.length > 50) throw new Error("too_many_recipients");
  return {
    to,
    cc,
    bcc,
    subject,
    text: text || undefined,
    html: html || undefined,
    replyToMessageId:
      replyToMessageId ??
      (typeof payload.replyToMessageId === "string"
        ? payload.replyToMessageId.slice(0, 200)
        : undefined),
  };
}

async function fetchReceivedEmail(emailId: string): Promise<ResendReceivedEmail | null> {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) return null;
  const res = await fetch(
    `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: externalFetchTimeout(),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    log.error("failed to retrieve received email", {
      emailId,
      status: res.status,
      detail: detail.slice(0, 200),
    });
    return null;
  }
  return (await res.json().catch(() => null)) as ResendReceivedEmail | null;
}

export function verifyResendWebhook(payload: string, headers: Headers): ResendWebhookEvent {
  const secret = env("RESEND_WEBHOOK_SECRET");
  if (!secret) throw new Error("resend_webhook_secret_not_configured");
  const wh = new Webhook(secret);
  return wh.verify(payload, {
    "svix-id": headers.get("svix-id") ?? "",
    "svix-timestamp": headers.get("svix-timestamp") ?? "",
    "svix-signature": headers.get("svix-signature") ?? "",
  }) as ResendWebhookEvent;
}

export async function storeInboundResendEmail(
  event: ResendWebhookEvent
): Promise<MailMessage | null> {
  if (event.type !== "email.received") return null;
  await ensureMailboxReady();
  const emailId = event.data?.email_id;
  const full = emailId ? await fetchReceivedEmail(emailId) : null;
  const from = parseAddress(full?.from ?? event.data?.from);
  const to = full?.to ?? event.data?.to ?? [];
  const cc = full?.cc ?? event.data?.cc ?? [];
  const bcc = full?.bcc ?? event.data?.bcc ?? [];
  const messageId = full?.message_id ?? event.data?.message_id ?? null;
  const createdAt =
    full?.created_at ?? event.data?.created_at ?? event.created_at ?? new Date().toISOString();
  const raw = { event, received: full };
  const brainId = mailboxBrainId([...to, ...cc]);
  const inReplyTo = headerValue(full?.headers, "in-reply-to");

  const pool = getSharedPgPool();
  if (pool) {
    let caseSlug: string | null = null;
    if (inReplyTo && brainId) {
      const parent = await pool.query(
        `SELECT case_slug FROM subsumio_mail_messages
          WHERE brain_id = $1 AND case_slug IS NOT NULL
            AND (message_id = $2 OR (provider_id IS NOT NULL AND position(provider_id in $2) > 0))
          ORDER BY created_at DESC LIMIT 1`,
        [brainId, inReplyTo]
      );
      caseSlug = parent.rows[0]?.case_slug ? String(parent.rows[0].case_slug) : null;
    }
    const { rows } = await pool.query(
      `INSERT INTO subsumio_mail_messages
        (id, provider_id, direction, status, from_email, from_name, to_emails, cc_emails, bcc_emails,
         subject, text_body, html_body, message_id, brain_id, raw, created_at, updated_at, in_reply_to, case_slug)
       VALUES ($1,$2,'inbound','received',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,now(),$15,$16)
       ON CONFLICT (provider_id) DO UPDATE
         SET raw = EXCLUDED.raw,
             text_body = COALESCE(EXCLUDED.text_body, subsumio_mail_messages.text_body),
             html_body = COALESCE(EXCLUDED.html_body, subsumio_mail_messages.html_body),
             updated_at = now()
       RETURNING *`,
      [
        randomUUID(),
        emailId ?? messageId,
        from.email || "unknown",
        from.name,
        to,
        cc,
        bcc,
        full?.subject ?? event.data?.subject ?? "",
        full?.text ?? null,
        full?.html ?? null,
        messageId,
        brainId,
        JSON.stringify(raw),
        createdAt,
        inReplyTo,
        caseSlug,
      ]
    );
    return rowToMessage(rows[0]);
  }

  if (process.env.NODE_ENV === "production" && !allowFileMailbox) {
    throw new Error("mailbox_database_not_configured");
  }
  const messages = await loadLocalMailbox();
  const existing = emailId ? messages.find((m) => m.providerId === emailId) : null;
  const next: MailMessage = existing
    ? { ...existing }
    : {
        id: randomUUID(),
        providerId: emailId ?? messageId ?? null,
        direction: "inbound",
        status: "received",
        fromEmail: from.email || "unknown",
        fromName: from.name,
        toEmails: to,
        ccEmails: cc,
        bccEmails: bcc,
        subject: full?.subject ?? event.data?.subject ?? "",
        text: full?.text ?? null,
        html: full?.html ?? null,
        messageId,
        inReplyTo,
        userId: null,
        brainId,
        caseSlug: inReplyTo
          ? (messages.find(
              (m) =>
                m.brainId === brainId &&
                m.caseSlug &&
                (m.messageId === inReplyTo || (m.providerId && inReplyTo.includes(m.providerId)))
            )?.caseSlug ?? null)
          : null,
        raw: raw as Record<string, unknown>,
        createdAt,
        updatedAt: new Date().toISOString(),
        folder: "inbox",
        isRead: false,
      };
  if (existing) {
    next.raw = raw as Record<string, unknown>;
    next.text = full?.text ?? existing.text;
    next.html = full?.html ?? existing.html;
    next.updatedAt = new Date().toISOString();
  } else {
    messages.push(next);
  }
  await persistLocalMailbox(messages);
  return next;
}

export async function listMailMessages(
  scope: MailboxScope,
  filters: MailListFilters = {}
): Promise<MailMessage[]> {
  await ensureMailboxReady();
  const pool = getSharedPgPool();
  if (!pool) {
    const messages = await loadLocalMailbox();
    let result = messages.filter(
      (message) =>
        mailboxMatchesScope(message, scope) &&
        (!filters.direction || message.direction === filters.direction) &&
        (!filters.folder ||
          (message.folder ?? (message.direction === "outbound" ? "sent" : "inbox")) ===
            filters.folder) &&
        (!filters.unreadOnly || !message.isRead) &&
        (!filters.caseSlug || message.caseSlug === filters.caseSlug)
    );
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (m) =>
          m.subject.toLowerCase().includes(q) ||
          m.fromEmail.toLowerCase().includes(q) ||
          (m.fromName?.toLowerCase().includes(q) ?? false) ||
          (m.text?.toLowerCase().includes(q) ?? false) ||
          (m.html?.toLowerCase().includes(q) ?? false)
      );
    }
    return localSort(result).slice(0, Math.max(1, Math.min(filters.limit ?? 50, 200)));
  }
  const capped = Math.max(1, Math.min(filters.limit ?? 50, 200));
  const direction = filters.direction;
  const folder = filters.folder;
  const search = filters.search?.trim() || null;
  const unreadOnly = filters.unreadOnly ?? false;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  conditions.push(`(brain_id = $${paramIdx} OR user_id = $${paramIdx + 1})`);
  params.push(scope.brainId, scope.userId);
  paramIdx += 2;
  if (filters.caseSlug) {
    conditions.push(`case_slug = $${paramIdx}`);
    params.push(filters.caseSlug);
    paramIdx++;
  }
  if (direction) {
    conditions.push(`direction = $${paramIdx}`);
    params.push(direction);
    paramIdx++;
  }
  if (folder) {
    conditions.push(`folder = $${paramIdx}`);
    params.push(folder);
    paramIdx++;
  }
  if (unreadOnly) {
    conditions.push(`is_read = false`);
  }
  if (search) {
    conditions.push(`(
      subject ILIKE $${paramIdx} OR
      from_email ILIKE $${paramIdx} OR
      from_name ILIKE $${paramIdx} OR
      text_body ILIKE $${paramIdx} OR
      html_body ILIKE $${paramIdx}
    )`);
    params.push(`%${search}%`);
    paramIdx++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  params.push(capped);

  const { rows } = await pool.query(
    `SELECT * FROM subsumio_mail_messages ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx}`,
    params
  );
  return rows.map(rowToMessage);
}

export async function getMailMessage(scope: MailboxScope, id: string): Promise<MailMessage | null> {
  await ensureMailboxReady();
  const pool = getSharedPgPool();
  if (!pool) {
    const messages = await loadLocalMailbox();
    return (
      messages.find((message) => message.id === id && mailboxMatchesScope(message, scope)) ?? null
    );
  }
  const { rows } = await pool.query(
    "SELECT * FROM subsumio_mail_messages WHERE id = $1 AND (brain_id = $2 OR user_id = $3)",
    [id, scope.brainId, scope.userId]
  );
  return rows[0] ? rowToMessage(rows[0]) : null;
}

export async function sendMailboxMessage(
  scope: MailboxScope,
  input: MailDraftInput
): Promise<MailMessage> {
  await ensureMailboxReady();
  const parent = input.replyToMessageId
    ? await getMailMessage(scope, input.replyToMessageId)
    : null;
  if (input.replyToMessageId && !parent) throw new Error("reply_parent_not_found");
  const caseSlug = input.caseSlug ?? parent?.caseSlug ?? null;
  const headers: Record<string, string> = {};
  if (parent?.messageId) headers["In-Reply-To"] = parent.messageId;

  const trackingId = generateTrackingId();

  const mailInput: MailInput = {
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: parent && !/^re:/i.test(input.subject) ? `Re: ${input.subject}` : input.subject,
    text: input.text,
    html: input.html,
    replyTo: mailboxAddressForBrain(scope.brainId),
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    trackingId,
  };
  // A connected firm mailbox sends through its own SMTP server: the client sees
  // the firm's address, replies thread correctly and land back in that mailbox.
  const account = await getSendingAccount(scope.brainId).catch(() => null);
  let result: { sent: boolean; id?: string; error?: string };
  let provider = "resend";
  let from = parseAddress(env("MAIL_FROM") || "Subsumio <hello@subsum.io>");
  if (account?.smtpHost) {
    provider = "smtp";
    from = { email: account.email, name: account.label || null };
    result = await sendViaAccountSmtp(account, mailInput, parent);
  } else {
    result = await sendMail(mailInput);
  }

  const pool = getSharedPgPool();
  if (!pool) {
    if (env("NODE_ENV") === "production" && !allowFileMailbox) {
      throw new Error("mailbox_database_not_configured");
    }
    const messages = await loadLocalMailbox();
    const next: MailMessage = {
      id: randomUUID(),
      providerId: result.id ?? null,
      direction: "outbound",
      status: result.sent ? "sent" : "failed",
      fromEmail: from.email,
      fromName: from.name,
      toEmails: input.to,
      ccEmails: input.cc ?? [],
      bccEmails: input.bcc ?? [],
      subject: mailInput.subject,
      text: input.text ?? null,
      html: input.html ?? null,
      messageId: result.id ?? null,
      inReplyTo: parent?.messageId ?? null,
      userId: scope.userId,
      brainId: scope.brainId,
      caseSlug,
      raw: { provider, result, trackingId },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      folder: "sent",
      isRead: true,
    } as MailMessage & { trackingId?: string };
    (next as unknown as Record<string, unknown>).trackingId = trackingId;
    messages.push(next);
    await persistLocalMailbox(messages);
    return next;
  }
  const { rows } = await pool.query(
    `INSERT INTO subsumio_mail_messages
      (id, provider_id, direction, status, from_email, from_name, to_emails, cc_emails, bcc_emails,
       subject, text_body, html_body, in_reply_to, user_id, brain_id, tracking_id, folder, is_read, raw, case_slug, created_at, updated_at)
     VALUES ($1,$2,'outbound',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'sent',true,$16::jsonb,$17,now(),now())
     RETURNING *`,
    [
      randomUUID(),
      result.id ?? null,
      result.sent ? "sent" : "failed",
      from.email,
      from.name,
      input.to,
      input.cc ?? [],
      input.bcc ?? [],
      mailInput.subject,
      input.text ?? null,
      input.html ?? null,
      parent?.messageId ?? null,
      scope.userId,
      scope.brainId,
      trackingId,
      JSON.stringify({ provider, result, trackingId }),
      caseSlug,
    ]
  );
  return rowToMessage(rows[0]);
}

async function sendViaAccountSmtp(
  account: NonNullable<Awaited<ReturnType<typeof getSendingAccount>>>,
  mail: MailInput,
  parent: MailMessage | null
): Promise<{ sent: boolean; id?: string; error?: string }> {
  try {
    const secrets = await getMailAccountSecrets(account.id);
    if (!secrets?.smtpPassword) return { sent: false, error: "smtp_credentials_missing" };
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: account.smtpHost ?? undefined,
      port: account.smtpPort ?? 465,
      secure: account.smtpSecure,
      auth: { user: account.smtpUser ?? account.imapUser, pass: secrets.smtpPassword },
    });
    const parentRefs =
      typeof parent?.raw?.references === "string" ? String(parent.raw.references) : "";
    const references = [parentRefs, parent?.messageId ?? ""].filter(Boolean).join(" ").trim();
    const info = await transport.sendMail({
      from: account.label
        ? `"${account.label.replace(/"/g, "")}" <${account.email}>`
        : account.email,
      to: mail.to,
      cc: mail.cc,
      bcc: mail.bcc,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      inReplyTo: parent?.messageId ?? undefined,
      references: references || undefined,
    });
    return { sent: true, id: info.messageId };
  } catch (err) {
    log.error("smtp send failed", err instanceof Error ? err.message : String(err));
    return { sent: false, error: "smtp_send_failed" };
  }
}

/* ── Mail fetched from a connected mailbox (IMAP) ───────────────────────── */

export interface ExternalInboundEmail {
  /** Stable dedupe key, e.g. `imap:<account>:<message-id>`. */
  providerId: string;
  brainId: string;
  fromEmail: string;
  fromName: string | null;
  to: string[];
  cc: string[];
  subject: string;
  text: string | null;
  html: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  receivedAt: string;
  /** Matter resolved by the caller (subject/party matching); replies inherit the parent's. */
  caseSlug: string | null;
  raw: Record<string, unknown>;
}

/**
 * Store one fetched message. Returns `created: false` when the message was
 * already stored (same provider id) — the caller must not triage it twice.
 */
export async function storeInboundExternalEmail(
  input: ExternalInboundEmail
): Promise<{ message: MailMessage; created: boolean } | null> {
  await ensureMailboxReady();
  const pool = getSharedPgPool();
  if (!pool) {
    if (process.env.NODE_ENV === "production" && !allowFileMailbox) {
      throw new Error("mailbox_database_not_configured");
    }
    const messages = await loadLocalMailbox();
    const existing = messages.find((m) => m.providerId === input.providerId);
    if (existing) return { message: existing, created: false };
    const parentCase = input.inReplyTo
      ? (messages.find((m) => m.messageId === input.inReplyTo && m.caseSlug)?.caseSlug ?? null)
      : null;
    const next: MailMessage = {
      id: randomUUID(),
      providerId: input.providerId,
      direction: "inbound",
      status: "received",
      fromEmail: input.fromEmail || "unknown",
      fromName: input.fromName,
      toEmails: input.to,
      ccEmails: input.cc,
      bccEmails: [],
      subject: input.subject,
      text: input.text,
      html: input.html,
      messageId: input.messageId,
      inReplyTo: input.inReplyTo,
      userId: null,
      brainId: input.brainId,
      caseSlug: parentCase ?? input.caseSlug,
      raw: { ...input.raw, references: input.references },
      createdAt: input.receivedAt,
      updatedAt: new Date().toISOString(),
      folder: "inbox",
      isRead: false,
    };
    messages.push(next);
    await persistLocalMailbox(messages);
    return { message: next, created: true };
  }

  let caseSlug = input.caseSlug;
  if (input.inReplyTo) {
    const parent = await pool.query(
      `SELECT case_slug FROM subsumio_mail_messages
        WHERE brain_id = $1 AND case_slug IS NOT NULL AND message_id = $2
        ORDER BY created_at DESC LIMIT 1`,
      [input.brainId, input.inReplyTo]
    );
    if (parent.rows[0]?.case_slug) caseSlug = String(parent.rows[0].case_slug);
  }
  const { rows } = await pool.query(
    `INSERT INTO subsumio_mail_messages
      (id, provider_id, direction, status, from_email, from_name, to_emails, cc_emails, bcc_emails,
       subject, text_body, html_body, message_id, brain_id, raw, created_at, updated_at, in_reply_to, case_slug)
     VALUES ($1,$2,'inbound','received',$3,$4,$5,$6,'{}',$7,$8,$9,$10,$11,$12::jsonb,$13,now(),$14,$15)
     ON CONFLICT (provider_id) DO NOTHING
     RETURNING *`,
    [
      randomUUID(),
      input.providerId,
      input.fromEmail || "unknown",
      input.fromName,
      input.to,
      input.cc,
      input.subject,
      input.text,
      input.html,
      input.messageId,
      input.brainId,
      JSON.stringify({ ...input.raw, references: input.references }),
      input.receivedAt,
      input.inReplyTo,
      caseSlug,
    ]
  );
  if (rows[0]) return { message: rowToMessage(rows[0]), created: true };
  const existing = await pool.query(
    "SELECT * FROM subsumio_mail_messages WHERE provider_id = $1 LIMIT 1",
    [input.providerId]
  );
  return existing.rows[0] ? { message: rowToMessage(existing.rows[0]), created: false } : null;
}

/** Attach the AI triage result to a stored message (kept in `raw.triage`). */
export async function setMailTriage(id: string, triage: Record<string, unknown>): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) {
    const messages = await loadLocalMailbox();
    const m = messages.find((x) => x.id === id);
    if (!m) return;
    m.raw = { ...m.raw, triage };
    await persistLocalMailbox(messages);
    return;
  }
  await pool.query(
    `UPDATE subsumio_mail_messages
        SET raw = raw || jsonb_build_object('triage', $2::jsonb), updated_at = now()
      WHERE id = $1`,
    [id, JSON.stringify(triage)]
  );
}

/**
 * Handle Resend webhook events for tracking (delivered, bounced, complained).
 * Returns true if the event was processed, false if it was not a tracking event.
 */
export async function handleResendTrackingEvent(event: ResendWebhookEvent): Promise<boolean> {
  const type = event.type;
  if (type !== "email.delivered" && type !== "email.bounced" && type !== "email.complained") {
    return false;
  }

  const emailId = event.data?.email_id ?? null;
  const subject = event.data?.subject ?? "";
  const to = event.data?.to ?? [];
  const createdAt = event.data?.created_at ?? event.created_at ?? new Date().toISOString();

  // Look up the message by provider_id to get the tracking_id
  const pool = getSharedPgPool();
  if (!pool) {
    log.info("Resend webhook (no DB — skipping)", { type, emailId });
    return true;
  }

  await ensureMailboxReady();

  try {
    const { rows } = await pool.query(
      "SELECT id, tracking_id FROM subsumio_mail_messages WHERE provider_id = $1",
      [emailId]
    );

    const messageId = rows[0]?.id ?? null;
    const trackingId = rows[0]?.tracking_id ?? null;

    const eventType =
      type === "email.delivered"
        ? "delivered"
        : type === "email.bounced"
          ? "bounced"
          : "complained";

    if (trackingId) {
      await logTrackingEvent({
        messageId: messageId ?? undefined,
        trackingId,
        eventType,
        raw: { source: "resend_webhook", event, subject, to, emailId, createdAt },
      });
    } else {
      // No tracking_id found — still update the message status
      if (messageId) {
        await pool.query(
          "UPDATE subsumio_mail_messages SET tracking_status = $2, updated_at = now() WHERE id = $1",
          [messageId, eventType]
        );
      }
      log.info("Resend webhook — no tracking_id found, status updated only", { type, emailId });
    }

    return true;
  } catch (err) {
    log.error("failed to handle Resend webhook", {
      type,
      error: err instanceof Error ? err.message : String(err),
    });
    return true; // Still return true to avoid re-processing
  }
}

export async function updateMailMessage(
  scope: MailboxScope,
  id: string,
  updates: { folder?: MailFolder; isRead?: boolean; caseSlug?: string | null }
): Promise<MailMessage | null> {
  await ensureMailboxReady();
  const pool = getSharedPgPool();
  if (!pool) {
    const messages = await loadLocalMailbox();
    const msg = messages.find((m) => m.id === id && mailboxMatchesScope(m, scope));
    if (!msg) return null;
    if (updates.folder !== undefined) msg.folder = updates.folder;
    if (updates.isRead !== undefined) {
      msg.isRead = updates.isRead;
      msg.readAt = updates.isRead ? new Date().toISOString() : null;
    }
    if (updates.caseSlug !== undefined) msg.caseSlug = updates.caseSlug;
    msg.updatedAt = new Date().toISOString();
    await persistLocalMailbox(messages);
    return msg;
  }
  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.folder !== undefined) {
    sets.push(`folder = $${idx}`);
    params.push(updates.folder);
    idx++;
  }
  if (updates.isRead !== undefined) {
    sets.push(`is_read = $${idx}`);
    params.push(updates.isRead);
    idx++;
    if (updates.isRead) {
      sets.push(`read_at = now()`);
    } else {
      sets.push(`read_at = NULL`);
    }
  }
  if (updates.caseSlug !== undefined) {
    sets.push(`case_slug = $${idx}`);
    params.push(updates.caseSlug);
    idx++;
  }

  params.push(id, scope.brainId, scope.userId);
  const whereClause = `id = $${idx} AND (brain_id = $${idx + 1} OR user_id = $${idx + 2})`;

  const { rows } = await pool.query(
    `UPDATE subsumio_mail_messages SET ${sets.join(", ")} WHERE ${whereClause} RETURNING *`,
    params
  );
  return rows[0] ? rowToMessage(rows[0]) : null;
}

export async function getUnreadCounts(scope: MailboxScope): Promise<Record<MailFolder, number>> {
  await ensureMailboxReady();
  const pool = getSharedPgPool();
  const empty: Record<MailFolder, number> = { inbox: 0, sent: 0, archive: 0, spam: 0, trash: 0 };
  if (!pool) {
    const messages = await loadLocalMailbox();
    for (const m of messages) {
      if (!mailboxMatchesScope(m, scope)) continue;
      if (m.isRead) continue;
      const folder = m.folder ?? (m.direction === "outbound" ? "sent" : "inbox");
      empty[folder]++;
    }
    return empty;
  }
  const { rows } = await pool.query(
    `SELECT folder, COUNT(*) as cnt FROM subsumio_mail_messages WHERE is_read = false AND (brain_id = $1 OR user_id = $2) GROUP BY folder`,
    [scope.brainId, scope.userId]
  );
  for (const row of rows) {
    const folder = row.folder as MailFolder;
    if (folder in empty) empty[folder] = parseInt(row.cnt, 10);
  }
  return empty;
}

export function getMailSnippet(message: MailMessage, maxLen = 120): string {
  const body = message.text || message.html || "";
  const stripped = body
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + "…" : stripped;
}
