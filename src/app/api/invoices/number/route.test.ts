// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/** Year counters of the fake database: key `${brain}:${year}` → last number. */
const counters = new Map<string, number>();
const pool = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/^\s*SELECT 1 FROM subsumio_invoice_counters/.test(sql)) {
      return { rows: counters.has(`${params[0]}:${params[1]}`) ? [{ "?column?": 1 }] : [] };
    }
    if (/INSERT INTO subsumio_invoice_counters/.test(sql)) {
      const key = `${params[0]}:${params[1]}`;
      const next = Math.max(counters.get(key) ?? 0, Number(params[2])) + 1;
      counters.set(key, next);
      return { rows: [{ last_number: next }] };
    }
    return { rows: [] };
  }),
};
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => pool }));

const mockList = vi.fn(async (..._args: unknown[]) => [] as unknown[]);
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...args: unknown[]) => mockList(...args),
}));
vi.mock("@/lib/api-handler", async () => {
  const { apiSuccess } = await import("@/lib/api-response");
  return {
    createHandler: (_opts: unknown, handler: (ctx: unknown) => Promise<Response>) => async () =>
      handler({ headers: {}, brainId: "brain-at" }),
    apiSuccess,
  };
});

import { POST } from "./route";

async function reserve(): Promise<string> {
  const res = await (POST as unknown as () => Promise<Response>)();
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { number: string } }).data.number;
}

beforeEach(() => {
  counters.clear();
  mockList.mockReset();
  mockList.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("POST /api/invoices/number (audit QA-6)", () => {
  test("00:30 Vienna on 1 January reserves in the new year's range", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
    expect(await reserve()).toBe("R-2027-0001");
  });
});

describe("POST /api/invoices/number (audit QA-11)", () => {
  test("with an existing year counter the invoices are not listed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T10:00:00Z"));
    counters.set("brain-at:2026", 12);
    expect(await reserve()).toBe("R-2026-0013");
    expect(mockList).not.toHaveBeenCalled();
  });

  test("without a counter the existing invoices seed the sequence once", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T10:00:00Z"));
    mockList.mockResolvedValue([{ frontmatter: { invoice_number: "R-2026-0041" } }]);
    expect(await reserve()).toBe("R-2026-0042");
    expect(await reserve()).toBe("R-2026-0043");
    expect(mockList).toHaveBeenCalledTimes(1);
  });
});
