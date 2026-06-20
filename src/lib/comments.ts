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

import { api } from "./api";
import { getSharedPgPool } from "./auth/store";
import { env } from "./env";
import { createSchemaInit } from "@/lib/schema-init";
import { promises as fs } from "node:fs";
import path from "node:path";

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

export async function addComment(opts: {
  parentSlug: string;
  parentType: string;
  authorId: string;
  authorName: string;
  content: string;
  threadId?: string;
  parentCommentId?: string;
}): Promise<Comment> {
  const now = Date.now();
  const slug = `comment/${opts.parentSlug.replace(/\//g, "-")}/${now}`;
  const threadId = opts.threadId || opts.parentCommentId || slug;
  const mentions = extractMentions(opts.content);
  await api.brain.createPage({
    slug,
    title: `Kommentar zu ${opts.parentSlug}`,
    type: "comment",
    content: opts.content,
    frontmatter: {
      type: "comment",
      parent_slug: opts.parentSlug,
      parent_type: opts.parentType,
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

export async function listComments(parentSlug: string): Promise<Comment[]> {
  try {
    const pages = await api.brain.listPages({ type: "comment", limit: 200 });
    return pages
      .filter((p) => {
        const fm = p.frontmatter as Record<string, unknown>;
        return String(fm.parent_slug ?? "") === parentSlug;
      })
      .map((p) => {
        const fm = p.frontmatter as Record<string, unknown>;
        return {
          id: p.slug,
          parentSlug: String(fm.parent_slug ?? ""),
          parentType: String(fm.parent_type ?? ""),
          authorId: String(fm.author_id ?? ""),
          authorName: String(fm.author_name ?? "Unbekannt"),
          content: fm.deleted_at ? "[gelöscht]" : p.content || "",
          createdAt: String(fm.created_at ?? p.created_at),
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
export async function deleteComment(opts: {
  commentId: string;
  authorId: string;
  userRole: string;
}): Promise<{ success: boolean }> {
  const page = await api.brain.getPage(opts.commentId);
  if (!page) {
    return { success: false };
  }
  const fm = page.frontmatter as Record<string, unknown>;
  const isAuthor = String(fm.author_id ?? "") === opts.authorId;
  const isAdmin = opts.userRole === "admin";
  if (!isAuthor && !isAdmin) {
    return { success: false };
  }
  // Soft-delete: update frontmatter with deleted_at, replace content
  await api.brain.updatePage({
    slug: opts.commentId,
    content: "[gelöscht]",
    frontmatter: { ...fm, deleted_at: new Date().toISOString() },
  });
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
  type: "mention" | "reply" | "deadline" | "system";
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const ensureNotifSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_notifications (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    brain_id text NOT NULL,
    type text NOT NULL DEFAULT 'system',
    data jsonb NOT NULL DEFAULT '{}',
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
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
        message: `${opts.authorName} hat dich in einem Kommentar erwähnt`,
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
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
      console.error(
        `[notifications] persist failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return;
  }
  // File-based fallback for dev
  try {
    await fs.mkdir(path.dirname(NOTIF_FILE), { recursive: true });
    let all: Notification[] = [];
    try {
      const raw = await fs.readFile(NOTIF_FILE, "utf-8");
      all = JSON.parse(raw);
    } catch {}
    all.unshift(notif);
    if (all.length > 500) all = all.slice(0, 500);
    const tmp = `${NOTIF_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(all, null, 2));
    await fs.rename(tmp, NOTIF_FILE);
  } catch (err) {
    console.error(
      `[notifications] file persist failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
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
      const limit = opts.limit ?? 50;
      const result = await pool.query(
        `SELECT * FROM subsumio_notifications WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT ${limit}`,
        params
      );
      return result.rows as Notification[];
    } catch {
      return [];
    }
  }
  // File fallback
  try {
    const raw = await fs.readFile(NOTIF_FILE, "utf-8");
    let all = JSON.parse(raw) as Notification[];
    if (opts.unreadOnly) all = all.filter((n) => !n.readAt);
    return all.slice(0, opts.limit ?? 50);
  } catch {
    return [];
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureNotifSchema();
      await pool.query("UPDATE subsumio_notifications SET read_at = now() WHERE id = $1", [id]);
    } catch {}
    return;
  }
  try {
    const raw = await fs.readFile(NOTIF_FILE, "utf-8");
    const all = JSON.parse(raw) as Notification[];
    const idx = all.findIndex((n) => n.id === id);
    if (idx !== -1) {
      all[idx].readAt = new Date().toISOString();
      const tmp = `${NOTIF_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(all, null, 2));
      await fs.rename(tmp, NOTIF_FILE);
    }
  } catch {}
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
  try {
    const raw = await fs.readFile(NOTIF_FILE, "utf-8");
    const all = JSON.parse(raw) as Notification[];
    for (const n of all) {
      if (!n.readAt) n.readAt = new Date().toISOString();
    }
    const tmp = `${NOTIF_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(all, null, 2));
    await fs.rename(tmp, NOTIF_FILE);
  } catch {}
}
