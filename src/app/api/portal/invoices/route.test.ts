// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/portal-access", () => ({ resolvePortalAccess: vi.fn() }));
vi.mock("@/lib/portal-session", () => ({ portalToken: (_req: Request, t?: string) => t ?? null }));
vi.mock("@/lib/engine-pages", () => ({ listEnginePages: vi.fn(async () => []) }));
vi.mock("@/lib/e-invoice/qr-bill", () => ({ generateEpcQrCode: vi.fn(async () => "qr") }));
vi.mock("@/lib/api-handler", () => ({
  createPublicHandler:
    (_opts: unknown, handler: (req: Request, body: unknown, q: unknown) => Promise<Response>) =>
    async (req: Request) =>
      handler(req, null, { token: new URL(req.url).searchParams.get("token") }),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json(data),
}));
vi.mock("@/lib/auth/rate-limit", () => ({ clientIp: () => "127.0.0.1" }));

import { GET } from "./route";
import { listEnginePages } from "@/lib/engine-pages";
import { resolvePortalAccess } from "@/lib/portal-access";

function req() {
  return new Request("http://localhost/api/portal/invoices?token=tok");
}

describe("GET /api/portal/invoices — kill switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses invoices when portal access is denied (portal disabled / archived)", async () => {
    vi.mocked(resolvePortalAccess).mockResolvedValue(
      Response.json({ error: "portal_disabled" }, { status: 403 })
    );
    const res = await GET(req() as never);
    expect(res.status).toBe(403);
    expect(listEnginePages).not.toHaveBeenCalled();
  });

  it("lists only sent/overdue/paid invoices of the token's matter", async () => {
    vi.mocked(resolvePortalAccess).mockResolvedValue({
      payload: { case_slug: "cases/a", brain_id: "b", exp: 1 },
      caseSlug: "cases/a",
      headers: { "x-test": "1" },
    });
    vi.mocked(listEnginePages).mockResolvedValue([
      { slug: "i1", frontmatter: { case_slugs: ["cases/a"], status: "sent", total: 100 } },
      { slug: "i2", frontmatter: { case_slugs: ["cases/a"], status: "draft", total: 50 } },
      { slug: "i3", frontmatter: { case_slugs: ["cases/other"], status: "sent", total: 70 } },
      { slug: "i4", frontmatter: { case_slugs: ["cases/a"], status: "paid", total: 30 } },
    ] as never);
    const res = await GET(req() as never);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { invoices: Array<{ slug: string }> };
    expect(data.invoices.map((i) => i.slug).sort()).toEqual(["i1", "i4"]);
  });
});
