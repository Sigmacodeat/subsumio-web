// @vitest-environment node

/**
 * The DMS connector is configured per installation. Several firms share one
 * instance, so it is only reachable for firms enabled explicitly
 * (DMS_ALLOWED_BRAIN_IDS), never for client_viewer accounts, and pushing into
 * the DMS needs write rights.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { can } from "@/lib/permissions";
import type { User } from "@/lib/auth/store";

const canPerform = (role: string, action: never) => can({ role } as unknown as User, action);

let currentBrain = "brain-a";

vi.mock("@/lib/api-handler", () => ({
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
  createHandler: (
    opts: { action: string },
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<unknown>
  ) => {
    const fn = async (req: Request) => {
      const url = new URL(req.url);
      const body = req.method === "POST" ? await req.json() : null;
      const ctx = {
        brainId: currentBrain,
        headers: {},
        user: { id: "u1", email: "t@t.com", role: "lawyer" },
      };
      return handler(ctx, body, Object.fromEntries(url.searchParams), req);
    };
    (fn as unknown as { __opts: unknown }).__opts = opts;
    return fn;
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/engine", () => ({
  recordQuota: vi.fn(),
  ENGINE_URL: "http://engine.invalid",
  enginePatchPage: vi.fn(),
}));
// No firm has a stored DMS config here: only the transitional env gate applies.
vi.mock("@/lib/dms/config-store", () => ({ getDmsSettingsForBrain: vi.fn(async () => null) }));

const fakeConnector = {
  name: "Fake DMS",
  isConfigured: () => true,
  search: vi.fn(async () => ({ documents: [{ id: "d1" }], total: 1 })),
  getDocument: vi.fn(async () => ({ id: "d1", name: "akte.pdf" })),
  getDocumentContent: vi.fn(async () => ({
    data: new TextEncoder().encode("x").buffer,
    mimeType: "application/pdf",
  })),
  pushToDms: vi.fn(async () => ({ success: true, documentId: "new-1" })),
  importToBrain: vi.fn(async () => ({ slug: "dms/import/d1", success: true })),
};

vi.mock("@/lib/dms", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  const enabled = actual.isDmsEnabledForBrain as (b: string) => boolean;
  // The real firm gate in front of a fake provider.
  return {
    ...actual,
    getConnector: vi.fn(async () => fakeConnector),
    getConnectorForBrain: vi.fn(async (b: string) => (enabled(b) ? fakeConnector : null)),
  };
});

import * as search from "./search/route";
import * as content from "./content/route";
import * as push from "./push/route";
import * as importRoute from "./import/route";
import * as status from "./status/route";

const actionOf = (h: unknown) => (h as { __opts: { action: string } }).__opts.action;

function get(url: string) {
  return new Request(url) as never;
}
function post(url: string, body: unknown) {
  return new Request(url, { method: "POST", body: JSON.stringify(body) }) as never;
}

describe("DMS routes — firm gate", () => {
  beforeEach(() => {
    process.env.DMS_ALLOWED_BRAIN_IDS = "brain-a";
    process.env.DMS_PROVIDER = "imanager";
    process.env.DMS_BASE_URL = "https://dms.example";
    currentBrain = "brain-a";
    vi.clearAllMocks();
  });
  afterEach(() => {
    delete process.env.DMS_ALLOWED_BRAIN_IDS;
    delete process.env.DMS_PROVIDER;
    delete process.env.DMS_BASE_URL;
  });

  test("a firm not enabled for the DMS gets 503 everywhere and reaches nothing", async () => {
    currentBrain = "brain-b";
    const responses = (await Promise.all([
      search.GET(get("http://x/api/dms/search?q=akte")),
      content.GET(get("http://x/api/dms/content?id=d1")),
      push.POST(post("http://x/api/dms/push", { filename: "a.pdf", content_base64: "eA==" })),
      importRoute.POST(post("http://x/api/dms/import", { documentId: "d1" })),
    ])) as Response[];
    expect(responses.map((r) => r.status)).toEqual([503, 503, 503, 503]);
    expect(fakeConnector.search).not.toHaveBeenCalled();
    expect(fakeConnector.getDocument).not.toHaveBeenCalled();
    expect(fakeConnector.pushToDms).not.toHaveBeenCalled();
    const s = (await status.GET(get("http://x/api/dms/status"))) as Response;
    expect(await s.json()).toEqual({ configured: false });
  });

  test("without DMS_ALLOWED_BRAIN_IDS no firm is enabled (fail-closed)", async () => {
    delete process.env.DMS_ALLOWED_BRAIN_IDS;
    const r = (await search.GET(get("http://x/api/dms/search?q=akte"))) as Response;
    expect(r.status).toBe(503);
  });

  test("the enabled firm can use it", async () => {
    const r = (await search.GET(get("http://x/api/dms/search?q=akte"))) as Response;
    expect(r.status).toBe(200);
    const p = (await push.POST(
      post("http://x/api/dms/push", { filename: "a.pdf", content_base64: "eA==" })
    )) as Response;
    expect(p.status).toBe(200);
  });

  test("client_viewer accounts cannot reach any DMS route; push needs write rights", () => {
    for (const h of [search.GET, content.GET, push.POST, importRoute.POST]) {
      expect(canPerform("client_viewer", actionOf(h) as never)).toBe(false);
    }
    expect(actionOf(push.POST)).toBe("brain.write");
    expect(canPerform("assistant", actionOf(push.POST) as never)).toBe(true);
  });
});
