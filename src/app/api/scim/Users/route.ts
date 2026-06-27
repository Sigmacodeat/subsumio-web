import { NextRequest } from "next/server";
import { getStore } from "@/lib/auth/store";
import {
  requireScimAuth,
  scimError,
  scimListResponse,
  scimResponse,
  userToScim,
  provisionOrUpdateUser,
  parseScimFilter,
  SCIM_SCHEMA_USER,
  type SCIMUser,
} from "@/lib/scim";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://subsum.eu";

/**
 * GET /api/scim/Users
 * List users with optional pagination and filtering.
 * Query params: startIndex, count, filter
 */
export async function GET(req: NextRequest) {
  const auth = requireScimAuth(req);
  if (auth instanceof Response) return auth;
  const { orgId } = auth;

  const { searchParams } = new URL(req.url);
  const startIndex = Math.max(1, parseInt(searchParams.get("startIndex") || "1", 10));
  const count = Math.min(200, Math.max(1, parseInt(searchParams.get("count") || "100", 10)));
  const filter = searchParams.get("filter") || undefined;

  const store = getStore();
  const allUsers = await store.listByOrg(orgId);

  // Map to SCIM and filter out non-SCIM users if no filter is given
  // (SCIM endpoints should return all users when queried by IdP)
  let scimUsers = allUsers.map((u) => userToScim(u, BASE_URL));

  // Apply filter if present
  if (filter) {
    const predicate = parseScimFilter(filter);
    scimUsers = scimUsers.filter(predicate);
  }

  // Pagination
  const total = scimUsers.length;
  const paged = scimUsers.slice(startIndex - 1, startIndex - 1 + count);

  return scimListResponse(paged, startIndex, count, total);
}

/**
 * POST /api/scim/Users
 * Create a new user (auto-provisioning from IdP).
 */
export async function POST(req: NextRequest) {
  const auth = requireScimAuth(req);
  if (auth instanceof Response) return auth;
  const { orgId } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return scimError(400, "Request body is not valid JSON");
  }

  const scimUser = body as SCIMUser;

  // Validate required fields
  if (!scimUser.schemas?.includes(SCIM_SCHEMA_USER)) {
    return scimError(400, "Missing or invalid schemas");
  }
  if (!scimUser.userName && !scimUser.emails?.length) {
    return scimError(400, "userName or emails is required", "invalidValue");
  }

  // Check for duplicate by externalId — scoped to this org so a different
  // tenant's IdP can never collide with or take over this org's users.
  const store = getStore();
  const { email, externalId } = scimUser.emails?.[0]
    ? {
        email: (scimUser.emails.find((e) => e.primary)?.value ||
          scimUser.emails[0]?.value ||
          scimUser.userName) as string,
        externalId: scimUser.externalId || scimUser.id,
      }
    : { email: scimUser.userName as string, externalId: scimUser.externalId || scimUser.id };

  if (externalId) {
    const existing = await store.getByScimExternalId(externalId);
    if (existing && existing.orgId === orgId) {
      // Per SCIM spec, return 409 Conflict
      return scimError(409, `User with externalId "${externalId}" already exists`, "uniqueness");
    }
  }

  const existingByEmail = await store.getByEmail(email);
  if (existingByEmail && existingByEmail.orgId === orgId) {
    // If email exists but no SCIM link, link it
    if (externalId) {
      await store.update(existingByEmail.id, {
        scimExternalId: externalId,
        ssoProvider: "scim",
      });
      return scimResponse(userToScim(existingByEmail, BASE_URL), 200);
    }
    return scimError(409, `User with email "${email}" already exists`, "uniqueness");
  }

  try {
    const { user, created } = await provisionOrUpdateUser(scimUser, orgId);
    return scimResponse(userToScim(user, BASE_URL), created ? 201 : 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[scim/Users POST] error:", msg);
    return scimError(500, "Failed to create user");
  }
}
