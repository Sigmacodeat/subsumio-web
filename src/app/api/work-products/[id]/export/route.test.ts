// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashContent, type WorkProduct } from "@/lib/work-product";

let role = "lawyer";

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: {
        body?: { parse: (d: unknown) => unknown };
        query?: { parse: (d: unknown) => unknown };
      },
      handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = { brainId: "brain-1", user: { id: "u1", email: "a@b.at", role }, headers: {} };
      const url = new URL(req.url);
      const body = opts.body ? opts.body.parse(await req.json()) : undefined;
      const query = opts.query
        ? opts.query.parse(Object.fromEntries(url.searchParams.entries()))
        : undefined;
      return handler(ctx, body, query, req);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/docx-export", () => ({
  generateDocx: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

let stored: WorkProduct | null = null;
vi.mock("@/lib/work-product-store", () => ({
  getWorkProduct: vi.fn(async () => stored),
}));

import { GET, POST } from "./route";
import { generateDocx } from "@/lib/docx-export";

function wp(status: WorkProduct["status"], content = "Memo-Inhalt"): WorkProduct {
  return {
    id: "wp-1",
    product_type: "memo",
    case_slug: "cases/a",
    title: "Memo",
    status,
    content,
    content_hash: hashContent(content),
    receipt_id: "r1",
    claim_evidence_slug: null,
    brain_id: "brain-1",
    user_id: "u1",
    jurisdiction: "AT",
    created_at: "2026-09-24T10:00:00.000Z",
    updated_at: "2026-09-24T10:00:00.000Z",
    submitted_at: null,
    approved_at: null,
    approved_by: null,
    published_at: null,
    rejected_at: null,
    rejected_by: null,
    rejection_reason: null,
    metadata: {},
  };
}

const url = "http://x/api/work-products/wp-1/export";

beforeEach(() => {
  role = "lawyer";
  vi.mocked(generateDocx).mockClear();
});

describe("GET /api/work-products/[id]/export", () => {
  it.each(["draft", "in_review", "rejected"] as const)("refuses a %s work product", async (s) => {
    stored = wp(s);
    const res = await GET(new Request(url) as never);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("release_required");
    expect(generateDocx).not.toHaveBeenCalled();
  });

  it("refuses xlsx before the release as well", async () => {
    stored = wp("draft", "| a |\n|---|\n| 1 |");
    const res = await GET(new Request(`${url}?format=xlsx`) as never);
    expect(res.status).toBe(403);
  });

  it("exports an approved work product, marked as AI", async () => {
    stored = wp("approved");
    const res = await GET(new Request(url) as never);
    expect(res.status).toBe(200);
    expect(vi.mocked(generateDocx).mock.calls[0]![1]).toMatchObject({ aiGenerated: true });
  });

  it("refuses an approved work product whose content no longer matches its hash", async () => {
    stored = { ...wp("approved"), content: "nachträglich geändert" };
    const res = await GET(new Request(url) as never);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/work-products/[id]/export (anwaltliche Übersteuerung)", () => {
  function override(reason: string) {
    return POST(
      new Request(url, {
        method: "POST",
        body: JSON.stringify({ override_reason: reason }),
      }) as never
    );
  }

  it("lets a lawyer export a draft with a reason", async () => {
    stored = wp("draft");
    const res = await override("Eilantrag, Zitate händisch geprüft");
    expect(res.status).toBe(200);
  });

  it("refuses the override for an assistant", async () => {
    role = "assistant";
    stored = wp("draft");
    const res = await override("Eilantrag, Zitate händisch geprüft");
    expect(res.status).toBe(403);
    expect(generateDocx).not.toHaveBeenCalled();
  });

  it("requires a reason of at least 10 characters", async () => {
    stored = wp("draft");
    await expect(override("kurz")).rejects.toThrow();
  });
});
