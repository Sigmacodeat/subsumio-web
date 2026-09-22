/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/auth/store", () => ({ markOnboardingProgress: vi.fn() }));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
  recordQuota: vi.fn(),
}));

import { GET, POST } from "./route";
import { requireEngineContext, recordQuota } from "@/lib/engine";
import { logAudit } from "@/lib/audit";

const ctx = {
  headers: { "x-subsumio-source": "brain_a" },
  brainId: "brain_a",
  plan: "team",
  user: { id: "u1", email: "anwalt@kanzlei.example", role: "lawyer", name: "Anwalt" },
};

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost:3000/api/pages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": "t",
        cookie: "sb_csrf=t",
      },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/pages", () => {
  let engineCalls: Array<{ url: string; body: any }>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
    engineCalls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        engineCalls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
        return new Response(JSON.stringify({ slug: "legal/deadlines/x", success: true }), {
          status: 200,
        });
      })
    );
  });

  // Lock check (GET /api/pages/<slug>) precedes every merge write — only the
  // write call carries a body.
  const writes = () => engineCalls.filter((c) => Object.keys(c.body).length > 0);

  it("rejects a create without a title", async () => {
    const res = await post({ slug: "legal/deadlines/x", frontmatter: { status: "done" } });
    expect(res.status).toBe(400);
    expect(engineCalls).toHaveLength(0);
  });

  it("forwards a merge update without a title (approve / mark done / second check)", async () => {
    const res = await post({
      slug: "legal/deadlines/x",
      merge: true,
      frontmatter: { review_status: "approved", reviewed_by: "Anwalt" },
    });
    expect(res.status).toBe(200);
    // First write call is the merge itself; a deadline merge may be followed by the
    // best-effort Aktenblatt refresh of its matter (read + rewrite).
    expect(writes().length).toBeGreaterThanOrEqual(1);
    expect(writes()[0].body).toMatchObject({ slug: "legal/deadlines/x", merge: true });
    // A merge is not a new page: no page quota, audited as an update.
    expect(recordQuota).not.toHaveBeenCalled();
    expect(vi.mocked(logAudit).mock.calls[0]?.[0]).toBe("case.update");
  });

  it("rejects a merge on a document checked out by another user (409)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        engineCalls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
        if (init?.body === undefined) {
          // Lock check GET — document locked by someone else.
          return Response.json({
            slug: "legal/akte-1/vertrag",
            frontmatter: {
              checked_out_by: {
                userId: "u2",
                userEmail: "kollege@kanzlei.example",
                at: "2026-09-22T10:00:00Z",
              },
            },
          });
        }
        return Response.json({ slug: "legal/akte-1/vertrag", success: true });
      })
    );
    const res = await post({
      slug: "legal/akte-1/vertrag",
      merge: true,
      frontmatter: { status: "final" },
    });
    expect(res.status).toBe(409);
    expect(writes()).toHaveLength(0);
  });

  it("lets the lock owner merge normally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        engineCalls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
        if (init?.body === undefined) {
          return Response.json({
            slug: "legal/akte-1/vertrag",
            frontmatter: {
              checked_out_by: { userId: "u1", userEmail: "anwalt@kanzlei.example", at: "t" },
            },
          });
        }
        return Response.json({ slug: "legal/akte-1/vertrag", success: true });
      })
    );
    const res = await post({
      slug: "legal/akte-1/vertrag",
      merge: true,
      frontmatter: { status: "final" },
    });
    expect(res.status).toBe(200);
    expect(writes().length).toBeGreaterThanOrEqual(1);
  });

  it("creates a page with a title and counts the page quota", async () => {
    const res = await post({ slug: "legal/deadlines/y", title: "Frist", type: "legal_deadline" });
    expect(res.status).toBe(200);
    expect(recordQuota).toHaveBeenCalledWith(expect.anything(), "pages");
    expect(vi.mocked(logAudit).mock.calls[0]?.[0]).toBe("case.create");
  });
});

describe("GET /api/pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          { slug: "contact/a", title: "Anna", frontmatter: {} },
          { slug: "contact/b", title: "Gelöscht", frontmatter: { status: "tombstoned" } },
        ])
      )
    );
  });

  it("does not bring deleted records back into lists", async () => {
    const res = await GET(new NextRequest("http://localhost:3000/api/pages?type=legal_contact"));
    expect(((await res.json()) as Array<{ slug: string }>).map((p) => p.slug)).toEqual([
      "contact/a",
    ]);
  });

  it("returns them on request, so offset paging counts every engine row", async () => {
    const res = await GET(
      new NextRequest("http://localhost:3000/api/pages?type=legal_contact&include_tombstoned=1")
    );
    expect((await res.json()) as unknown[]).toHaveLength(2);
  });
});
