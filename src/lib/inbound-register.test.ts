import { describe, expect, it } from "vitest";
import { inboundAssignmentUpdate, inboundDeadlineDescription } from "./inbound-register";

describe("inboundAssignmentUpdate (W4-06)", () => {
  it("keeps every earlier change and appends the new one", () => {
    const first = inboundAssignmentUpdate(
      { case_slug: "legal/cases/a" },
      { caseSlug: "legal/cases/b", by: "RA X", at: "2026-09-21T09:00:00.000Z" }
    );
    const second = inboundAssignmentUpdate(first, {
      caseSlug: "legal/cases/b",
      by: "RA Y",
      at: "2026-09-21T10:00:00.000Z",
    });
    expect(second.assignment_history).toEqual([
      {
        from: "legal/cases/a",
        to: "legal/cases/b",
        by: "RA X",
        at: "2026-09-21T09:00:00.000Z",
        kind: "reassigned",
      },
      {
        from: "legal/cases/b",
        to: "legal/cases/b",
        by: "RA Y",
        at: "2026-09-21T10:00:00.000Z",
        kind: "confirmed",
      },
    ]);
    expect(second.case_suggested).toBe(false);
  });
});

describe("inboundDeadlineDescription", () => {
  it("names the subject and the day of receipt", () => {
    expect(
      inboundDeadlineDescription({ subject: "Ladung", received_at: "2026-09-21T08:00:00.000Z" })
    ).toBe("Frist aus Posteingang: Ladung (eingelangt 21.09.2026)");
  });
});
