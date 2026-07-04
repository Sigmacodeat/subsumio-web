/**
 * drift-guard.test.ts — C4: Parity test for web-lib AT deadline calculations.
 *
 * The frist-engine (server/src/core/legal/frist-engine.ts) is the authority
 * for AT deadline calculation. This test verifies that the web-lib's
 * simplified AT rules produce correct end dates for known inputs.
 *
 * Expected values are computed independently using the same statutory rules:
 *   - 4 Wochen = 28 Tage, rolled forward to next workday if Sa/So
 *   - 2 Wochen = 14 Tage, rolled forward to next workday if Sa/So
 *
 * If the frist-engine produces a different result (e.g. due to verhandlungsfreie
 * Zeit or Zustellfiktionen), the engine is authoritative and the web-lib is
 * the fallback. This test catches unintended drift in the web-lib's basic
 * calculation logic.
 */
import { describe, it, expect } from "vitest";
import { computeDueDate, DEADLINE_RULES, nextWorkday } from "@/lib/legal-deadlines";

/**
 * Compute expected AT deadline: add N days, roll forward to next workday
 * (Sa/So only — AT holidays are handled by the engine, not the web-lib
 * when no state is provided).
 */
function expectedAtDeadline(startDate: string, days: number): string {
  const d = new Date(`${startDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2);
  else if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0]!;
}

const AT_RULES = [
  { key: "at-jn-berufung", days: 28, desc: "Berufung 4 Wochen (AT)" },
  { key: "at-jn-revision", days: 28, desc: "Revision 4 Wochen (AT)" },
  { key: "at-avg-einwendung", days: 14, desc: "Einwendung 2 Wochen (AT AVG)" },
  { key: "at-bao-beschwerde", days: 28, desc: "Beschwerde 4 Wochen (AT BAO)" },
];

const TEST_DATES = [
  "2024-01-15",
  "2024-03-10",
  "2024-09-20",
  "2024-10-15",
  "2025-02-01",
  "2025-04-10",
];

describe("C4: Drift-Guard — Web-Lib AT rules produce expected dates", () => {
  for (const rule of AT_RULES) {
    const webRule = DEADLINE_RULES.find((r) => r.key === rule.key);
    if (!webRule) {
      it(`${rule.desc}: rule not found in DEADLINE_RULES`, () => {
        expect.fail(`Rule ${rule.key} not found in DEADLINE_RULES`);
      });
      continue;
    }

    describe(`${rule.desc} (${rule.key})`, () => {
      for (const testDate of TEST_DATES) {
        it(`${testDate} → +${rule.days}d (rolled to workday)`, () => {
          const { dueDate } = computeDueDate(webRule, testDate, undefined, "AT");
          const expected = expectedAtDeadline(testDate, rule.days);
          expect(dueDate).toBe(expected);
        });
      }
    });
  }
});

describe("C4: Drift-Guard — nextWorkday rolls Sa/So correctly", () => {
  it("Saturday rolls to Monday", () => {
    const sat = new Date("2024-03-09T12:00:00Z");
    const result = nextWorkday(sat);
    expect(result.date.getUTCDay()).toBe(1);
    expect(result.shifted).toBe(true);
  });

  it("Sunday rolls to Monday", () => {
    const sun = new Date("2024-03-10T12:00:00Z");
    const result = nextWorkday(sun);
    expect(result.date.getUTCDay()).toBe(1);
    expect(result.shifted).toBe(true);
  });

  it("Monday stays Monday", () => {
    const mon = new Date("2024-03-11T12:00:00Z");
    const result = nextWorkday(mon);
    expect(result.date.getUTCDay()).toBe(1);
    expect(result.shifted).toBe(false);
  });
});
