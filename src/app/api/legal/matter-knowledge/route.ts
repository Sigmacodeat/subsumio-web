import { NextResponse } from "next/server";
import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { applyMatterKnowledgeMutation } from "@/lib/matter-knowledge";
import type { CaseFrontmatter } from "@/lib/legal-types";
import { encodeSlugPath } from "@/lib/utils";

export const dynamic = "force-dynamic";

const sourceSchema = z.object({
  type: z.enum(["manual", "document", "email", "whatsapp", "copilot", "upload_analysis", "system"]),
  label: z.string().min(1).max(240),
  slug: z.string().max(500).optional(),
  quote: z.string().max(2000).optional(),
  received_at: z.string().max(80).optional(),
});

const mutationSchema = z.object({
  caseSlug: z.string().min(1).max(500),
  action: z.enum(["add", "approve", "mark_party_assertion", "correct", "reject", "supersede"]),
  factId: z.string().max(240).optional(),
  statement: z.string().max(4000).optional(),
  correctedStatement: z.string().max(4000).optional(),
  source: sourceSchema,
  reason: z.string().max(1000).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: mutationSchema,
    audit: (ctx, body) => ({
      action: "case.update",
      entityType: "legal_case",
      entityId: body.caseSlug,
      details: {
        field: "knowledge_reviews",
        mutation: body.action,
        factId: body.factId,
        sourceType: body.source.type,
        actorId: ctx.user.id,
      },
    }),
  },
  async (ctx, body) => {
    try {
      const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlugPath(body.caseSlug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!getRes.ok) return apiError("not_found", "Akte nicht gefunden", 404);
      const page = (await getRes.json()) as {
        slug: string;
        title: string;
        content: string;
        type?: string;
        frontmatter?: Record<string, unknown>;
      };
      const currentFrontmatter = (page.frontmatter ?? {}) as CaseFrontmatter;
      const result = applyMatterKnowledgeMutation(currentFrontmatter, {
        action: body.action,
        factId: body.factId,
        statement: body.statement,
        correctedStatement: body.correctedStatement,
        source: body.source,
        reason: body.reason,
        actor: {
          id: ctx.user.id,
          name: ctx.user.name || ctx.user.email,
          type: ctx.user.role === "lawyer" || ctx.user.role === "admin" ? "lawyer" : "staff",
        },
      });

      const updateRes = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          slug: page.slug,
          title: page.title,
          content: page.content,
          type: page.type ?? "legal_case",
          frontmatter: result.frontmatter as Record<string, unknown>,
          merge: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!updateRes.ok)
        return apiError("internal_error", "Seite konnte nicht aktualisiert werden", 502);

      return NextResponse.json({
        ok: true,
        review: result.review,
        audit: result.audit,
        knowledgeReviews: result.frontmatter.knowledge_reviews ?? [],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("knowledge_")) {
        return apiError("bad_request", message, 400);
      }
      console.error("[legal/matter-knowledge] mutation failed:", message);
      return apiError("internal_error", "Failed to mutate matter knowledge", 500);
    }
  }
);
