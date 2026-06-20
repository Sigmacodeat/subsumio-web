import { NextRequest } from "next/server";
import {
  requireScimAuth,
  scimError,
  scimListResponse,
  scimResponse,
  SCIM_SCHEMA_GROUP,
  type SCIMGroup,
} from "@/lib/scim";
import { groups } from "@/lib/scim-groups";

export const dynamic = "force-dynamic";

/**
 * GET /api/scim/Groups
 * List groups with optional pagination.
 */
export async function GET(req: NextRequest) {
  const authError = requireScimAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const startIndex = Math.max(
    1,
    parseInt(searchParams.get("startIndex") || "1", 10),
  );
  const count = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get("count") || "100", 10)),
  );

  const allGroups = Array.from(groups.values());
  const total = allGroups.length;
  const paged = allGroups.slice(startIndex - 1, startIndex - 1 + count);

  return scimListResponse(paged, startIndex, count, total);
}

/**
 * POST /api/scim/Groups
 * Create a new group.
 */
export async function POST(req: NextRequest) {
  const authError = requireScimAuth(req);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return scimError(400, "Request body is not valid JSON");
  }

  const scimGroup = body as SCIMGroup;

  if (!scimGroup.schemas?.includes(SCIM_SCHEMA_GROUP)) {
    return scimError(400, "Missing or invalid schemas");
  }

  if (!scimGroup.displayName) {
    return scimError(400, "displayName is required", "invalidValue");
  }

  // Check for duplicate
  for (const g of groups.values()) {
    if (g.displayName === scimGroup.displayName) {
      return scimError(
        409,
        `Group "${scimGroup.displayName}" already exists`,
        "uniqueness",
      );
    }
  }

  const groupId = scimGroup.id || crypto.randomUUID();
  const created: SCIMGroup = {
    ...scimGroup,
    id: groupId,
    schemas: [SCIM_SCHEMA_GROUP],
    meta: {
      resourceType: "Group",
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    },
  };

  groups.set(groupId, created);

  return scimResponse(created, 201);
}
