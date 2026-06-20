
import { z } from "zod";
import { addComment, listComments, deleteComment } from "@/lib/comments";
import { createHandler, apiError } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";

export const dynamic = "force-dynamic";

const commentsQuerySchema = z.object({
  parentSlug: z.string().min(1, "parentSlug_required").or(z.literal("").transform(() => undefined)),
}).passthrough();

const commentsPostSchema = z.object({
  parent_slug: z.string().min(1, "parent_slug_required"),
  content: z.string().min(1, "content_required").max(10_000, "content_too_long"),
  thread_id: z.string().optional(),
  parent_comment_id: z.string().optional(),
});

const commentsDeleteSchema = z.object({
  id: z.string().min(1, "id_required"),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: commentsQuerySchema,
  },
  async (_ctx, _body, query, _req) => {
    const parentSlug = query.parentSlug || "";
    if (!parentSlug.trim()) {
      return apiError("parentSlug_required", "parentSlug erforderlich", 400);
    }
    try {
      const comments = await listComments(parentSlug);
      return Response.json({ comments, total: comments.length });
    } catch (err) {
      console.error("[comments] list failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Kommentare konnten nicht geladen werden", 500);
    }
  },
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: commentsPostSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "comment",
      entityId: body.parent_slug,
      details: { authorId: ctx.user.id },
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const comment = await addComment({
        parentSlug: body.parent_slug,
        parentType: "page",
        authorId: ctx.user.id,
        authorName: ctx.user.name || ctx.user.email,
        content: body.content.trim(),
        threadId: body.thread_id,
        parentCommentId: body.parent_comment_id,
      });
      broadcastSseEvent(ctx.brainId, "comment.added", { caseSlug: body.parent_slug, commentId: comment.id, by: ctx.user.email });
      return Response.json({ comment }, { status: 201 });
    } catch (err) {
      console.error("[comments] create failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Kommentar konnte nicht erstellt werden", 500);
    }
  },
);

export const DELETE = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: commentsDeleteSchema,
  },
  async (ctx, body, _query, _req) => {
    try {
      const result = await deleteComment({
        commentId: body.id,
        authorId: ctx.user.id,
        userRole: ctx.user.role,
      });
      if (!result.success) {
        return apiError("delete_failed", "Kommentar konnte nicht gelöscht werden (nicht gefunden oder keine Berechtigung)", 403);
      }
      broadcastSseEvent(ctx.brainId, "comment.deleted", { commentId: body.id, by: ctx.user.email });
      return Response.json({ ok: true });
    } catch (err) {
      console.error("[comments] delete failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Kommentar konnte nicht gelöscht werden", 500);
    }
  },
);
