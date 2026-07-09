// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://mock-engine:3001",
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: unknown,
    handler: (ctx: unknown, body: unknown, query: URLSearchParams, req: Request) => Promise<unknown>
  ) => {
    return async (req: Request) => {
      const ctx = {
        headers: { "x-subsumio-source": "test-brain" },
        brainId: "test-brain",
        plan: "pro",
        user: { email: "test@test.com" },
      };
      try {
        const body = req.method === "GET" ? null : await req.json().catch(() => null);
        const result = await handler(ctx, body, new URL(req.url).searchParams, req);
        return result;
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
      }
    };
  },
  apiSuccess: (data: unknown) => Response.json(data),
  apiError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status }),
}));

import { GET } from "./route";

function mockPage(
  slug: string,
  type: string,
  frontmatter: Record<string, unknown>,
  title?: string
) {
  return {
    slug,
    title: title || slug,
    content: "",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    frontmatter,
    type,
  };
}

function mockFetchResponse(pages: unknown[]) {
  return new Response(JSON.stringify(pages), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(fn: (url: string) => Response | Promise<Response>) {
  global.fetch = vi.fn(fn as unknown as typeof fetch) as unknown as typeof fetch;
}

describe("/api/review-inbox", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("returns empty items when no pages exist", async () => {
    mockFetch(() => mockFetchResponse([]));
    const res = await GET(new Request("http://localhost/api/review-inbox"));
    const data = await res.json();
    expect(data.items).toEqual([]);
    expect(data.total).toBe(0);
  });

  test("aggregates document_requests, deadlines, and submissions", async () => {
    mockFetch((url: string) => {
      if (url.includes("type=document_request")) {
        return Promise.resolve(
          mockFetchResponse([
            mockPage("legal/doc-req-1", "document_request", {
              status: "draft",
              case_slug: "cases/matter-1",
              items: [{ label: "Personalausweis" }],
              channel: "whatsapp",
              created_at: "2026-07-08T10:00:00Z",
            }),
          ])
        );
      }
      if (url.includes("type=legal_deadline")) {
        return Promise.resolve(
          mockFetchResponse([
            mockPage("legal/deadline-1", "legal_deadline", {
              review_status: "unreviewed",
              status: "pending",
              due_date: "2026-07-15",
              case_slug: "cases/matter-2",
              urgency: "high",
              source: "ai",
              source_quote: "Frist endet am 15.07.",
              created_at: "2026-07-07T10:00:00Z",
            }),
          ])
        );
      }
      if (url.includes("type=client_submission")) {
        return Promise.resolve(
          mockFetchResponse([
            mockPage("legal/submission-1", "client_submission", {
              review_status: "new",
              case_slug: "cases/matter-1",
              source: "WhatsApp",
              normalized_text: "Hier sind meine Dokumente",
              created_at: "2026-07-09T08:00:00Z",
            }),
          ])
        );
      }
      if (url.includes("type=legal_case")) {
        return Promise.resolve(mockFetchResponse([]));
      }
      return Promise.resolve(mockFetchResponse([]));
    });

    const res = await GET(new Request("http://localhost/api/review-inbox"));
    const data = await res.json();
    expect(data.total).toBe(3);
    expect(data.items).toHaveLength(3);

    const types = data.items.map((i: { type: string }) => i.type);
    expect(types).toContain("document_request");
    expect(types).toContain("suggested_deadline");
    expect(types).toContain("client_submission");
  });

  test("filters out fulfilled and expired document requests", async () => {
    mockFetch((url: string) => {
      if (url.includes("type=document_request")) {
        return Promise.resolve(
          mockFetchResponse([
            mockPage("legal/fulfilled-1", "document_request", {
              status: "fulfilled",
              case_slug: "cases/m1",
              items: [{ label: "Test" }],
            }),
            mockPage("legal/expired-1", "document_request", {
              status: "expired",
              case_slug: "cases/m1",
              items: [{ label: "Test" }],
            }),
            mockPage("legal/draft-1", "document_request", {
              status: "draft",
              case_slug: "cases/m1",
              items: [{ label: "Test" }],
            }),
          ])
        );
      }
      return Promise.resolve(mockFetchResponse([]));
    });

    const res = await GET(new Request("http://localhost/api/review-inbox"));
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].type).toBe("document_request");
    expect(data.items[0].status).toBe("draft");
  });

  test("filters out approved and rejected deadlines", async () => {
    mockFetch((url: string) => {
      if (url.includes("type=legal_deadline")) {
        return Promise.resolve(
          mockFetchResponse([
            mockPage("legal/d-approved", "legal_deadline", {
              review_status: "approved",
              status: "pending",
              due_date: "2026-07-15",
            }),
            mockPage("legal/d-rejected", "legal_deadline", {
              review_status: "rejected",
              status: "pending",
              due_date: "2026-07-15",
            }),
            mockPage("legal/d-unreviewed", "legal_deadline", {
              review_status: "unreviewed",
              status: "pending",
              due_date: "2026-07-15",
              case_slug: "cases/m1",
            }),
          ])
        );
      }
      return Promise.resolve(mockFetchResponse([]));
    });

    const res = await GET(new Request("http://localhost/api/review-inbox"));
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].type).toBe("suggested_deadline");
  });

  test("extracts suggested_parties from legal_case pages", async () => {
    mockFetch((url: string) => {
      if (url.includes("type=legal_case")) {
        return Promise.resolve(
          mockFetchResponse([
            mockPage("cases/matter-1", "legal_case", {
              suggested_parties: [
                { name: "Max Mustermann", role: "Gegner", source: "KI", confirmed: false },
                { name: "Anna Schmidt", role: "Zeuge", source: "Dokument", confirmed: true },
              ],
              created_at: "2026-07-01T00:00:00Z",
            }),
          ])
        );
      }
      return Promise.resolve(mockFetchResponse([]));
    });

    const res = await GET(new Request("http://localhost/api/review-inbox"));
    const data = await res.json();
    const partyItems = data.items.filter((i: { type: string }) => i.type === "suggested_party");
    expect(partyItems).toHaveLength(1);
    expect(partyItems[0].partyName).toBe("Max Mustermann");
    expect(partyItems[0].partyRole).toBe("Gegner");
    expect(partyItems[0].caseSlug).toBe("cases/matter-1");
  });

  test("extracts pending facts from legal_case pages", async () => {
    mockFetch((url: string) => {
      if (url.includes("type=legal_case")) {
        return Promise.resolve(
          mockFetchResponse([
            mockPage("cases/matter-1", "legal_case", {
              facts: [
                {
                  id: "f1",
                  statement: "Klage wurde am 1.3. eingereicht",
                  source: "KI",
                  confidence: "high",
                  review_status: "pending",
                },
                {
                  id: "f2",
                  statement: "Beklagte hat Widerspruch eingelegt",
                  source: "KI",
                  confidence: "medium",
                  review_status: "approved",
                },
              ],
              created_at: "2026-07-01T00:00:00Z",
            }),
          ])
        );
      }
      return Promise.resolve(mockFetchResponse([]));
    });

    const res = await GET(new Request("http://localhost/api/review-inbox"));
    const data = await res.json();
    const factItems = data.items.filter((i: { type: string }) => i.type === "pending_fact");
    expect(factItems).toHaveLength(1);
    expect(factItems[0].factId).toBe("f1");
    expect(factItems[0].factStatement).toContain("Klage");
    expect(factItems[0].factConfidence).toBe("high");
  });

  test("sorts by priority (high first) then by createdAt desc", async () => {
    mockFetch((url: string) => {
      if (url.includes("type=client_submission")) {
        return Promise.resolve(
          mockFetchResponse([
            mockPage("sub/low-prio", "client_submission", {
              review_status: "new",
              case_slug: "cases/m1",
              source: "WhatsApp",
              normalized_text: "Low priority",
              created_at: "2026-07-01T00:00:00Z",
            }),
            mockPage("sub/high-prio", "client_submission", {
              review_status: "new",
              case_slug: "cases/m2",
              source: "WhatsApp",
              normalized_text: "High priority",
              created_at: "2026-07-09T00:00:00Z",
            }),
          ])
        );
      }
      return Promise.resolve(mockFetchResponse([]));
    });

    const res = await GET(new Request("http://localhost/api/review-inbox"));
    const data = await res.json();
    // Both are high priority (client_submission default), sorted by createdAt desc
    expect(data.items[0].id).toBe("sub/high-prio");
    expect(data.items[1].id).toBe("sub/low-prio");
  });

  test("extracts suggested_deadlines from legal_case frontmatter with arrayIndex", async () => {
    mockFetch((url: string) => {
      if (url.includes("type=legal_case")) {
        return Promise.resolve(
          mockFetchResponse([
            mockPage("cases/test-case", "legal_case", {
              suggested_deadlines: [
                {
                  title: "Klagefrist",
                  due_date: "2026-08-15",
                  urgency: "high",
                  source: "KI",
                  source_quote: "§ 253 ZPO",
                  confirmed: false,
                },
                {
                  title: "Beweisfrist",
                  due_date: "2026-09-01",
                  urgency: "medium",
                  source: "KI",
                  confirmed: true, // already confirmed — should be filtered
                },
              ],
            }),
          ])
        );
      }
      return Promise.resolve(mockFetchResponse([]));
    });

    const res = await GET(new Request("http://localhost/api/review-inbox"));
    const data = await res.json();
    const sdItems = data.items.filter((i: { type: string }) => i.type === "suggested_deadline");
    expect(sdItems).toHaveLength(1);
    expect(sdItems[0].title).toBe("Klagefrist");
    expect(sdItems[0].arrayIndex).toBe(0);
    expect(sdItems[0].caseSlug).toBe("cases/test-case");
    expect(sdItems[0].dueDate).toBe("2026-08-15");
    expect(sdItems[0].sourceQuote).toBe("§ 253 ZPO");
  });
});
