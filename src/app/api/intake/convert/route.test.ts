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
      conflict_check: { status: "clear" },
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

import { POST } from "./route";

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
      })
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
                conflict_check: { status: "clear" },
                kyc: { required: true, status: "verified" },
                poa: { required: true, status: "signed" },
                engagement_letter: { status: "sent" },
              },
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await POST(
      new Request("http://localhost/api/intake/convert", {
        method: "POST",
        body: JSON.stringify({ slug: "legal/intake/2026-06-20/max" }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.case).toBeDefined();
    expect(body.case.type).toBe("legal_case");
  });
});
