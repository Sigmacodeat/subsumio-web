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
import { groups } from "@/lib/scim-groups";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/scim/Groups/:id
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const authError = requireScimAuth(req);
  if (authError) return authError;

  const { id } = await params;
  const group = groups.get(id);

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
  const authError = requireScimAuth(req);
  if (authError) return authError;

  const { id } = await params;
  const existing = groups.get(id);

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

  const updated: SCIMGroup = {
    ...scimGroup,
    id,
    schemas: [SCIM_SCHEMA_GROUP],
    meta: {
      resourceType: "Group",
      created: existing.meta?.created,
      lastModified: new Date().toISOString(),
    },
  };

  groups.set(id, updated);
  return scimResponse(updated);
}

/**
 * PATCH /api/scim/Groups/:id
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const authError = requireScimAuth(req);
  if (authError) return authError;

  const { id } = await params;
  const existing = groups.get(id);

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

  const updated = { ...existing };

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
  const authError = requireScimAuth(req);
  if (authError) return authError;

  const { id } = await params;

  if (!groups.has(id)) {
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
