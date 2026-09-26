import { describe, expect, it } from "vitest";
import { caseRetentionState, caseRetentionUntil, retentionRunningMessage } from "./case-retention";

const now = new Date("2026-09-26T10:00:00Z");

describe("case retention (§ 12 RAO, § 132 BAO)", () => {
  it("runs 7 years from the end of the closing year", () => {
    expect(caseRetentionUntil("2026-03-05")).toBe("2033-12-31");
    expect(caseRetentionUntil("2026-12-31T23:30:00Z")).toBe("2034-12-31"); // Wien: 2027
    expect(caseRetentionUntil("kaputt")).toBeNull();
  });

  it("an open matter has no retention period", () => {
    expect(caseRetentionState({ status: "open" }, now)).toEqual({
      applies: false,
      until: null,
      running: false,
    });
  });

  it("an archived or closed matter is retained", () => {
    expect(caseRetentionState({ status: "archived", archived_at: "2025-01-02" }, now)).toEqual({
      applies: true,
      until: "2032-12-31",
      running: true,
    });
    expect(caseRetentionState({ status: "won", closed_at: "2015-06-01" }, now).running).toBe(false);
  });

  it("a stored retention_until can extend but never shorten the statutory period", () => {
    expect(
      caseRetentionState(
        { status: "archived", closed_at: "2024-01-01", retention_until: "2020-01-01" },
        now
      )
    ).toMatchObject({ until: "2031-12-31", running: true });
    expect(
      caseRetentionState(
        { status: "archived", closed_at: "2010-01-01", retention_until: "2030-12-31" },
        now
      )
    ).toMatchObject({ until: "2030-12-31", running: true });
  });

  it("fails closed when the period cannot be determined", () => {
    expect(caseRetentionState({ status: "settled" }, now)).toEqual({
      applies: true,
      until: null,
      running: true,
    });
    expect(
      caseRetentionState(
        { status: "archived", closed_at: "2001-01-01", retention_until: "??" },
        now
      ).running
    ).toBe(true);
  });

  it("the last day of the period still counts", () => {
    const fm = { status: "archived", retention_until: "2026-09-26", closed_at: "2010-01-01" };
    expect(caseRetentionState(fm, new Date("2026-09-26T21:00:00Z")).running).toBe(true);
    expect(caseRetentionState(fm, new Date("2026-09-27T01:00:00Z")).running).toBe(false);
  });

  it("names the end date in the refusal", () => {
    expect(retentionRunningMessage("2033-12-31")).toMatch(/bis 31\.12\.2033/);
  });
});
