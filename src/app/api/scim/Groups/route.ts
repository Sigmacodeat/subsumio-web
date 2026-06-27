import { createScimHandler } from "@/lib/api-handler";
import {
  requireScimAuth,
  scimError,
  scimListResponse,
  scimResponse,
  SCIM_SCHEMA_GROUP,
  type SCIMGroup,
} from "@/lib/scim";
import { groups, listGroupsForOrg, type StoredScimGroup } from "@/lib/scim-groups";
import { z } from "zod";

export const dynamic = "force-dynamic";

const listQuerySchema = z.object({
  startIndex: z.string().optional(),
  count: z.string().optional(),
});

const createGroupSchema = z.object({
  schemas: z.array(z.string()),
  displayName: z.string().optional(),
  externalId: z.string().optional(),
  id: z.string().optional(),
  members: z.array(z.any()).optional(),
});

/**
 * GET /api/scim/Groups
 * List groups with optional pagination.
 */
export const GET = createScimHandler(
  {
    query: listQuerySchema,
    customAuth: (req) => {
      const auth = requireScimAuth(req);
      if (auth instanceof Response) return auth;
      return { context: { orgId: auth.orgId } };
    },
  },
  async (ctx, _body, query) => {
    const orgId = (ctx as Record<string, unknown>).orgId as string;
    const startIndex = Math.max(1, parseInt(query.startIndex || "1", 10));
    const count = Math.min(200, Math.max(1, parseInt(query.count || "100", 10)));

    const allGroups = listGroupsForOrg(orgId);
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
    customAuth: (req) => {
      const auth = requireScimAuth(req);
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
    for (const g of listGroupsForOrg(orgId)) {
      if (g.displayName === scimGroup.displayName) {
        return scimError(409, `Group "${scimGroup.displayName}" already exists`, "uniqueness");
      }
    }

    const groupId = scimGroup.id || crypto.randomUUID();
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

    groups.set(groupId, created);

    return scimResponse(created, 201);
  }
);
