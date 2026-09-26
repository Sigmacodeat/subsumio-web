// @vitest-environment node
// KYC route: birth date is kept (OPS-6), a sanctions hit is cleared only as a
// documented decision (OPS-8).
import { beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "u1", email: "anwalt@kanzlei.example", role: "lawyer" };
const mockPatch = vi.fn();
const logAudit = vi.fn();

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock("@/lib/keyed-lock", () => ({
  withKeyedLock: <T>(_k: string, fn: () => Promise<T>) => fn(),
}));
vi.mock("@/lib/sanctions/check", () => ({
  runSanctionsCheck: vi.fn(),
  applyCheckResult: vi.fn(),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
    handler: (ctx: unknown, body: unknown, q: unknown, req: unknown) => Promise<Response>
  ) => {
    return async (req: Request & { params?: unknown }) => {
      const ctx = { headers: {}, brainId: "b1", user };
      const raw = await req.json().catch(() => ({}));
      const parsed = opts.body?.safeParse(raw);
      if (parsed && !parsed.success) return Response.json({ error: "bad" }, { status: 400 });
      return handler(ctx, parsed?.data ?? raw, {}, req);
    };
  },
  apiError: (code: string, message: string, status: number, details?: unknown) =>
    Response.json({ error: message, code, details }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { GET, PATCH } from "./route";

let stored: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  user.role = "lawyer";
  stored = {
    id: "k1",
    case_slug: "legal/cases/m1",
    client_name: "Alice Example",
    party_type: "natural",
    status: "in_progress",
    provider: "manual",
    pep_check: true,
    risk_level: "low",
    risk_factors: [],
    transparenzregister_checked: false,
    created_at: "2026-09-01",
    updated_at: "2026-09-01",
  };
  mockPatch.mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ frontmatter: stored, content: "" }))
  );
});

function patch(body: unknown) {
  const req = new Request("http://localhost/api/kyc/k1", {
    method: "PATCH",
    body: JSON.stringify(body),
  }) as Request & { params?: unknown };
  req.params = Promise.resolve({ id: "k1" });
  return (PATCH as unknown as (r: Request) => Promise<Response>)(req);
}

const written = () => mockPatch.mock.calls[0]?.[1]?.frontmatter as Record<string, unknown>;

describe("OPS-6 birth date", () => {
  it("keeps identification.birth_date on update", async () => {
    const res = await patch({
      action: "update",
      fields: { identification: { birth_date: "1979-03-14" } },
    });
    expect(res.status).toBe(200);
    expect((written().identification as Record<string, unknown>).birth_date).toBe("1979-03-14");
  });

  it("rejects a malformed birth date", async () => {
    const res = await patch({
      action: "update",
      fields: { identification: { birth_date: "14.3.79" } },
    });
    expect(res.status).toBe(400);
  });
});

describe("OPS-8 sanctions hit", () => {
  beforeEach(() => {
    stored = {
      ...stored,
      sanctions_checked: true,
      sanctions_hit: true,
      sanctions_source: "EU-Liste, geprüft 2026-09-20",
      sanctions_checked_at: "2026-09-20T10:00:00Z",
    };
  });

  it("an ordinary save cannot untick a recorded hit (409)", async () => {
    const res = await patch({ action: "update", fields: { sanctions_hit: false } });
    expect(res.status).toBe(409);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("the recorded list-check result cannot be overwritten by hand", async () => {
    await patch({ action: "update", fields: { sanctions_source: "frei erfunden", notes: "n" } });
    expect(written().sanctions_source).toBe("EU-Liste, geprüft 2026-09-20");
  });

  it("clearing needs a reason of at least 20 characters", async () => {
    const res = await patch({ action: "sanctions_clear", reason: "passt" });
    expect(res.status).toBe(400);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("an assistant cannot clear a hit", async () => {
    user.role = "assistant";
    const res = await patch({
      action: "sanctions_clear",
      reason: "Namensgleichheit, Geburtsdatum weicht laut Ausweis ab",
    });
    expect(res.status).toBe(403);
  });

  it("a lawyer clears it with a reason: history + own audit action", async () => {
    const reason = "Namensgleichheit, Geburtsdatum weicht laut Ausweis ab";
    const res = await patch({ action: "sanctions_clear", reason });
    expect(res.status).toBe(200);
    const fm = written();
    expect(fm.sanctions_hit).toBe(false);
    expect(fm.sanctions_cleared_by).toBe(user.email);
    expect(fm.sanctions_cleared_reason).toBe(reason);
    const history = fm.history as Array<{ note?: string }>;
    expect(history.at(-1)?.note).toContain(reason);
    expect(logAudit).toHaveBeenCalledWith(
      "kyc.sanctions_cleared",
      "kyc_verification",
      expect.objectContaining({ details: expect.objectContaining({ reason }) })
    );
  });
});

describe("GET /api/kyc/<id> — firm-internal", () => {
  it("a client account gets 403 for the AML record of its own matter", async () => {
    user.role = "client_viewer";
    const fetchMock = vi.fn(async () => Response.json({ frontmatter: stored }));
    vi.stubGlobal("fetch", fetchMock);
    const req = Object.assign(new Request("http://x/api/kyc/k1"), {
      params: Promise.resolve({ id: "k1" }),
    });
    const res = await (GET as unknown as (r: Request) => Promise<Response>)(req);
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
