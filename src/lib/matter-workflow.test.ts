import { describe, expect, it } from "vitest";
import { deriveMatterWorkflowActions } from "./matter-workflow";
import type { CaseDetail } from "./matter-detail-types";

const baseMatter = {
  slug: "legal/cases/test",
  title: "Testakte",
  status: "open",
  documents: [],
  deadlines: [],
  tasks: [],
  claims: [],
  defenses: [],
  mandateAcceptance: {
    intake_slug: "intake-1",
    accepted_at: "2026-07-09T12:00:00.000Z",
    accepted_by: "test@example.com",
    conflict_check: { status: "clear" },
    kyc: { required: true, status: "verified" },
    poa: { required: true, status: "signed" },
    engagement_letter: { status: "sent" },
  },
} as unknown as CaseDetail;

describe("deriveMatterWorkflowActions", () => {
  it("starts with source upload when the matter has no documents", () => {
    const actions = deriveMatterWorkflowActions(baseMatter);
    expect(actions[0]).toMatchObject({ kind: "upload", priority: "high" });
  });

  it("prioritises overdue deadlines over all other work", () => {
    const actions = deriveMatterWorkflowActions({
      ...baseMatter,
      deadlines: [{ id: "d1", title: "Berufung", due_date: "2020-01-01", status: "pending" }],
    });
    expect(actions[0]).toMatchObject({ kind: "review_deadlines", priority: "critical" });
  });

  it("only offers calendar sync for reviewed deadlines not already synced", () => {
    const matter = {
      ...baseMatter,
      documents: [
        { id: "doc", name: "Klage.pdf", uploadedAt: "2026-01-01", analysis_status: "completed" },
      ],
      deadlines: [
        {
          id: "d1",
          title: "Klageantwort",
          due_date: "2099-01-01",
          status: "pending",
          review_status: "approved",
        },
      ],
    } as CaseDetail;
    expect(deriveMatterWorkflowActions(matter).some((action) => action.kind === "calendar")).toBe(
      true
    );
    expect(
      deriveMatterWorkflowActions(matter, null, new Set(["d1"])).some(
        (action) => action.kind === "calendar"
      )
    ).toBe(false);
  });
});
