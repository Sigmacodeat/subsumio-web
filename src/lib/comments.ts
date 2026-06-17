/**
 * Kommentar-Thread System für SigmaBrain.
 * Kommentare werden als Brain-Pages vom Typ "comment" gespeichert,
 * mit Verknüpfung zu einer Parent-Page (case, evidence, deadline, time_entry).
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
 *     content: string
 */

import { api } from "./api";

export interface Comment {
  id: string;
  parentSlug: string;
  parentType: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  threadId?: string;
}

export async function addComment(opts: {
  parentSlug: string;
  parentType: string;
  authorId: string;
  authorName: string;
  content: string;
  threadId?: string;
}): Promise<Comment> {
  const now = Date.now();
  const slug = `comment/${opts.parentSlug.replace(/\//g, "-")}/${now}`;
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
      thread_id: opts.threadId || slug,
      created_at: new Date().toISOString(),
    },
  });
  return {
    id: slug,
    parentSlug: opts.parentSlug,
    parentType: opts.parentType,
    authorId: opts.authorId,
    authorName: opts.authorName,
    content: opts.content,
    createdAt: new Date().toISOString(),
    threadId: opts.threadId || slug,
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
          content: p.content || "",
          createdAt: String(fm.created_at ?? p.created_at),
          threadId: String(fm.thread_id ?? p.slug),
        };
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch {
    return [];
  }
}
