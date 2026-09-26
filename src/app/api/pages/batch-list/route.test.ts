import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
  recordQuota: vi.fn(),
}));

import { POST } from "./route";
import { requireEngineContext } from "@/lib/engine";

const ctx = {
  headers: { "x-subsumio-source": "brain_a" },
  brainId: "brain_a",
  plan: "team",
  user: { id: "u1", email: "anwalt@kanzlei.example", role: "lawyer", name: "Anwalt" },
};

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost:3000/api/pages/batch-list", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/pages/batch-list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as never);
    const all = Array.from({ length: 450 }, (_, i) => ({
      slug: `contact/${i}`,
      title: `Kontakt ${i}`,
      frontmatter: i === 3 ? { status: "tombstoned" } : {},
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const params = new URL(url).searchParams;
        const offset = Number(params.get("offset") ?? 0);
        // The engine never returns more than 100 rows per request.
        const limit = Math.min(Number(params.get("limit") ?? 100), 100);
        return Response.json(all.slice(offset, offset + limit));
      })
    );
  });

  it("reads past the engine's per-request cap and leaves out deleted records", async () => {
    const res = await post({ types: ["legal_contact"], limit: 10_000 });
    const body = (await res.json()) as { results: Record<string, unknown[]> };
    expect(body.results.legal_contact).toHaveLength(449);
  });

  it("stops at the requested number", async () => {
    const res = await post({ types: ["legal_contact"], limit: 200 });
    const body = (await res.json()) as { results: Record<string, unknown[]> };
    expect(body.results.legal_contact).toHaveLength(199);
  });

  it("refuses a request that would fan out into thousands of engine calls (R11-12)", async () => {
    const res = await post({
      types: Array.from({ length: 20 }, (_, i) => `t${i}`),
      limit: 50_000,
    });
    expect(res.status).toBe(400);
    const tooMany = await post({ types: ["a", "b", "c"], limit: 50_000 });
    expect(tooMany.status).toBe(400);
    const allInvoices = await post({ types: ["invoice"], limit: 50_000 });
    expect(allInvoices.status).toBe(200);
  });
});
