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
// The real engine checker — the route is tested against its actual answer shape.
import { conflictCheck } from "../../../../server/src/core/legal/conflict-check";

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

describe("POST /api/pages — server conflict gate (§ 10 RAO)", () => {
  // The engine answer is produced by the REAL engine checker over fixture
  // rows, so the route is tested against the shape production returns.
  const caseRows = [
    {
      slug: "legal/cases/alt",
      title: "Alt",
      client_name: "Dritte Beklagte GmbH",
      opponent_name: "X Y",
    },
    { slug: "legal/cases/folge", title: "Folge", client_name: "Muster AG", opponent_name: "Z Z" },
    {
      slug: "legal/cases/gegner",
      title: "Gegner-Akte",
      client_name: "Irgendwer",
      opponent_name: "Neue Mandantin GmbH",
    },
  ].map((r) => ({
    ...r,
    additional_opponents: null,
    contact_name: null,
    contact_company: null,
    contact_role: null,
    status: "open",
    page_type: "legal_case",
  }));
  const contactRows = [
    {
      slug: "kontakte/muster-ag",
      title: "Muster AG",
      client_name: null,
      opponent_name: null,
      additional_opponents: null,
      contact_name: "Muster AG",
      contact_company: null,
      contact_role: "client",
      status: null,
      page_type: "legal_contact",
    },
  ];
  const fixtureEngine = {
    async executeRaw<T>(sql: string): Promise<T[]> {
      return (sql.includes("type = 'person'") ? [] : [...caseRows, ...contactRows]) as T[];
    },
  };

  let checks: Array<Record<string, unknown>>;
  let caseWrites: Array<Record<string, any>>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
    checks = [];
    caseWrites = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith("/api/legal/conflict-check")) {
          const req = JSON.parse(String(init?.body ?? "{}")) as Record<string, any>;
          checks.push(req);
          const result = await conflictCheck(fixtureEngine, {
            name: req.name,
            side: req.side,
            selfCaseSlug: req.self_case_slug,
            ownContactSlugs: req.own_contact_slugs,
          });
          return new Response(JSON.stringify(result), { status: 200 });
        }
        if (init?.method === "POST" && String(url).endsWith("/api/pages")) {
          const body = JSON.parse(String(init.body ?? "{}"));
          if (body.type === "legal_case") caseWrites.push(body);
        }
        return new Response(JSON.stringify({ slug: "legal/cases/neu", success: true }), {
          status: 200,
        });
      })
    );
  });

  it("checks every party with its side and blocks on the additional opponent only", async () => {
    const res = await post({
      slug: "legal/cases/neu",
      title: "Muster gegen Beispiel",
      type: "legal_case",
      frontmatter: {
        client_name: "Muster AG",
        opponent_name: "Beispiel GmbH",
        additional_opponents: [
          { name: "Dritte Beklagte GmbH", rolle: "nebenbeklagter" },
          { name: "Beispiel GmbH", rolle: "nebenbeklagter" },
        ],
      },
    });
    expect(checks.map((c) => [c.name, c.side])).toEqual([
      ["Muster AG", "client"],
      ["Beispiel GmbH", "opponent"],
      ["Dritte Beklagte GmbH", "opponent"],
    ]);
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.conflictWarning.blocking.map((m: any) => m.name)).toEqual(["Dritte Beklagte GmbH"]);
    expect(body.conflictWarning.blocking[0]).toMatchObject({
      slug: "legal/cases/alt",
      type: "case",
      role: "client",
      party: "Dritte Beklagte GmbH",
    });
    expect(caseWrites).toHaveLength(0);
  });

  it("OPS-1: the new client is the opponent in an existing Akte → 409 with filled name", async () => {
    const res = await post({
      slug: "legal/cases/neu",
      title: "Neue Mandantin",
      type: "legal_case",
      frontmatter: { client_name: "Neue Mandantin Ges.m.b.H." },
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.conflictWarning.matches[0].name).toBe("Neue Mandantin GmbH");
    expect(body.conflictWarning.matches[0].title).toBe("Gegner-Akte");
  });

  it("OPS-4: follow-up matter for an existing client with its own contact → 200, no warning", async () => {
    const res = await post({
      slug: "legal/cases/neu",
      title: "Muster AG — Folgeakte",
      type: "legal_case",
      frontmatter: { client_name: "Muster AG", client_slug: "kontakte/muster-ag" },
    });
    expect(res.status).toBe(200);
    expect(checks[0]).toMatchObject({
      name: "Muster AG",
      side: "client",
      self_case_slug: "legal/cases/neu",
      own_contact_slugs: ["kontakte/muster-ag"],
    });
    const body = (await res.json()) as any;
    expect(body.conflictWarning.matches).toBeUndefined();
    expect(caseWrites[0]?.frontmatter.conflict_status).toBe("conflict_cleared");
  });

  it("waiver: assistant is refused (403)", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue({
      ...ctx,
      user: { ...ctx.user, role: "assistant" },
    } as any);
    const res = await post({
      slug: "legal/cases/neu",
      title: "Neue Mandantin",
      type: "legal_case",
      frontmatter: {
        client_name: "Neue Mandantin GmbH",
        conflict_waiver_reason: "Zustimmung beider Seiten liegt vor",
      },
    });
    expect(res.status).toBe(403);
    expect(caseWrites).toHaveLength(0);
  });

  it("waiver by a lawyer is stamped with the real user; client stamps are ignored", async () => {
    const res = await post({
      slug: "legal/cases/neu",
      title: "Neue Mandantin",
      type: "legal_case",
      frontmatter: {
        client_name: "Neue Mandantin GmbH",
        conflict_waiver_reason: "Zustimmung beider Seiten liegt vor",
        conflict_waived_by: "jemand-anderer@example.com",
        conflict_waived_at: "2020-01-01T00:00:00.000Z",
        mandate_acceptance: { intake_slug: "quick-create", conflict_check: { status: "clear" } },
      },
    });
    expect(res.status).toBe(200);
    const fm = caseWrites[0]!.frontmatter;
    expect(fm.conflict_status).toBe("conflict_waived");
    expect(fm.conflict_waived_by).toBe("anwalt@kanzlei.example");
    expect(fm.conflict_waived_by_id).toBe("u1");
    expect(fm.conflict_waived_at).not.toBe("2020-01-01T00:00:00.000Z");
    expect(fm.mandate_acceptance.conflict_check).toMatchObject({
      status: "conflict",
      waived: true,
      waived_by_id: "u1",
      waived_reason: "Zustimmung beider Seiten liegt vor",
    });
  });

  it("a client-claimed conflict status is replaced by the server's", async () => {
    const res = await post({
      slug: "legal/cases/neu",
      title: "Neue Sache",
      type: "legal_case",
      frontmatter: {
        client_name: "Berta Unbekannt",
        conflict_status: "conflict_waived",
        conflict_waived_by: "jemand@example.com",
      },
    });
    expect(res.status).toBe(200);
    const fm = caseWrites[0]!.frontmatter;
    expect(fm.conflict_status).toBe("conflict_cleared");
    expect(fm.conflict_waived_by).toBeUndefined();
  });

  it("OPS-5: mandate_acceptance.conflict_check is written from the server result", async () => {
    const res = await post({
      slug: "legal/cases/neu",
      title: "Neue Sache",
      type: "legal_case",
      frontmatter: {
        client_name: "Berta Unbekannt",
        mandate_acceptance: {
          intake_slug: "quick-create",
          conflict_check: { status: "pending", severity: "unknown", matches: [] },
          kyc: { required: true, status: "pending" },
        },
      },
    });
    expect(res.status).toBe(200);
    const cc = caseWrites[0]!.frontmatter.mandate_acceptance.conflict_check;
    expect(cc).toMatchObject({
      status: "clear",
      performed_by: "anwalt@kanzlei.example",
      performed_by_id: "u1",
      parties: [{ name: "Berta Unbekannt", side: "client", severity: "none" }],
    });
    expect(caseWrites[0]!.frontmatter.mandate_acceptance.kyc).toEqual({
      required: true,
      status: "pending",
    });
  });

  it("engine unavailable → 503, nothing written", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith("/api/legal/conflict-check")) {
          return new Response("down", { status: 502 });
        }
        if (init?.method === "POST") caseWrites.push(JSON.parse(String(init.body ?? "{}")));
        return new Response(JSON.stringify({ slug: "x" }), { status: 200 });
      })
    );
    const res = await post({
      slug: "legal/cases/neu",
      title: "Neue Sache",
      type: "legal_case",
      frontmatter: { client_name: "Berta Unbekannt" },
    });
    expect(res.status).toBe(503);
    expect(caseWrites).toHaveLength(0);
  });
});
