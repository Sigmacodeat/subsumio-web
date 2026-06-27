import { createScimHandler } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import {
  requireScimAuth,
  scimError,
  scimResponse,
  userToScim,
  provisionOrUpdateUser,
  deprovisionUser,
  SCIM_SCHEMA_USER,
  SCIM_SCHEMA_PATCH_OP,
  type SCIMUser,
  type SCIMPatchRequest,
  type SCIMPatchOperation,
} from "@/lib/scim";
import { z } from "zod";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://subsum.eu";

const updateUserSchema = z.object({
  schemas: z.array(z.string()),
  userName: z.string().optional(),
  emails: z.array(z.object({ value: z.string(), type: z.string().optional(), primary: z.boolean().optional() })).optional(),
  externalId: z.string().optional(),
  id: z.string().optional(),
  name: z.object({ givenName: z.string().optional(), familyName: z.string().optional(), formatted: z.string().optional() }).optional(),
  displayName: z.string().optional(),
  active: z.boolean().optional(),
  title: z.string().optional(),
  userType: z.string().optional(),
  department: z.string().optional(),
});

const patchRequestSchema = z.object({
  schemas: z.array(z.string()),
  Operations: z.array(z.object({
    op: z.string(),
    path: z.string().optional(),
    value: z.any().optional(),
  })).optional(),
});

/**
 * GET /api/scim/Users/:id
 * Retrieve a single user by ID.
 */
export const GET = createScimHandler(
  {
    customAuth: (req) => {
      const auth = requireScimAuth(req);
      if (auth instanceof Response) return auth;
      return { context: { orgId: auth.orgId } };
    },
  },
  async (ctx, _body, _query, extra) => {
    const orgId = (ctx as Record<string, unknown>).orgId as string;
    const params = await (extra.params || Promise.resolve({}));
    const { id } = params as { id: string };
    const store = getStore();
    const user = await store.getById(id);

    if (!user || user.orgId !== orgId) {
      return scimError(404, `User ${id} not found`);
    }

    return scimResponse(userToScim(user, BASE_URL));
  }
);

/**
 * PUT /api/scim/Users/:id
 * Replace a user's attributes (full replacement per SCIM 2.0 spec).
 */
export const PUT = createScimHandler(
  {
    body: updateUserSchema,
    customAuth: (req) => {
      const auth = requireScimAuth(req);
      if (auth instanceof Response) return auth;
      return { context: { orgId: auth.orgId } };
    },
  },
  async (ctx, body, _query, extra) => {
    const orgId = (ctx as Record<string, unknown>).orgId as string;
    const params = await (extra.params || Promise.resolve({}));
    const { id } = params as { id: string };
    const store = getStore();
    const existing = await store.getById(id);

    if (!existing || existing.orgId !== orgId) {
      return scimError(404, `User ${id} not found`);
    }

    const scimUser = body as SCIMUser;

    if (!scimUser.schemas?.includes(SCIM_SCHEMA_USER)) {
      return scimError(400, "Missing or invalid schemas");
    }

    // Ensure the ID matches
    scimUser.id = id;
    if (!scimUser.externalId) {
      scimUser.externalId = existing.scimExternalId || undefined;
    }

    try {
      const { user } = await provisionOrUpdateUser(scimUser, orgId);
      return scimResponse(userToScim(user, BASE_URL));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[scim/Users PUT] error:", msg);
      return scimError(500, "Failed to update user");
    }
  }
);

/**
 * PATCH /api/scim/Users/:id
 * Apply partial updates per SCIM 2.0 PATCH operation.
 */
export const PATCH = createScimHandler(
  {
    body: patchRequestSchema,
    customAuth: (req) => {
      const auth = requireScimAuth(req);
      if (auth instanceof Response) return auth;
      return { context: { orgId: auth.orgId } };
    },
  },
  async (ctx, body, _query, extra) => {
    const orgId = (ctx as Record<string, unknown>).orgId as string;
    const params = await (extra.params || Promise.resolve({}));
    const { id } = params as { id: string };
    const store = getStore();
    const existing = await store.getById(id);

    if (!existing || existing.orgId !== orgId) {
      return scimError(404, `User ${id} not found`);
    }

    const patchReq = body as SCIMPatchRequest;

    if (!patchReq.schemas?.includes(SCIM_SCHEMA_PATCH_OP)) {
      return scimError(400, "Missing or invalid schemas for PATCH");
    }

    // Apply patch operations to build an updated SCIM user
    const currentScim = userToScim(existing, BASE_URL);

    for (const op of patchReq.Operations || []) {
      applyPatchOperation(currentScim, op);
    }

    // Now provision/update with the patched data
    currentScim.id = id;
    if (!currentScim.externalId) {
      currentScim.externalId = existing.scimExternalId || undefined;
    }

    try {
      const { user } = await provisionOrUpdateUser(currentScim, orgId);
      return scimResponse(userToScim(user, BASE_URL));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[scim/Users PATCH] error:", msg);
      return scimError(500, "Failed to patch user");
    }
  }
);

/**
 * DELETE /api/scim/Users/:id
 * Deactivate a user (NOT delete — for audit trail).
 */
export const DELETE = createScimHandler(
  {
    customAuth: (req) => {
      const auth = requireScimAuth(req);
      if (auth instanceof Response) return auth;
      return { context: { orgId: auth.orgId } };
    },
  },
  async (ctx, _body, _query, extra) => {
    const orgId = (ctx as Record<string, unknown>).orgId as string;
    const params = await (extra.params || Promise.resolve({}));
    const { id } = params as { id: string };
    const updated = await deprovisionUser(id, orgId);

    if (!updated) {
      return scimError(404, `User ${id} not found`);
    }

    // SCIM spec: return 204 No Content
    return new Response(null, { status: 204 });
  }
);

// ── Patch Operation Helpers ────────────────────────────────────────────

function applyPatchOperation(user: SCIMUser, op: SCIMPatchOperation): void {
  const path = op.path || "";
  const value = op.value;

  switch (op.op.toLowerCase()) {
    case "replace":
      applyReplace(user, path, value);
      break;
    case "add":
      applyAdd(user, path, value);
      break;
    case "remove":
      applyRemove(user, path);
      break;
  }
}

function applyReplace(user: SCIMUser, path: string, value: unknown): void {
  const lowerPath = path.toLowerCase();

  if (lowerPath === "username") {
    user.userName = String(value);
  } else if (lowerPath === "displayname") {
    user.displayName = String(value);
  } else if (lowerPath === "active") {
    user.active = Boolean(value);
  } else if (lowerPath === "name.familyname") {
    user.name = { ...user.name, familyName: String(value) };
  } else if (lowerPath === "name.givenname") {
    user.name = { ...user.name, givenName: String(value) };
  } else if (lowerPath === "name.formatted") {
    user.name = { ...user.name, formatted: String(value) };
  } else if (lowerPath === "emails" || lowerPath.startsWith("emails[")) {
    if (Array.isArray(value)) {
      user.emails = value as SCIMUser["emails"];
    }
  } else if (lowerPath === "title") {
    user.title = String(value);
  } else if (lowerPath === "usertype") {
    user.userType = String(value);
  }
}

function applyAdd(user: SCIMUser, path: string, value: unknown): void {
  // For "add", we merge rather than replace
  const lowerPath = path.toLowerCase();

  if (lowerPath === "emails" && Array.isArray(value)) {
    const newEmails = value as SCIMUser["emails"];
    user.emails = [...(user.emails || []), ...newEmails];
  } else {
    // For single-value attributes, add behaves like replace
    applyReplace(user, path, value);
  }
}

function applyRemove(user: SCIMUser, path: string): void {
  const lowerPath = path.toLowerCase();

  if (lowerPath === "emails") {
    user.emails = [];
  } else if (lowerPath === "title") {
    user.title = undefined;
  } else if (lowerPath === "usertype") {
    user.userType = undefined;
  }
}
