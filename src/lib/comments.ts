/**
 * Kommentar-Thread System für Subsumio.
 * Kommentare werden als Brain-Pages vom Typ "comment" gespeichert,
 * mit Verknüpfung zu einer Parent-Page (case, evidence, deadline, time_entry).
 *
 * Features:
 *   - Reply-Struktur via parentId (Nested Threads)
 *   - @mention Parsing + Notification-Creation
 *   - Soft-Delete (Author oder Admin)
 *
 * Schema:
 *   slug: comment/{parentSlug}/{timestamp}
 *   type: "comment"
 *   frontmatter:
 *     parent_slug: string
 *     parent_type: string
 *     author_id: string
 *     author_name: string
 *     thread_id: string (für Nested Replies)
 *     parent_comment_id: string (optional — für Replies auf Kommentare)
 *     content: string
 *     deleted_at: string (optional — Soft-Delete)
 *     mentions: string[] (optional — @mentioned usernames)
 */

import { getEnginePage, writeEnginePage, type EngineHeaders } from "./engine-page-io";
import { listEnginePages } from "./engine-pages";
import { getSharedPgPool } from "./auth/store";
import { env } from "./env";
import { createSchemaInit } from "@/lib/schema-init";
import { promises as fs } from "node:fs";
import path from "node:path";

import { logger } from "@/lib/logger";
const log = logger("lib/comments");

// Simple serialization queue for file-based notification writes (dev mode)
class AsyncQueue {
  private tail: Promise<void> = Promise.resolve();
  async run<T>(task: () => Promise<T>): Promise<T> {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const next = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.tail = this.tail.then(
      () => task().then(resolve, reject),
      () => task().then(resolve, reject)
    );
    return next;
  }
}
const fileWriteQueue = new AsyncQueue();

export interface Comment {
  id: string;
  parentSlug: string;
  parentType: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  threadId?: string;
  parentCommentId?: string;
  deletedAt?: string;
  mentions?: string[];
}

/**
 * The caller may not see the matter this thread belongs to (ethical wall,
 * restricted matter). Routes answer it like a missing thread.
 */
export class CommentAccessError extends Error {
  constructor() {
    super("comment_thread_not_accessible");
    this.name = "CommentAccessError";
  }
}

/**
 * The matter a thread hangs off. Threads in the matter tabs use
 * `legal/cases/<id>/evidence/<n>` style parents, which are no pages of their
 * own — the matter page decides who may read and write the thread.
 */
export function commentMatterSlug(parentSlug: string): string | undefined {
  const match = /^legal\/cases\/[^/]+/.exec(parentSlug);
  return match ? match[0] : undefined;
}

/** Throws CommentAccessError when the caller cannot see the thread's matter. */
async function assertThreadVisible(headers: EngineHeaders, parentSlug: string): Promise<void> {
  const matter = commentMatterSlug(parentSlug);
  if (!matter) return;
  const page = await getEnginePage(headers, matter);
  if (!page) throw new CommentAccessError();
}

function commentSlugPrefix(parentSlug: string): string {
  return `comment/${parentSlug.replace(/\//g, "-")}/`;
}

/**
 * Every function takes the calling route's `ctx.headers` (tenant, API key and
 * signed caller identity), so the engine applies the matter access rules.
 */
export async function addComment(
  headers: EngineHeaders,
  opts: {
    parentSlug: string;
    parentType: string;
    authorId: string;
    authorName: string;
    content: string;
    threadId?: string;
    parentCommentId?: string;
  }
): Promise<Comment> {
  await assertThreadVisible(headers, opts.parentSlug);
  const now = Date.now();
  const slug = `${commentSlugPrefix(opts.parentSlug)}${now}`;
  const threadId = opts.threadId || opts.parentCommentId || slug;
  const mentions = extractMentions(opts.content);
  const matter = commentMatterSlug(opts.parentSlug);
  await writeEnginePage(headers, {
    slug,
    title: `Kommentar zu ${opts.parentSlug}`,
    type: "comment",
    content: opts.content,
    frontmatter: {
      type: "comment",
      parent_slug: opts.parentSlug,
      parent_type: opts.parentType,
      // Stamps the matter, so the engine's wall and restriction filters cover
      // the comment page itself (its own slug is not under the matter path).
      ...(matter ? { case_slug: matter } : {}),
      // Page listings carry no body; the thread view reads the text from here.
      content: opts.content,
      author_id: opts.authorId,
      author_name: opts.authorName,
      thread_id: threadId,
      parent_comment_id: opts.parentCommentId || null,
      created_at: new Date().toISOString(),
      mentions: mentions.length > 0 ? mentions : null,
    },
  });
  // Create mention notifications (fire-and-forget)
  if (mentions.length > 0) {
    void createMentionNotifications({
      commentId: slug,
      mentionedUserNames: mentions,
      authorName: opts.authorName,
      parentSlug: opts.parentSlug,
    });
  }
  return {
    id: slug,
    parentSlug: opts.parentSlug,
    parentType: opts.parentType,
    authorId: opts.authorId,
    authorName: opts.authorName,
    content: opts.content,
    createdAt: new Date().toISOString(),
    threadId,
    parentCommentId: opts.parentCommentId,
    mentions,
  };
}

/** Throws CommentAccessError when the caller cannot see the thread's matter. */
export async function listComments(headers: EngineHeaders, parentSlug: string): Promise<Comment[]> {
  await assertThreadVisible(headers, parentSlug);
  try {
    const pages = await listEnginePages(headers, "comment", 500, {
      slugPrefix: commentSlugPrefix(parentSlug),
    });
    return pages
      .filter((p) => String(p.frontmatter?.parent_slug ?? "") === parentSlug)
      .map((p) => {
        const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
        const text = typeof fm.content === "string" ? fm.content : p.content || "";
        return {
          id: p.slug,
          parentSlug: String(fm.parent_slug ?? ""),
          parentType: String(fm.parent_type ?? ""),
          authorId: String(fm.author_id ?? ""),
          authorName: String(fm.author_name ?? "Unbekannt"),
          content: fm.deleted_at ? "[gelöscht]" : text,
          createdAt: String(fm.created_at ?? p.created_at ?? ""),
          threadId: String(fm.thread_id ?? p.slug),
          parentCommentId: fm.parent_comment_id ? String(fm.parent_comment_id) : undefined,
          deletedAt: fm.deleted_at ? String(fm.deleted_at) : undefined,
          mentions: Array.isArray(fm.mentions) ? (fm.mentions as string[]) : undefined,
        };
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch {
    return [];
  }
}

/**
 * Soft-Delete a comment. Only the author or an admin can delete.
 * The comment content is replaced with "[gelöscht]" but the record stays for audit.
 */
export async function deleteComment(
  headers: EngineHeaders,
  opts: {
    commentId: string;
    authorId: string;
    userRole: string;
  }
): Promise<{ success: boolean }> {
  if (!opts.commentId.startsWith("comment/")) return { success: false };
  const page = await getEnginePage(headers, opts.commentId);
  if (!page) {
    return { success: false };
  }
  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  try {
    await assertThreadVisible(headers, String(fm.parent_slug ?? ""));
  } catch (err) {
    if (err instanceof CommentAccessError) return { success: false };
    throw err;
  }
  const isAuthor = String(fm.author_id ?? "") === opts.authorId;
  const isAdmin = opts.userRole === "admin";
  if (!isAuthor && !isAdmin) {
    return { success: false };
  }
  // Soft-delete: update frontmatter with deleted_at, replace content
  await writeEnginePage(
    headers,
    {
      slug: opts.commentId,
      content: "[gelöscht]",
      frontmatter: { deleted_at: new Date().toISOString(), content: "[gelöscht]" },
    },
    { merge: true }
  );
  return { success: true };
}

/**
 * Extract @mentions from comment content.
 * Returns an array of mentioned usernames (without the @ prefix).
 */
export function extractMentions(content: string): string[] {
  const regex = /@(\w[\w.-]{1,30}\w)/g;
  const matches = content.match(regex);
  if (!matches) return [];
  // Deduplicate and strip @ prefix
  const set = new Set(matches.map((m) => m.slice(1)));
  return Array.from(set);
}

// ── Notification System ─────────────────────────────────────────────────

export interface Notification {
  id: string;
  userId: string;
  brainId: string;
  type:
    | "mention"
    | "reply"
    | "deadline"
    | "system"
    | "notification_failure"
    | "document_request"
    | "retention"
    | "autonomous_task"
    | "inbox_triage"
    | "copilot_stale_case"
    | "copilot_missing_time_entries"
    | "copilot_budget_warning"
    | "copilot_unread_documents"
    | "copilot_conflict_pending"
    | "copilot_missing_parties"
    | "copilot_legal_hold_active"
    | "copilot_critical_deadline"
    | "copilot_no_tasks"
    | "corpus_delta";
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const ensureNotifSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_notifications (
    id text NOT NULL,
    user_id text NOT NULL,
    brain_id text NOT NULL,
    type text NOT NULL DEFAULT 'system',
    data jsonb NOT NULL DEFAULT '{}',
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, user_id, brain_id)
  );
  CREATE INDEX IF NOT EXISTS idx_notif_user_brain
    ON subsumio_notifications (user_id, brain_id, read_at);
`);

const NOTIF_DATA_DIR = env("SUBSUMIO_DATA_DIR") || path.join(process.cwd(), ".data");
const NOTIF_FILE = path.join(NOTIF_DATA_DIR, "notifications.json");

async function createMentionNotifications(opts: {
  commentId: string;
  mentionedUserNames: string[];
  authorName: string;
  parentSlug: string;
}): Promise<void> {
  for (const userName of opts.mentionedUserNames) {
    const notif: Notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId: userName, // resolved to userId in same brain
      brainId: "", // will be set by caller context
      type: "mention",
      data: {
        commentId: opts.commentId,
        authorName: opts.authorName,
        parentSlug: opts.parentSlug,
        message: `${opts.authorName} hat Sie in einem Kommentar erwähnt`,
      },
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    await persistNotification(notif);
  }
}

async function persistNotification(notif: Notification): Promise<void> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureNotifSchema();
      await pool.query(
        `INSERT INTO subsumio_notifications (id, user_id, brain_id, type, data, read_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id, user_id, brain_id) DO NOTHING`,
        [
          notif.id,
          notif.userId,
          notif.brainId,
          notif.type,
          JSON.stringify(notif.data),
          notif.readAt,
          notif.createdAt,
        ]
      );
    } catch (err) {
      log.error(
        `[notifications] persist failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return;
  }
  // File-based fallback for dev — serialize writes
  await fileWriteQueue.run(async () => {
    try {
      await fs.mkdir(path.dirname(NOTIF_FILE), { recursive: true });
      let all: Notification[] = [];
      try {
        const raw = await fs.readFile(NOTIF_FILE, "utf-8");
        all = JSON.parse(raw);
      } catch {}
      // Skip if already exists (dedup)
      if (all.some((n) => n.id === notif.id)) return;
      all.unshift(notif);
      if (all.length > 500) all = all.slice(0, 500);
      const tmp = `${NOTIF_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(all, null, 2));
      await fs.rename(tmp, NOTIF_FILE);
    } catch (err) {
      log.error(
        `[notifications] file persist failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
}

export async function persistNotificationUpsert(notif: Notification): Promise<void> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureNotifSchema();
      // ON CONFLICT: update data but don't reset read_at if already read
      await pool.query(
        `INSERT INTO subsumio_notifications (id, user_id, brain_id, type, data, read_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id, user_id, brain_id) DO UPDATE SET
           data = EXCLUDED.data,
           type = EXCLUDED.type
           WHERE subsumio_notifications.read_at IS NULL`,
        [
          notif.id,
          notif.userId,
          notif.brainId,
          notif.type,
          JSON.stringify(notif.data),
          notif.readAt,
          notif.createdAt,
        ]
      );
    } catch (err) {
      log.error(
        `[notifications] upsert failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return;
  }
  // File-based fallback: serialize writes to prevent race conditions
  await fileWriteQueue.run(async () => {
    try {
      await fs.mkdir(path.dirname(NOTIF_FILE), { recursive: true });
      let all: Notification[] = [];
      try {
        const raw = await fs.readFile(NOTIF_FILE, "utf-8");
        all = JSON.parse(raw);
      } catch {}
      const idx = all.findIndex(
        (n) => n.id === notif.id && n.userId === notif.userId && n.brainId === notif.brainId
      );
      if (idx !== -1) {
        // Only update data if not yet read
        if (all[idx].readAt === null) {
          all[idx].data = notif.data;
          all[idx].type = notif.type;
        }
      } else {
        all.unshift(notif);
        if (all.length > 500) all = all.slice(0, 500);
      }
      const tmp = `${NOTIF_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(all, null, 2));
      await fs.rename(tmp, NOTIF_FILE);
    } catch (err) {
      log.error(
        `[notifications] file upsert failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
}

export async function listNotifications(opts: {
  userId: string;
  brainId: string;
  unreadOnly?: boolean;
  limit?: number;
}): Promise<Notification[]> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureNotifSchema();
      const conditions = ["user_id = $1", "brain_id = $2"];
      const params: unknown[] = [opts.userId, opts.brainId];
      if (opts.unreadOnly) {
        conditions.push("read_at IS NULL");
      }
      const limit = Math.min(Number.isFinite(opts.limit) ? opts.limit! : 50, 200);
      const result = await pool.query(
        `SELECT * FROM subsumio_notifications WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${params.length + 1}`,
        [...params, limit]
      );
      // Map Postgres rows to Notification — pg returns timestamptz as Date, not string
      return result.rows.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        userId: row.user_id as string,
        brainId: row.brain_id as string,
        type: row.type as Notification["type"],
        data: row.data as Record<string, unknown>,
        readAt:
          row.read_at instanceof Date ? row.read_at.toISOString() : (row.read_at as string | null),
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : (row.created_at as string),
      }));
    } catch {
      return [];
    }
  }
  // File fallback
  try {
    const raw = await fs.readFile(NOTIF_FILE, "utf-8");
    let all = JSON.parse(raw) as Notification[];
    // Security: filter by userId + brainId (same as Postgres WHERE clause)
    all = all.filter((n) => n.userId === opts.userId && n.brainId === opts.brainId);
    if (opts.unreadOnly) all = all.filter((n) => !n.readAt);
    const limit = Number.isFinite(opts.limit) ? opts.limit! : 50;
    return all.slice(0, Math.min(limit, 200));
  } catch {
    return [];
  }
}

/**
 * Mark a single notification read. Scoped to (userId, brainId) — without
 * this, any authenticated caller could mark (and confirm the existence of)
 * another user's notification just by knowing or guessing its ID. Deadline
 * notification IDs in particular are deterministic
 * (`notif_dl_<slug>_<date>`), so this isn't a theoretical concern.
 */
export async function markNotificationRead(
  id: string,
  owner: { userId: string; brainId: string }
): Promise<void> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureNotifSchema();
      await pool.query(
        "UPDATE subsumio_notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND brain_id = $3",
        [id, owner.userId, owner.brainId]
      );
    } catch {}
    return;
  }
  await fileWriteQueue.run(async () => {
    try {
      const raw = await fs.readFile(NOTIF_FILE, "utf-8");
      const all = JSON.parse(raw) as Notification[];
      const idx = all.findIndex(
        (n) => n.id === id && n.userId === owner.userId && n.brainId === owner.brainId
      );
      if (idx !== -1) {
        all[idx].readAt = new Date().toISOString();
        const tmp = `${NOTIF_FILE}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(all, null, 2));
        await fs.rename(tmp, NOTIF_FILE);
      }
    } catch {}
  });
}

export async function createDeadlineNotification(opts: {
  userId: string;
  brainId: string;
  caseSlug?: string;
  caseTitle: string;
  deadlineDate: string;
  daysRemaining: number;
  isOverdue: boolean;
  isVorfrist?: boolean;
  /** Urlaubsvertretung-Hinweis, wenn die verantwortliche Person abwesend ist. */
  delegation?: string;
}): Promise<void> {
  // Deterministic ID based on caseSlug + deadlineDate to prevent duplicates
  const slugPart = opts.caseSlug ?? opts.caseTitle.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
  const datePart = String(opts.deadlineDate)
    .replace(/[^a-zA-Z0-9]/g, "_")
    .slice(0, 20);
  const notifId = `notif_dl_${slugPart}_${datePart}`;

  const notif: Notification = {
    id: notifId,
    userId: opts.userId,
    brainId: opts.brainId,
    type: "deadline",
    data: {
      title: opts.caseTitle,
      caseSlug: opts.caseSlug,
      deadlineDate: opts.deadlineDate,
      daysRemaining: opts.daysRemaining,
      isOverdue: opts.isOverdue,
      isVorfrist: opts.isVorfrist,
      ...(opts.delegation ? { delegation: opts.delegation } : {}),
    },
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  await persistNotificationUpsert(notif);
}

export async function createDocumentRequestNotification(opts: {
  userId: string;
  brainId: string;
  caseSlug?: string;
  caseTitle: string;
  requestSlug: string;
  itemCount: number;
  isReminder: boolean;
  daysSinceSent?: number;
}): Promise<void> {
  const slugPart = opts.caseSlug ?? opts.caseTitle.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
  const reqPart = opts.requestSlug.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
  const suffix = opts.isReminder ? `_rem_${opts.daysSinceSent ?? 0}` : "";
  const notifId = `notif_dr_${slugPart}_${reqPart}${suffix}`;

  const notif: Notification = {
    id: notifId,
    userId: opts.userId,
    brainId: opts.brainId,
    type: "document_request",
    data: {
      title: opts.caseTitle,
      caseSlug: opts.caseSlug,
      requestSlug: opts.requestSlug,
      itemCount: opts.itemCount,
      isReminder: opts.isReminder,
      daysSinceSent: opts.daysSinceSent,
    },
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  await persistNotificationUpsert(notif);
}

/**
 * Stale-intake escalation — fires once per intake request (deterministic
 * ID) when a Mandatsanfrage sits open longer than the firm tolerates.
 * Renders as a system notification; `intakeSlug` lets the UI link/title it.
 */
export async function createIntakeStaleNotification(opts: {
  userId: string;
  brainId: string;
  intakeSlug: string;
  clientName?: string;
  hoursOpen: number;
}): Promise<void> {
  const slugPart = opts.intakeSlug.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 60);
  const notif: Notification = {
    id: `notif_intake_stale_${slugPart}`,
    userId: opts.userId,
    brainId: opts.brainId,
    type: "system",
    data: {
      intakeSlug: opts.intakeSlug,
      clientName: opts.clientName,
      hoursOpen: opts.hoursOpen,
      message: `Erstanfrage von ${opts.clientName || "Mandant"} ist seit ${opts.hoursOpen} Std. unbearbeitet — bitte in der Mandatsaufnahme prüfen.`,
    },
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  await persistNotificationUpsert(notif);
}

/**
 * The full firm export an admin asked for is ready (or finished with gaps).
 * One notice per export (deterministic id); the download itself stays on the
 * privacy settings page, behind the admin's session.
 */
export async function createFirmExportReadyNotification(opts: {
  userId: string;
  brainId: string;
  exportId: number;
  expiresAt?: string | null;
  complete: boolean;
}): Promise<void> {
  const until = opts.expiresAt
    ? new Date(opts.expiresAt).toLocaleString("de-AT", {
        timeZone: "Europe/Vienna",
        dateStyle: "short",
        timeStyle: "short",
      })
    : null;
  const notif: Notification = {
    id: `notif_firm_export_${opts.exportId}`,
    userId: opts.userId,
    brainId: opts.brainId,
    type: "system",
    data: {
      exportId: opts.exportId,
      href: "/dashboard/settings/privacy",
      message: `${
        opts.complete
          ? "Der vollständige Kanzlei-Export ist fertig."
          : "Der Kanzlei-Export ist fertig, aber nicht vollständig — Details im Manifest."
      } Download einmalig unter Einstellungen → Privatsphäre${until ? `, bis ${until}` : ""}.`,
    },
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  await persistNotificationUpsert(notif);
}

export async function createRetentionNotification(opts: {
  userId: string;
  brainId: string;
  caseSlug: string;
  caseTitle: string;
  caseNumber: string;
  action: "review" | "delete";
  yearsSinceClosure: number;
}): Promise<void> {
  const slugPart = opts.caseSlug.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
  const notifId = `notif_retention_${slugPart}_${opts.action}`;

  const notif: Notification = {
    id: notifId,
    userId: opts.userId,
    brainId: opts.brainId,
    type: "retention",
    data: {
      title: opts.caseTitle,
      caseSlug: opts.caseSlug,
      caseNumber: opts.caseNumber,
      action: opts.action,
      yearsSinceClosure: opts.yearsSinceClosure,
    },
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  await persistNotificationUpsert(notif);
}

export async function markAllNotificationsRead(opts: {
  userId: string;
  brainId: string;
}): Promise<void> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureNotifSchema();
      await pool.query(
        "UPDATE subsumio_notifications SET read_at = now() WHERE user_id = $1 AND brain_id = $2 AND read_at IS NULL",
        [opts.userId, opts.brainId]
      );
    } catch {}
    return;
  }
  await fileWriteQueue.run(async () => {
    try {
      const raw = await fs.readFile(NOTIF_FILE, "utf-8");
      const all = JSON.parse(raw) as Notification[];
      for (const n of all) {
        if (n.userId === opts.userId && n.brainId === opts.brainId && !n.readAt) {
          n.readAt = new Date().toISOString();
        }
      }
      const tmp = `${NOTIF_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(all, null, 2));
      await fs.rename(tmp, NOTIF_FILE);
    } catch {}
  });
}

export async function deleteNotification(
  id: string,
  owner: { userId: string; brainId: string }
): Promise<void> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureNotifSchema();
      await pool.query(
        "DELETE FROM subsumio_notifications WHERE id = $1 AND user_id = $2 AND brain_id = $3",
        [id, owner.userId, owner.brainId]
      );
    } catch {}
    return;
  }
  await fileWriteQueue.run(async () => {
    try {
      const raw = await fs.readFile(NOTIF_FILE, "utf-8");
      const all = JSON.parse(raw) as Notification[];
      const filtered = all.filter(
        (n) => !(n.id === id && n.userId === owner.userId && n.brainId === owner.brainId)
      );
      const tmp = `${NOTIF_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(filtered, null, 2));
      await fs.rename(tmp, NOTIF_FILE);
    } catch {}
  });
}

export async function deleteAllReadNotifications(opts: {
  userId: string;
  brainId: string;
}): Promise<number> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureNotifSchema();
      const result = await pool.query(
        "DELETE FROM subsumio_notifications WHERE user_id = $1 AND brain_id = $2 AND read_at IS NOT NULL",
        [opts.userId, opts.brainId]
      );
      return result.rowCount ?? 0;
    } catch {}
    return 0;
  }
  let deleted = 0;
  await fileWriteQueue.run(async () => {
    try {
      const raw = await fs.readFile(NOTIF_FILE, "utf-8");
      const all = JSON.parse(raw) as Notification[];
      const filtered = all.filter((n) => {
        if (n.userId === opts.userId && n.brainId === opts.brainId && n.readAt) {
          deleted++;
          return false;
        }
        return true;
      });
      const tmp = `${NOTIF_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(filtered, null, 2));
      await fs.rename(tmp, NOTIF_FILE);
    } catch {}
  });
  return deleted;
}

export async function createNotificationFailureNotification(opts: {
  userId: string;
  brainId: string;
  caseSlug?: string;
  caseTitle: string;
  deadlineTitle: string;
  deadlineDate: string;
  channels: string[];
  reason: string;
}): Promise<void> {
  const slugPart = opts.caseSlug ?? opts.caseTitle.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
  const datePart = String(opts.deadlineDate)
    .replace(/[^a-zA-Z0-9]/g, "_")
    .slice(0, 20);
  const reasonPart = opts.reason.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
  const notifId = `notif_fail_${slugPart}_${datePart}_${reasonPart}`;

  const notif: Notification = {
    id: notifId,
    userId: opts.userId,
    brainId: opts.brainId,
    type: "notification_failure",
    data: {
      title: opts.caseTitle,
      caseSlug: opts.caseSlug,
      deadlineTitle: opts.deadlineTitle,
      deadlineDate: opts.deadlineDate,
      channels: opts.channels,
      reason: opts.reason,
    },
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  await persistNotificationUpsert(notif);
}

export async function createAutonomousTaskNotification(opts: {
  userId: string;
  brainId: string;
  taskId: string;
  taskType: string;
  status: "completed" | "failed" | "requires_approval";
  caseSlug?: string;
  result?: Record<string, unknown>;
}): Promise<void> {
  const notifId = `notif_auto_${opts.taskId}`;
  const notif: Notification = {
    id: notifId,
    userId: opts.userId,
    brainId: opts.brainId,
    type: "autonomous_task",
    data: {
      taskId: opts.taskId,
      taskType: opts.taskType,
      status: opts.status,
      caseSlug: opts.caseSlug,
      result: opts.result,
    },
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  await persistNotificationUpsert(notif);
}

export async function createInboxTriageNotification(opts: {
  userId: string;
  brainId: string;
  messageId: string;
  subject: string;
  urgency: "urgent" | "normal" | "low";
  suggestedAction: string;
}): Promise<void> {
  const notifId = `notif_triage_${opts.messageId}`;
  const notif: Notification = {
    id: notifId,
    userId: opts.userId,
    brainId: opts.brainId,
    type: "inbox_triage",
    data: {
      messageId: opts.messageId,
      subject: opts.subject,
      urgency: opts.urgency,
      suggestedAction: opts.suggestedAction,
    },
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  await persistNotificationUpsert(notif);
}

/**
 * Corpus Delta Notification — wird vom corpus-pipeline Supervisor geschrieben,
 * wenn der RIS Delta-Watcher neue oder geänderte Dokumente gefunden hat.
 *
 * Deterministic ID: `notif_corpus_delta_{YYYY-MM-DD}` verhindert Duplikate
 * pro Tag — der Delta-Watcher läuft 1x täglich via Cron, aber manuelle
 * Triggers erzeugen keine zweite Notification für denselben Tag.
 *
 * Die Notification ist user-agnostic (userId="system", brainId="system") —
 * alle Admins sehen sie. Das Corpus-Alert-Banner filtert nach type=corpus_delta.
 */
export async function createCorpusDeltaNotification(opts: {
  newCount: number;
  changedCount: number;
  applikationen: string[];
  failedCount?: number;
}): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const notifId = `notif_corpus_delta_${today}`;
  const total = opts.newCount + opts.changedCount;
  const notif: Notification = {
    id: notifId,
    userId: "system",
    brainId: "system",
    type: "corpus_delta",
    data: {
      title:
        total > 0
          ? `${total} ${total === 1 ? "neues/geändertes Dokument" : "neue/geänderte Dokumente"} im RIS`
          : "RIS Delta-Sync abgeschlossen — keine Änderungen",
      newCount: opts.newCount,
      changedCount: opts.changedCount,
      failedCount: opts.failedCount ?? 0,
      applikationen: opts.applikationen,
      total,
      url: "/dashboard/sources",
      syncDate: today,
    },
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  await persistNotificationUpsert(notif);
}

/**
 * Listet alle Corpus-Delta-Notifications (ungelesen), unabhängig vom User —
 * da Corpus-Alerts systemweit sind (userId="system").
 */
export async function listCorpusDeltaNotifications(opts: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<Notification[]> {
  const pool = getSharedPgPool();
  if (!pool) return [];
  try {
    await ensureNotifSchema();
    const conditions = ["type = 'corpus_delta'"];
    const params: unknown[] = [];
    if (opts.unreadOnly) {
      conditions.push("read_at IS NULL");
    }
    const limit = Math.min(Number.isFinite(opts.limit) ? opts.limit! : 50, 200);
    params.push(limit);
    const result = await pool.query(
      `SELECT * FROM subsumio_notifications WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $1`,
      params
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      userId: row.user_id as string,
      brainId: row.brain_id as string,
      type: row.type as Notification["type"],
      data: row.data as Record<string, unknown>,
      readAt:
        row.read_at instanceof Date ? row.read_at.toISOString() : (row.read_at as string | null),
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at as string),
    }));
  } catch {
    return [];
  }
}

/**
 * The true count of unread corpus-delta notifications, independent of any
 * list `limit`. The ops badge used to call listCorpusDeltaNotifications with
 * `limit=1` and read the length of that capped array as "the count" — which
 * can only ever be 0 or 1, no matter how many alerts are actually unread.
 * This runs a real COUNT(*), so the badge can show the true number.
 */
export async function countUnreadCorpusDeltaNotifications(): Promise<number> {
  const pool = getSharedPgPool();
  if (!pool) return 0;
  try {
    await ensureNotifSchema();
    const result = await pool.query(
      `SELECT count(*)::int AS n FROM subsumio_notifications WHERE type = 'corpus_delta' AND read_at IS NULL`
    );
    return (result.rows[0]?.n as number) ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Markiert alle Corpus-Delta-Notifications als gelesen.
 */
export async function markAllCorpusDeltaNotificationsRead(): Promise<number> {
  const pool = getSharedPgPool();
  if (!pool) return 0;
  try {
    await ensureNotifSchema();
    const result = await pool.query(
      "UPDATE subsumio_notifications SET read_at = now() WHERE type = 'corpus_delta' AND read_at IS NULL"
    );
    return result.rowCount ?? 0;
  } catch {
    return 0;
  }
}
