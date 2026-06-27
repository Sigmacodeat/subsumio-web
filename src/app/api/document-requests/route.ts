import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import {
  buildDocumentRequest,
  documentRequestFromPage,
  extractRequestedDocumentItems,
  type DocumentRequestFrontmatter,
} from "@/lib/document-requests";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import type { BrainPage } from "@/lib/types";

export const dynamic = "force-dynamic";

const docRequestQuerySchema = z.object({
  caseSlug: z.string().optional(),
  status: z.string().optional(),
  limit: z.string().optional(),
});

const itemSchema = z.union([
  z.string().min(1).max(160),
  z.object({
    key: z.string().min(1).max(120).optional(),
    label: z.string().min(1).max(160).optional(),
    required: z.boolean().optional(),
    received_document_slug: z.string().optional(),
  }),
]);

const docRequestPostSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  items: z.array(itemSchema).optional(),
  text: z.string().max(2_000).optional(),
  channel: z.enum(["whatsapp", "portal", "email", "manual"]).default("whatsapp"),
  recipient_role: z.enum(["client", "lawyer", "assistant", "other"]).default("client"),
  status: z.enum(["draft", "sent", "partially_fulfilled", "fulfilled", "expired"]).default("draft"),
  source_event_slug: z.string().optional(),
  message_draft: z.string().max(5_000).optional(),
  include_portal_link: z.boolean().default(false),
});

const docRequestPatchSchema = z.object({
  slug: z.string().min(1, "slug_required"),
  status: z.enum(["draft", "sent", "partially_fulfilled", "fulfilled", "expired"]).optional(),
  items: z.array(itemSchema).optional(),
  message_draft: z.string().max(5_000).optional(),
  sent_at: z.string().optional(),
});

function pagesFrom(data: unknown): BrainPage[] {
  if (Array.isArray(data)) return data as BrainPage[];
  if (data && typeof data === "object" && Array.isArray((data as { pages?: unknown }).pages)) {
    return (data as { pages: BrainPage[] }).pages;
  }
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: BrainPage[] }).items;
  }
  return [];
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: docRequestQuerySchema,
    cacheMaxAge: 15,
  },
  async (ctx, _body, query, _req) => {
    const limit = Math.min(Number.parseInt(query.limit || "100", 10) || 100, 250);
    const res = await fetch(`${ENGINE_URL}/api/pages?type=document_request&limit=${limit}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok)
      return apiError(
        "document_requests_list_failed",
        "Dokumentenanfragen konnten nicht geladen werden",
        502
      );

    const requests = pagesFrom(await res.json().catch(() => []))
      .map(documentRequestFromPage)
      .filter(
        (item): item is NonNullable<ReturnType<typeof documentRequestFromPage>> => item !== null
      )
      .filter((item) => !query.caseSlug || item.frontmatter.case_slug === query.caseSlug)
      .filter((item) => !query.status || item.frontmatter.status === query.status)
      .sort(
        (a, b) =>
          new Date(b.frontmatter.created_at).getTime() -
          new Date(a.frontmatter.created_at).getTime()
      );

    return Response.json({ requests, total: requests.length });
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: docRequestPostSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "document_request",
      entityId: body.case_slug,
      details: { channel: body.channel, status: body.status },
    }),
  },
  async (ctx, body, _query, _req) => {
    const items = body.items?.length
      ? body.items
      : extractRequestedDocumentItems(body.text || body.message_draft || "");
    const request = await buildDocumentRequest({
      brainId: ctx.brainId,
      caseSlug: body.case_slug,
      items,
      channel: body.channel,
      recipientRole: body.recipient_role,
      status: body.status,
      sourceEventSlug: body.source_event_slug,
      messageDraft: body.message_draft,
      includePortalLink: body.include_portal_link,
    });

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        slug: request.slug,
        title: request.title,
        type: "document_request",
        content: request.content,
        frontmatter: request.frontmatter,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok)
      return apiError(
        "document_request_create_failed",
        "Dokumentenanfrage konnte nicht erstellt werden",
        502
      );

    broadcastSseEvent(ctx.brainId, "document_request.created", {
      slug: request.slug,
      caseSlug: body.case_slug,
      by: ctx.user.email,
    });
    return Response.json({ request }, { status: 201 });
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: docRequestPatchSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "document_request",
      entityId: body.slug,
      details: { status: body.status },
    }),
  },
  async (ctx, body, _query, _req) => {
    const patch: Partial<DocumentRequestFrontmatter> = {
      status: body.status,
      items: body.items?.map((item) =>
        typeof item === "string"
          ? { key: item.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: item, required: true }
          : {
              key:
                item.key || (item.label || "unterlage").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
              label: item.label || item.key || "Unterlage",
              required: item.required ?? true,
              received_document_slug: item.received_document_slug,
            }
      ),
      message_draft: body.message_draft,
      sent_at: body.sent_at,
      updated_at: new Date().toISOString(),
    };
    Object.keys(patch).forEach((key) => {
      if ((patch as Record<string, unknown>)[key] === undefined)
        delete (patch as Record<string, unknown>)[key];
    });

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        slug: body.slug,
        title: "Dokumentenanfrage Update",
        type: "document_request",
        frontmatter: patch,
        ...(body.message_draft ? { content: body.message_draft } : {}),
        merge: true,
        signal: AbortSignal.timeout(15_000),
      }),
    });
    if (!res.ok)
      return apiError(
        "document_request_update_failed",
        "Dokumentenanfrage konnte nicht aktualisiert werden",
        502
      );

    broadcastSseEvent(ctx.brainId, "document_request.updated", {
      slug: body.slug,
      by: ctx.user.email,
    });
    return Response.json({ ok: true, slug: body.slug, patch });
  }
);
