import { describe, expect, it } from "vitest";
import { retentionStatus } from "./retention-period";

describe("retentionStatus (§ 132 BAO: from the end of the closing year)", () => {
  it("a matter closed in March 2019 is kept until the end of 2026", () => {
    expect(retentionStatus("2019-03-05", new Date("2026-12-31T12:00:00Z"), 7, 3)?.action).toBe(
      "keep"
    );
    expect(retentionStatus("2019-03-05", new Date("2027-01-01T12:00:00Z"), 7, 3)?.action).toBe(
      "review"
    );
  });

  it("deletion only after the grace years, also counted from year end", () => {
    expect(retentionStatus("2015-12-30", new Date("2025-12-31T12:00:00Z"), 7, 3)?.action).toBe(
      "review"
    );
    expect(retentionStatus("2015-12-30", new Date("2026-01-01T12:00:00Z"), 7, 3)?.action).toBe(
      "delete"
    );
  });

  it("unreadable date: no status", () => {
    expect(retentionStatus("unbekannt", new Date(), 7, 3)).toBeNull();
  });
});
