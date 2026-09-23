// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPatch = vi.fn();

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) => {
    return async (req: Request) => {
      const ctx = {
        headers: {},
        brainId: "brain-at",
        user: { id: "u2", email: "kollegin@example.com", name: "Kollegin" },
      };
      return handler(ctx, await req.json());
    };
  },
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { POST } from "./route";

let stored: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPatch.mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(stored))
  );
});

const post = (body: unknown) =>
  (POST as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/legal/fristen/second-check", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );

describe("POST /api/legal/fristen/second-check", () => {
  it("stamps the signed-in user on a standalone Notfrist", async () => {
    stored = {
      slug: "legal/deadlines/f1",
      type: "legal_deadline",
      frontmatter: { status: "pending", is_notfrist: true, created_by: "anwalt@example.com" },
    };
    const res = await post({ slug: "legal/deadlines/f1" });
    expect(res.status).toBe(200);
    const fm = mockPatch.mock.calls[0][1].frontmatter;
    expect(fm).toMatchObject({
      status: "done",
      second_check_by: "Kollegin",
      second_check_by_id: "u2",
      second_check_by_email: "kollegin@example.com",
    });
  });

  it("refuses the person who created the deadline (compared by id, name and e-mail)", async () => {
    stored = {
      slug: "legal/deadlines/f1",
      type: "legal_deadline",
      frontmatter: { status: "pending", is_notfrist: true, created_by: "KOLLEGIN@example.com" },
    };
    const res = await post({ slug: "legal/deadlines/f1" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("second_check_self_blocked");
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("refuses the first reviewer", async () => {
    stored = {
      slug: "legal/deadlines/f1",
      type: "legal_deadline",
      frontmatter: { status: "pending", reviewed_by: "Kollegin" },
    };
    expect((await post({ slug: "legal/deadlines/f1" })).status).toBe(409);
  });

  it("does not complete pages that are not deadlines", async () => {
    stored = { slug: "legal/invoices/r-1", type: "invoice", frontmatter: { status: "sent" } };
    expect((await post({ slug: "legal/invoices/r-1" })).status).toBe(400);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("second-checks a deadline inside a matter's list and leaves the others untouched", async () => {
    stored = {
      slug: "legal/cases/akte-1",
      type: "legal_case",
      frontmatter: {
        deadlines: [
          { id: "d1", title: "Berufung", status: "pending", is_notfrist: true },
          { id: "d2", title: "Replik", status: "pending" },
        ],
      },
    };
    const res = await post({ slug: "legal/cases/akte-1", deadlineId: "d1" });
    expect(res.status).toBe(200);
    const { slug, frontmatter } = mockPatch.mock.calls[0][1];
    expect(slug).toBe("legal/cases/akte-1");
    expect(frontmatter.deadlines[0]).toMatchObject({
      status: "done",
      second_check_by: "Kollegin",
      second_check_by_id: "u2",
    });
    expect(frontmatter.deadlines[1]).toEqual({ id: "d2", title: "Replik", status: "pending" });
  });

  it("routes a page: id from the matter view to the standalone deadline page", async () => {
    stored = { slug: "legal/deadlines/f9", type: "legal_deadline", frontmatter: {} };
    const res = await post({ slug: "legal/cases/akte-1", deadlineId: "page:legal/deadlines/f9" });
    expect(res.status).toBe(200);
    expect(mockPatch.mock.calls[0][1].slug).toBe("legal/deadlines/f9");
  });

  it("never overwrites an existing second check", async () => {
    stored = {
      slug: "legal/deadlines/f1",
      type: "legal_deadline",
      frontmatter: { status: "done", second_check_by: "Dritte", second_check_at: "t" },
    };
    const res = await post({ slug: "legal/deadlines/f1" });
    expect(res.status).toBe(200);
    expect(mockPatch).not.toHaveBeenCalled();
  });
});
