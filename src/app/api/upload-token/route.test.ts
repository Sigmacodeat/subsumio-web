// @vitest-environment node
// Upload into an archived matter (AKT-24): refused before a token is issued.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-handler", () => ({
  recordQuota: vi.fn(),
  createHandler: (
    opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
    handler: (ctx: unknown, body: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const raw = await req.json();
      const parsed = opts.body!.safeParse(raw);
      if (!parsed.success) return Response.json({ error: "bad" }, { status: 400 });
      return handler(
        {
          headers: {},
          brainId: "b1",
          user: { id: "u1", role: "lawyer" },
          billing: { ownerId: "u1", ownerType: "user" },
          plan: "team",
        },
        parsed.data
      );
    };
  },
}));

import { POST } from "./route";

let casePage: Record<string, unknown>;

beforeEach(() => {
  process.env.SUBSUMIO_INTERNAL_SECRET = "test-secret";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(casePage))
  );
});

function request() {
  return (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/upload-token", {
      method: "POST",
      body: JSON.stringify({
        source: "documents",
        case_slug: "legal/cases/m1",
        filename: "schriftsatz.pdf",
        size: 1000,
        mime_type: "application/pdf",
      }),
    })
  );
}

describe("POST /api/upload-token", () => {
  it("refuses an archived matter with 409 case_archived", async () => {
    casePage = { slug: "legal/cases/m1", type: "legal_case", frontmatter: { status: "archived" } };
    const res = await request();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("case_archived");
  });

  it("refuses a matter the user may only read with 403 matter_read_only", async () => {
    casePage = {
      slug: "legal/cases/m1",
      type: "legal_case",
      frontmatter: {
        status: "active",
        permissions: {
          visibility: "confidential",
          grants: [{ user_id: "u1", level: "read" }],
        },
      },
    };
    const res = await request();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("matter_read_only");
  });

  it("issues a token for an active matter", async () => {
    casePage = { slug: "legal/cases/m1", type: "legal_case", frontmatter: { status: "active" } };
    const res = await request();
    expect(res.status).toBe(200);
  });
});
