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

function post(body: unknown, extraHeaders: Record<string, string> = {}) {
  return POST(
    new NextRequest("http://localhost:3000/api/pages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": "t",
        cookie: "sb_csrf=t",
        ...extraHeaders,
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
    const actions = vi.mocked(logAudit).mock.calls.map((c) => c[0]);
    expect(actions).toContain("case.update");
    expect(actions).not.toContain("case.create");
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
    expect(vi.mocked(logAudit).mock.calls.map((c) => c[0])).toContain("case.create");
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
    // version: every merge advances the stored version (If-Match detection).
    expect(writes()[0].body.frontmatter).toEqual({ note: "ok", version: 1 });
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

  it("refuses page metadata sent as a YAML block inside the content (400)", async () => {
    readStatus = 404;
    const res = await post({
      slug: "legal/approvals/neu",
      merge: true,
      content: "---\ntype: agent_action\nstatus: approved\n---\nbody",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("frontmatter_in_content");
    expect(engineCalls).toHaveLength(0);
  });

  it("content that merely contains a rule later on is written normally", async () => {
    readStatus = 404;
    const res = await post({
      slug: "wiki/notiz",
      title: "Notiz",
      content: "Text\n\n---\n\nmehr Text",
    });
    expect(res.status).toBe(200);
    expect(writes()).toHaveLength(1);
  });

  it("refuses a change of a matter's access rules through the generic route (403)", async () => {
    stored = {
      slug: "legal/cases/a-1",
      type: "legal_case",
      frontmatter: { version: 1, permissions: { blocked_users: ["u2"] } },
    };
    const res = await post({
      slug: "legal/cases/a-1",
      merge: true,
      frontmatter: { permissions: { blocked_users: [] } },
    });
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
    // Sending the stored rules back unchanged is fine.
    const same = await post({
      slug: "legal/cases/a-1",
      merge: true,
      frontmatter: { note: "x", permissions: { blocked_users: ["u2"] } },
    });
    expect(same.status).toBe(200);
  });

  it("fails closed when the stored page cannot be read", async () => {
    readStatus = 502;
    const res = await post({ slug: "legal/invoices/r-1", merge: true, frontmatter: { total: 1 } });
    expect(res.status).toBe(503);
    expect(writes()).toHaveLength(0);
  });

  it("still creates a new page when the slug does not exist yet", async () => {
    readStatus = 404;
    const res = await post({ slug: "legal/cases/r-2", title: "Akte", type: "legal_case" });
    expect(res.status).toBe(200);
    expect(writes()).toHaveLength(1);
  });

  it("an invoice is never created over the generic route — only via /api/invoices", async () => {
    readStatus = 404;
    const res = await post({ slug: "legal/invoices/r-2", title: "Rechnung", type: "invoice" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("invoice_create_via_route");
    expect(writes()).toHaveLength(0);
  });

  describe("a create never silently replaces a matter or invoice", () => {
    it("a new matter is written create-only (if_absent)", async () => {
      readStatus = 404;
      const res = await post({ slug: "legal/cases/r-3", title: "Akte", type: "legal_case" });
      expect(res.status).toBe(200);
      expect(writes()[0].body).toMatchObject({ slug: "legal/cases/r-3", if_absent: true });
    });

    it("a create over a stored draft invoice → 409 page_exists, nothing written", async () => {
      stored = { slug: "legal/invoices/r-4", type: "invoice", frontmatter: { status: "draft" } };
      const res = await post({ slug: "legal/invoices/r-4", title: "Neu", type: "invoice" });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("page_exists");
      expect(writes()).toHaveLength(0);
    });

    it("a create over a stored matter → 409 page_exists, even without a type in the request", async () => {
      stored = { slug: "legal/cases/a", type: "legal_case", frontmatter: { version: 3 } };
      const res = await post({ slug: "legal/cases/a", title: "Akte A" });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("page_exists");
      expect(writes()).toHaveLength(0);
    });

    it("a tombstoned matter still counts as existing", async () => {
      stored = {
        slug: "legal/cases/t",
        type: "legal_case",
        frontmatter: { status: "tombstoned" },
      };
      const res = await post({ slug: "legal/cases/t", title: "Neu", type: "legal_case" });
      expect(res.status).toBe(409);
      expect(writes()).toHaveLength(0);
    });

    it("a deliberate replacement with a stale If-Match → 409 version_conflict", async () => {
      stored = { slug: "legal/invoices/r-5", type: "invoice", frontmatter: { version: 4 } };
      const res = await post(
        { slug: "legal/invoices/r-5", title: "Neu", type: "invoice" },
        { "If-Match": "3" }
      );
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("version_conflict");
      expect(writes()).toHaveLength(0);
    });

    it("a deliberate replacement with the stored version is written and advances it", async () => {
      stored = {
        slug: "legal/invoices/r-6",
        type: "invoice",
        frontmatter: { status: "draft", version: 4 },
      };
      const res = await post(
        { slug: "legal/invoices/r-6", title: "Neu", type: "invoice", frontmatter: { total: 5 } },
        { "If-Match": "4" }
      );
      expect(res.status).toBe(200);
      expect(writes()).toHaveLength(1);
      expect(writes()[0].body.if_absent).toBeUndefined();
      expect(writes()[0].body.frontmatter).toMatchObject({ total: 5, version: 5 });
    });

    it("an engine page_exists (created in the meantime) is passed on as 409", async () => {
      readStatus = 404;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          engineCalls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
          if (init?.body === undefined) return new Response("{}", { status: 404 });
          return Response.json({ error: "page_exists", message: "x" }, { status: 409 });
        })
      );
      const res = await post({ slug: "legal/cases/r-7", title: "Akte", type: "legal_case" });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("page_exists");
    });

    it("other page types keep plain create semantics", async () => {
      stored = { slug: "notes/n", type: "note", frontmatter: {} };
      const res = await post({ slug: "notes/n", title: "Notiz", type: "note" });
      expect(res.status).toBe(200);
      expect(writes()[0].body.if_absent).toBeUndefined();
    });
  });
});

describe("GET /api/pages — frontmatter filter relay (R11-9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
  });

  it("relays fm.<key> to the engine and refuses malformed keys", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return Response.json([]);
      })
    );
    const ok = await GET(
      new NextRequest("http://localhost:3000/api/pages?type=legal_case&fm.portal_enabled=true")
    );
    expect(ok.status).toBe(200);
    expect(new URL(urls[0]).searchParams.get("fm.portal_enabled")).toBe("true");
    const bad = await GET(
      new NextRequest("http://localhost:3000/api/pages?type=legal_case&fm.Bad-Key=1")
    );
    expect(bad.status).toBe(400);
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

  it("lets the engine filter by case_slug: one call even with 15,000 deadlines firm-wide", async () => {
    const calls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url);
        calls.push(u);
        // Engine honours fm.case_slug: only the matter's 3 rows come back.
        const want = u.searchParams.get("fm.case_slug");
        return Response.json(
          want === "legal/cases/akte-1"
            ? [0, 1, 2].map((i) => ({
                slug: `legal/deadlines/m-${i}`,
                title: "Frist",
                frontmatter: { case_slug: want },
              }))
            : Array.from({ length: 100 }, (_, i) => ({
                slug: `x/${i}`,
                title: "x",
                frontmatter: {},
              }))
        );
      })
    );
    const res = await GET(
      new NextRequest(
        "http://localhost:3000/api/pages?type=legal_deadline&case_slug=legal/cases/akte-1"
      )
    );
    expect(((await res.json()) as unknown[]).length).toBe(3);
    expect(calls).toHaveLength(1);
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
        // The matter is new: reading it before the write finds nothing.
        if (
          (!init?.method || init.method === "GET") &&
          String(url).includes("/api/pages/legal/cases/neu")
        ) {
          return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
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
        // The matter is new: reading it before the write finds nothing.
        if (!init?.method || init.method === "GET") {
          return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
        }
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

describe("POST /api/pages — Fristen: Identität, Notfrist-Schutz, Protokoll (C6)", () => {
  let engineCalls: Array<{ url: string; body: any }>;
  let stored: unknown;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
    engineCalls = [];
    stored = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        engineCalls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
        if (init?.body === undefined) {
          return stored === null ? new Response("{}", { status: 404 }) : Response.json(stored);
        }
        return Response.json({ slug: "x", success: true });
      })
    );
  });

  const writes = () => engineCalls.filter((c) => Object.keys(c.body).length > 0);

  it("FRI-6: stamps created_by from the session and ignores a client-sent creator", async () => {
    const res = await post({
      slug: "legal/deadlines/neu",
      title: "Berufung",
      type: "legal_deadline",
      frontmatter: {
        due_date: "2026-03-30",
        is_notfrist: true,
        created_by: "jemand-anderes@example.com",
        created_by_id: "u-fake",
      },
    });
    expect(res.status).toBe(200);
    const fm = writes()[0].body.frontmatter;
    expect(fm.created_by_id).toBe("u1");
    expect(fm.created_by).toBe("anwalt@kanzlei.example");
    expect(fm.audit_log).toHaveLength(1);
    expect(fm.audit_log[0]).toMatchObject({ action: "created", actor_id: "u1", server: true });
  });

  it("FRI-7: a Notfrist due date cannot be moved without a reason", async () => {
    stored = {
      slug: "legal/deadlines/f1",
      type: "legal_deadline",
      frontmatter: { status: "pending", is_notfrist: true, due_date: "2026-03-30" },
    };
    const res = await post({
      slug: "legal/deadlines/f1",
      merge: true,
      frontmatter: { due_date: "2026-04-15" },
    });
    expect(res.status).toBe(422);
    expect(writes()).toHaveLength(0);
  });

  it("FRI-7/FRI-15: a lawyer moves a Notfrist with a reason — logged with before/after", async () => {
    stored = {
      slug: "legal/deadlines/f1",
      type: "legal_deadline",
      frontmatter: { status: "pending", is_notfrist: true, due_date: "2026-03-30" },
    };
    const res = await post({
      slug: "legal/deadlines/f1",
      merge: true,
      frontmatter: { due_date: "2026-04-15", change_reason: "Zustellung neu festgestellt" },
    });
    expect(res.status).toBe(200);
    const fm = writes()[0].body.frontmatter;
    expect(fm.change_reason).toBeUndefined();
    expect(fm.audit_log.at(-1)).toMatchObject({
      due_date_before: "2026-03-30",
      due_date_after: "2026-04-15",
      reason: "Zustellung neu festgestellt",
      actor_id: "u1",
    });
    const deadlineAudit = vi.mocked(logAudit).mock.calls.find((c) => c[0] === "deadline.update");
    expect(deadlineAudit?.[2]).toMatchObject({
      entityId: "legal/deadlines/f1",
      userId: "u1",
      details: { due_date_before: "2026-03-30", due_date_after: "2026-04-15" },
    });
  });

  it("FRI-7: an assistant cannot cancel a Notfrist, even with a reason", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue({
      ...ctx,
      user: { ...ctx.user, id: "u3", role: "assistant" },
    } as any);
    stored = {
      slug: "legal/deadlines/f1",
      type: "legal_deadline",
      frontmatter: { status: "pending", is_notfrist: true, due_date: "2026-03-30" },
    };
    const res = await post({
      slug: "legal/deadlines/f1",
      merge: true,
      frontmatter: { status: "cancelled", change_reason: "Doppelt erfasst" },
    });
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  it("FRI-7: removing a Notfrist from a matter's deadlines[] is refused", async () => {
    stored = {
      slug: "legal/cases/akte-1",
      type: "legal_case",
      frontmatter: {
        deadlines: [
          { id: "d1", title: "Berufung", due_date: "2026-03-30", is_notfrist: true },
          { id: "d2", title: "Termin", due_date: "2026-04-01" },
        ],
      },
    };
    const res = await post({
      slug: "legal/cases/akte-1",
      merge: true,
      frontmatter: { deadlines: [{ id: "d2", title: "Termin", due_date: "2026-04-01" }] },
    });
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });

  it("FRI-15: a client-sent history is replaced by the stored one", async () => {
    stored = {
      slug: "legal/cases/akte-1",
      type: "legal_case",
      frontmatter: {
        deadlines: [
          {
            id: "d1",
            title: "Termin",
            due_date: "2026-04-01",
            audit_log: [{ at: "t0", action: "created", actor: "A" }],
          },
        ],
      },
    };
    const res = await post({
      slug: "legal/cases/akte-1",
      merge: true,
      frontmatter: {
        deadlines: [{ id: "d1", title: "Termin", due_date: "2026-04-01", audit_log: [] }],
      },
    });
    expect(res.status).toBe(200);
    const entry = writes()[0].body.frontmatter.deadlines[0];
    expect(entry.audit_log).toEqual([{ at: "t0", action: "created", actor: "A" }]);
  });

  it("FRI-8: a merge advances the stored version", async () => {
    stored = { slug: "legal/cases/akte-1", type: "legal_case", frontmatter: { version: 7 } };
    await post({ slug: "legal/cases/akte-1", merge: true, frontmatter: { priority: "high" } });
    expect(writes()[0].body.frontmatter.version).toBe(8);
  });
});
