import { createScimHandler } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import {
  requireScimAuth,
  scimError,
  scimResponse,
  userToScim,
  provisionOrUpdateUser,
  deprovisionUser,
  parseScimBoolean,
  SCIM_SCHEMA_USER,
  SCIM_SCHEMA_PATCH_OP,
  type SCIMUser,
  type SCIMPatchRequest,
  type SCIMPatchOperation,
} from "@/lib/scim";
import { z } from "zod";

import { logger } from "@/lib/logger";
const log = logger("api/scim/Users/[id]");

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://subsum.io";

const updateUserSchema = z.object({
  schemas: z.array(z.string().max(200)).max(20),
  userName: z.string().max(500).optional(),
  emails: z
    .array(
      z.object({
        value: z.string().max(500),
        type: z.string().max(50).optional(),
        primary: z.boolean().optional(),
      })
    )
    .max(20)
    .optional(),
  externalId: z.string().max(200).optional(),
  id: z.string().max(200).optional(),
  name: z
    .object({
      givenName: z.string().max(200).optional(),
      familyName: z.string().max(200).optional(),
      formatted: z.string().max(500).optional(),
    })
    .optional(),
  displayName: z.string().max(500).optional(),
  active: z.boolean().optional(),
  title: z.string().max(200).optional(),
  userType: z.string().max(200).optional(),
  department: z.string().max(200).optional(),
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
 * GET /api/scim/Users/:id
 * Retrieve a single user by ID.
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
      log.error("[scim/Users PUT] error:", msg);
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
      const invalid = applyPatchOperation(currentScim, op);
      if (invalid) return scimError(400, invalid, "invalidValue");
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
      log.error("[scim/Users PATCH] error:", msg);
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
    const updated = await deprovisionUser(id, orgId);

    if (!updated) {
      return scimError(404, `User ${id} not found`);
    }

    // SCIM spec: return 204 No Content
    return new Response(null, { status: 204 });
  }
);

// ── Patch Operation Helpers ────────────────────────────────────────────
//
// Each helper returns an error text for a value it cannot apply (answered
// with 400 invalidValue) and null otherwise. Unknown attributes are ignored.

function applyPatchOperation(user: SCIMUser, op: SCIMPatchOperation): string | null {
  const path = op.path || "";
  const value = op.value;

  switch (op.op.toLowerCase()) {
    case "replace":
      return applyReplace(user, path, value);
    case "add":
      return applyAdd(user, path, value);
    case "remove":
      applyRemove(user, path);
      return null;
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * RFC 7644 §3.5.2.3: without `path`, `value` is an object whose attributes
 * are each replaced (Okta deactivates with `{"value":{"active":false}}`).
 * A nested `name` object sets its sub-attributes.
 */
function applyReplaceAll(user: SCIMUser, value: unknown): string | null {
  if (!isPlainObject(value)) return "PATCH without path needs an object value";
  for (const [key, attr] of Object.entries(value)) {
    if (key.toLowerCase() === "name" && isPlainObject(attr)) {
      for (const [sub, subValue] of Object.entries(attr)) {
        const invalid = applyReplace(user, `name.${sub}`, subValue);
        if (invalid) return invalid;
      }
      continue;
    }
    const invalid = applyReplace(user, key, attr);
    if (invalid) return invalid;
  }
  return null;
}

function applyReplace(user: SCIMUser, path: string, value: unknown): string | null {
  if (path === "") return applyReplaceAll(user, value);
  const lowerPath = path.toLowerCase();

  if (lowerPath === "username") {
    user.userName = String(value);
  } else if (lowerPath === "displayname") {
    user.displayName = String(value);
  } else if (lowerPath === "active") {
    const active = parseScimBoolean(value);
    if (active === null) return "active must be true or false";
    user.active = active;
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
  return null;
}

function applyAdd(user: SCIMUser, path: string, value: unknown): string | null {
  // For "add", we merge rather than replace
  const lowerPath = path.toLowerCase();

  if (lowerPath === "emails" && Array.isArray(value)) {
    const newEmails = value as SCIMUser["emails"];
    user.emails = [...(user.emails || []), ...newEmails];
    return null;
  }
  // For single-value attributes (and a path-less object), add behaves like replace
  return applyReplace(user, path, value);
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
