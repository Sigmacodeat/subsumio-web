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

describe("POST /api/pages — server-side write guards", () => {
  let engineCalls: Array<{ url: string; body: any }>;
  let stored: unknown;
  let readStatus: number;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
    engineCalls = [];
    stored = null;
    readStatus = 200;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        engineCalls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
        if (init?.body === undefined) {
          return readStatus === 200
            ? Response.json(stored)
            : new Response("{}", { status: readStatus });
        }
        return Response.json({ slug: "x", success: true });
      })
    );
  });

  const writes = () => engineCalls.filter((c) => Object.keys(c.body).length > 0);

  it("rejects a merge that marks a Notfrist done with a client-set second check", async () => {
    stored = {
      slug: "legal/deadlines/f1",
      type: "legal_deadline",
      frontmatter: { status: "pending", second_check_required: true },
    };
    const res = await post({
      slug: "legal/deadlines/f1",
      merge: true,
      frontmatter: { status: "done", second_check_by: "Anwalt", second_check_at: "t" },
    });
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  it("drops client second_check fields from any merge", async () => {
    stored = { slug: "legal/deadlines/f2", type: "legal_deadline", frontmatter: {} };
    const res = await post({
      slug: "legal/deadlines/f2",
      merge: true,
      frontmatter: { note: "ok", second_check_by: "Anwalt", second_check_at: "t" },
    });
    expect(res.status).toBe(200);
    expect(writes()[0].body.frontmatter).toEqual({ note: "ok" });
  });

  it("rejects a merge that edits an issued invoice", async () => {
    stored = {
      slug: "legal/invoices/r-1",
      type: "invoice",
      frontmatter: { status: "paid", total: 780 },
    };
    const res = await post({ slug: "legal/invoices/r-1", merge: true, frontmatter: { total: 1 } });
    expect(res.status).toBe(409);
    expect(writes()).toHaveLength(0);
  });

  it("rejects a create that would overwrite an issued invoice", async () => {
    stored = { slug: "legal/invoices/r-1", type: "invoice", frontmatter: { status: "sent" } };
    const res = await post({
      slug: "legal/invoices/r-1",
      title: "Rechnung",
      type: "invoice",
      frontmatter: { status: "draft", total: 1 },
    });
    expect(res.status).toBe(409);
    expect(writes()).toHaveLength(0);
  });

  it("fails closed when the stored page cannot be read", async () => {
    readStatus = 502;
    const res = await post({ slug: "legal/invoices/r-1", merge: true, frontmatter: { total: 1 } });
    expect(res.status).toBe(503);
    expect(writes()).toHaveLength(0);
  });

  it("still creates a new page when the slug does not exist yet", async () => {
    readStatus = 404;
    const res = await post({ slug: "legal/invoices/r-2", title: "Rechnung", type: "invoice" });
    expect(res.status).toBe(200);
    expect(writes()).toHaveLength(1);
  });
});

describe("GET /api/pages?case_slug= — one matter's pages, complete", () => {
  const deadlines = Array.from({ length: 250 }, (_, i) => ({
    slug: `legal/deadlines/d-${i}`,
    title: `Frist ${i}`,
    frontmatter:
      i === 7
        ? { case_title: "Muster gegen Beispiel" }
        : i % 50 === 0 || i === 249
          ? { case_slug: "legal/cases/akte-1" }
          : { case_slug: "legal/cases/andere" },
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url);
        const limit = Number(u.searchParams.get("limit"));
        const offset = Number(u.searchParams.get("offset") ?? 0);
        return Response.json(deadlines.slice(offset, offset + Math.min(limit, 100)));
      })
    );
  });

  it("pages past the engine cap and returns only the matter's deadlines", async () => {
    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/pages?type=legal_deadline&case_slug=legal/cases/akte-1&case_title=Muster%20gegen%20Beispiel"
      )
    );
    const slugs = ((await res.json()) as Array<{ slug: string }>).map((p) => p.slug);
    expect(slugs.sort()).toEqual(
      [
        "legal/deadlines/d-0",
        "legal/deadlines/d-100",
        "legal/deadlines/d-150",
        "legal/deadlines/d-200",
        "legal/deadlines/d-249",
        "legal/deadlines/d-50",
        "legal/deadlines/d-7",
      ].sort()
    );
  });

  it("requires a type for a matter filter", async () => {
    const res = await GET(
      new NextRequest("http://localhost:3000/api/pages?case_slug=legal/cases/akte-1")
    );
    expect(res.status).toBe(400);
  });
});
