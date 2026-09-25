/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// In-memory workflow page; reads and writes yield so requests interleave.
let stored: { slug: string; frontmatter: { steps: any[] } };
const tick = () => new Promise((r) => setTimeout(r, 5));

vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), SYSTEM_BRAIN: "system" }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
  clientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
  recordQuota: vi.fn(),
  enginePatchPage: vi.fn(async (_h: unknown, patch: { frontmatter: { steps: any[] } }) => {
    await tick();
    stored = { ...stored, frontmatter: { ...stored.frontmatter, ...patch.frontmatter } };
    return new Response("{}", { status: 200 });
  }),
}));

import { POST } from "./route";
import { requireEngineContext } from "@/lib/engine";

const ctx = {
  headers: { "x-subsumio-source": "brain_a" },
  brainId: "brain_a",
  plan: "team",
  user: { id: "u1", email: "anwalt@kanzlei.example", role: "lawyer", name: "A" },
};

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost:3000/api/workflows/approve", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/workflows/approve — parallel decisions (OPS-20)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
    stored = {
      slug: "workflows/w1",
      frontmatter: {
        steps: [
          { id: "a", requires_approval: true, approval_status: "pending", status: "pending" },
          { id: "b", requires_approval: true, approval_status: "pending", status: "pending" },
        ],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await tick();
        return Response.json(JSON.parse(JSON.stringify(stored)));
      })
    );
  });

  it("two parallel approvals of different steps both land", async () => {
    const [r1, r2] = await Promise.all([
      post({ workflowSlug: "workflows/w1", stepId: "a", action: "approve" }),
      post({ workflowSlug: "workflows/w1", stepId: "b", action: "approve" }),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const status = Object.fromEntries(
      stored.frontmatter.steps.map((s) => [s.id, s.approval_status])
    );
    expect(status).toEqual({ a: "approved", b: "approved" });
  });

  it("approve and reject of the same step in parallel: exactly one wins, the other gets 409", async () => {
    const results = await Promise.all([
      post({ workflowSlug: "workflows/w1", stepId: "a", action: "approve" }),
      post({ workflowSlug: "workflows/w1", stepId: "a", action: "reject" }),
    ]);
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([200, 409]);
  });

  it("limits the comment length", async () => {
    const res = await post({
      workflowSlug: "workflows/w1",
      stepId: "a",
      action: "approve",
      comment: "x".repeat(2001),
    });
    expect(res.status).toBe(400);
  });
});
