import type { NextRequest } from "next/server";
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
  case_title: "Test Case",
  case_frontmatter: { status: "open", client_name: "Max Muster" },
  deadlines: [],
  documents: [],
  parties: [],
  facts: [],
  activity: [],
  communications: [],
  coverage: { completeness: 0.85 },
  gaps: [],
  generated_at: "2026-09-12T10:00:00.000Z",
} as unknown as MatterContextBundle;

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
type MatterContextBundle = Awaited<ReturnType<typeof buildMatterContext>>;

function makeRequest(caseSlug: string): NextRequest {
  const url = `http://localhost/api/matter-context/${encodeURIComponent(caseSlug)}`;
  return new Request(url, { method: "GET" }) as unknown as NextRequest;
}

describe("GET /api/matter-context/[caseSlug]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildMatterContext).mockResolvedValue(mockBundle);
  });

  test("returns full matter context bundle", async () => {
    const req = makeRequest("legal/cases/test-case");
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "legal/cases/test-case",
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.case_slug).toBe("legal/cases/test-case");
    expect(body.case_title).toBe("Test Case");
    expect(body.case_frontmatter).toEqual({ status: "open", client_name: "Max Muster" });
    expect(body.deadlines).toEqual([]);
    expect(body.documents).toEqual([]);
    expect(body.parties).toEqual([]);
    expect(body.coverage).toEqual({ completeness: 0.85 });
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

  test("handles buildMatterContext error", async () => {
    vi.mocked(buildMatterContext).mockRejectedValueOnce(new Error("Engine unreachable"));

    const req = makeRequest("legal/cases/error");
    (req as unknown as { params: Promise<{ caseSlug: string }> }).params = Promise.resolve({
      caseSlug: "legal/cases/error",
    });

    await expect(GET(req)).rejects.toThrow("Engine unreachable");
  });
});
