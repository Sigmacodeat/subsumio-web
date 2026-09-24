import { describe, expect, test } from "vitest";
import { agendaDayLabel, buildAgenda, fristenToAgendaPages } from "./overview-agenda";

const now = new Date(2026, 8, 19, 9, 0); // Sa, 19.09.2026

const cases = [
  {
    slug: "legal/cases/a",
    title: "Novak ./. Versicherung AG",
    frontmatter: { case_number: "QA-2026-003" },
  },
];

describe("buildAgenda", () => {
  test("groups by local calendar day and resolves the matter", () => {
    const agenda = buildAgenda(
      [
        {
          slug: "d1",
          title: "Klagebeantwortung § 230 ZPO",
          frontmatter: { due_date: "2026-09-21", case_slug: "legal/cases/a" },
        },
        { slug: "d2", title: "Berufungsfrist", frontmatter: { due_date: "2026-09-21" } },
        { slug: "d3", title: "Heute fällig", frontmatter: { due_date: "2026-09-19" } },
      ],
      cases,
      { now }
    );
    expect(agenda.days.map((d) => d.iso)).toEqual(["2026-09-19", "2026-09-21"]);
    expect(agenda.days[1].entries).toHaveLength(2);
    const first = agenda.days[1].entries.find((e) => e.slug === "d1")!;
    expect(first.caseNumber).toBe("QA-2026-003");
    expect(first.days).toBe(2);
  });

  test("overdue open deadlines come first, done ones disappear", () => {
    const agenda = buildAgenda(
      [
        { slug: "late", title: "Frist", frontmatter: { due_date: "2026-09-15" } },
        {
          slug: "done",
          title: "Erledigt",
          frontmatter: { due_date: "2026-09-15", status: "done" },
        },
      ],
      [],
      { now }
    );
    expect(agenda.overdue.map((e) => e.slug)).toEqual(["late"]);
    expect(agenda.overdue[0].days).toBe(-4);
  });

  test("a Vorfrist is its own agenda entry, the Notfrist flag carries over", () => {
    const agenda = buildAgenda(
      [
        {
          slug: "n",
          title: "Rekursfrist § 521 ZPO",
          frontmatter: { due_date: "2026-10-12", vorfrist_date: "2026-09-28", is_notfrist: true },
        },
      ],
      [],
      { now }
    );
    expect(agenda.upcomingCount).toBe(1);
    const e = agenda.days[0].entries[0];
    expect(e.kind).toBe("vorfrist");
    expect(e.notfrist).toBe(true);
  });

  test("hearings are recognised and carry the time from the title", () => {
    const agenda = buildAgenda(
      [
        {
          slug: "h",
          title: "Vorbereitende Tagsatzung um 09:30 Uhr",
          frontmatter: { due_date: "2026-09-22" },
        },
      ],
      [],
      { now }
    );
    const e = agenda.days[0].entries[0];
    expect(e.kind).toBe("hearing");
    expect(e.time).toBe("09:30");
  });

  test("points to the next entry when the window is empty", () => {
    const agenda = buildAgenda(
      [{ slug: "far", title: "Später", frontmatter: { due_date: "2026-11-30" } }],
      [],
      { now }
    );
    expect(agenda.days).toHaveLength(0);
    expect(agenda.nextAfterWindow?.slug).toBe("far");
    expect(agenda.later.map((e) => e.slug)).toEqual(["far"]);
  });
});

describe("agendaDayLabel", () => {
  test("relative words for today and tomorrow, weekday otherwise", () => {
    expect(agendaDayLabel({ date: now, days: 0 })).toBe("Heute");
    expect(agendaDayLabel({ date: now, days: 1 })).toBe("Morgen");
    expect(agendaDayLabel({ date: new Date(2026, 8, 23), days: 4 })).toMatch(/Mittwoch/);
  });
});

describe("fristenToAgendaPages (Mein Tag uses the Fristen read model)", () => {
  test("includes matter-embedded deadlines and keeps entries of one matter apart", () => {
    const pages = fristenToAgendaPages([
      {
        id: "d-1",
        title: "Berufung",
        due_date: "2026-09-22",
        status: "pending",
        type: "deadline",
        case_slug: "legal/cases/a",
        is_notfrist: true,
        review_status: "unreviewed",
      },
      {
        id: "d-2",
        title: "Replik",
        due_date: "2026-09-22",
        status: "pending",
        type: "deadline",
        case_slug: "legal/cases/a",
      },
      {
        id: "d-3",
        title: "Erledigt",
        due_date: "2026-09-21",
        status: "done",
        type: "deadline",
        case_slug: "legal/cases/a",
      },
      {
        id: "t-1",
        title: "Tagsatzung",
        due_date: "2026-09-23",
        status: "pending",
        type: "hearing",
        case_slug: "legal/cases/a",
      },
    ]);
    const agenda = buildAgenda(pages, cases, { now, windowDays: 14 });
    const entries = agenda.days.flatMap((d) => d.entries);
    expect(entries.map((e) => e.title)).toEqual(["Berufung", "Replik", "Tagsatzung"]);
    expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length);
    expect(entries[0]).toMatchObject({
      notfrist: true,
      unreviewed: true,
      caseNumber: "QA-2026-003",
    });
    expect(entries.find((e) => e.title === "Tagsatzung")?.kind).toBe("hearing");
  });
});
