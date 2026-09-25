import { describe, expect, it } from "vitest";
import { aggregateLawyerStats, entryFromTimeEntryPage } from "./controlling";

const now = new Date("2026-09-25T10:00:00Z");

describe("aggregateLawyerStats (GELD-24)", () => {
  const cases = [
    {
      slug: "cases/a",
      frontmatter: {
        own_lawyer_name: "Anwältin A",
        time_entries: [
          { id: "t1", date: "2026-09-10", minutes: 120, rate: 300, lawyer: "Anwalt B" },
          { id: "t2", date: "2026-09-11", minutes: 60, rate: 300 },
          { id: "t3", date: "2026-09-12", minutes: 60, billable: false },
        ],
      },
    },
  ];

  it("hours go to the lawyer who did them; without one, to the matter's lawyer", () => {
    const stats = aggregateLawyerStats(cases, [], "month", now);
    const a = stats.find((s) => s.name === "Anwältin A")!;
    const b = stats.find((s) => s.name === "Anwalt B")!;
    expect(b.totalHours).toBe(2);
    expect(b.totalRevenue).toBe(600);
    expect(a.totalHours).toBe(2);
    expect(a.billableHours).toBe(1);
  });

  it("timer entries (standalone pages) are counted", () => {
    const timer = entryFromTimeEntryPage("time-entries/x", {
      date: "2026-09-20",
      minutes: 30,
      rate: 200,
      lawyer: "Anwalt B",
      case_slug: "cases/a",
    });
    const stats = aggregateLawyerStats(cases, [timer], "month", now);
    expect(stats.find((s) => s.name === "Anwalt B")!.totalHours).toBe(2.5);
  });

  it("period by the firm's calendar", () => {
    const stats = aggregateLawyerStats(
      [
        {
          slug: "cases/b",
          frontmatter: {
            own_lawyer_name: "C",
            time_entries: [{ id: "x", date: "2026-08-31", minutes: 60 }],
          },
        },
      ],
      [],
      "month",
      now
    );
    expect(stats.find((s) => s.name === "C")!.totalHours).toBe(0);
    const quarter = aggregateLawyerStats(
      [
        {
          slug: "cases/b",
          frontmatter: {
            own_lawyer_name: "C",
            time_entries: [{ id: "x", date: "2026-08-31", minutes: 60 }],
          },
        },
      ],
      [],
      "quarter",
      now
    );
    expect(quarter.find((s) => s.name === "C")!.totalHours).toBe(1);
  });
});
