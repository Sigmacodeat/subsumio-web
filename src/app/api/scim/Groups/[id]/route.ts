import { createScimHandler } from "@/lib/api-handler";
import {
  requireScimAuth,
  scimError,
  scimResponse,
  SCIM_SCHEMA_GROUP,
  SCIM_SCHEMA_PATCH_OP,
  type SCIMGroup,
  type SCIMPatchRequest,
} from "@/lib/scim";
import {
  applyGroupPatch,
  groups,
  getGroupForOrg,
  type StoredScimGroup,
} from "@/lib/scim-groups";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateGroupSchema = z.object({
  schemas: z.array(z.string().max(200)).max(20),
  displayName: z.string().max(500).optional(),
  externalId: z.string().max(200).optional(),
  id: z.string().max(200).optional(),
  members: z.array(z.any()).max(1000).optional(),
});

const patchRequestSchema = z.object({
  schemas: z.array(z.string().max(200)).max(20),
  Operations: z
    .array(
      z.object({
        op: z.string().max(50),
        path: z.string().max(500).optional(),
        value: z.any().optional(),
      })
    )
    .max(100)
    .optional(),
});

/**
 * GET /api/scim/Groups/:id
 */
export const GET = createScimHandler(
  {
    customAuth: async (req) => {
      const auth = await requireScimAuth(req);
      if (auth instanceof Response) return auth;
      return { context: { orgId: auth.orgId } };
    },
  },
  async (ctx, _body, _query, extra) => {
    const orgId = (ctx as Record<string, unknown>).orgId as string;
    const params = await (extra.params || Promise.resolve({}));
    const { id } = params as { id: string };
    const group = getGroupForOrg(id, orgId);

    if (!group) {
      return scimError(404, `Group ${id} not found`);
    }

    return scimResponse(group);
  }
);

/**
 * PUT /api/scim/Groups/:id
 * Replace group attributes.
 */
export const PUT = createScimHandler(
  {
    body: updateGroupSchema,
    customAuth: async (req) => {
      const auth = await requireScimAuth(req);
      if (auth instanceof Response) return auth;
      return { context: { orgId: auth.orgId } };
    },
  },
  async (ctx, body, _query, extra) => {
    const orgId = (ctx as Record<string, unknown>).orgId as string;
    const params = await (extra.params || Promise.resolve({}));
    const { id } = params as { id: string };
    const existing = getGroupForOrg(id, orgId);

    if (!existing) {
      return scimError(404, `Group ${id} not found`);
    }

    const scimGroup = body as SCIMGroup;

    if (!scimGroup.schemas?.includes(SCIM_SCHEMA_GROUP)) {
      return scimError(400, "Missing or invalid schemas");
    }

    const updated: StoredScimGroup = {
      ...scimGroup,
      id,
      schemas: [SCIM_SCHEMA_GROUP],
      meta: {
        resourceType: "Group",
        created: existing.meta?.created,
        lastModified: new Date().toISOString(),
      },
      _orgId: orgId,
    };

    groups.set(id, updated);
    return scimResponse(updated);
  }
);

/**
 * PATCH /api/scim/Groups/:id
 */
export const PATCH = createScimHandler(
  {
    body: patchRequestSchema,
    customAuth: async (req) => {
      const auth = await requireScimAuth(req);
      if (auth instanceof Response) return auth;
      return { context: { orgId: auth.orgId } };
    },
  },
  async (ctx, body, _query, extra) => {
    const orgId = (ctx as Record<string, unknown>).orgId as string;
    const params = await (extra.params || Promise.resolve({}));
    const { id } = params as { id: string };
    const existing = getGroupForOrg(id, orgId);

    if (!existing) {
      return scimError(404, `Group ${id} not found`);
    }

    const patchReq = body as SCIMPatchRequest;

    if (!patchReq.schemas?.includes(SCIM_SCHEMA_PATCH_OP)) {
      return scimError(400, "Missing or invalid schemas for PATCH");
    }

    const updated: StoredScimGroup = { ...existing };

    for (const op of patchReq.Operations || []) {
      applyGroupPatch(updated, op);
    }

    updated.meta = {
      resourceType: "Group",
      created: updated.meta?.created,
      lastModified: new Date().toISOString(),
    };

    groups.set(id, updated);
    return scimResponse(updated);
  }
);

/**
 * DELETE /api/scim/Groups/:id
 */
export const DELETE = createScimHandler(
  {
    customAuth: async (req) => {
      const auth = await requireScimAuth(req);
      if (auth instanceof Response) return auth;
      return { context: { orgId: auth.orgId } };
    },
  },
  async (ctx, _body, _query, extra) => {
    const orgId = (ctx as Record<string, unknown>).orgId as string;
    const params = await (extra.params || Promise.resolve({}));
    const { id } = params as { id: string };

    if (!getGroupForOrg(id, orgId)) {
      return scimError(404, `Group ${id} not found`);
    }

    groups.delete(id);
    return new Response(null, { status: 204 });
  }
);
