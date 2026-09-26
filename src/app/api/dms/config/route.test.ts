// @vitest-environment node

/**
 * DMS configuration route: admin-only (settings.write + admin), audited, the
 * key never comes back and never lands in the audit details, and only public
 * https endpoints are accepted.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

type Opts = {
  action: string;
  admin?: boolean;
  audit?: (ctx: unknown, body: unknown) => { action: string; details?: unknown };
};

vi.mock("@/lib/api-handler", () => ({
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
  createHandler: (
    opts: Opts,
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<unknown>
  ) => {
    const fn = async (req: Request) => {
      const body = req.method === "PUT" ? await req.json() : null;
      const ctx = { brainId: "brain-a", headers: {}, user: { id: "admin-1", role: "admin" } };
      return handler(ctx, body, {}, req);
    };
    (fn as unknown as { __opts: Opts }).__opts = opts;
    return fn;
  },
}));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine", enginePatchPage: vi.fn() }));

const saveDmsConfig = vi.fn(async (_b: string, _u: string, input: Record<string, unknown>) => ({
  provider: input.provider,
  baseUrl: input.baseUrl,
  hasApiKey: true,
  sharepointSiteId: null,
  sharepointDriveId: null,
  boxFolderId: null,
  updatedBy: "admin-1",
  updatedAt: "2026-09-25T00:00:00.000Z",
}));
const deleteDmsConfig = vi.fn(async () => true);
const getDmsConfig = vi.fn(async () => null);

vi.mock("@/lib/dms/config-store", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    validateDmsBaseUrl: actual.validateDmsBaseUrl,
    saveDmsConfig: (...a: unknown[]) => saveDmsConfig(...(a as [string, string, never])),
    deleteDmsConfig: (...a: unknown[]) => deleteDmsConfig(...(a as [])),
    getDmsConfig: (...a: unknown[]) => getDmsConfig(...(a as [])),
  };
});

import { can } from "@/lib/permissions";
import type { User } from "@/lib/auth/store";
import * as route from "./route";

const optsOf = (h: unknown) => (h as { __opts: Opts }).__opts;
const SECRET = "very-secret-dms-key";

function put(body: unknown) {
  return new Request("http://x/api/dms/config", {
    method: "PUT",
    body: JSON.stringify(body),
  }) as never;
}

describe("/api/dms/config", () => {
  beforeEach(() => vi.clearAllMocks());

  test("read, set up, change and delete are admin-only", () => {
    for (const h of [route.GET, route.PUT, route.DELETE]) {
      const o = optsOf(h);
      expect(o.action).toBe("settings.write");
      expect(o.admin).toBe(true);
      for (const role of ["lawyer", "assistant", "client_viewer"]) {
        expect(can({ role } as unknown as User, o.action as never)).toBe(false);
      }
    }
  });

  test("changes are audited without the key", () => {
    const put = optsOf(route.PUT).audit!({}, { provider: "imanager", apiKey: SECRET });
    expect(put.action).toBe("dms.config_update");
    expect(JSON.stringify(put)).not.toContain(SECRET);
    expect(optsOf(route.DELETE).audit!({}, null).action).toBe("dms.config_delete");
  });

  test("saving returns the public shape only — the key never comes back", async () => {
    const r = (await route.PUT(
      put({ provider: "imanager", baseUrl: "https://dms.example.com/", apiKey: SECRET })
    )) as Response;
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain(SECRET);
    expect(saveDmsConfig).toHaveBeenCalledWith(
      "brain-a",
      "admin-1",
      expect.objectContaining({ baseUrl: "https://dms.example.com", apiKey: SECRET })
    );
  });

  test("non-public or non-https endpoints are refused before anything is stored", async () => {
    for (const baseUrl of ["http://dms.example.com", "https://10.0.0.1", "https://localhost"]) {
      const r = (await route.PUT(
        put({ provider: "imanager", baseUrl, apiKey: SECRET })
      )) as Response;
      expect(r.status).toBe(400);
    }
    const missing = (await route.PUT(
      put({ provider: "netdocuments", apiKey: SECRET })
    )) as Response;
    expect(missing.status).toBe(400);
    expect(saveDmsConfig).not.toHaveBeenCalled();
  });

  test("Box needs no endpoint", async () => {
    const r = (await route.PUT(put({ provider: "box", apiKey: SECRET }))) as Response;
    expect(r.status).toBe(200);
    expect(saveDmsConfig).toHaveBeenCalledWith(
      "brain-a",
      "admin-1",
      expect.objectContaining({ provider: "box", baseUrl: "" })
    );
  });

  test("delete removes the firm's own config", async () => {
    const r = (await route.DELETE(
      new Request("http://x", { method: "DELETE" }) as never
    )) as Response;
    expect(r.status).toBe(200);
    expect(deleteDmsConfig).toHaveBeenCalledWith("brain-a");
  });
});
