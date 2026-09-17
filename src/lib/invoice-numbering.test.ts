import { describe, expect, it } from "vitest";
import {
  allocateInvoiceNumber,
  formatInvoiceNumber,
  highestInvoiceNumber,
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
