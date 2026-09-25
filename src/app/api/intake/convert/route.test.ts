import type { NextRequest } from "next/server";
// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
const _mockBrainPage = vi.fn((slug: string) => ({
  slug,
  title: "Intake: Max Muster",
  type: "intake_request",
  content: "Kündigung erhalten",
  frontmatter: {
    type: "intake_request",
    source: "whatsapp",
    status: "accepted",
    client_name: "Max Muster",
    legal_area: "Arbeitsrecht",
    summary: "Mandant hat eine Kündigung erhalten.",
    missing_documents: [],
    conflict_check_status: "clear",
    created_at: "2026-06-20T10:00:00.000Z",
    updated_at: "2026-06-20T10:00:00.000Z",
    acceptance: {
      conflict_check: SERVER_CLEAR,
      kyc: { required: true, status: "verified" },
      poa: { required: true, status: "signed" },
      engagement_letter: { status: "sent" },
    },
  },
}));

global.fetch = mockFetch as unknown as typeof fetch;

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { body?: { safeParse: (d: unknown) => { success: boolean } } },
    handler: (...args: unknown[]) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const body = await req.json().catch(() => ({}));
      if (opts.body) {
        const parsed = opts.body.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "bad_request" }, { status: 400 });
        }
      }
      const ctx = {
        headers: { "x-test": "1" },
        brainId: "test-brain",
        user: { id: "user-1", email: "test@example.com" },
      };
      return handler(ctx, body);
    };
  },
  apiError: (_code: string, message: string, status: number, details?: Record<string, unknown>) =>
    Response.json({ error: message, code: _code, details }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }, { status: 200 }),
  recordQuota: vi.fn(),
}));

vi.mock("@/lib/intake-conversion", () => ({
  buildCaseFromIntake: (intake: { slug: string; frontmatter: Record<string, unknown> }) => ({
    slug: `legal/cases/2026-12345-max-muster`,
    title: "Max Muster - Arbeitsrecht",
    type: "legal_case",
    content: "",
    frontmatter: {
      type: "legal_case",
      case_number: "2026-12345",
      status: "open",
      priority: "medium",
      legal_area: intake.frontmatter.legal_area,
      client_name: intake.frontmatter.client_name,
      source: "intake",
      source_intake_slug: intake.slug,
      version: 0,
    },
  }),
}));

vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/comments", () => ({ createDocumentRequestNotification: vi.fn() }));

import { POST } from "./route";

/** A conflict check the server ran and recorded (real user id). */
const SERVER_CLEAR = {
  status: "clear",
  performed_at: "2026-06-20T10:05:00.000Z",
  performed_by: "anwalt@kanzlei.example",
  performed_by_id: "user-1",
  severity: "none",
  matches: [],
};

function clearCheck() {
  return new Response(
    JSON.stringify({ name: "Max Muster", severity: "none", explanation: "", matches: [] }),
    { status: 200 }
  );
}

describe("POST /api/intake/convert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("blocks conversion when acceptance is incomplete", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          slug: "legal/intake/2026-06-20/max",
          title: "Intake: Max Muster",
          type: "intake_request",
          frontmatter: {
            type: "intake_request",
            status: "accepted",
            client_name: "Max Muster",
            legal_area: "Arbeitsrecht",
            summary: "Kündigung",
            missing_documents: [],
            conflict_check_status: "pending",
            created_at: "2026-06-20T10:00:00.000Z",
            updated_at: "2026-06-20T10:00:00.000Z",
            acceptance: {
              conflict_check: { status: "pending" },
              kyc: { required: true, status: "pending" },
              poa: { required: true, status: "pending" },
              engagement_letter: { status: "pending" },
            },
          },
        }),
        { status: 200 }
      )
    );

    const res = await POST(
      new Request("http://localhost/api/intake/convert", {
        method: "POST",
        body: JSON.stringify({ slug: "legal/intake/2026-06-20/max" }),
      }) as unknown as NextRequest
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("Mandatsannahme unvollständig");
    expect(body.details?.code).toContain("acceptance_incomplete");
  });

  test("allows conversion when acceptance is complete", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            slug: "legal/intake/2026-06-20/max",
            title: "Intake: Max Muster",
            type: "intake_request",
            frontmatter: {
              type: "intake_request",
              status: "accepted",
              client_name: "Max Muster",
              legal_area: "Arbeitsrecht",
              summary: "Kündigung",
              missing_documents: [],
              conflict_check_status: "clear",
              created_at: "2026-06-20T10:00:00.000Z",
              updated_at: "2026-06-20T10:00:00.000Z",
              acceptance: {
                conflict_check: SERVER_CLEAR,
                kyc: {
                  required: true,
                  status: "verified",
                  verification_slug: "legal/kyc/kyc-1",
                },
                poa: { required: true, status: "signed" },
                engagement_letter: { status: "sent" },
              },
            },
          }),
          { status: 200 }
        )
      )
      // the linked identification record
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ frontmatter: { status: "verified" } }), { status: 200 })
      )
      .mockResolvedValueOnce(clearCheck()) // server-side conflict re-check
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await POST(
      new Request("http://localhost/api/intake/convert", {
        method: "POST",
        body: JSON.stringify({ slug: "legal/intake/2026-06-20/max" }),
      }) as unknown as NextRequest
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.case).toBeDefined();
    expect(body.case.type).toBe("legal_case");
  });

  test("retry after case-created-but-intake-failed completes idempotently (no duplicate case)", async () => {
    const intakePage = {
      slug: "legal/intake/2026-06-20/max",
      title: "Intake: Max Muster",
      type: "intake_request",
      frontmatter: {
        type: "intake_request",
        status: "accepted",
        client_name: "Max Muster",
        legal_area: "Arbeitsrecht",
        summary: "Kündigung",
        missing_documents: [],
        conflict_check_status: "clear",
        created_at: "2026-06-20T10:00:00.000Z",
        updated_at: "2026-06-20T10:00:00.000Z",
        acceptance: {
          conflict_check: SERVER_CLEAR,
          kyc: { required: false, status: "not_required" },
          poa: { required: false, status: "not_required" },
          engagement_letter: { status: "sent" },
        },
      },
    };
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(intakePage), { status: 200 }))
      .mockResolvedValueOnce(clearCheck()) // server-side conflict re-check
      // case slug already exists — built from THIS intake
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            slug: "legal/cases/2026-12345-max-muster",
            frontmatter: { source_intake_slug: "legal/intake/2026-06-20/max" },
          }),
          { status: 200 }
        )
      )
      // intake status update
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await POST(
      new Request("http://localhost/api/intake/convert", {
        method: "POST",
        body: JSON.stringify({ slug: "legal/intake/2026-06-20/max" }),
      }) as unknown as NextRequest
    );

    expect(res.status).toBe(200);
    // exactly one POST /api/pages (the intake update) — no second case create
    const creates = mockFetch.mock.calls.filter(
      ([url, init]) =>
        String(url).endsWith("/api/pages") &&
        (init as RequestInit | undefined)?.method === "POST" &&
        String((init as RequestInit).body).includes('"legal_case"')
    );
    expect(creates).toHaveLength(0);
  });

  test("409 when the slug belongs to a different case", async () => {
    const intakePage = {
      slug: "legal/intake/2026-06-20/max",
      type: "intake_request",
      frontmatter: {
        type: "intake_request",
        status: "accepted",
        client_name: "Max Muster",
        missing_documents: [],
        acceptance: {
          conflict_check: SERVER_CLEAR,
          kyc: { required: false, status: "not_required" },
          poa: { required: false, status: "not_required" },
          engagement_letter: { status: "sent" },
        },
      },
    };
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(intakePage), { status: 200 }))
      .mockResolvedValueOnce(clearCheck()) // server-side conflict re-check
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            slug: "legal/cases/2026-12345-max-muster",
            frontmatter: { source_intake_slug: "legal/intake/other-intake" },
          }),
          { status: 200 }
        )
      );

    const res = await POST(
      new Request("http://localhost/api/intake/convert", {
        method: "POST",
        body: JSON.stringify({ slug: "legal/intake/2026-06-20/max" }),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(409);
  });

  test("a matter created at the slug after the check is not replaced: create-only write, 409", async () => {
    const intakePage = {
      slug: "legal/intake/2026-06-20/max",
      type: "intake_request",
      frontmatter: {
        type: "intake_request",
        status: "accepted",
        client_name: "Max Muster",
        missing_documents: [],
        acceptance: {
          conflict_check: SERVER_CLEAR,
          kyc: { required: false, status: "not_required" },
          poa: { required: false, status: "not_required" },
          engagement_letter: { status: "sent" },
        },
      },
    };
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(intakePage), { status: 200 }))
      .mockResolvedValueOnce(clearCheck()) // server-side conflict re-check
      .mockResolvedValueOnce(new Response("not found", { status: 404 })) // slug free
      // …but taken by the time the case is written
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "page_exists" }), { status: 409 })
      );

    const res = await POST(
      new Request("http://localhost/api/intake/convert", {
        method: "POST",
        body: JSON.stringify({ slug: "legal/intake/2026-06-20/max" }),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("case_slug_exists");
    const create = mockFetch.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith("/api/pages") &&
        (init as RequestInit | undefined)?.method === "POST" &&
        String((init as RequestInit).body).includes('"legal_case"')
    );
    expect(JSON.parse(String((create![1] as RequestInit).body)).if_absent).toBe(true);
    // The intake is not marked converted.
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  test("missing_documents become a document_request draft (once)", async () => {
    const intakePage = {
      slug: "legal/intake/2026-06-20/max",
      type: "intake_request",
      frontmatter: {
        type: "intake_request",
        status: "accepted",
        client_name: "Max Muster",
        missing_documents: ["Vollmacht", "Kündigungsschreiben"],
        acceptance: {
          conflict_check: SERVER_CLEAR,
          kyc: { required: false, status: "not_required" },
          poa: { required: false, status: "not_required" },
          engagement_letter: { status: "sent" },
        },
      },
    };
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(intakePage), { status: 200 }))
      .mockResolvedValueOnce(clearCheck()) // server-side conflict re-check
      .mockResolvedValueOnce(new Response("not found", { status: 404 })) // case slug free
      .mockResolvedValueOnce(new Response("{}", { status: 200 })) // case create
      .mockResolvedValueOnce(new Response("{}", { status: 200 })) // intake update
      .mockResolvedValueOnce(new Response("[]", { status: 200 })) // doc-request list
      .mockResolvedValueOnce(new Response("{}", { status: 200 })); // doc-request create

    const res = await POST(
      new Request("http://localhost/api/intake/convert", {
        method: "POST",
        body: JSON.stringify({ slug: "legal/intake/2026-06-20/max" }),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document_request_slug).toMatch(/^legal\/document-requests\//);
    const docReqCalls = mockFetch.mock.calls.filter(([, init]) =>
      String((init as RequestInit | undefined)?.body ?? "").includes('"document_request"')
    );
    expect(docReqCalls).toHaveLength(1);
    const reqBody = JSON.parse(String((docReqCalls[0]?.[1] as RequestInit).body));
    expect(reqBody.frontmatter.items).toHaveLength(2);
    expect(reqBody.frontmatter.status).toBe("draft");
    expect(reqBody.frontmatter.case_slug).toBe("legal/cases/2026-12345-max-muster");
  });

  test("send_document_request: true markiert die Anfrage als gesendet", async () => {
    const intakePage = {
      slug: "legal/intake/2026-06-20/max",
      type: "intake_request",
      frontmatter: {
        type: "intake_request",
        status: "accepted",
        client_name: "Max Muster",
        missing_documents: ["Vollmacht"],
        acceptance: {
          conflict_check: SERVER_CLEAR,
          kyc: { required: false, status: "not_required" },
          poa: { required: false, status: "not_required" },
          engagement_letter: { status: "sent" },
        },
      },
    };
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(intakePage), { status: 200 }))
      .mockResolvedValueOnce(clearCheck()) // server-side conflict re-check
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await POST(
      new Request("http://localhost/api/intake/convert", {
        method: "POST",
        body: JSON.stringify({
          slug: "legal/intake/2026-06-20/max",
          send_document_request: true,
        }),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    const docReqCalls = mockFetch.mock.calls.filter(([, init]) =>
      String((init as RequestInit | undefined)?.body ?? "").includes('"document_request"')
    );
    const reqBody = JSON.parse(String((docReqCalls[0]?.[1] as RequestInit).body));
    expect(reqBody.frontmatter.status).toBe("sent");
    expect(reqBody.frontmatter.sent_at).toBeTruthy();
  });

  test("an existing request whose 'sent' mark is refused is not announced as sent", async () => {
    const intakePage = {
      slug: "legal/intake/2026-06-20/max",
      type: "intake_request",
      frontmatter: {
        type: "intake_request",
        status: "accepted",
        client_name: "Max Muster",
        missing_documents: ["Vollmacht"],
        acceptance: {
          conflict_check: SERVER_CLEAR,
          kyc: { required: false, status: "not_required" },
          poa: { required: false, status: "not_required" },
          engagement_letter: { status: "sent" },
        },
      },
    };
    const existingRequest = {
      slug: "legal/document-requests/vorhanden",
      type: "document_request",
      frontmatter: {
        case_slug: "legal/cases/2026-12345-max-muster",
        source_event_slug: "legal/intake/2026-06-20/max",
        status: "draft",
      },
    };
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(intakePage), { status: 200 }))
      .mockResolvedValueOnce(clearCheck()) // server-side conflict re-check
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([existingRequest]), { status: 200 }))
      .mockResolvedValueOnce(new Response("engine down", { status: 500 }));

    const res = await POST(
      new Request("http://localhost/api/intake/convert", {
        method: "POST",
        body: JSON.stringify({
          slug: "legal/intake/2026-06-20/max",
          send_document_request: true,
        }),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document_request_slug).toBe("legal/document-requests/vorhanden");
    expect(body.document_request_sent).toBe(false);
    const { createDocumentRequestNotification } = await import("@/lib/comments");
    expect(createDocumentRequestNotification).not.toHaveBeenCalled();
  });

  test("portal_enabled: true bietet das Portal an, ohne einen Link zu speichern", async () => {
    const intakePage = {
      slug: "legal/intake/2026-06-20/max",
      type: "intake_request",
      frontmatter: {
        type: "intake_request",
        status: "accepted",
        client_name: "Max Muster",
        missing_documents: ["Vollmacht"],
        acceptance: {
          conflict_check: SERVER_CLEAR,
          kyc: { required: false, status: "not_required" },
          poa: { required: false, status: "not_required" },
          engagement_letter: { status: "sent" },
        },
      },
    };
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(intakePage), { status: 200 }))
      .mockResolvedValueOnce(clearCheck()) // server-side conflict re-check
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await POST(
      new Request("http://localhost/api/intake/convert", {
        method: "POST",
        body: JSON.stringify({
          slug: "legal/intake/2026-06-20/max",
          portal_enabled: true,
        }),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(200);
    const docReqCalls = mockFetch.mock.calls.filter(([, init]) =>
      String((init as RequestInit | undefined)?.body ?? "").includes('"document_request"')
    );
    const reqBody = JSON.parse(String((docReqCalls[0]?.[1] as RequestInit).body));
    // The request offers the portal; no link (with its token) is stored.
    expect(reqBody.frontmatter.portal_link).toBe(true);
    expect(reqBody.frontmatter.portal_url).toBeUndefined();
    expect(JSON.stringify(reqBody)).not.toContain("/portal/");
  });

  test.each([
    ["no acceptance at all", undefined, [], "acceptance_missing"],
    [
      "a verified status without a record",
      {
        conflict_check: SERVER_CLEAR,
        kyc: { required: true, status: "verified" },
        poa: { required: false, status: "not_required" },
        engagement_letter: { status: "sent" },
      },
      [],
      "kyc_not_verified",
    ],
    [
      "a linked record that is still open",
      {
        conflict_check: SERVER_CLEAR,
        kyc: { required: true, status: "verified", verification_slug: "legal/kyc/k2" },
        poa: { required: false, status: "not_required" },
        engagement_letter: { status: "sent" },
      },
      [new Response(JSON.stringify({ frontmatter: { status: "in_progress" } }), { status: 200 })],
      "kyc_not_verified",
    ],
  ])("refuses conversion with %s", async (_label, acceptance, extra, code) => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          slug: "legal/intake/2026-06-20/max",
          title: "Intake: Max Muster",
          type: "intake_request",
          frontmatter: {
            type: "intake_request",
            status: "accepted",
            client_name: "Max Muster",
            legal_area: "Arbeitsrecht",
            summary: "Kündigung",
            missing_documents: [],
            created_at: "2026-06-20T10:00:00.000Z",
            updated_at: "2026-06-20T10:00:00.000Z",
            ...(acceptance ? { acceptance } : {}),
          },
        }),
        { status: 200 }
      )
    );
    for (const r of extra as Response[]) mockFetch.mockResolvedValueOnce(r);
    const res = await POST(
      new Request("http://localhost/api/intake/convert", {
        method: "POST",
        body: JSON.stringify({ slug: "legal/intake/2026-06-20/max" }),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(422);
    expect((await res.json()).details?.code).toBe(code);
  });

  // ── OPS-3: the conversion runs through the server-side conflict check ──

  const acceptedIntake = (conflictCheck: Record<string, unknown>, extra = {}) => ({
    slug: "legal/intake/2026-06-20/max",
    title: "Intake: Max Muster",
    type: "intake_request",
    frontmatter: {
      type: "intake_request",
      status: "accepted",
      client_name: "Max Muster",
      missing_documents: [],
      acceptance: {
        conflict_check: conflictCheck,
        kyc: { required: false, status: "not_required" },
        poa: { required: false, status: "not_required" },
        engagement_letter: { status: "sent" },
      },
      ...extra,
    },
  });

  const criticalCheck = () =>
    new Response(
      JSON.stringify({
        name: "Max Muster",
        side: "client",
        severity: "critical",
        explanation: "Gegnerseite",
        matches: [
          {
            slug: "legal/cases/alt",
            title: "Alt-Akte",
            role: "opponent",
            quelle: "case",
            matched_name: "Max Muster",
            assessment: "critical",
          },
        ],
      }),
      { status: 200 }
    );

  const convert = () =>
    POST(
      new Request("http://localhost/api/intake/convert", {
        method: "POST",
        body: JSON.stringify({ slug: "legal/intake/2026-06-20/max" }),
      }) as unknown as NextRequest
    );

  const caseCreates = () =>
    mockFetch.mock.calls.filter(
      ([url, init]) =>
        String(url).endsWith("/api/pages") &&
        String((init as RequestInit | undefined)?.body ?? "").includes('"legal_case"')
    );

  test("a client-claimed 'clear' without server record is refused (422)", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify(acceptedIntake({ status: "clear", performed_by: "current-user" })),
        { status: 200 }
      )
    );
    const res = await convert();
    expect(res.status).toBe(422);
    expect((await res.json()).details?.code).toBe("conflict_check_not_server_verified");
    expect(caseCreates()).toHaveLength(0);
  });

  test("a conflict found at conversion time blocks without waiver (409)", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(acceptedIntake(SERVER_CLEAR)), { status: 200 })
      )
      .mockResolvedValueOnce(criticalCheck());
    const res = await convert();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflict_detected");
    expect(body.conflictWarning.blocking[0].name).toBe("Max Muster");
    expect(caseCreates()).toHaveLength(0);
    // the conflict check was asked with the side of the new mandate
    const checkCall = mockFetch.mock.calls.find(([url]) =>
      String(url).endsWith("/api/legal/conflict-check")
    );
    expect(JSON.parse(String((checkCall?.[1] as RequestInit).body))).toMatchObject({
      name: "Max Muster",
      side: "client",
    });
  });

  test("the opponent of the intake is checked on the opponent side", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(acceptedIntake(SERVER_CLEAR, { opponent: "Gegner GmbH" })), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(clearCheck())
      .mockResolvedValueOnce(criticalCheck());
    const res = await convert();
    expect(res.status).toBe(409);
    const sides = mockFetch.mock.calls
      .filter(([url]) => String(url).endsWith("/api/legal/conflict-check"))
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(sides).toEqual([
      { name: "Max Muster", side: "client" },
      { name: "Gegner GmbH", side: "opponent" },
    ]);
  });

  test("a justified waiver covering the conflict lets the conversion through", async () => {
    const waived = {
      ...SERVER_CLEAR,
      status: "conflict",
      severity: "critical",
      matches: ["legal/cases/alt"],
      waived: true,
      waived_by: "partner@kanzlei.example",
      waived_by_id: "user-9",
      waived_by_role: "lawyer",
      waived_reason: "Beide Parteien haben schriftlich zugestimmt.",
      waived_at: "2026-06-20T11:00:00.000Z",
    };
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(acceptedIntake(waived)), { status: 200 }))
      .mockResolvedValueOnce(criticalCheck())
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await convert();
    expect(res.status).toBe(200);
    const created = JSON.parse(String((caseCreates()[0]?.[1] as RequestInit).body));
    expect(created.frontmatter.conflict_status).toBe("conflict_waived");
    expect(created.frontmatter.mandate_acceptance.conflict_check).toMatchObject({
      status: "conflict",
      waived: true,
      waived_by_id: "user-9",
      performed_by_id: "user-1",
    });
  });

  test("a waiver does not cover a NEW conflict (409)", async () => {
    const waivedOther = {
      ...SERVER_CLEAR,
      status: "conflict",
      matches: ["legal/cases/eine-andere"],
      waived: true,
      waived_by: "partner@kanzlei.example",
      waived_by_id: "user-9",
      waived_by_role: "lawyer",
      waived_reason: "Zustimmung liegt vor.",
    };
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(acceptedIntake(waivedOther)), { status: 200 })
      )
      .mockResolvedValueOnce(criticalCheck());
    const res = await convert();
    expect(res.status).toBe(409);
    expect(caseCreates()).toHaveLength(0);
  });

  test("the created matter carries the server's conversion-time check", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(acceptedIntake(SERVER_CLEAR)), { status: 200 })
      )
      .mockResolvedValueOnce(clearCheck())
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await convert();
    expect(res.status).toBe(200);
    const created = JSON.parse(String((caseCreates()[0]?.[1] as RequestInit).body));
    expect(created.frontmatter.conflict_status).toBe("conflict_cleared");
    expect(created.frontmatter.mandate_acceptance.conflict_check).toMatchObject({
      status: "clear",
      performed_by: "test@example.com",
      performed_by_id: "user-1",
      parties: [{ name: "Max Muster", side: "client", severity: "none" }],
    });
  });

  test("an unreachable conflict check blocks the conversion (503)", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify(acceptedIntake(SERVER_CLEAR)), { status: 200 })
      )
      .mockResolvedValueOnce(new Response("down", { status: 502 }));
    const res = await convert();
    expect(res.status).toBe(503);
    expect(caseCreates()).toHaveLength(0);
  });
});
