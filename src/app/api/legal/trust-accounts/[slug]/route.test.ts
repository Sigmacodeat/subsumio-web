// @vitest-environment node
// Anderkonto löschen (GELD-7, UIS-3-7): only without balance, audited as trust.delete.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPatch = vi.fn();
const logAudit = vi.fn();

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: (...args: unknown[]) => mockPatch(...args),
}));
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock("@/lib/keyed-lock", () => ({
  withKeyedLock: <T>(_k: string, fn: () => Promise<T>) => fn(),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    _opts: unknown,
    handler: (ctx: unknown, body: unknown, q: unknown, req: unknown) => Promise<Response>
  ) => {
    return async (req: Request) =>
      handler(
        { headers: {}, brainId: "b1", user: { id: "u1", email: "a@k.example", role: "lawyer" } },
        {},
        {},
        req
      );
  },
  apiError: (code: string, message: string, status: number, details?: unknown) =>
    Response.json({ error: message, code, details }, { status }),
}));

import { DELETE } from "./route";

let account: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  mockPatch.mockResolvedValue(Response.json({ success: true }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(account))
  );
});

function del() {
  const req = new Request("http://localhost/api/legal/trust-accounts/x", { method: "DELETE" });
  (req as unknown as { params: Promise<{ slug: string }> }).params = Promise.resolve({
    slug: encodeURIComponent("trust-accounts/1"),
  });
  return (DELETE as unknown as (r: Request) => Promise<Response>)(req);
}

describe("DELETE /api/legal/trust-accounts/[slug]", () => {
  it("refuses an account that still holds client money (409)", async () => {
    account = {
      slug: "trust-accounts/1",
      frontmatter: {
        status: "active",
        opening_balance: 0,
        // Stored balance says 0, the journal says 100 — the journal counts.
        current_balance: 0,
        transactions: [
          { id: "t1", type: "deposit", amount: 100, date: "2026-09-01", matterSlug: "m" },
        ],
      },
    };
    const res = await del();
    expect(res.status).toBe(409);
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("deletes an account without balance and audits it as trust.delete", async () => {
    account = {
      slug: "trust-accounts/1",
      frontmatter: { status: "closed", opening_balance: 0, transactions: [] },
    };
    const res = await del();
    expect(res.status).toBe(200);
    expect(mockPatch.mock.calls[0][1].frontmatter.status).toBe("tombstoned");
    expect(logAudit).toHaveBeenCalledWith(
      "trust.delete",
      "trust_account",
      expect.objectContaining({ entityId: "trust-accounts/1" })
    );
  });
});
