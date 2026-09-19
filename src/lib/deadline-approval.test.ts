import { describe, expect, it } from "vitest";
import {
  buildApprovedDeadlinePage,
  buildApprovedDeadlineSlug,
  slugPart,
} from "./deadline-approval";

describe("slugPart", () => {
  it("lowercases, spells out umlauts and collapses separators", () => {
    expect(slugPart("Berufungsfrist § 464 ZPO")).toBe("berufungsfrist-464-zpo");
    expect(slugPart("Äußerung zur Klagebeantwortung")).toBe("aeusserung-zur-klagebeantwortung");
    expect(slugPart("  --Frist!!  ")).toBe("frist");
  });

  it("cuts to the maximum length without a trailing dash", () => {
    const s = slugPart("a".repeat(40) + " bbbbbbbbbbbbbbb", 42);
    expect(s.length).toBeLessThanOrEqual(42);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("buildApprovedDeadlineSlug", () => {
  it("builds legal/deadlines/<akte-tail>-<datum>-<titel-slug>", () => {
    expect(
      buildApprovedDeadlineSlug({
        caseSlug: "legal/cases/qa-2026-003-novak-versicherung-ag",
        date: "2026-10-14",
        title: "Fristende für Klagebeantwortung (vier Wochen ab Zustellung)",
      })
    ).toBe(
      "legal/deadlines/qa-2026-003-novak-versicherung-ag-2026-10-14-fristende-fuer-klagebeantwortung-vier-wochen-ab"
    );
  });

  it("uses only the date part of a timestamp", () => {
    expect(
      buildApprovedDeadlineSlug({ caseSlug: "cases/x", date: "2026-10-14T00:00:00Z", title: "F" })
    ).toBe("legal/deadlines/x-2026-10-14-f");
  });

  it("is deterministic and falls back without a case", () => {
    const input = { date: "2026-11-12", title: "Rekursfrist § 521 ZPO" };
    expect(buildApprovedDeadlineSlug(input)).toBe(
      "legal/deadlines/ohne-akte-2026-11-12-rekursfrist-521-zpo"
    );
    expect(buildApprovedDeadlineSlug(input)).toBe(buildApprovedDeadlineSlug(input));
  });
});

describe("buildApprovedDeadlinePage", () => {
  it("carries the approval into the frontmatter", () => {
    const page = buildApprovedDeadlinePage({
      caseSlug: "legal/cases/demo",
      title: "Berufungsfrist",
      date: "2026-10-14",
      law: "§ 464 Abs 1 ZPO",
      vorfristDate: "2026-10-07",
      reviewedBy: "Dr. Muster",
      now: new Date("2026-09-19T10:00:00Z"),
    });
    expect(page.slug).toBe("legal/deadlines/demo-2026-10-14-berufungsfrist");
    expect(page.type).toBe("legal_deadline");
    expect(page.frontmatter).toEqual({
      type: "legal_deadline",
      case_slug: "legal/cases/demo",
      title: "Berufungsfrist",
      due_date: "2026-10-14",
      law: "§ 464 Abs 1 ZPO",
      vorfrist_date: "2026-10-07",
      status: "pending",
      source: "ai_deadline_calendar",
      review_status: "approved",
      reviewed_by: "Dr. Muster",
      reviewed_at: "2026-09-19T10:00:00.000Z",
    });
  });
});
