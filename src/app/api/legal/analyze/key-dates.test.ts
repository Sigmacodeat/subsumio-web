import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/api-handler", () => ({
  createHandler: () => async () => new Response(null),
  apiError: () => new Response(null, { status: 500 }),
}));

import { withDeadlinesFromKeyDates } from "./route";

describe("withDeadlinesFromKeyDates", () => {
  test("bridges future key_dates into writeback deadlines, skipping past dates", () => {
    const out = withDeadlinesFromKeyDates({
      key_dates: [
        { date: "2020-01-01", what: "Zustellung des Beschlusses" },
        { date: "2099-10-14", what: "Fristende für Klagebeantwortung" },
        { date: "2099-11-05", what: "Vorbereitende Tagsatzung, 09:30 Uhr" },
      ],
    });
    const deadlines = out.deadlines as Array<Record<string, string>>;
    expect(deadlines).toHaveLength(2);
    expect(deadlines[0]).toMatchObject({ date: "2099-10-14", urgency: "high" });
    expect(deadlines[1].label).toContain("Tagsatzung");
  });

  test("leaves explicit deadlines untouched", () => {
    const parsed = {
      deadlines: [{ label: "x", date: "2099-01-01" }],
      key_dates: [{ date: "2099-02-02", what: "y" }],
    };
    expect(withDeadlinesFromKeyDates(parsed)).toBe(parsed);
  });
});
