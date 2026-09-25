import { describe, expect, it, vi } from "vitest";
import {
  allocateInvoiceNumber,
  formatInvoiceNumber,
  highestInvoiceNumber,
  reserveInvoiceNumber,
} from "@/lib/invoice-numbering";

describe("invoice numbering", () => {
  it("formats and finds the highest number of the year", () => {
    expect(formatInvoiceNumber(2026, 7)).toBe("R-2026-0007");
    expect(
      highestInvoiceNumber(
        ["R-2026-0003", "R-2025-0099", "R-2026-0011", "Gutschrift", undefined],
        2026
      )
    ).toBe(11);
  });

  it("never hands out the same number twice, even when requests overlap", async () => {
    const numbers = await Promise.all(
      Array.from({ length: 20 }, () => allocateInvoiceNumber("brain_overlap", 2026, 0))
    );
    expect(new Set(numbers).size).toBe(20);
  });

  it("continues after the highest existing invoice", async () => {
    expect(await allocateInvoiceNumber("brain_existing", 2026, 41)).toBe("R-2026-0042");
    expect(await allocateInvoiceNumber("brain_existing", 2026, 41)).toBe("R-2026-0043");
    expect(await allocateInvoiceNumber("brain_existing", 2027, 0)).toBe("R-2027-0001");
  });
});

describe("reserveInvoiceNumber (QA-11)", () => {
  it("reads the existing invoices only to seed a year's counter", async () => {
    const load = vi.fn(async () => ["R-2026-0007"]);
    expect(await reserveInvoiceNumber("brain_seed", 2026, load)).toBe("R-2026-0008");
    expect(await reserveInvoiceNumber("brain_seed", 2026, load)).toBe("R-2026-0009");
    expect(load).toHaveBeenCalledTimes(1);
    // A new year gets its own seed.
    expect(await reserveInvoiceNumber("brain_seed", 2027, load)).toBe("R-2027-0001");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("still reserves a number when the seed list cannot be read", async () => {
    const load = vi.fn(async (): Promise<string[]> => {
      throw new Error("engine down");
    });
    expect(await reserveInvoiceNumber("brain_seed_fail", 2026, load)).toBe("R-2026-0001");
  });
});
