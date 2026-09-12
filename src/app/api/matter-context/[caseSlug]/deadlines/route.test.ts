// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock engine
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  engineHeadersForBrain: () => ({ Authorization: "Bearer test" }),
}));

// Mock matter-context with deterministic bundle
const mockBundle = {
  case_slug: "legal/cases/test-case",
  deadlines: [
    { title: "Berufungsfrist", due_date: "2026-12-01", urgency: "critical" },
    { title: "Alte Frist", due_date: "2026-01-01", urgency: "overdue" },
    { title: "Zukünftige Frist", due_date: "2027-06-01", urgency: "upcoming" },
    { title: "Erledigte Frist", due_date: "2026-03-01", urgency: "normal" },
  ],
  generated_at: "2026-09-12T10:00:00.000Z",
};

vi.mock("@/lib/matter-context", () => ({
  buildMatterContext: vi.fn(async () => mockBundle),
}));

// Mock api-handler to bypass CSRF/auth
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: Record<string, unknown>,
    handler: (ctx: unknown, body: unknown, query: unknown, req: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const ctx = {
        brainId: "test-brain",
        user: { id: "user-1", email: "test@example.com" },
      };
      return handler(ctx, {}, {}, req);
    };
  },
}));

import { GET } from "./route";
import { buildMatterContext } from "@/lib/matter-context";

function makeRequest(caseSlug: string): Request {
  const url = `http://localhost/api/matter-context/${encodeURIComponent(caseSlug)}/deadlines`;
  return new Request(url, { method: "GET" });
}

describe("GET /api/matter-context/[caseSlug]/deadlines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildMatterContext).mockResolvedValue(mockBundle);
  });

  test("returns deadline summary with counts", async () => {
    const req = makeRequest("legal/cases/test-case");
    // Attach params (Next.js 15 route context)
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "legal/cases/test-case",
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.case_slug).toBe("legal/cases/test-case");
    expect(body.deadlines).toHaveLength(4);
    expect(body.deadline_count).toBe(4);
    expect(body.overdue_count).toBe(1);
    expect(body.critical_count).toBe(1);
    expect(body.upcoming_count).toBe(1);
    expect(body.generated_at).toBe("2026-09-12T10:00:00.000Z");
  });

  test("calls buildMatterContext with correct args", async () => {
    const req = makeRequest("legal/cases/my-case");
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "legal/cases/my-case",
    });

    await GET(req);
    expect(buildMatterContext).toHaveBeenCalledWith(
      "legal/cases/my-case",
      "http://engine-test:3001",
      { Authorization: "Bearer test" },
      "user-1"
    );
  });

  test("returns 400 when caseSlug is missing", async () => {
    const req = makeRequest("");
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "",
    });

    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_slug");
  });

  test("handles empty deadlines list", async () => {
    vi.mocked(buildMatterContext).mockResolvedValueOnce({
      ...mockBundle,
      deadlines: [],
    });

    const req = makeRequest("legal/cases/empty");
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "legal/cases/empty",
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deadline_count).toBe(0);
    expect(body.overdue_count).toBe(0);
    expect(body.critical_count).toBe(0);
    expect(body.upcoming_count).toBe(0);
  });

  test("handles buildMatterContext error", async () => {
    vi.mocked(buildMatterContext).mockRejectedValueOnce(new Error("Engine unreachable"));

    const req = makeRequest("legal/cases/error");
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "legal/cases/error",
    });

    await expect(GET(req)).rejects.toThrow("Engine unreachable");
  });
});
