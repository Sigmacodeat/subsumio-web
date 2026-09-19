import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";

export const dynamic = "force-dynamic";

/**
 * Copilot conversations kept on the server, one engine page per session.
 *
 * A session lives at `chat-sessions/private/<owner>/<id>`; the engine hides
 * that prefix from everyone but the owner (server/src/core/matter-access.ts,
 * privateChatDenies) and keeps all `chat-sessions/` out of search. Sharing
 * writes a copy to `chat-sessions/shared/<owner>/<id>`, visible to everyone in
 * the firm who may see its matter: a session about a matter carries that
 * matter's `case_slug`, so walls and restricted matters apply to it too. The
 * browser keeps its IndexedDB copy as a cache.
 */

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_MESSAGES = 300;
const MAX_CONTENT_CHARS = 20_000;

const messageSchema = z.object({
  id: z.string().max(120),
  role: z.enum(["user", "assistant"]),
  content: z.string().max(MAX_CONTENT_CHARS),
  createdAt: z.string().max(40),
});

const putSchema = z.object({
  id: z.string().regex(ID_RE),
  title: z.string().max(200),
  case_slug: z.string().max(300).optional(),
  messages: z.array(messageSchema).max(MAX_MESSAGES),
});

const patchSchema = z.object({
  id: z.string().regex(ID_RE),
  shared: z.boolean(),
});

const querySchema = z.object({
  id: z.string().regex(ID_RE).optional(),
  owner: z.string().max(200).optional(),
  case_slug: z.string().max(300).optional(),
});

function ownerSegment(ownerId: string): string {
  return ownerId.replace(/[^A-Za-z0-9_-]/g, "_");
}

function privateSlug(ownerId: string, id: string): string {
  return `chat-sessions/private/${ownerSegment(ownerId)}/${id}`;
}

function sharedSlug(ownerId: string, id: string): string {
  return `chat-sessions/shared/${ownerSegment(ownerId)}/${id}`;
}

async function writeSession(
  headers: Record<string, string>,
  slug: string,
  title: string,
  content: string,
  frontmatter: Record<string, unknown>
): Promise<Response> {
  return fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      slug,
      type: "chat_session",
      title: title || "Unterhaltung",
      content,
      frontmatter: { type: "chat_session", ...frontmatter },
    }),
    signal: AbortSignal.timeout(15_000),
  });
}

interface SessionPage {
  slug: string;
  title?: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
}

async function readSession(
  headers: Record<string, string>,
  slug: string
): Promise<SessionPage | null> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const page = (await res.json()) as SessionPage & { type?: string };
  const fm = page.frontmatter ?? {};
  if ((page.type ?? fm.type) !== "chat_session" || fm.status === "tombstoned") return null;
  return page;
}

function visibleTo(fm: Record<string, unknown>, userId: string): boolean {
  return fm.owner_id === userId || fm.shared === true;
}

function summary(page: { slug: string; title?: string; frontmatter?: Record<string, unknown> }) {
  const fm = page.frontmatter ?? {};
  return {
    id: page.slug.split("/").pop() ?? page.slug,
    owner_id: String(fm.owner_id ?? ""),
    owner_name: String(fm.owner_name ?? ""),
    title: String(fm.title ?? page.title ?? ""),
    case_slug: typeof fm.case_slug === "string" ? fm.case_slug : undefined,
    message_count: Number(fm.message_count ?? 0),
    shared: fm.shared === true,
    updated_at: String(fm.updated_at ?? ""),
  };
}

/** One session with its messages (?id&owner), or the sessions of a matter (?case_slug). */
export const GET = createHandler(
  { action: "brain.read", rateTier: "standard", query: querySchema },
  async (ctx, _body, query) => {
    if (query?.id) {
      const own = !query.owner || query.owner === ctx.user.id;
      const page = await readSession(
        ctx.headers,
        own ? privateSlug(ctx.user.id, query.id) : sharedSlug(query.owner!, query.id)
      );
      if (!page || !visibleTo(page.frontmatter ?? {}, ctx.user.id)) {
        return apiError("not_found", "Unterhaltung nicht gefunden", 404);
      }
      let messages: unknown[] = [];
      try {
        messages = JSON.parse(page.content ?? "[]");
      } catch {
        messages = [];
      }
      return apiSuccess({ ...summary(page), messages });
    }
    const pages = await listEnginePages(ctx.headers, "chat_session", 1_000);
    const sessions = pages
      .filter((p) => visibleTo(p.frontmatter ?? {}, ctx.user.id))
      // One's own shared copy duplicates the private original.
      .filter(
        (p) =>
          !(p.slug.startsWith("chat-sessions/shared/") && p.frontmatter?.owner_id === ctx.user.id)
      )
      .filter((p) => !query?.case_slug || p.frontmatter?.case_slug === query.case_slug)
      .map(summary)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return apiSuccess({ sessions });
  }
);

/** Save (create or replace) one of the caller's own sessions. */
export const PUT = createHandler(
  { action: "brain.write", rateTier: "standard", body: putSchema },
  async (ctx, body) => {
    const slug = privateSlug(ctx.user.id, body.id);
    const existing = await readSession(ctx.headers, slug);
    const shared = existing?.frontmatter?.shared === true;
    const content = JSON.stringify(body.messages);
    const frontmatter = {
      owner_id: ctx.user.id,
      owner_name: ctx.user.name ?? ctx.user.email,
      title: body.title,
      ...(body.case_slug ? { case_slug: body.case_slug } : {}),
      message_count: body.messages.length,
      shared,
      updated_at: new Date().toISOString(),
    };
    const res = await writeSession(ctx.headers, slug, body.title, content, frontmatter);
    if (!res.ok) {
      // A matter the caller may only read, or one behind a wall: the
      // conversation stays in the browser only.
      return apiError(
        "save_failed",
        "Unterhaltung konnte nicht gespeichert werden",
        res.status === 403 || res.status === 404 ? 403 : 502
      );
    }
    if (shared) {
      await writeSession(
        ctx.headers,
        sharedSlug(ctx.user.id, body.id),
        body.title,
        content,
        frontmatter
      );
    }
    return apiSuccess({ id: body.id, owner_id: ctx.user.id });
  }
);

/** Share one of the caller's sessions with colleagues, or make it private again. */
export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: patchSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "chat_session",
      entityId: body.id,
      details: { shared: body.shared },
    }),
  },
  async (ctx, body) => {
    const slug = privateSlug(ctx.user.id, body.id);
    const existing = await readSession(ctx.headers, slug);
    if (!existing || existing.frontmatter?.owner_id !== ctx.user.id) {
      return apiError("not_found", "Unterhaltung nicht gefunden", 404);
    }
    const now = new Date().toISOString();
    const copy = sharedSlug(ctx.user.id, body.id);
    const shareRes = body.shared
      ? await writeSession(ctx.headers, copy, existing.title ?? "", existing.content ?? "[]", {
          ...(existing.frontmatter ?? {}),
          shared: true,
          updated_at: now,
        })
      : await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(copy)}`, {
          method: "DELETE",
          headers: ctx.headers,
          signal: AbortSignal.timeout(10_000),
        });
    if (!shareRes.ok && !(shareRes.status === 404 && !body.shared)) {
      return apiError("update_failed", "Freigabe konnte nicht gespeichert werden", 502);
    }
    const res = await enginePatchPage(ctx.headers, {
      slug,
      frontmatter: { shared: body.shared, updated_at: now },
    });
    if (!res.ok) return apiError("update_failed", "Freigabe konnte nicht gespeichert werden", 502);
    return apiSuccess({ id: body.id, owner_id: ctx.user.id, shared: body.shared });
  }
);
