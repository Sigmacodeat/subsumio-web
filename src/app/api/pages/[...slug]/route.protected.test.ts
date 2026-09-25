// @vitest-environment node
// PATCH/DELETE/GET /api/pages/<slug> vs. protected records (OPS-7, OPS-18,
// GELD-7, AKT-8, AKT-9).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPatch = vi.fn();
const user = { id: "u1", email: "assistenz@example.com", name: "A", role: "assistant" };

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: unknown,
    handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const ctx = { headers: { "x-subsumio-source": "brain-at" }, brainId: "brain-at", user };
      const body = req.method === "PATCH" ? await req.json().catch(() => ({})) : {};
      return handler(ctx, body, {}, req);
    };
  },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiNotFound: (code: string) => Response.json({ error: code }, { status: 404 }),
}));

import { DELETE, GET, PATCH } from "./route";

/** Pages by slug; a value that is a number is answered with that HTTP status. */
let pages: Record<string, Record<string, unknown> | number>;

beforeEach(() => {
  vi.clearAllMocks();
  user.role = "assistant";
  pages = {};
  mockPatch.mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const slug = decodeURIComponent(String(url).replace("http://engine.test/api/pages/", ""));
      const page = pages[slug];
      if (page === undefined) return new Response("nf", { status: 404 });
      if (typeof page === "number") return new Response("x", { status: page });
      return Response.json(page);
    })
  );
});

function call(method: "PATCH" | "DELETE" | "GET", slug: string, body?: unknown, headers = {}) {
  const req = new Request(`http://localhost/api/pages/${slug}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  (req as unknown as { params: Promise<{ slug: string[] }> }).params = Promise.resolve({
    slug: slug.split("/"),
  });
  const fn = method === "PATCH" ? PATCH : method === "DELETE" ? DELETE : GET;
  return (fn as unknown as (r: Request) => Promise<Response>)(req);
}

describe("PATCH version (AKT-9)", () => {
  it("is the stored version + 1 without If-Match, whatever the client sends", async () => {
    pages["legal/cases/m1"] = {
      slug: "legal/cases/m1",
      type: "legal_case",
      frontmatter: { status: "active", version: 7 },
    };
    const res = await call("PATCH", "legal/cases/m1", { frontmatter: { notes: "x" } });
    expect(res.status).toBe(200);
    expect(mockPatch.mock.calls[0][1].frontmatter.version).toBe(8);

    mockPatch.mockClear();
    await call("PATCH", "legal/cases/m1", { frontmatter: { notes: "y", version: 1 } });
    expect(mockPatch.mock.calls[0][1].frontmatter.version).toBe(8);
  });

  it("with a matching If-Match it is also stored + 1", async () => {
    pages["legal/cases/m1"] = {
      slug: "legal/cases/m1",
      type: "legal_case",
      frontmatter: { status: "active", version: 3 },
    };
    await call("PATCH", "legal/cases/m1", { frontmatter: { version: 99 } }, { "if-match": "3" });
    expect(mockPatch.mock.calls[0][1].frontmatter.version).toBe(4);
  });
});

describe("PATCH bypasses (AKT-8, OPS-7, GELD-7)", () => {
  it("an assistant cannot tombstone a page via PATCH", async () => {
    pages["legal/documents/d1"] = {
      slug: "legal/documents/d1",
      type: "document",
      frontmatter: { status: "active" },
    };
    const res = await call("PATCH", "legal/documents/d1", {
      frontmatter: { status: "tombstoned" },
    });
    expect(res.status).toBe(403);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("legal_hold cannot be switched off via PATCH, even by an admin", async () => {
    user.role = "admin";
    pages["legal/cases/m1"] = {
      slug: "legal/cases/m1",
      type: "legal_case",
      frontmatter: { status: "active", legal_hold: true },
    };
    const res = await call("PATCH", "legal/cases/m1", { frontmatter: { legal_hold: false } });
    expect(res.status).toBe(403);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("a KYC record and a trust account are not patched generically", async () => {
    user.role = "admin";
    pages["legal/kyc/k1"] = { slug: "legal/kyc/k1", type: "kyc_verification", frontmatter: {} };
    pages["trust-accounts/1"] = {
      slug: "trust-accounts/1",
      type: "trust_account",
      frontmatter: { transactions: [] },
    };
    expect(
      (await call("PATCH", "legal/kyc/k1", { frontmatter: { status: "verified" } })).status
    ).toBe(403);
    expect(
      (await call("PATCH", "trust-accounts/1", { frontmatter: { current_balance: 0 } })).status
    ).toBe(403);
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe("DELETE (AKT-8, GELD-7, OPS-7)", () => {
  it("fails closed (503) when the matter's Legal Hold cannot be checked", async () => {
    user.role = "lawyer";
    pages["legal/documents/d1"] = {
      slug: "legal/documents/d1",
      type: "document",
      frontmatter: { case_slug: "legal/cases/m1" },
    };
    pages["legal/cases/m1"] = 500;
    const res = await call("DELETE", "legal/documents/d1");
    expect(res.status).toBe(503);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("refuses a document of a matter under Legal Hold (423)", async () => {
    user.role = "lawyer";
    pages["legal/documents/d1"] = {
      slug: "legal/documents/d1",
      type: "document",
      frontmatter: { case_slug: "legal/cases/m1" },
    };
    pages["legal/cases/m1"] = {
      slug: "legal/cases/m1",
      type: "legal_case",
      frontmatter: { legal_hold: true },
    };
    const res = await call("DELETE", "legal/documents/d1");
    expect(res.status).toBe(423);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("does not delete a trust account or a KYC record through the page API", async () => {
    user.role = "admin";
    pages["trust-accounts/1"] = {
      slug: "trust-accounts/1",
      type: "trust_account",
      frontmatter: { current_balance: 100 },
    };
    pages["legal/kyc/k1"] = { slug: "legal/kyc/k1", type: "kyc_verification", frontmatter: {} };
    expect((await call("DELETE", "trust-accounts/1")).status).toBe(403);
    expect((await call("DELETE", "legal/kyc/k1")).status).toBe(403);
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe("GET redacts the SMTP password (OPS-18)", () => {
  it("returns only smtpPasswordSet", async () => {
    user.role = "client_viewer";
    pages["legal/settings/kanzlei"] = {
      slug: "legal/settings/kanzlei",
      type: "kanzlei_settings",
      frontmatter: { smtpPassword: "legacy-plain", smtpPasswordEnc: "sbenc:abc", iban: "AT1" },
    };
    const res = await call("GET", "legal/settings/kanzlei");
    const body = await res.json();
    expect(body.frontmatter).toEqual({ iban: "AT1", smtpPasswordSet: true });
  });
});
