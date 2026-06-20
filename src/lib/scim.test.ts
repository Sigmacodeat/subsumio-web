// @vitest-environment node

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SCIM_CONTENT_TYPE,
  SCIM_SCHEMA_USER,
  SCIM_SCHEMA_GROUP,
  SCIM_SCHEMA_LIST,
  SCIM_SCHEMA_ERROR,
  SCIM_SCHEMA_PATCH_OP,
  scimError,
  scimResponse,
  scimListResponse,
  validateScimAuth,
  requireScimAuth,
  userToScim,
  scimToUserData,
  parseScimFilter,
  workOSUserToScim,
  isWorkosDirectorySyncConfigured,
  type SCIMUser,
  type WorkOSDirectoryUser,
} from "./scim";
// Minimal mock user type matching the fields used by userToScim
interface MockUser {
  id: string;
  email: string;
  name: string;
  role: string;
  brainId: string;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
  scimExternalId: string | null;
  ssoProvider: string | null;
}

function makeUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: "user-123",
    email: "max@example.com",
    name: "Max Mustermann",
    role: "lawyer",
    brainId: "brain-123",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    deactivatedAt: null,
    scimExternalId: null,
    ssoProvider: null,
    ...overrides,
  };
}

describe("SCIM Constants", () => {
  test("SCIM_CONTENT_TYPE is application/scim+json", () => {
    expect(SCIM_CONTENT_TYPE).toContain("application/scim+json");
  });

  test("SCIM schema URNs are valid strings", () => {
    expect(SCIM_SCHEMA_USER).toContain("core:2.0:User");
    expect(SCIM_SCHEMA_GROUP).toContain("core:2.0:Group");
    expect(SCIM_SCHEMA_LIST).toContain("ListResponse");
    expect(SCIM_SCHEMA_ERROR).toContain("Error");
    expect(SCIM_SCHEMA_PATCH_OP).toContain("PatchOp");
  });
});

describe("scimError", () => {
  test("returns a Response with correct status", () => {
    const res = scimError(404, "Not found");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toBe(SCIM_CONTENT_TYPE);
  });

  test("body contains error schema and detail", async () => {
    const res = scimError(400, "Invalid request");
    const body = await res.json();
    expect(body.schemas).toContain(SCIM_SCHEMA_ERROR);
    expect(body.detail).toBe("Invalid request");
    expect(body.status).toBe(400);
  });

  test("includes scimType when provided", async () => {
    const res = scimError(400, "Invalid filter", "invalidFilter");
    const body = await res.json();
    expect(body.scimType).toBe("invalidFilter");
  });

  test("omits scimType when not provided", async () => {
    const res = scimError(500, "Server error");
    const body = await res.json();
    expect(body.scimType).toBeUndefined();
  });
});

describe("scimResponse", () => {
  test("returns 200 by default", () => {
    const res = scimResponse({ ok: true });
    expect(res.status).toBe(200);
  });

  test("accepts custom status code", () => {
    const res = scimResponse({ created: true }, 201);
    expect(res.status).toBe(201);
  });

  test("sets correct content type", () => {
    const res = scimResponse({});
    expect(res.headers.get("Content-Type")).toBe(SCIM_CONTENT_TYPE);
  });
});

describe("scimListResponse", () => {
  test("returns correct list structure", async () => {
    const items = [{ id: "1" }, { id: "2" }, { id: "3" }];
    const res = scimListResponse(items, 1, 10, 100);
    const body = await res.json();
    expect(body.schemas).toContain(SCIM_SCHEMA_LIST);
    expect(body.totalResults).toBe(100);
    expect(body.startIndex).toBe(1);
    expect(body.Resources).toHaveLength(3);
  });

  test("itemsPerPage is min of count and resources length", async () => {
    const items = [{ id: "1" }];
    const res = scimListResponse(items, 1, 50, 100);
    const body = await res.json();
    expect(body.itemsPerPage).toBe(1);
  });

  test("handles empty list", async () => {
    const res = scimListResponse([], 1, 10, 0);
    const body = await res.json();
    expect(body.totalResults).toBe(0);
    expect(body.Resources).toHaveLength(0);
  });
});

describe("validateScimAuth", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  async function freshImport() {
    vi.resetModules();
    return await import("./scim");
  }

  test("returns false when SCIM_BEARER_TOKEN is not set", async () => {
    delete process.env.SCIM_BEARER_TOKEN;
    const { validateScimAuth: fresh } = await freshImport();
    const req = new Request("https://example.com/api/scim/Users", {
      headers: { Authorization: "Bearer some-token" },
    });
    expect(fresh(req)).toBe(false);
  });

  test("returns false when Authorization header is missing", async () => {
    process.env.SCIM_BEARER_TOKEN = "valid-token";
    const { validateScimAuth: fresh } = await freshImport();
    const req = new Request("https://example.com/api/scim/Users");
    expect(fresh(req)).toBe(false);
  });

  test("returns false when Authorization header is not Bearer", async () => {
    process.env.SCIM_BEARER_TOKEN = "valid-token";
    const { validateScimAuth: fresh } = await freshImport();
    const req = new Request("https://example.com/api/scim/Users", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(fresh(req)).toBe(false);
  });

  test("returns true for valid bearer token", async () => {
    process.env.SCIM_BEARER_TOKEN = "valid-token";
    const { validateScimAuth: fresh } = await freshImport();
    const req = new Request("https://example.com/api/scim/Users", {
      headers: { Authorization: "Bearer valid-token" },
    });
    expect(fresh(req)).toBe(true);
  });

  test("returns false for wrong token", async () => {
    process.env.SCIM_BEARER_TOKEN = "valid-token";
    const { validateScimAuth: fresh } = await freshImport();
    const req = new Request("https://example.com/api/scim/Users", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(fresh(req)).toBe(false);
  });

  test("returns false for token of different length", async () => {
    process.env.SCIM_BEARER_TOKEN = "valid-token";
    const { validateScimAuth: fresh } = await freshImport();
    const req = new Request("https://example.com/api/scim/Users", {
      headers: { Authorization: "Bearer valid-token-extra" },
    });
    expect(fresh(req)).toBe(false);
  });
});

describe("requireScimAuth", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  async function freshImport() {
    vi.resetModules();
    return await import("./scim");
  }

  test("returns null when authorized", async () => {
    process.env.SCIM_BEARER_TOKEN = "valid-token";
    const { requireScimAuth: fresh } = await freshImport();
    const req = new Request("https://example.com/api/scim/Users", {
      headers: { Authorization: "Bearer valid-token" },
    });
    expect(fresh(req)).toBeNull();
  });

  test("returns 401 Response when not authorized", async () => {
    process.env.SCIM_BEARER_TOKEN = "valid-token";
    const { requireScimAuth: fresh } = await freshImport();
    const req = new Request("https://example.com/api/scim/Users");
    const result = fresh(req);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(401);
  });
});

describe("userToScim", () => {
  test("converts internal user to SCIM format", () => {
    const user = makeUser();
    const scim = userToScim(user, "https://app.example.com");
    expect(scim.schemas).toContain(SCIM_SCHEMA_USER);
    expect(scim.id).toBe("user-123");
    expect(scim.userName).toBe("max@example.com");
    expect(scim.displayName).toBe("Max Mustermann");
    expect(scim.emails[0].value).toBe("max@example.com");
    expect(scim.emails[0].primary).toBe(true);
    expect(scim.active).toBe(true);
  });

  test("splits name into given and family name", () => {
    const user = makeUser({ name: "Anna Schmidt" });
    const scim = userToScim(user, "https://app.example.com");
    expect(scim.name?.givenName).toBe("Anna");
    expect(scim.name?.familyName).toBe("Schmidt");
  });

  test("handles single-word name", () => {
    const user = makeUser({ name: "Max" });
    const scim = userToScim(user, "https://app.example.com");
    expect(scim.name?.givenName).toBe("Max");
    expect(scim.name?.familyName).toBeUndefined();
  });

  test("handles multi-word name", () => {
    const user = makeUser({ name: "Max von und zu Mustermann" });
    const scim = userToScim(user, "https://app.example.com");
    expect(scim.name?.givenName).toBe("Max");
    expect(scim.name?.familyName).toBe("von und zu Mustermann");
  });

  test("sets active=false when deactivatedAt is set", () => {
    const user = makeUser({ deactivatedAt: "2024-06-01T00:00:00Z" });
    const scim = userToScim(user, "https://app.example.com");
    expect(scim.active).toBe(false);
  });

  test("includes externalId when present", () => {
    const user = makeUser({ scimExternalId: "ext-123" });
    const scim = userToScim(user, "https://app.example.com");
    expect(scim.externalId).toBe("ext-123");
  });

  test("includes meta with location URL", () => {
    const user = makeUser();
    const scim = userToScim(user, "https://app.example.com");
    expect(scim.meta?.resourceType).toBe("User");
    expect(scim.meta?.location).toContain("/api/scim/Users/user-123");
  });

  test("includes userType from role", () => {
    const user = makeUser({ role: "admin" });
    const scim = userToScim(user, "https://app.example.com");
    expect(scim.userType).toBe("admin");
  });
});

describe("scimToUserData", () => {
  function makeScimUser(overrides: Partial<SCIMUser> = {}): SCIMUser {
    return {
      schemas: [SCIM_SCHEMA_USER],
      id: "scim-123",
      userName: "test@example.com",
      name: { formatted: "Test User", givenName: "Test", familyName: "User" },
      displayName: "Test User",
      emails: [{ value: "test@example.com", type: "work", primary: true }],
      active: true,
      ...overrides,
    } as SCIMUser;
  }

  test("extracts email from primary email", () => {
    const data = scimToUserData(makeScimUser());
    expect(data.email).toBe("test@example.com");
  });

  test("falls back to first email when no primary", () => {
    const scim = makeScimUser({
      emails: [{ value: "secondary@example.com", primary: false }],
    });
    expect(scimToUserData(scim).email).toBe("secondary@example.com");
  });

  test("falls back to userName when no emails", () => {
    const scim = makeScimUser({ emails: undefined as never });
    expect(scimToUserData(scim).email).toBe("test@example.com");
  });

  test("lowercases email", () => {
    const scim = makeScimUser({
      emails: [{ value: "Test@EXAMPLE.COM", primary: true }],
    });
    expect(scimToUserData(scim).email).toBe("test@example.com");
  });

  test("uses displayName for name", () => {
    const scim = makeScimUser({ displayName: "Display Name" });
    expect(scimToUserData(scim).name).toBe("Display Name");
  });

  test("falls back to formatted name", () => {
    const scim = makeScimUser({
      displayName: undefined,
      name: { formatted: "Formatted Name" },
    });
    expect(scimToUserData(scim).name).toBe("Formatted Name");
  });

  test("falls back to given+family name", () => {
    const scim = makeScimUser({
      displayName: undefined,
      name: { givenName: "Given", familyName: "Family" },
    });
    expect(scimToUserData(scim).name).toBe("Given Family");
  });

  test("falls back to email when no name fields", () => {
    const scim = makeScimUser({
      displayName: undefined,
      name: {},
    });
    expect(scimToUserData(scim).name).toBe("test@example.com");
  });

  test("uses externalId when present", () => {
    const scim = makeScimUser({ externalId: "ext-456" });
    expect(scimToUserData(scim).externalId).toBe("ext-456");
  });

  test("falls back to id when no externalId", () => {
    const scim = makeScimUser();
    expect(scimToUserData(scim).externalId).toBe("scim-123");
  });

  test("preserves active status", () => {
    const scim = makeScimUser({ active: false });
    expect(scimToUserData(scim).active).toBe(false);
  });
});

describe("parseScimFilter", () => {
  function makeScimUser(overrides: Partial<SCIMUser> = {}): SCIMUser {
    return {
      schemas: [SCIM_SCHEMA_USER],
      id: "123",
      userName: "user@example.com",
      displayName: "Test User",
      emails: [{ value: "user@example.com", primary: true }],
      active: true,
      ...overrides,
    } as SCIMUser;
  }

  test("filters by userName eq", () => {
    const filter = parseScimFilter('userName eq "user@example.com"');
    expect(filter(makeScimUser())).toBe(true);
    expect(filter(makeScimUser({ userName: "other@example.com" }))).toBe(false);
  });

  test("filters by emails.value eq", () => {
    const filter = parseScimFilter('emails.value eq "user@example.com"');
    expect(filter(makeScimUser())).toBe(true);
    expect(filter(makeScimUser({ emails: [{ value: "other@example.com" }] }))).toBe(false);
  });

  test("filters by externalId eq", () => {
    const filter = parseScimFilter('externalId eq "ext-123"');
    expect(filter(makeScimUser({ externalId: "ext-123" }))).toBe(true);
    expect(filter(makeScimUser({ externalId: "ext-456" }))).toBe(false);
  });

  test("filters by displayName eq", () => {
    const filter = parseScimFilter('displayName eq "Test User"');
    expect(filter(makeScimUser())).toBe(true);
    expect(filter(makeScimUser({ displayName: "Other" }))).toBe(false);
  });

  test("returns pass-all filter for unparseable input", () => {
    const filter = parseScimFilter("invalid filter expression");
    expect(filter(makeScimUser())).toBe(true);
  });

  test("filter is case-insensitive", () => {
    const filter = parseScimFilter('userName eq "USER@EXAMPLE.COM"');
    expect(filter(makeScimUser())).toBe(true);
  });

  test("handles unquoted values", () => {
    const filter = parseScimFilter("userName eq user@example.com");
    expect(filter(makeScimUser())).toBe(true);
  });
});

describe("workOSUserToScim", () => {
  test("converts WorkOS user to SCIM format", () => {
    const dirUser: WorkOSDirectoryUser = {
      id: "workos-123",
      emails: [{ value: "dir@example.com", primary: true }],
      name: { givenName: "Dir", familyName: "User", formatted: "Dir User" },
      displayName: "Dir User",
      active: true,
    };
    const scim = workOSUserToScim(dirUser);
    expect(scim.id).toBe("workos-123");
    expect(scim.externalId).toBe("workos-123");
    expect(scim.userName).toBe("dir@example.com");
    expect(scim.displayName).toBe("Dir User");
    expect(scim.emails[0].value).toBe("dir@example.com");
    expect(scim.active).toBe(true);
  });

  test("falls back to userName when no emails", () => {
    const dirUser: WorkOSDirectoryUser = {
      id: "workos-456",
      emails: [],
      userName: "fallback@example.com",
    };
    const scim = workOSUserToScim(dirUser);
    expect(scim.userName).toBe("fallback@example.com");
  });

  test("handles missing name fields", () => {
    const dirUser: WorkOSDirectoryUser = {
      id: "workos-789",
      emails: [{ value: "noname@example.com", primary: true }],
    };
    const scim = workOSUserToScim(dirUser);
    expect(scim.name?.formatted).toBe("noname@example.com");
  });

  test("maps groups when present", () => {
    const dirUser: WorkOSDirectoryUser = {
      id: "workos-grp",
      emails: [{ value: "grp@example.com", primary: true }],
      groups: [{ value: "grp-1", display: "Admins" }],
    };
    const scim = workOSUserToScim(dirUser);
    expect(scim.groups).toHaveLength(1);
    expect(scim.groups![0].value).toBe("grp-1");
    expect(scim.groups![0].display).toBe("Admins");
  });

  test("defaults active to true when not specified", () => {
    const dirUser: WorkOSDirectoryUser = {
      id: "workos-active",
      emails: [{ value: "active@example.com" }],
    };
    const scim = workOSUserToScim(dirUser);
    expect(scim.active).toBe(true);
  });
});

describe("isWorkosDirectorySyncConfigured", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  async function freshImport() {
    vi.resetModules();
    return await import("./scim");
  }

  test("returns false when no env vars set", async () => {
    delete process.env.WORKOS_API_KEY;
    delete process.env.WORKOS_DIRECTORY_ID;
    const { isWorkosDirectorySyncConfigured: fresh } = await freshImport();
    expect(fresh()).toBe(false);
  });

  test("returns true when both env vars are set", async () => {
    process.env.WORKOS_API_KEY = "key";
    process.env.WORKOS_DIRECTORY_ID = "dir-123";
    const { isWorkosDirectorySyncConfigured: fresh } = await freshImport();
    expect(fresh()).toBe(true);
  });

  test("returns false when only API key is set", async () => {
    process.env.WORKOS_API_KEY = "key";
    delete process.env.WORKOS_DIRECTORY_ID;
    const { isWorkosDirectorySyncConfigured: fresh } = await freshImport();
    expect(fresh()).toBe(false);
  });
});
