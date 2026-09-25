// @vitest-environment node
// UIS-4-7: the insurer's answer (Deckungsstatus) can be recorded on an
// existing coverage inquiry.
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getEnginePage = vi.hoisted(() => vi.fn());
const writeEnginePage = vi.hoisted(() => vi.fn());

vi.mock("@/lib/engine-page-io", () => ({
  getEnginePage: (...a: unknown[]) => getEnginePage(...a),
  writeEnginePage: (...a: unknown[]) => writeEnginePage(...a),
}));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { action: string; body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = {
        brainId: "firm-a",
        headers: { "x-subsumio-source": "firm-a" },
        user: { id: "u-lawyer", role: "lawyer", email: "l@example.at" },
        action: opts.action,
      };
      const parsed = opts.body ? opts.body.parse(await req.json()) : undefined;
      return handler(ctx, parsed);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { PATCH } from "./route";

const existing = {
  id: "rsv-1700000000000-abc123",
  case_slug: "legal/cases/m1",
  client_name: "Alice Example",
  insurance_provider: "Versicherung A",
  coverage_status: "pending",
  created_at: "2026-09-01T08:00:00.000Z",
  updated_at: "2026-09-01T08:00:00.000Z",
};

function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request("http://x/api/legal-insurance", {
      method: "PATCH",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getEnginePage.mockResolvedValue({
    slug: `legal/rsv/${existing.id}`,
    type: "rsv_case",
    frontmatter: existing,
  });
  writeEnginePage.mockResolvedValue(undefined);
});

describe("PATCH /api/legal-insurance", () => {
  it("records an approval with decision date and keeps the other fields", async () => {
    const res = await patch({ id: existing.id, coverage_status: "approved" });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.rsv.coverage_status).toBe("approved");
    expect(data.rsv.decided_at).toBeTruthy();
    expect(data.rsv.client_name).toBe("Alice Example");
    const [, page, opts] = writeEnginePage.mock.calls[0];
    expect(page.slug).toBe(`legal/rsv/${existing.id}`);
    expect(page.frontmatter.coverage_status).toBe("approved");
    expect(opts).toMatchObject({ merge: true });
  });

  it("returns 404 for an unknown inquiry and writes nothing", async () => {
    getEnginePage.mockResolvedValue(null);
    const res = await patch({ id: existing.id, coverage_status: "denied" });
    expect(res.status).toBe(404);
    expect(writeEnginePage).not.toHaveBeenCalled();
  });

  it("refuses to change a page of another type", async () => {
    getEnginePage.mockResolvedValue({ slug: "x", type: "legal_case", frontmatter: existing });
    const res = await patch({ id: existing.id, coverage_status: "denied" });
    expect(res.status).toBe(404);
    expect(writeEnginePage).not.toHaveBeenCalled();
  });

  it("reports a failed write instead of success", async () => {
    writeEnginePage.mockRejectedValue(new Error("engine_page_write_failed_500"));
    const res = await patch({ id: existing.id, coverage_status: "denied" });
    expect(res.status).toBe(502);
  });

  it("rejects an unknown status and a malformed id", async () => {
    await expect(patch({ id: existing.id, coverage_status: "maybe" })).rejects.toThrow();
    await expect(patch({ id: "../etc", coverage_status: "approved" })).rejects.toThrow();
  });
});
