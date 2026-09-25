// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: vi.fn(async () => new Response("{}", { status: 200 })),
}));
vi.mock("@/lib/server-brain", () => ({
  createServerBrainClient: () => ({ getPage: async () => null }),
}));

import {
  allocateCaseNumber,
  CaseNumberAllocationError,
  formatCaseNumber,
  viennaYear,
} from "./case-numbering";

let counterPage: { status: number; body?: unknown } = { status: 404 };

beforeEach(() => {
  counterPage = { status: 404 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      counterPage.status === 200
        ? Response.json(counterPage.body)
        : new Response("{}", { status: counterPage.status })
    )
  );
});

const NOW = new Date("2026-06-15T10:00:00Z");

describe("allocateCaseNumber", () => {
  test("20 parallel allocations get 20 different numbers", async () => {
    const numbers = await Promise.all(
      Array.from({ length: 20 }, () => allocateCaseNumber({}, "brain-parallel", undefined, NOW))
    );
    expect(new Set(numbers).size).toBe(20);
    expect(numbers).toContain("26-0001");
    expect(numbers).toContain("26-0020");
  });

  test("a failed counter read is an error, never a restart at 0001", async () => {
    counterPage = { status: 500 };
    await expect(allocateCaseNumber({}, "brain-err", undefined, NOW)).rejects.toBeInstanceOf(
      CaseNumberAllocationError
    );
  });

  test("continues after the numbers the earlier counter page handed out", async () => {
    counterPage = {
      status: 200,
      body: { slug: "legal/settings/case-number-counter", frontmatter: { year: 2026, next: 42 } },
    };
    expect(await allocateCaseNumber({}, "brain-legacy", "MK", NOW)).toBe("MK-26-0042");
  });

  test("the year follows Vienna time at New Year", () => {
    // 31.12.2026 23:30 UTC is already 1.1.2027 in Vienna.
    expect(viennaYear(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
    expect(viennaYear(new Date("2026-12-31T22:30:00Z"))).toBe(2026);
    expect(formatCaseNumber(2027, 7)).toBe("27-0007");
  });
});
