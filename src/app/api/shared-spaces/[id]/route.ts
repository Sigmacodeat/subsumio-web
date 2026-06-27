import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { apiError, apiSuccess } from "@/lib/api-response";
import { ENGINE_URL } from "@/lib/engine";
import type { AuditSpec } from "@/lib/api-handler";
import type { NextRequest } from "next/server";

export const maxDuration = 30;

const updateSpaceSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  expires_at: z.string().optional(),
  settings: z.object({
    allow_upload: z.boolean().optional(),
    allow_download: z.boolean().optional(),
    max_file_size: z.number().optional(),
    allowed_file_types: z.array(z.string()).optional(),
    require_auth: z.boolean().optional(),
  }).optional(),
});

async function getIdFromParams(req: NextRequest): Promise<string> {
  const params = await (req as unknown as { params: Promise<{ id: string }> }).params;
  return params.id;
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const id = await getIdFromParams(req);

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(id)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return apiError("space_fetch_failed", `Engine ${res.status}`, res.status);
    }

    const data = await res.json();
    return apiSuccess(data);
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: updateSpaceSchema,
    audit: (_ctx, body) =>
      ({
        action: "space.update",
        entityType: "shared_space",
        details: body,
      }) as AuditSpec,
  },
  async (ctx, body, _query, req) => {
    const id = await getIdFromParams(req);

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return apiError("space_update_failed", `Engine ${res.status}`, res.status);
    }

    const data = await res.json();
    return apiSuccess(data);
  }
);

export const DELETE = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    audit: (_ctx, _body) =>
      ({
        action: "space.delete",
        entityType: "shared_space",
        details: { id: "deleted" },
      }) as AuditSpec,
  },
  async (ctx, _body, _query, req) => {
    const id = await getIdFromParams(req);

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: ctx.headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return apiError("space_delete_failed", `Engine ${res.status}`, res.status);
    }

    return apiSuccess({ deleted: true });
  }
);
