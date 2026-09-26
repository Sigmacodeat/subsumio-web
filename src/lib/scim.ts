/**
 * SCIM 2.0 Server implementation + WorkOS Directory Sync client.
 *
 * This module provides:
 *   1. SCIM 2.0 type definitions (User, Group, ListResponse, ErrorResponse)
 *   2. Helper functions for mapping between internal User and SCIM User
 *   3. Bearer-token authentication for inbound SCIM requests from WorkOS/IdP
 *   4. WorkOS Directory Sync API client (for manual pull sync)
 *
 * Environment variables:
 *   SCIM_BEARER_TOKENS   — org-scoped secrets for inbound SCIM requests,
 *                          format "orgId1:token1,orgId2:token2". Each IdP
 *                          tenant connection gets its own token, and every
 *                          provisioning request is scoped to that org.
 *   SCIM_BEARER_TOKEN    — legacy single-tenant secret. Only honored when
 *                          SCIM_SINGLE_TENANT_ORG_ID is also set, so a
 *                          deployment can't accidentally run multi-tenant
 *                          SCIM with no org isolation.
 *   SCIM_SINGLE_TENANT_ORG_ID — org id every legacy SCIM_BEARER_TOKEN
 *                          request is scoped to.
 *   WORKOS_API_KEY       — existing WorkOS API key (reused from SSO)
 *   Org.workosDirectoryId — the firm's own WorkOS directory (Directory Sync)
 *   WORKOS_DIRECTORY_ID + WORKOS_DIRECTORY_ORG_ID — single-tenant fallback:
 *                          the directory counts only for that one firm
 */

import {
  type KanzleiRole,
  type Org,
  type User,
  getStore,
  getOrgStore,
  buildNewUser,
} from "@/lib/auth/store";
import { logAudit } from "@/lib/audit";
import { auditBrainForOrg } from "@/lib/audit-user";
import { provisionBrainAsync } from "@/lib/provision";
import { externalFetchTimeout } from "@/lib/retry";
import { revokeUserAccess } from "@/lib/auth/revoke-access";
import { hit, clientIp } from "@/lib/auth/rate-limit";

// ── SCIM 2.0 Constants ────────────────────────────────────────────────

export const SCIM_CONTENT_TYPE = "application/scim+json; charset=utf-8";
export const SCIM_SCHEMA_USER = "urn:ietf:params:scim:schemas:core:2.0:User";
export const SCIM_SCHEMA_GROUP = "urn:ietf:params:scim:schemas:core:2.0:Group";
export const SCIM_SCHEMA_LIST = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
export const SCIM_SCHEMA_ERROR = "urn:ietf:params:scim:api:messages:2.0:Error";
export const SCIM_SCHEMA_PATCH_OP = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

// ── SCIM 2.0 Type Definitions ─────────────────────────────────────────

export interface SCIMResource {
  schemas: string[];
  id: string;
  externalId?: string;
  meta?: {
    resourceType: string;
    created?: string;
    lastModified?: string;
    location?: string;
    version?: string;
  };
}

export interface SCIMName {
  formatted?: string;
  familyName?: string;
  givenName?: string;
}

export interface SCIMEmail {
  value: string;
  type?: string;
  primary?: boolean;
}

export interface SCIMUser extends SCIMResource {
  schemas: [typeof SCIM_SCHEMA_USER];
  userName: string;
  name?: SCIMName;
  displayName?: string;
  emails: SCIMEmail[];
  /** Absent means "unchanged" on update and "active" on creation. */
  active?: boolean;
  title?: string;
  userType?: string;
  department?: string;
  groups?: SCIMGroupRef[];
}

export interface SCIMGroupRef {
  value: string;
  ref?: string;
  display?: string;
  type?: string;
}

export interface SCIMGroup extends SCIMResource {
  schemas: [typeof SCIM_SCHEMA_GROUP];
  displayName: string;
  members?: SCIMMemberRef[];
}

export interface SCIMMemberRef {
  value: string;
  ref?: string;
  display?: string;
}

export interface SCIMListResponse<T> {
  schemas: [typeof SCIM_SCHEMA_LIST];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export interface SCIMErrorResponse {
  schemas: [typeof SCIM_SCHEMA_ERROR];
  detail: string;
  status: number;
  scimType?:
    | "invalidFilter"
    | "tooMany"
    | "uniqueness"
    | "mutability"
    | "invalidSyntax"
    | "invalidPath"
    | "noTarget"
    | "invalidValue"
    | "invalidVers"
    | "sensitive";
}

export interface SCIMPatchOperation {
  op: "replace" | "add" | "remove";
  path?: string;
  value?: unknown;
}

export interface SCIMPatchRequest {
  schemas: [typeof SCIM_SCHEMA_PATCH_OP];
  Operations: SCIMPatchOperation[];
}

// ── SCIM Error Helper ─────────────────────────────────────────────────

export function scimError(
  status: number,
  detail: string,
  scimType?: SCIMErrorResponse["scimType"]
): Response {
  const body: SCIMErrorResponse = {
    schemas: [SCIM_SCHEMA_ERROR],
    status,
    detail,
    ...(scimType ? { scimType } : {}),
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": SCIM_CONTENT_TYPE },
  });
}

// ── SCIM Success Helper ───────────────────────────────────────────────

export function scimResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": SCIM_CONTENT_TYPE },
  });
}

export function scimListResponse<T>(
  resources: T[],
  startIndex: number,
  count: number,
  total: number
): Response {
  const body: SCIMListResponse<T> = {
    schemas: [SCIM_SCHEMA_LIST],
    totalResults: total,
    startIndex,
    itemsPerPage: Math.min(count, resources.length),
    Resources: resources,
  };
  return scimResponse(body);
}

// ── Bearer Token Authentication ───────────────────────────────────────

/** Timing-safe string comparison (equal-length check first, then constant-time diff). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Parses `SCIM_BEARER_TOKENS="orgId1:token1,orgId2:token2"` into a Map<token, orgId>. */
function parseScimTokenMap(): Map<string, string> {
  const raw = process.env.SCIM_BEARER_TOKENS || "";
  const map = new Map<string, string>();
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf(":");
    if (idx <= 0) continue;
    const orgId = pair.slice(0, idx).trim();
    const token = pair.slice(idx + 1).trim();
    if (orgId && token) map.set(token, orgId);
  }
  return map;
}

/**
 * Resolve the Authorization header for inbound SCIM requests to the org it
 * is scoped to. SCIM requests use a bearer token, not session cookies.
 *
 * Every token is tied to exactly one org — there is no "global" SCIM token
 * that can see across tenants. Returns the orgId on success, or null if the
 * token is missing/invalid/unscoped.
 */
export function resolveScimOrgId(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);

  const tokenMap = parseScimTokenMap();
  for (const [candidateToken, orgId] of tokenMap) {
    if (timingSafeEqual(token, candidateToken)) return orgId;
  }

  // Legacy single-tenant fallback: only honored when explicitly scoped to
  // one org, so a deployment can't run multi-tenant SCIM with no isolation.
  const legacyToken = process.env.SCIM_BEARER_TOKEN || "";
  const legacyOrgId = process.env.SCIM_SINGLE_TENANT_ORG_ID || "";
  if (legacyToken && legacyOrgId && timingSafeEqual(token, legacyToken)) {
    return legacyOrgId;
  }

  return null;
}

/**
 * Middleware-like guard for SCIM routes.
 * Returns the resolved orgId if authorized, or a 401/429 Response if not.
 *
 * Rate-limited by IP: this is the single choke point every /api/scim/*
 * route passes through (via createScimHandler's customAuth), so limiting
 * here bounds brute-force guesses against any org's SCIM_BEARER_TOKENS
 * entry across all SCIM endpoints in one place. The limit is generous
 * (IdPs like Okta/Azure AD can burst across Users + Groups during a full
 * directory sync).
 */
export async function requireScimAuth(req: Request): Promise<{ orgId: string } | Response> {
  const ip = clientIp(req.headers);
  const rate = await hit(`scim-auth:${ip}`, 60, 60_000);
  if (!rate.ok) {
    return Response.json(
      { error: "rate_limited", message: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }
  const orgId = resolveScimOrgId(req);
  if (!orgId) {
    return scimError(401, "Invalid or missing bearer token");
  }
  return { orgId };
}

// ── User ↔ SCIM Mapping ───────────────────────────────────────────────

/**
 * Convert internal User to SCIM 2.0 User representation.
 */
export function userToScim(user: User, baseUrl: string): SCIMUser {
  const [givenName, ...rest] = user.name.split(" ");
  const familyName = rest.join(" ");

  return {
    schemas: [SCIM_SCHEMA_USER],
    id: user.id,
    externalId: user.scimExternalId || undefined,
    userName: user.email,
    name: {
      formatted: user.name,
      givenName: givenName || undefined,
      familyName: familyName || undefined,
    },
    displayName: user.name,
    emails: [
      {
        value: user.email,
        type: "work",
        primary: true,
      },
    ],
    active: !user.deactivatedAt,
    userType: user.role,
    meta: {
      resourceType: "User",
      created: user.createdAt,
      lastModified: user.createdAt,
      location: `${baseUrl}/api/scim/Users/${user.id}`,
    },
  };
}

/**
 * Extract user data from a SCIM 2.0 User resource.
 */
export function scimToUserData(scimUser: SCIMUser): {
  email: string;
  name: string;
  externalId?: string;
  active: boolean | undefined;
} {
  const email =
    scimUser.emails?.find((e) => e.primary)?.value ||
    scimUser.emails?.[0]?.value ||
    scimUser.userName;

  const name =
    scimUser.displayName ||
    (scimUser.name?.formatted
      ? scimUser.name.formatted
      : [scimUser.name?.givenName, scimUser.name?.familyName].filter(Boolean).join(" ")) ||
    email;

  return {
    email: email.trim().toLowerCase(),
    name: name.trim(),
    externalId: scimUser.externalId || scimUser.id,
    active: scimUser.active,
  };
}

/**
 * SCIM booleans as IdPs send them: JSON `true`/`false`, or the strings
 * "true"/"false" in any case (Microsoft Entra ID sends "True"/"False").
 * Anything else is not a boolean — null, so the caller answers 400 instead of
 * guessing (`Boolean("False")` would be `true`).
 */
export function parseScimBoolean(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return null;
}

// ── SCIM Provisioning Logic ───────────────────────────────────────────

/** Role of a user created by SCIM auto-provisioning (never admin). */
export const SCIM_DEFAULT_ROLE: KanzleiRole = "assistant";

/**
 * Provision or update a user from SCIM data.
 * - If user exists (by externalId or email), update it
 * - If user doesn't exist, create it (auto-provisioning)
 * - If active=false, deactivate (deprovisioning)
 */
export async function provisionOrUpdateUser(
  scimUser: SCIMUser,
  orgId: string
): Promise<{ user: User; created: boolean }> {
  const store = getStore();
  const { email, name, externalId, active } = scimToUserData(scimUser);

  // Try to find by SCIM external ID first, then by email — scoped to this
  // org's tenant so one IdP connection can never see/link another tenant's user.
  let user: User | null = null;
  if (externalId) {
    const candidate = await store.getByScimExternalId(externalId);
    if (candidate && candidate.orgId === orgId) user = candidate;
  }
  if (!user) {
    const candidate = await store.getByEmail(email);
    if (candidate && candidate.orgId === orgId) user = candidate;
  }

  if (!user) {
    // Auto-provision: create new user from SCIM data
    const newUser = await buildNewUser({
      email,
      name,
      passwordHash: "", // SCIM users have no local password
      locale: "de",
    });
    newUser.orgId = orgId;
    // buildNewUser defaults to "admin" (the founder of a new firm). A person
    // provisioned by the firm's IdP joins an existing firm and starts with
    // least privilege; an admin promotes where needed.
    newUser.role = SCIM_DEFAULT_ROLE;
    newUser.scimExternalId = externalId || null;
    newUser.ssoProvider = "scim";
    newUser.emailVerifiedAt = new Date().toISOString();
    // Only an explicit `active: false` creates a blocked account.
    if (active === false) {
      newUser.deactivatedAt = new Date().toISOString();
    }
    user = await store.create(newUser);

    // Provision brain for the new user
    provisionBrainAsync(user.brainId, { industry: null });

    await logAudit("scim.user_provisioned", "user", {
      brainId: await auditBrainForOrg(orgId),
      entityId: user.id,
      details: { email, externalId, active },
    });

    return { user, created: true };
  }

  // Update existing user
  const patch: Partial<User> = {
    name,
    scimExternalId: externalId || user.scimExternalId,
  };

  // `active` is applied only when the IdP states it; a request without it
  // (partial PUT/POST) leaves the account as it is.
  if (active === true && user.deactivatedAt) {
    // Reactivate
    patch.deactivatedAt = null;
  } else if (active === false && !user.deactivatedAt) {
    // Deactivate (deprovision)
    patch.deactivatedAt = new Date().toISOString();
  }

  user = await store.update(user.id, patch);
  if (!user) throw new Error("Failed to update user during SCIM sync");

  if (patch.deactivatedAt) {
    await revokeUserAccess(user.id);
  }

  await logAudit("scim.user_updated", "user", {
    brainId: await auditBrainForOrg(orgId ?? user.orgId),
    entityId: user.id,
    details: { email, externalId, active, changes: patch },
  });

  return { user, created: false };
}

/**
 * Deprovision a user (deactivate, not delete — for audit trail).
 */
export async function deprovisionUser(userId: string, orgId?: string): Promise<User | null> {
  const store = getStore();
  const user = await store.getById(userId);
  if (!user) return null;
  if (orgId && user.orgId !== orgId) return null;

  const updated = await store.update(userId, {
    deactivatedAt: new Date().toISOString(),
  });

  await revokeUserAccess(userId);

  await logAudit("scim.user_deprovisioned", "user", {
    brainId: await auditBrainForOrg(orgId ?? user.orgId),
    entityId: userId,
    details: { email: user.email, externalId: user.scimExternalId },
  });

  return updated;
}

// ── SCIM Filter Parser (basic) ────────────────────────────────────────

/**
 * Parse a basic SCIM filter expression.
 * Supports: userName eq "value", emails.value eq "value", externalId eq "value"
 * Returns a predicate function for filtering users.
 */
export function parseScimFilter(filter: string): (user: SCIMUser) => boolean {
  // Basic support for: attr eq "value"  or  attr eq value
  const eqMatch = filter.match(/^(\w+(?:\.\w+)?)\s+eq\s+"?([^"]+)"?$/i);
  if (!eqMatch) {
    // If we can't parse, return a pass-all filter
    return () => true;
  }

  const [, attr, value] = eqMatch;
  const lowerValue = value.toLowerCase();

  return (user: SCIMUser) => {
    switch (attr.toLowerCase()) {
      case "username":
        return user.userName.toLowerCase() === lowerValue;
      case "emails.value":
      case "emails":
        return user.emails?.some((e) => e.value.toLowerCase() === lowerValue);
      case "externalid":
        return (user.externalId || "").toLowerCase() === lowerValue;
      case "displayname":
        return (user.displayName || "").toLowerCase() === lowerValue;
      default:
        return true;
    }
  };
}

// ── WorkOS Directory Sync API Client ──────────────────────────────────

const WORKOS_API_BASE = "https://api.workos.com";

/**
 * The WorkOS directory this firm may pull, or null. Each firm has its own
 * (`Org.workosDirectoryId`); the installation-wide WORKOS_DIRECTORY_ID only
 * counts for the one firm named in WORKOS_DIRECTORY_ORG_ID (single-tenant
 * setups) — never for every firm of the installation.
 */
export function workosDirectoryIdFor(
  org: Pick<Org, "id" | "workosDirectoryId"> | null | undefined
): string | null {
  if (!org) return null;
  const own = org.workosDirectoryId?.trim();
  if (own) return own;
  const envDir = process.env.WORKOS_DIRECTORY_ID?.trim();
  const envOrg = process.env.WORKOS_DIRECTORY_ORG_ID?.trim();
  if (envDir && envOrg && envOrg === org.id) return envDir;
  return null;
}

/** Directory Sync is usable for this firm: API key set and a directory of its own. */
export function isWorkosDirectorySyncConfigured(
  org: Pick<Org, "id" | "workosDirectoryId"> | null | undefined
): boolean {
  return Boolean(process.env.WORKOS_API_KEY && workosDirectoryIdFor(org));
}

/** Thrown before anything is read or written when a firm has no directory of its own. */
export class DirectoryNotConfiguredError extends Error {
  constructor() {
    super("directory_not_configured");
    this.name = "DirectoryNotConfiguredError";
  }
}

export interface WorkOSDirectoryUser {
  id: string;
  emails: Array<{ value: string; type?: string; primary?: boolean }>;
  name?: { givenName?: string; familyName?: string; formatted?: string };
  displayName?: string;
  userName?: string;
  active?: boolean;
  title?: string;
  userType?: string;
  groups?: Array<{ value: string; display?: string }>;
  rawAttributes?: Record<string, unknown>;
}

export interface WorkOSDirectoryGroup {
  id: string;
  displayName: string;
  members?: Array<{ value: string; display?: string }>;
}

/**
 * List directory users from WorkOS.
 * Paginates through all results.
 */
export async function listWorkOSDirectoryUsers(directoryId: string): Promise<WorkOSDirectoryUser[]> {
  if (!process.env.WORKOS_API_KEY || !directoryId) {
    throw new Error("WorkOS Directory Sync not configured");
  }

  const users: WorkOSDirectoryUser[] = [];
  let cursor: string | undefined;
  const perPage = 100;

  do {
    const url = new URL(
      `${WORKOS_API_BASE}/directory_sync/${encodeURIComponent(directoryId)}/users`
    );
    url.searchParams.set("limit", String(perPage));
    if (cursor) url.searchParams.set("after", cursor);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.WORKOS_API_KEY}` },
      signal: externalFetchTimeout(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`WorkOS directory users fetch failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as {
      data: WorkOSDirectoryUser[];
      cursor?: string;
      list_metadata?: { before?: string; after?: string };
    };

    users.push(...(data.data || []));
    cursor = data.list_metadata?.after || undefined;
  } while (cursor);

  return users;
}

/**
 * List directory groups from WorkOS.
 */
export async function listWorkOSDirectoryGroups(directoryId: string): Promise<WorkOSDirectoryGroup[]> {
  if (!process.env.WORKOS_API_KEY || !directoryId) {
    throw new Error("WorkOS Directory Sync not configured");
  }

  const groups: WorkOSDirectoryGroup[] = [];
  let cursor: string | undefined;
  const perPage = 100;

  do {
    const url = new URL(
      `${WORKOS_API_BASE}/directory_sync/${encodeURIComponent(directoryId)}/groups`
    );
    url.searchParams.set("limit", String(perPage));
    if (cursor) url.searchParams.set("after", cursor);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.WORKOS_API_KEY}` },
      signal: externalFetchTimeout(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`WorkOS directory groups fetch failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as {
      data: WorkOSDirectoryGroup[];
      list_metadata?: { before?: string; after?: string };
    };

    groups.push(...(data.data || []));
    cursor = data.list_metadata?.after || undefined;
  } while (cursor);

  return groups;
}

/**
 * Convert a WorkOS directory user to SCIM user format.
 */
export function workOSUserToScim(dirUser: WorkOSDirectoryUser): SCIMUser {
  const primaryEmail =
    dirUser.emails?.find((e) => e.primary)?.value ||
    dirUser.emails?.[0]?.value ||
    dirUser.userName ||
    "";

  const formattedName =
    dirUser.name?.formatted ||
    [dirUser.name?.givenName, dirUser.name?.familyName].filter(Boolean).join(" ") ||
    dirUser.displayName ||
    primaryEmail;

  return {
    schemas: [SCIM_SCHEMA_USER],
    id: dirUser.id,
    externalId: dirUser.id,
    userName: primaryEmail,
    name: {
      formatted: formattedName,
      givenName: dirUser.name?.givenName,
      familyName: dirUser.name?.familyName,
    },
    displayName: dirUser.displayName || formattedName,
    emails: (dirUser.emails || []).map((e) => ({
      value: e.value,
      type: e.type || "work",
      primary: e.primary ?? false,
    })),
    active: dirUser.active ?? true,
    title: dirUser.title,
    userType: dirUser.userType,
    groups: dirUser.groups?.map((g) => ({
      value: g.value,
      display: g.display,
    })),
  };
}

// ── Manual Sync (pull from WorkOS) ────────────────────────────────────

export interface SyncResult {
  usersProcessed: number;
  usersCreated: number;
  usersUpdated: number;
  usersDeactivated: number;
  groupsProcessed: number;
  errors: string[];
  startedAt: string;
  completedAt: string;
}

/**
 * Pull all users from WorkOS Directory Sync and provision/update them locally.
 * This is the "manual sync" triggered from the dashboard.
 */
export async function syncFromWorkOS(orgId: string): Promise<SyncResult> {
  // Only the firm's own directory — resolved before anything is touched.
  const directoryId = workosDirectoryIdFor(await getOrgStore().getById(orgId));
  if (!directoryId || !process.env.WORKOS_API_KEY) throw new DirectoryNotConfiguredError();

  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  let usersCreated = 0;
  let usersUpdated = 0;
  let usersDeactivated = 0;
  let groupsProcessed = 0;

  try {
    const dirUsers = await listWorkOSDirectoryUsers(directoryId);
    const store = getStore();

    // Get all existing SCIM users (this org only) to detect deprovisioning
    const allUsers = await store.listByOrg(orgId);
    const scimUserExternalIds = new Set(
      allUsers.filter((u) => u.scimExternalId).map((u) => u.scimExternalId as string)
    );

    // Process each directory user
    for (const dirUser of dirUsers) {
      try {
        const scimUser = workOSUserToScim(dirUser);
        const { created } = await provisionOrUpdateUser(scimUser, orgId);
        if (created) {
          usersCreated++;
        } else {
          usersUpdated++;
        }
        // Track that this external ID was seen
        if (scimUser.externalId) scimUserExternalIds.delete(scimUser.externalId);
      } catch (err) {
        errors.push(`User ${dirUser.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Any remaining external IDs were not in the directory → deactivate
    for (const missingExternalId of scimUserExternalIds) {
      const user = await store.getByScimExternalId(missingExternalId);
      if (user && user.orgId === orgId && !user.deactivatedAt) {
        await deprovisionUser(user.id, orgId);
        usersDeactivated++;
      }
    }

    // Sync groups (just count for now — groups are informational)
    try {
      const dirGroups = await listWorkOSDirectoryGroups(directoryId);
      groupsProcessed = dirGroups.length;
      await logAudit("scim.group_synced", "group", {
        brainId: await auditBrainForOrg(orgId),
        details: { count: groupsProcessed },
      });
    } catch (err) {
      errors.push(`Groups sync: ${err instanceof Error ? err.message : String(err)}`);
    }
  } catch (err) {
    errors.push(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const completedAt = new Date().toISOString();

  const result: SyncResult = {
    usersProcessed: usersCreated + usersUpdated,
    usersCreated,
    usersUpdated,
    usersDeactivated,
    groupsProcessed,
    errors,
    startedAt,
    completedAt,
  };

  await logAudit("scim.sync_manual", "system", {
    brainId: await auditBrainForOrg(orgId),
    details: result as unknown as Record<string, unknown>,
  });

  return result;
}

// ── Sync Status Store ─────────────────────────────────────────────────

import { logger } from "@/lib/logger";
const log = logger("lib/scim");

export interface SyncStatus {
  lastSyncAt: string | null;
  lastSyncResult: SyncResult | null;
  configured: boolean;
  workosDirectorySyncConfigured: boolean;
  totalScimUsers: number;
  activeScimUsers: number;
  deactivatedScimUsers: number;
}

/** A SCIM bearer token is scoped to this firm (SCIM_BEARER_TOKENS or the single-tenant pair). */
export function isScimTokenConfiguredFor(orgId: string): boolean {
  for (const tokenOrg of parseScimTokenMap().values()) if (tokenOrg === orgId) return true;
  return Boolean(
    process.env.SCIM_BEARER_TOKEN && process.env.SCIM_SINGLE_TENANT_ORG_ID?.trim() === orgId
  );
}

const MAX_STORED_SYNC_ERRORS = 20;

export async function getSyncStatus(orgId?: string | null): Promise<SyncStatus> {
  const store = getStore();
  // Everything here is per firm. Without an org there is nothing to report —
  // never fall back to the whole installation or another firm's sync.
  const allUsers = orgId ? await store.listByOrg(orgId) : [];
  const org = orgId ? await getOrgStore().getById(orgId) : null;
  const scimUsers = allUsers.filter((u) => u.scimExternalId || u.ssoProvider === "scim");
  const activeScimUsers = scimUsers.filter((u) => !u.deactivatedAt);
  const deactivatedScimUsers = scimUsers.filter((u) => u.deactivatedAt);

  const last = org?.scimLastSync ?? null;

  return {
    lastSyncAt: last?.at ?? null,
    lastSyncResult: (last?.result as SyncResult | undefined) ?? null,
    configured: orgId ? isScimTokenConfiguredFor(orgId) : false,
    workosDirectorySyncConfigured: isWorkosDirectorySyncConfigured(org),
    totalScimUsers: scimUsers.length,
    activeScimUsers: activeScimUsers.length,
    deactivatedScimUsers: deactivatedScimUsers.length,
  };
}

/** Stores the result on the firm's own record (never a shared file). */
export async function saveSyncStatus(orgId: string, result: SyncResult): Promise<void> {
  try {
    await getOrgStore().update(orgId, {
      scimLastSync: {
        at: result.completedAt,
        result: { ...result, errors: result.errors.slice(0, MAX_STORED_SYNC_ERRORS) },
      },
    });
  } catch (err) {
    log.error(
      "[scim] failed to save sync status:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
