import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { apiError, apiSuccess } from "@/lib/api-response";
import { ENGINE_URL } from "@/lib/engine";
import { generateSpaceSlug, generateSourceId, type SharedSpace } from "@/lib/shared-spaces";

export const maxDuration = 30;

const createSpaceSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createSpaceSchema,
    audit: (_ctx, body) => ({
      action: "case.create" as const,
      entityType: "shared_space",
      details: { title: body.title },
    }),
  },
  async (ctx, body, _query, _req) => {
    const slug = generateSpaceSlug(body.title);
    const spaceId = slug.split("/")[1] ?? slug;
    const sourceId = generateSourceId(spaceId);

    const space: SharedSpace = {
      id: spaceId,
      slug,
      title: body.title,
      description: body.description ?? "",
      owner_org_id: ctx.user.orgId ?? ctx.user.id,
      owner_org_name: ctx.user.name,
      source_id: sourceId,
      members: [
        {
          org_id: ctx.user.orgId ?? ctx.user.id,
          org_name: ctx.user.name,
          role: "owner",
          invited_by: ctx.user.id,
          invited_at: new Date().toISOString(),
          accepted_at: new Date().toISOString(),
          status: "active",
        },
      ],
      resources: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      settings: {
        default_permission: "read",
        allow_member_invite: false,
        require_approval_for_resources: true,
      },
    };

    const payload = {
      slug,
      title: body.title,
      type: "shared_space",
      compiled_truth: body.description ?? "",
      frontmatter: space,
    };

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return apiError("space_creation_failed", errText || `Engine ${res.status}`, res.status);
    }

    const created = (await res.json()) as { slug: string };
    return apiSuccess({ ...space, slug: created.slug });
  }
);

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    const params = new URLSearchParams();
    params.set("type", "shared_space");
    params.set("limit", "50");

    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
    });

    if (!res.ok) {
      return apiError("spaces_fetch_failed", `Engine ${res.status}`, res.status);
    }

    const data = (await res.json()) as {
      pages: Array<{ slug: string; title: string; frontmatter: Record<string, unknown> }>;
    };
    const spaces = (data.pages ?? []).map((p) => ({
      slug: p.slug,
      title: p.title,
      ...(p.frontmatter as Partial<SharedSpace>),
    }));

    return apiSuccess(spaces);
  }
);
