import { NextRequest } from "next/server";
import {
  requireScimAuth,
  scimError,
  scimResponse,
  SCIM_SCHEMA_GROUP,
  SCIM_SCHEMA_PATCH_OP,
  type SCIMGroup,
  type SCIMPatchRequest,
  type SCIMPatchOperation,
} from "@/lib/scim";

export const dynamic = "force-dynamic";

// Import the shared groups map from the shared module
import { groups, getGroupForOrg, type StoredScimGroup } from "@/lib/scim-groups";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/scim/Groups/:id
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = requireScimAuth(req);
  if (auth instanceof Response) return auth;
  const { orgId } = auth;

  const { id } = await params;
  const group = getGroupForOrg(id, orgId);

  if (!group) {
    return scimError(404, `Group ${id} not found`);
  }

  return scimResponse(group);
}

/**
 * PUT /api/scim/Groups/:id
 * Replace group attributes.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = requireScimAuth(req);
  if (auth instanceof Response) return auth;
  const { orgId } = auth;

  const { id } = await params;
  const existing = getGroupForOrg(id, orgId);

  if (!existing) {
    return scimError(404, `Group ${id} not found`);
  }

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

/**
 * PATCH /api/scim/Groups/:id
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = requireScimAuth(req);
  if (auth instanceof Response) return auth;
  const { orgId } = auth;

  const { id } = await params;
  const existing = getGroupForOrg(id, orgId);

  if (!existing) {
    return scimError(404, `Group ${id} not found`);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return scimError(400, "Request body is not valid JSON");
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

/**
 * DELETE /api/scim/Groups/:id
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = requireScimAuth(req);
  if (auth instanceof Response) return auth;
  const { orgId } = auth;

  const { id } = await params;

  if (!getGroupForOrg(id, orgId)) {
    return scimError(404, `Group ${id} not found`);
  }

  groups.delete(id);
  return new Response(null, { status: 204 });
}

function applyGroupPatch(group: SCIMGroup, op: SCIMPatchOperation): void {
  const path = op.path || "";
  const lowerPath = path.toLowerCase();

  switch (op.op.toLowerCase()) {
    case "replace":
    case "add":
      if (lowerPath === "displayname") {
        group.displayName = String(op.value);
      } else if (lowerPath === "members" && Array.isArray(op.value)) {
        const newMembers = op.value as SCIMGroup["members"];
        if (op.op.toLowerCase() === "add") {
          group.members = [...(group.members || []), ...(newMembers || [])];
        } else {
          group.members = newMembers;
        }
      }
      break;
    case "remove":
      if (lowerPath === "members") {
        group.members = [];
      } else if (lowerPath === "displayname") {
        // displayName is required, can't remove
      }
      break;
  }
}
