// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock api-handler to bypass CSRF/auth, passing the JSON body through.
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: Record<string, unknown>,
    handler: (ctx: unknown, body: unknown, query: unknown, req: unknown) => Promise<Response>
  ) => {
    return async (req: Request) => {
      const ctx = {
        brainId: "test-brain",
        user: { id: "user-1", email: "test@example.com" },
        headers: { "x-subsumio-source": "test-brain" },
      };
      const body = req.method === "GET" ? undefined : await req.json().catch(() => ({}));
      const query = Object.fromEntries(new URL(req.url).searchParams.entries());
      try {
        return await handler(ctx, body, query, req);
      } catch (err) {
        // Mirror createHandler: AppError carries statusCode/code → mapped response.
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        const code = (err as { code?: string }).code ?? "internal_error";
        return Response.json({ error: (err as Error).message, code }, { status });
      }
    };
  },
  apiSuccess: (data: unknown, meta?: unknown, status = 200) =>
    Response.json({ data, ...(meta ? { meta } : {}) }, { status }),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

const mockPageExists = vi.fn(async () => false);
const mockWriteOrThrow = vi.fn(async () => new Response("{}", { status: 200 }));

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePageExists: (...a: unknown[]) => mockPageExists(...a),
  engineWriteOrThrow: (...a: unknown[]) => mockWriteOrThrow(...a),
}));

const mockListOpenItems = vi.fn(async (): Promise<unknown[]> => []);
vi.mock("@/lib/open-items", () => ({
  listOpenItems: (...a: unknown[]) => mockListOpenItems(...a),
}));

// Real fibu (pure functions — deterministic ids, matching).
import { POST } from "./route";

const TXN = {
  date: "2026-09-20",
  amount: 1200.5,
  direction: "credit",
  iban: "AT12 3456 7890 1234 5678",
  sender_name: "Muster GmbH",
  sender_iban: "AT98 7654 3210 9876 5432",
  reference: "RE-2026-0042",
  purpose: "Rechnung RE-2026-0042",
};

function postBody(transactions: unknown[]) {
  return new NextRequest("http://localhost/api/fibu/opos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactions }),
  });
}

describe("POST /api/fibu/opos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPageExists.mockResolvedValue(false);
    mockWriteOrThrow.mockResolvedValue(new Response("{}", { status: 200 }));
    mockListOpenItems.mockResolvedValue([]);
  });

  it("persists each new transaction and reports it as imported", async () => {
    const res = await POST(postBody([TXN]));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(1);
    expect(body.data.skipped).toBe(0);
    expect(mockWriteOrThrow).toHaveBeenCalledTimes(1);
    const writeBody = mockWriteOrThrow.mock.calls[0]![1] as { slug: string };
    expect(writeBody.slug).toMatch(/^legal\/bank-transactions\/txn-/);
  });

  it("fails the request when the engine rejects a write (no silent success)", async () => {
    mockWriteOrThrow.mockRejectedValueOnce(
      Object.assign(new Error("Engine write failed: /api/pages → HTTP 500"), {
        code: "engine_write_failed",
        statusCode: 502,
      })
    );
    const res = await POST(postBody([TXN]));
    // createHandler maps AppError(statusCode 502) → 502 response
    expect(res.status).toBe(502);
  });

  it("skips a transaction that was already imported (idempotent re-import)", async () => {
    mockPageExists.mockResolvedValue(true);
    const res = await POST(postBody([TXN]));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(0);
    expect(body.data.skipped).toBe(1);
    expect(mockWriteOrThrow).not.toHaveBeenCalled();
  });

  it("produces a stable transaction id — the same statement line maps to the same slug", async () => {
    await POST(postBody([TXN]));
    const first = (mockWriteOrThrow.mock.calls[0]![1] as { slug: string }).slug;

    mockWriteOrThrow.mockClear();
    await POST(postBody([{ ...TXN, iban: "AT123456789012345678" }])); // same IBAN, no spaces
    const second = (mockWriteOrThrow.mock.calls[0]![1] as { slug: string }).slug;

    expect(first).toBe(second);
  });
});
