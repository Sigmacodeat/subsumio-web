import { describe, expect, it } from "vitest";
import { tariffEntriesFor } from "./TariffEntryDialog";

describe("tariffEntriesFor (W4-09)", () => {
  it("one Tarifleistung per calculated line; the time spent is booked once", () => {
    const entries = tariffEntriesFor({
      caseSlug: "legal/cases/a",
      date: "2026-09-24",
      minutes: 90,
      system: "ratg",
      basis: 12000,
      lines: [
        { id: "ratg-1-0", description: "Klage TP 3A — BG 12.000 €", date: "2026-09-24", amount: 287.4 },
        { id: "ratg-1-1", description: "Einheitssatz 50 %", date: "2026-09-24", amount: 143.7 },
      ],
    });
    expect(entries.map((e) => e.minutes)).toEqual([90, 0]);
    expect(entries[0].tariff).toEqual({
      system: "ratg",
      amount: 287.4,
      basis: 12000,
      label: "Klage TP 3A — BG 12.000 €",
    });
    expect(entries.every((e) => e.case_slug === "legal/cases/a" && e.billable)).toBe(true);
  });
});
