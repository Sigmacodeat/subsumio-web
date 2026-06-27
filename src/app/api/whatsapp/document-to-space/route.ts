import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { apiError, apiSuccess } from "@/lib/api-response";
import { ENGINE_URL } from "@/lib/engine";
import type { AuditSpec } from "@/lib/api-handler";

export const maxDuration = 30;

const documentToSpaceSchema = z.object({
  whatsapp_message_id: z.string().min(1),
  shared_space_id: z.string().min(1).optional(),
  file_name: z.string().min(1),
  file_type: z.string().min(1),
  file_size: z.number().positive(),
  storage_path: z.string().min(1),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: documentToSpaceSchema,
    audit: (_ctx, body) =>
      ({
        action: "whatsapp.document_to_space",
        entityType: "whatsapp_document_mapping",
        details: {
          whatsapp_message_id: body.whatsapp_message_id,
          shared_space_id: body.shared_space_id,
        },
      }) as AuditSpec,
  },
  async (ctx, body, _query, _req) => {
    // 1. Create document in shared space if space_id provided
    let documentId: string | undefined;
    if (body.shared_space_id) {
      const document = {
        slug: `${body.shared_space_id}/doc/${Date.now()}`,
        title: body.file_name,
        type: "shared_space_document",
        content: "",
        frontmatter: {
          shared_space_id: body.shared_space_id,
          uploaded_by: ctx.user.id,
          file_name: body.file_name,
          file_type: body.file_type,
          file_size: body.file_size,
          storage_path: body.storage_path,
          uploaded_at: new Date().toISOString(),
          metadata: {
            whatsapp_message_id: body.whatsapp_message_id,
            client_portal_upload: false,
          },
        },
      };

      const docRes = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(document),
        signal: AbortSignal.timeout(15_000),
      });

      if (!docRes.ok) {
        return apiError("document_creation_failed", `Engine ${docRes.status}`, docRes.status);
      }

      const docData = await docRes.json();
      documentId = docData.id;
    }

    // 2. Create WhatsApp document mapping
    const mapping = {
      slug: `whatsapp-mapping/${body.whatsapp_message_id}`,
      title: `WhatsApp Mapping: ${body.whatsapp_message_id}`,
      type: "whatsapp_document_mapping",
      content: "",
      frontmatter: {
        whatsapp_message_id: body.whatsapp_message_id,
        shared_space_id: body.shared_space_id,
        document_id: documentId,
        mapped_at: new Date().toISOString(),
        mapped_by: "user",
      },
    };

    const mappingRes = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify(mapping),
      signal: AbortSignal.timeout(15_000),
    });

    if (!mappingRes.ok) {
      return apiError("mapping_creation_failed", `Engine ${mappingRes.status}`, mappingRes.status);
    }

    const mappingData = await mappingRes.json();
    return apiSuccess(mappingData);
  }
);

const listMappingsQuerySchema = z
  .object({
    unmapped_only: z.string().optional(),
    date_range: z.string().optional(),
  })
  .passthrough();

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: listMappingsQuerySchema,
  },
  async (ctx, _body, query, _req) => {
    const unmapped_only = query?.unmapped_only;
    const date_range = query?.date_range;

    const params = new URLSearchParams();
    params.set("type", "whatsapp_document_mapping");
    params.set("limit", "50");
    if (unmapped_only === "true") params.set("unmapped", "true");
    if (date_range) params.set("date_range", date_range);

    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return apiError("mappings_fetch_failed", `Engine ${res.status}`, res.status);
    }

    const data = await res.json();
    return apiSuccess(data);
  }
);
