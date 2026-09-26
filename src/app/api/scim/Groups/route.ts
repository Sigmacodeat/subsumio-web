import { createScimHandler } from "@/lib/api-handler";
import {
  requireScimAuth,
  scimError,
  scimListResponse,
  scimResponse,
  SCIM_SCHEMA_GROUP,
  syncRolesAfterGroupChange,
  type SCIMGroup,
} from "@/lib/scim";
import { getScimGroupStore, listGroupsForOrg, type StoredScimGroup } from "@/lib/scim-groups";
import { logAudit } from "@/lib/audit";
import { auditBrainForOrg } from "@/lib/audit-user";
import { z } from "zod";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  startIndex: z.string().optional(),
  count: z.string().optional(),
});

const createGroupSchema = z.object({
  schemas: z.array(z.string().max(200)).max(20),
  displayName: z.string().max(500).optional(),
  externalId: z.string().max(200).optional(),
  id: z.string().max(200).optional(),
  members: z.array(z.any()).max(1000).optional(),
});

/**
 * GET /api/scim/Groups
 * List groups with optional pagination.
 */
export const GET = createScimHandler(
  {
    query: listQuerySchema,
    customAuth: async (req) => {
      const auth = await requireScimAuth(req);
      if (auth instanceof Response) return auth;
      return { context: { orgId: auth.orgId } };
    },
  },
  async (ctx, _body, query) => {
    const orgId = (ctx as Record<string, unknown>).orgId as string;
    const startIndex = Math.max(1, parseInt(query.startIndex || "1", 10));
    const count = Math.min(200, Math.max(1, parseInt(query.count || "100", 10)));

    const allGroups = await listGroupsForOrg(orgId);
    const total = allGroups.length;
    const paged = allGroups.slice(startIndex - 1, startIndex - 1 + count);

    return scimListResponse(paged, startIndex, count, total);
  }
);

/**
 * POST /api/scim/Groups
 * Create a new group.
 */
export const POST = createScimHandler(
  {
    body: createGroupSchema,
    customAuth: async (req) => {
      const auth = await requireScimAuth(req);
      if (auth instanceof Response) return auth;
      return { context: { orgId: auth.orgId } };
    },
  },
  async (ctx, body, _query, _extra) => {
    const orgId = (ctx as Record<string, unknown>).orgId as string;
    const scimGroup = body as SCIMGroup;

    if (!scimGroup.schemas?.includes(SCIM_SCHEMA_GROUP)) {
      return scimError(400, "Missing or invalid schemas");
    }

    if (!scimGroup.displayName) {
      return scimError(400, "displayName is required", "invalidValue");
    }

    // Check for duplicate — scoped to this org only
    const existing = await listGroupsForOrg(orgId);
    for (const g of existing) {
      if (g.displayName === scimGroup.displayName) {
        return scimError(409, `Group "${scimGroup.displayName}" already exists`, "uniqueness");
      }
    }

    const groupId = scimGroup.id || crypto.randomUUID();
    if (existing.some((g) => g.id === groupId)) {
      return scimError(409, `Group ${groupId} already exists`, "uniqueness");
    }
    const created: StoredScimGroup = {
      ...scimGroup,
      id: groupId,
      schemas: [SCIM_SCHEMA_GROUP],
      meta: {
        resourceType: "Group",
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      },
      _orgId: orgId,
    };

    await getScimGroupStore().put(created);
    await syncRolesAfterGroupChange(orgId, null, created);
    await logAudit("scim.group_synced", "group", {
      brainId: await auditBrainForOrg(orgId),
      entityId: groupId,
      details: { operation: "create", displayName: created.displayName },
    });

    return scimResponse(created, 201);
  }
);
