// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";

const mockGetFristen = vi.fn();
vi.mock("@/app/api/legal/fristen/route", () => ({
  GET: (...args: unknown[]) => mockGetFristen(...args),
}));
vi.mock("@/lib/work-product-receipt-store", () => ({ storeReceipt: vi.fn(async () => {}) }));
vi.mock("@/lib/work-product-receipts", () => ({ buildWorkProductReceipt: vi.fn(() => ({})) }));
vi.mock("@/lib/logger", () => ({ logger: () => ({ error: vi.fn(), warn: vi.fn() }) }));
vi.mock("@/lib/api-handler", async () => {
  const { apiError } = await import("@/lib/api-response");
  return {
    createHandler:
      (
        _opts: unknown,
        handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
      ) =>
      async (req: Request) =>
        handler(
          { brainId: "brain-at", user: { id: "u1" } },
          {
            case_slug: "cases/2026-0001",
            jurisdiction: "at",
            language: "de",
            include_overdue: true,
            include_upcoming_days: 30,
          },
          {},
          req
        ),
    apiError,
  };
});

import { POST } from "./route";

afterEach(() => vi.useRealTimers());

describe("POST /api/legal/fristenreport (audit QA-6)", () => {
  test("00:30 Vienna on 1 January: Stichtag is the new day, yesterday's deadline is overdue", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
    mockGetFristen.mockResolvedValueOnce(
      Response.json({
        fristen: [
          { id: "f1", due_date: "2026-12-31", status: "open" },
          { id: "f2", due_date: "2027-01-01", status: "open" },
        ],
      })
    );
    const res = await POST(
      new Request("http://localhost/api/legal/fristenreport", { method: "POST" }) as never
    );
    const report = (await res.json()) as {
      stichtag: string;
      horizon: string;
      overdue: Array<{ id: string }>;
      upcoming: Array<{ id: string }>;
    };
    expect(report.stichtag).toBe("2027-01-01");
    expect(report.horizon).toBe("2027-01-31");
    expect(report.overdue.map((f) => f.id)).toEqual(["f1"]);
    expect(report.upcoming.map((f) => f.id)).toEqual(["f2"]);
  });
});
