// @vitest-environment node
// GELD-25: the account's jurisdiction reaches the booking check.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPatch = vi.fn();

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/keyed-lock", () => ({
  withKeyedLock: <T>(_k: string, fn: () => Promise<T>) => fn(),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      _opts: unknown,
      handler: (ctx: unknown, body: unknown, q: unknown, req: unknown) => Promise<Response>
    ) =>
    async (req: Request) =>
      handler(
        { headers: {}, brainId: "b1", user: { id: "u1", email: "a@k.example", role: "lawyer" } },
        await req.json(),
        {},
        req
      ),
  apiError: (code: string, message: string, status: number, details?: unknown) =>
    Response.json({ error: message, code, details }, { status }),
}));

import { POST } from "./route";

let account: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPatch.mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(account))
  );
});

function book() {
  const req = new Request("http://localhost/api/legal/trust-accounts/x", {
    method: "POST",
    body: JSON.stringify({
      type: "deposit",
      amount: 100,
      date: "2026-09-01",
      description: "Fremdgeld",
      matterSlug: "cases/a",
    }),
  });
  (req as unknown as { params: Promise<{ slug: string }> }).params = Promise.resolve({
    slug: encodeURIComponent("trust-accounts/1"),
  });
  return (POST as unknown as (r: Request) => Promise<Response>)(req);
}

describe("POST /api/legal/trust-accounts/[slug] — jurisdiction", () => {
  it("a German Anderkonto gets the BRAO hints", async () => {
    account = {
      slug: "trust-accounts/1",
      frontmatter: { status: "active", jurisdiction: "de", opening_balance: 0, transactions: [] },
    };
    const res = await book();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.warnings.join(" ")).toContain("BRAO");
  });

  it("an Austrian account does not", async () => {
    account = {
      slug: "trust-accounts/1",
      frontmatter: { status: "active", jurisdiction: "at", opening_balance: 0, transactions: [] },
    };
    const body = await (await book()).json();
    expect((body.warnings ?? []).join(" ")).not.toContain("BRAO");
  });
});
