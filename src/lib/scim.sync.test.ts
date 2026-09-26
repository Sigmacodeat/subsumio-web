// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
// Directory Sync is per firm: a firm without its own directory pulls nothing
// and changes no account; the sync status of one firm is never shown to another.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const orgs: Record<string, any> = {};
const created: any[] = [];
const updatedUsers: any[] = [];
vi.mock("@/lib/auth/store", () => ({
  buildNewUser: async (input: any) => ({ id: `u-${input.email}`, brainId: "b", ...input }),
  getStore: () => ({
    getByScimExternalId: async () => null,
    getByEmail: async () => null,
    listByOrg: async () => [],
    create: async (u: any) => {
      created.push(u);
      return u;
    },
    update: async (id: string, patch: any) => {
      updatedUsers.push({ id, patch });
      return { id, ...patch };
    },
  }),
  getOrgStore: () => ({
    getById: async (id: string) => orgs[id] ?? null,
    update: async (id: string, patch: any) => {
      orgs[id] = { ...orgs[id], ...patch };
      return orgs[id];
    },
  }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined), SYSTEM_BRAIN: "system" }));
vi.mock("@/lib/audit-user", () => ({ auditBrainForOrg: async () => "brain" }));
vi.mock("@/lib/provision", () => ({ provisionBrainAsync: vi.fn() }));
vi.mock("@/lib/auth/revoke-access", () => ({ revokeUserAccess: vi.fn(async () => undefined) }));

import {
  DirectoryNotConfiguredError,
  getSyncStatus,
  saveSyncStatus,
  syncFromWorkOS,
  type SyncResult,
} from "./scim";

const origEnv = { ...process.env };
const fetchSpy = vi.fn();

beforeEach(() => {
  for (const k of Object.keys(orgs)) delete orgs[k];
  created.length = 0;
  updatedUsers.length = 0;
  orgs["org-a"] = { id: "org-a", workosDirectoryId: "directory_a" };
  orgs["org-b"] = { id: "org-b" };
  process.env.WORKOS_API_KEY = "key";
  process.env.WORKOS_DIRECTORY_ID = "directory_a";
  delete process.env.WORKOS_DIRECTORY_ORG_ID;
  fetchSpy.mockReset();
  fetchSpy.mockImplementation(async (url: URL) => {
    const body = String(url).includes("/users")
      ? {
          data: [{ id: "d1", emails: [{ value: "x@firm-a.example", primary: true }] }],
          list_metadata: {},
        }
      : { data: [], list_metadata: {} };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  process.env = { ...origEnv };
  vi.unstubAllGlobals();
});

describe("syncFromWorkOS", () => {
  it("refuses a firm without its own directory before touching anything", async () => {
    await expect(syncFromWorkOS("org-b")).rejects.toBeInstanceOf(DirectoryNotConfiguredError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
    expect(updatedUsers).toHaveLength(0);
  });

  it("pulls only the firm's own directory", async () => {
    const res = await syncFromWorkOS("org-a");
    expect(res.usersCreated).toBe(1);
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => u.includes("/directory_sync/directory_a/"))).toBe(true);
    expect(created[0].orgId).toBe("org-a");
  });
});

describe("sync status", () => {
  const result: SyncResult = {
    usersProcessed: 3,
    usersCreated: 1,
    usersUpdated: 2,
    usersDeactivated: 0,
    groupsProcessed: 0,
    errors: [],
    startedAt: "2026-09-26T08:00:00.000Z",
    completedAt: "2026-09-26T08:00:05.000Z",
  };

  it("is stored per firm and never shown to another firm", async () => {
    await saveSyncStatus("org-a", result);
    const a = await getSyncStatus("org-a");
    const b = await getSyncStatus("org-b");
    expect(a.lastSyncAt).toBe(result.completedAt);
    expect(a.lastSyncResult?.usersCreated).toBe(1);
    expect(b.lastSyncAt).toBeNull();
    expect(b.lastSyncResult).toBeNull();
    expect(b.workosDirectorySyncConfigured).toBe(false);
  });

  it("reports the SCIM token as configured only for the firm it is scoped to", async () => {
    process.env.SCIM_BEARER_TOKENS = "org-a:tok-a";
    expect((await getSyncStatus("org-a")).configured).toBe(true);
    expect((await getSyncStatus("org-b")).configured).toBe(false);
  });
});
