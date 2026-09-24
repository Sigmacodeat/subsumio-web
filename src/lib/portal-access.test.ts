import { describe, test, expect, vi, beforeEach } from "vitest";

const mockVerify = vi.hoisted(() => vi.fn());
const mockHeaders = vi.hoisted(() => vi.fn(() => ({ "x-brain": "firm-1" })));
const mockSuperseded = vi.hoisted(() => vi.fn(() => false));

vi.mock("@/lib/portal-token", () => ({
  verifyPortalToken: mockVerify,
  isPortalTokenSuperseded: mockSuperseded,
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "https://engine.test",
  engineHeadersForBrain: mockHeaders,
}));

import { resolvePortalAccess } from "./portal-access";

const PAYLOAD = {
  case_slug: "cases/mueller",
  brain_id: "brain-firm-1",
  sub: "portal",
};

function mockEngineFetch(ok: boolean, body: object = {}, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status,
      json: async () => body,
    }))
  );
}

async function expectApiError(res: unknown, status: number, code: string) {
  // apiError liefert { error: message, code } als Response.
  expect(res instanceof Response).toBe(true);
  const r = res as Response;
  expect(r.status).toBe(status);
  const body = await r.json();
  expect(body.code).toBe(code);
}

describe("resolvePortalAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuperseded.mockReturnValue(false);
    mockVerify.mockResolvedValue(PAYLOAD);
    mockEngineFetch(true, { frontmatter: { status: "open", portal_enabled: true } });
  });

  test("ungueltiger Token → 403 invalid_or_expired_token", async () => {
    mockVerify.mockResolvedValueOnce(null);
    await expectApiError(await resolvePortalAccess("bad"), 403, "invalid_or_expired_token");
  });

  test("Token ohne brain_id → 403 new_portal_link_required", async () => {
    // Alte Links ohne Brain-Bindung duerfen nicht in die Default-Engine
    // rutschen — sonst wuerde ein Mandant fremde Akten sehen.
    mockVerify.mockResolvedValueOnce({ ...PAYLOAD, brain_id: undefined });
    await expectApiError(await resolvePortalAccess("tok"), 403, "new_portal_link_required");
    expect(mockHeaders).not.toHaveBeenCalled();
  });

  test("Engine 404 → case_not_found; sonstiger Fehler → 502", async () => {
    mockEngineFetch(false, {}, 404);
    await expectApiError(await resolvePortalAccess("tok"), 404, "case_not_found");
    mockEngineFetch(false, {}, 500);
    await expectApiError(await resolvePortalAccess("tok"), 502, "case_not_found");
  });

  test("archivierte Akte → 403 case_archived", async () => {
    mockEngineFetch(true, { frontmatter: { status: "archived", portal_enabled: true } });
    await expectApiError(await resolvePortalAccess("tok"), 403, "case_archived");
  });

  test("nicht freigegebene Akte → 403 portal_disabled", async () => {
    mockEngineFetch(true, { frontmatter: { status: "open", portal_enabled: false } });
    await expectApiError(await resolvePortalAccess("tok"), 403, "portal_disabled");
  });

  test("Token vor dem Link-Reset-Cutoff → 403 link_revoked", async () => {
    mockEngineFetch(true, {
      frontmatter: {
        status: "open",
        portal_enabled: true,
        portal_links_reset_at: "2026-06-01T00:00:00.000Z",
      },
    });
    mockSuperseded.mockReturnValueOnce(true);
    await expectApiError(await resolvePortalAccess("tok"), 403, "link_revoked");
    // Cutoff muss mit dem Case-Frontmatter geprüft werden.
    expect(mockSuperseded).toHaveBeenCalledWith(PAYLOAD, "2026-06-01T00:00:00.000Z");
  });

  test("gueltig → Brain-Headers, caseSlug, Payload", async () => {
    const res = await resolvePortalAccess("tok");
    expect(res instanceof Response).toBe(false);
    if (res instanceof Response) return;
    expect(res.caseSlug).toBe("cases/mueller");
    expect(res.headers).toEqual({ "x-brain": "firm-1" });
    // Brain-Isolation: Header kommen aus brain_id des Tokens, nie Default.
    expect(mockHeaders).toHaveBeenCalledWith("brain-firm-1");
    expect(fetch).toHaveBeenCalledWith(
      "https://engine.test/api/pages/cases%2Fmueller",
      expect.objectContaining({ headers: { "x-brain": "firm-1" } })
    );
  });
});
