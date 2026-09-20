import { describe, it, expect } from "vitest";
import {
  alertSentFields,
  alertStageFor,
  collectDueAlerts,
  hoursUntil,
  markCaseAlerts,
  stagesPassed,
  type AlertPage,
} from "@/lib/deadline-alerts";

const NOW = new Date("2026-09-20T09:00:00Z");

function deadlinePage(over: Record<string, unknown> = {}): AlertPage {
  return {
    slug: "legal/deadlines/d1",
    title: "Klagebeantwortung",
    frontmatter: { case_slug: "legal/cases/novak", due_date: "2026-09-21", ...over },
  };
}

describe("alertStageFor", () => {
  it("names the stage by the hours left", () => {
    expect(alertStageFor(2)).toBe("urgent");
    expect(alertStageFor(24)).toBe("urgent");
    expect(alertStageFor(48)).toBe("warning");
    expect(alertStageFor(100)).toBe("normal");
    expect(alertStageFor(300)).toBeUndefined();
  });

  it("keeps an overdue deadline urgent", () => {
    expect(alertStageFor(-12)).toBe("urgent");
  });

  it("records every stage already passed", () => {
    expect(stagesPassed("urgent")).toEqual(["urgent", "warning", "normal"]);
    expect(stagesPassed("normal")).toEqual(["normal"]);
  });
});

describe("hoursUntil", () => {
  it("reads a date-only deadline as end of that day", () => {
    expect(Math.round(hoursUntil("2026-09-20", new Date("2026-09-20T09:00:00")))).toBe(15);
  });

  it("returns NaN for nonsense", () => {
    expect(Number.isNaN(hoursUntil("kein datum", NOW))).toBe(true);
  });
});

describe("collectDueAlerts", () => {
  it("finds a deadline page that is due", () => {
    // 21.09. end of day is ~39 hours out from 20.09. 09:00 → the 72-hour stage.
    const alerts = collectDueAlerts([], [deadlinePage()], NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ urgency: "warning", title: "Klagebeantwortung" });
  });

  it("stays silent for a stage already signalled — no repeat every 30 minutes", () => {
    const page = deadlinePage({ alert_stages_sent: ["urgent", "warning", "normal"] });
    expect(collectDueAlerts([], [page], NOW)).toEqual([]);
  });

  it("still fires when only a wider stage was signalled", () => {
    const page = deadlinePage({ alert_stages_sent: ["normal"] });
    expect(collectDueAlerts([], [page], NOW)[0]?.urgency).toBe("warning");
  });

  it("reaches the 24-hour stage on the last day", () => {
    const page = deadlinePage({ due_date: "2026-09-20", alert_stages_sent: ["warning", "normal"] });
    expect(collectDueAlerts([], [page], NOW)[0]?.urgency).toBe("urgent");
  });

  it("leaves out completed deadlines and deadlines far out", () => {
    expect(collectDueAlerts([], [deadlinePage({ status: "completed" })], NOW)).toEqual([]);
    expect(collectDueAlerts([], [deadlinePage({ due_date: "2026-12-01" })], NOW)).toEqual([]);
  });

  it("leaves out deadlines of an archived matter", () => {
    const cases: AlertPage[] = [{ slug: "legal/cases/novak", frontmatter: { status: "archived" } }];
    expect(collectDueAlerts(cases, [deadlinePage()], NOW)).toEqual([]);
  });

  it("finds deadlines inside a matter", () => {
    const cases: AlertPage[] = [
      {
        slug: "legal/cases/gruber",
        title: "Gruber",
        frontmatter: {
          deadlines: [{ id: "f1", title: "Berufung", due_date: "2026-09-22" }],
        },
      },
    ];
    const alerts = collectDueAlerts(cases, [], NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].ref).toEqual({
      kind: "case",
      caseSlug: "legal/cases/gruber",
      id: "f1",
      title: "Berufung",
      dueDate: "2026-09-22",
    });
    // 22.09. end of day is ~63 hours out → still the 72-hour stage.
    expect(alerts[0].urgency).toBe("warning");
  });

  it("counts a deadline present both as page and in the matter once", () => {
    const cases: AlertPage[] = [
      {
        slug: "legal/cases/novak",
        frontmatter: {
          deadlines: [{ title: "Klagebeantwortung", due_date: "2026-09-21" }],
        },
      },
    ];
    expect(collectDueAlerts(cases, [deadlinePage()], NOW)).toHaveLength(1);
  });
});

describe("alertSentFields", () => {
  it("adds the stages passed without dropping earlier ones", () => {
    const fields = alertSentFields(
      { alert_stages_sent: ["normal"] },
      "warning",
      "2026-09-20T09:00:00Z"
    );
    expect(fields.alert_stages_sent).toEqual(["warning", "normal"]);
    expect(fields.alert_sent_at).toBe("2026-09-20T09:00:00Z");
  });
});

describe("markCaseAlerts", () => {
  it("marks only the matching deadline", () => {
    const deadlines = [
      { id: "f1", title: "Berufung", due_date: "2026-09-22" },
      { id: "f2", title: "Replik", due_date: "2026-10-30" },
    ];
    const items = collectDueAlerts(
      [{ slug: "legal/cases/gruber", frontmatter: { deadlines } }],
      [],
      NOW
    );
    const { deadlines: next, changed } = markCaseAlerts(deadlines, items, "2026-09-20T09:00:00Z");
    expect(changed).toBe(true);
    expect(next[0].alert_stages_sent).toEqual(["warning", "normal"]);
    expect(next[1].alert_stages_sent).toBeUndefined();
  });

  it("reports no change when nothing matches", () => {
    const deadlines = [{ id: "f1", title: "Berufung", due_date: "2026-09-22" }];
    expect(markCaseAlerts(deadlines, [], "2026-09-20T09:00:00Z").changed).toBe(false);
  });
});
