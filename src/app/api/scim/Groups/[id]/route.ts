import { createScimHandler } from "@/lib/api-handler";
import {
  requireScimAuth,
  scimError,
  scimResponse,
  SCIM_SCHEMA_GROUP,
  SCIM_SCHEMA_PATCH_OP,
  syncRolesAfterGroupChange,
  type SCIMGroup,
  type SCIMPatchRequest,
} from "@/lib/scim";
import {
  applyGroupPatch,
  getGroupForOrg,
  getScimGroupStore,
  type StoredScimGroup,
} from "@/lib/scim-groups";
import { logAudit } from "@/lib/audit";
import { auditBrainForOrg } from "@/lib/audit-user";

async function auditGroup(orgId: string, id: string, operation: string, displayName?: string) {
  await logAudit("scim.group_synced", "group", {
    brainId: await auditBrainForOrg(orgId),
    entityId: id,
    details: { operation, ...(displayName ? { displayName } : {}) },
  });
}
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
    const group = await getGroupForOrg(id, orgId);

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
    const existing = await getGroupForOrg(id, orgId);

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

    await getScimGroupStore().put(updated);
    await syncRolesAfterGroupChange(orgId, existing, updated);
    await auditGroup(orgId, id, "replace", updated.displayName);
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
    const patchReq = body as SCIMPatchRequest;

    if (!patchReq.schemas?.includes(SCIM_SCHEMA_PATCH_OP)) {
      return scimError(400, "Missing or invalid schemas for PATCH");
    }

    const result = await getScimGroupStore().update(orgId, id, (group) => {
      for (const op of patchReq.Operations || []) {
        applyGroupPatch(group, op);
      }
      group.meta = {
        resourceType: "Group",
        created: group.meta?.created,
        lastModified: new Date().toISOString(),
      };
      return group;
    });
    if (!result) {
      return scimError(404, `Group ${id} not found`);
    }

    await syncRolesAfterGroupChange(orgId, result.before, result.after);
    await auditGroup(orgId, id, "patch", result.after.displayName);
    return scimResponse(result.after);
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

    const removed = await getScimGroupStore().delete(orgId, id);
    if (!removed) {
      return scimError(404, `Group ${id} not found`);
    }

    await syncRolesAfterGroupChange(orgId, removed, null);
    await auditGroup(orgId, id, "delete", removed.displayName);
    return new Response(null, { status: 204 });
  }
);
