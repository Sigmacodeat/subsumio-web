// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";

const mockAllocate = vi.fn(async (..._args: unknown[]) => "R-2027-0001");
vi.mock("@/lib/engine-pages", () => ({ listEnginePages: vi.fn(async () => []) }));
vi.mock("@/lib/invoice-numbering", () => ({
  allocateInvoiceNumber: (...args: unknown[]) => mockAllocate(...args),
  highestInvoiceNumber: () => 0,
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

afterEach(() => vi.useRealTimers());

describe("POST /api/invoices/number (audit QA-6)", () => {
  test("00:30 Vienna on 1 January reserves in the new year's range", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
    const res = await (POST as unknown as () => Promise<Response>)();
    expect(res.status).toBe(200);
    expect(mockAllocate).toHaveBeenCalledWith("brain-at", 2027, 0);
  });
});
