import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { apiError, apiSuccess } from "@/lib/api-response";
import { ENGINE_URL } from "@/lib/engine";

export const maxDuration = 60;

const uploadDocumentSchema = z.object({
  file_name: z.string().min(1),
  file_type: z.string().min(1),
  file_size: z.number().positive(),
  storage_path: z.string().min(1),
  metadata: z.object({
    whatsapp_message_id: z.string().optional(),
    client_portal_upload: z.boolean().optional(),
  }).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: z.object({
      type: z.string().optional(),
      search: z.string().optional(),
      page: z.string().optional(),
      limit: z.string().optional(),
    }),
  },
  async (ctx, _body, query, req) => {
    const routeParams = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const id = routeParams.id;
    const { type, search, page = "1", limit = "50" } = query;

    const params = new URLSearchParams();
    params.set("type", "shared_space_document");
    params.set("limit", limit);
    params.set("page", page);
    if (type) params.set("file_type", type);
    if (search) params.set("search", search);

    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return apiError("documents_fetch_failed", `Engine ${res.status}`, res.status);
    }

    const data = await res.json();
    return apiSuccess(data);
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: uploadDocumentSchema,
    audit: (_ctx, body) => ({
      action: "document.upload" as const,
      entityType: "shared_space_document",
      details: { file_name: body.file_name, file_size: body.file_size },
    }),
  },
  async (ctx, body, _query, req) => {
    const routeParams = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const id = routeParams.id;

    const document = {
      slug: `${id}/doc/${Date.now()}`,
      title: body.file_name,
      type: "shared_space_document",
      content: "",
      frontmatter: {
        shared_space_id: id,
        uploaded_by: ctx.user.id,
        file_name: body.file_name,
        file_type: body.file_type,
        file_size: body.file_size,
        storage_path: body.storage_path,
        uploaded_at: new Date().toISOString(),
        metadata: body.metadata || {},
      },
    };

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify(document),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      return apiError("document_upload_failed", `Engine ${res.status}`, res.status);
    }

    const data = await res.json();
    return apiSuccess(data);
  }
);
