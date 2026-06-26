import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Webhook } from "svix";
import { getSharedPgPool, type PublicUser } from "@/lib/auth/store";
import { externalFetchTimeout } from "@/lib/retry";
import { sendMail, type MailInput } from "@/lib/mail";
import { generateTrackingId, logTrackingEvent } from "@/lib/email/tracking";
import { createSchemaInit } from "@/lib/schema-init";
import { logger } from "@/lib/logger";

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
}

export type MailFolder = "inbox" | "sent" | "archive" | "spam" | "trash";

export interface MailListFilters {
  limit?: number;
  direction?: MailDirection;
  folder?: MailFolder;
  search?: string;
  unreadOnly?: boolean;
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

import { env } from "@/lib/env";

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
]);

async function ensureMailboxReady(): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) {
    if (process.env.NODE_ENV === "production" && !allowFileMailbox) {
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

function mailboxMatchesUser(message: MailMessage, user: MailboxUser) {
  return user.role === "admin" || message.userId === user.id || message.brainId === user.brainId;
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

function mailboxBrainId(to: string[]): string | null {
  const first = to[0]?.toLowerCase() ?? "";
  const plus = first.match(/^[^+@]+\+([^@]+)@/);
  if (plus?.[1]) return plus[1].replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || null;
  return process.env.EMAIL_INBOUND_DEFAULT_BRAIN_ID || null;
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
  const apiKey = process.env.RESEND_API_KEY;
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
  const secret = process.env.RESEND_WEBHOOK_SECRET;
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
  const brainId = mailboxBrainId(to);

  const pool = getSharedPgPool();
  if (pool) {
    const { rows } = await pool.query(
      `INSERT INTO subsumio_mail_messages
        (id, provider_id, direction, status, from_email, from_name, to_emails, cc_emails, bcc_emails,
         subject, text_body, html_body, message_id, brain_id, raw, created_at, updated_at)
       VALUES ($1,$2,'inbound','received',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,now())
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
        inReplyTo: null,
        userId: null,
        brainId,
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

type MailboxUser = Pick<PublicUser, "id" | "role" | "brainId">;

export async function listMailMessages(
  user: MailboxUser,
  filters: MailListFilters = {}
): Promise<MailMessage[]> {
  await ensureMailboxReady();
  const pool = getSharedPgPool();
  if (!pool) {
    const messages = await loadLocalMailbox();
    let result = messages.filter(
      (message) =>
        mailboxMatchesUser(message, user) &&
        (!filters.direction || message.direction === filters.direction) &&
        (!filters.folder ||
          (message.folder ?? (message.direction === "outbound" ? "sent" : "inbox")) ===
            filters.folder) &&
        (!filters.unreadOnly || !message.isRead)
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
  const isAdmin = user.role === "admin";
  const direction = filters.direction;
  const folder = filters.folder;
  const search = filters.search?.trim() || null;
  const unreadOnly = filters.unreadOnly ?? false;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (!isAdmin) {
    conditions.push(`(user_id = $${paramIdx} OR brain_id = $${paramIdx + 1})`);
    params.push(user.id, user.brainId);
    paramIdx += 2;
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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(capped);

  const { rows } = await pool.query(
    `SELECT * FROM subsumio_mail_messages ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx}`,
    params
  );
  return rows.map(rowToMessage);
}

export async function getMailMessage(user: MailboxUser, id: string): Promise<MailMessage | null> {
  await ensureMailboxReady();
  const pool = getSharedPgPool();
  if (!pool) {
    const messages = await loadLocalMailbox();
    return (
      messages.find((message) => message.id === id && mailboxMatchesUser(message, user)) ?? null
    );
  }
  const isAdmin = user.role === "admin";
  const { rows } = await pool.query(
    isAdmin
      ? "SELECT * FROM subsumio_mail_messages WHERE id = $1"
      : "SELECT * FROM subsumio_mail_messages WHERE id = $1 AND (user_id = $2 OR brain_id = $3)",
    isAdmin ? [id] : [id, user.id, user.brainId]
  );
  return rows[0] ? rowToMessage(rows[0]) : null;
}

export async function sendMailboxMessage(
  user: MailboxUser,
  input: MailDraftInput
): Promise<MailMessage> {
  await ensureMailboxReady();
  const parent = input.replyToMessageId ? await getMailMessage(user, input.replyToMessageId) : null;
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
    replyTo: process.env.MAIL_REPLY_TO || process.env.MAIL_FROM,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    trackingId,
  };
  const result = await sendMail(mailInput);

  const from = parseAddress(process.env.MAIL_FROM || "Subsumio <hello@subsum.io>");
  const pool = getSharedPgPool();
  if (!pool) {
    if (process.env.NODE_ENV === "production" && !allowFileMailbox) {
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
      userId: user.id,
      brainId: user.brainId,
      raw: { provider: "resend", result, trackingId },
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
       subject, text_body, html_body, in_reply_to, user_id, brain_id, tracking_id, folder, is_read, raw, created_at, updated_at)
     VALUES ($1,$2,'outbound',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'sent',true,$16::jsonb,now(),now())
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
      user.id,
      user.brainId,
      trackingId,
      JSON.stringify({ provider: "resend", result, trackingId }),
    ]
  );
  return rowToMessage(rows[0]);
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
  user: MailboxUser,
  id: string,
  updates: { folder?: MailFolder; isRead?: boolean }
): Promise<MailMessage | null> {
  await ensureMailboxReady();
  const pool = getSharedPgPool();
  if (!pool) {
    const messages = await loadLocalMailbox();
    const msg = messages.find((m) => m.id === id && mailboxMatchesUser(m, user));
    if (!msg) return null;
    if (updates.folder !== undefined) msg.folder = updates.folder;
    if (updates.isRead !== undefined) {
      msg.isRead = updates.isRead;
      msg.readAt = updates.isRead ? new Date().toISOString() : null;
    }
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

  params.push(id);
  const isAdmin = user.role === "admin";
  const whereClause = isAdmin
    ? `id = $${idx}`
    : `id = $${idx} AND (user_id = $${idx + 1} OR brain_id = $${idx + 2})`;
  if (!isAdmin) params.push(user.id, user.brainId);

  const { rows } = await pool.query(
    `UPDATE subsumio_mail_messages SET ${sets.join(", ")} WHERE ${whereClause} RETURNING *`,
    params
  );
  return rows[0] ? rowToMessage(rows[0]) : null;
}

export async function getUnreadCounts(user: MailboxUser): Promise<Record<MailFolder, number>> {
  await ensureMailboxReady();
  const pool = getSharedPgPool();
  const empty: Record<MailFolder, number> = { inbox: 0, sent: 0, archive: 0, spam: 0, trash: 0 };
  if (!pool) {
    const messages = await loadLocalMailbox();
    for (const m of messages) {
      if (!mailboxMatchesUser(m, user)) continue;
      if (m.isRead) continue;
      const folder = m.folder ?? (m.direction === "outbound" ? "sent" : "inbox");
      empty[folder]++;
    }
    return empty;
  }
  const isAdmin = user.role === "admin";
  const { rows } = await pool.query(
    isAdmin
      ? `SELECT folder, COUNT(*) as cnt FROM subsumio_mail_messages WHERE is_read = false GROUP BY folder`
      : `SELECT folder, COUNT(*) as cnt FROM subsumio_mail_messages WHERE is_read = false AND (user_id = $1 OR brain_id = $2) GROUP BY folder`,
    isAdmin ? [] : [user.id, user.brainId]
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
