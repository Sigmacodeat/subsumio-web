import { describe, expect, it } from "vitest";
import {
  annotateDelegations,
  collectDueReminders,
  isClosedDeadline,
  markCaseDeadlines,
  nextDueStage,
  parseReminderStages,
  sentFields,
  type DueReminder,
  type ReminderPage,
} from "./deadline-reminders";
import type { AbsenceRecord } from "./absence";

const now = new Date("2026-09-17T06:00:00.000Z");
const inDays = (n: number) => new Date(Date.UTC(2026, 8, 17 + n)).toISOString().slice(0, 10);

const matter = (over: Partial<ReminderPage> & { slug: string }): ReminderPage => ({
  title: "Gruber ./. Bau AG",
  frontmatter: { case_number: "2026/101", status: "open" },
  ...over,
});

const deadlinePage = (slug: string, fm: Record<string, unknown>): ReminderPage => ({
  slug,
  title: String(fm.title ?? "Frist"),
  frontmatter: { type: "legal_deadline", case_slug: "legal/cases/1", ...fm },
});

describe("escalation stages", () => {
  it("fires at 7, 3, 1 and 0 days and each stage only once", () => {
    const d = { due_date: inDays(3) };
    expect(nextDueStage(d, inDays(3), now)).toBe(3);
    expect(nextDueStage({ ...d, reminder_stages_sent: [7, 3] }, inDays(3), now)).toBeUndefined();
    expect(nextDueStage({ ...d, reminder_stages_sent: [7] }, inDays(1), now)).toBe(1);
    expect(nextDueStage({}, inDays(8), now)).toBeUndefined();
    expect(nextDueStage({}, inDays(0), now)).toBe(0);
  });

  it("treats done, cancelled and rejected deadlines as closed", () => {
    expect(isClosedDeadline({ status: "done" })).toBe(true);
    expect(isClosedDeadline({ status: "Erledigt" })).toBe(true);
    expect(isClosedDeadline({ review_status: "rejected" })).toBe(true);
    expect(isClosedDeadline({ status: "pending" })).toBe(false);
  });
});

describe("collectDueReminders", () => {
  it("reminds for standalone deadline records, not only for deadlines inside a matter", () => {
    const groups = collectDueReminders(
      [matter({ slug: "legal/cases/1" })],
      [
        deadlinePage("legal/deadlines/import-1", { title: "Berufung", due_date: inDays(3) }),
        deadlinePage("legal/deadlines/import-2", { title: "Spät", due_date: inDays(20) }),
      ],
      now
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].caseLabel).toBe("2026/101");
    expect(groups[0].items.map((i) => [i.title, i.stage])).toEqual([["Berufung", 3]]);
    expect(groups[0].items[0].ref).toEqual({ kind: "page", slug: "legal/deadlines/import-1" });
  });

  it("leaves out done, deleted, overdue and archived-matter deadlines", () => {
    const groups = collectDueReminders(
      [
        matter({ slug: "legal/cases/1" }),
        matter({
          slug: "legal/cases/2",
          frontmatter: {
            case_number: "2026/102",
            status: "archived",
            deadlines: [{ title: "In Archivakte", due_date: inDays(1) }],
          },
        }),
      ],
      [
        deadlinePage("legal/deadlines/a", {
          title: "Erledigt",
          due_date: inDays(1),
          status: "done",
        }),
        deadlinePage("legal/deadlines/b", {
          title: "Gelöscht",
          due_date: inDays(1),
          status: "tombstoned",
        }),
        deadlinePage("legal/deadlines/c", { title: "Abgelaufen", due_date: inDays(-2) }),
        deadlinePage("legal/deadlines/d", {
          title: "Verworfen",
          due_date: inDays(1),
          review_status: "rejected",
        }),
        deadlinePage("legal/deadlines/e", {
          title: "In Archivakte",
          due_date: inDays(1),
          case_slug: "legal/cases/2",
        }),
      ],
      now
    );
    expect(groups).toEqual([]);
  });

  it("reminds once when a standalone deadline is also copied into the matter", () => {
    const groups = collectDueReminders(
      [
        matter({
          slug: "legal/cases/1",
          frontmatter: {
            case_number: "2026/101",
            deadlines: [
              { id: "page:legal/deadlines/a", title: "Berufung", due_date: inDays(1) },
              { title: "Berufung", due_date: inDays(1) },
              { id: "own-1", title: "Eigene Frist", due_date: inDays(1) },
            ],
          },
        }),
      ],
      [deadlinePage("legal/deadlines/a", { title: "Berufung", due_date: inDays(1) })],
      now
    );
    expect(groups[0].items.map((i) => `${i.title}:${i.ref.kind}`)).toEqual([
      "Berufung:page",
      "Eigene Frist:case",
    ]);
  });

  it("reminds for a deadline without a matter and names it as such", () => {
    const groups = collectDueReminders(
      [],
      [
        deadlinePage("legal/deadlines/x", {
          title: "Ohne Akte",
          due_date: inDays(0),
          case_slug: "",
        }),
      ],
      now
    );
    expect(groups[0]).toMatchObject({ caseSlug: undefined, caseLabel: "Ohne Akte" });
    expect(groups[0].items[0].stage).toBe(0);
  });

  it("reports a reached Vorfrist once, even when no stage is due", () => {
    const page = deadlinePage("legal/deadlines/v", {
      title: "Vorfrist-Fall",
      due_date: inDays(10),
      vorfrist_date: inDays(-1),
    });
    const [group] = collectDueReminders([matter({ slug: "legal/cases/1" })], [page], now);
    expect(group.items[0]).toMatchObject({ stage: undefined, vorfristReached: true });
    const sent = deadlinePage("legal/deadlines/v", {
      ...page.frontmatter,
      vorfrist_reminder_sent_at: "2026-09-16T06:00:00.000Z",
    });
    expect(collectDueReminders([matter({ slug: "legal/cases/1" })], [sent], now)).toEqual([]);
  });
});

describe("recording what was sent", () => {
  it("records every stage already passed, so no later run repeats an earlier one", () => {
    // First seen three days before: the seven-day stage must not fire tomorrow.
    expect(
      sentFields({}, { stage: 3, vorfristReached: false, daysRemaining: 3 }, "T")
        .reminder_stages_sent
    ).toEqual([7, 3]);
    expect(
      sentFields({}, { stage: 0, vorfristReached: false, daysRemaining: 0 }, "T")
        .reminder_stages_sent
    ).toEqual([7, 3, 1, 0]);
  });

  it("adds the stage without losing earlier ones", () => {
    expect(
      sentFields(
        { reminder_stages_sent: [7] },
        { stage: 3, vorfristReached: false, daysRemaining: 3 },
        "T"
      )
    ).toEqual({
      reminder_sent_at: "T",
      reminder_stages_sent: [7, 3],
    });
    expect(
      sentFields({}, { stage: undefined, vorfristReached: true, daysRemaining: 9 }, "T")
    ).toEqual({
      vorfrist_reminder_sent_at: "T",
    });
  });

  it("marks only the reminded deadlines of a freshly read matter and keeps the rest", () => {
    const item: DueReminder = {
      ref: {
        kind: "case",
        caseSlug: "legal/cases/1",
        id: "d1",
        title: "Frist",
        dueDate: inDays(1),
      },
      title: "Frist",
      dueDate: inDays(1),
      daysRemaining: 1,
      stage: 1,
      vorfristReached: false,
      isNotfrist: false,
      unreviewedAi: false,
    };
    const { deadlines, changed } = markCaseDeadlines(
      [
        { id: "d1", title: "Frist", due_date: inDays(1) },
        { id: "d2", title: "Andere", due_date: inDays(1) },
      ],
      [item],
      "T"
    );
    expect(changed).toBe(true);
    expect(deadlines[0]).toMatchObject({ reminder_stages_sent: [7, 3, 1], reminder_sent_at: "T" });
    expect(deadlines[1]).toEqual({ id: "d2", title: "Andere", due_date: inDays(1) });
  });

  it("matches by title and date when the entry has no id", () => {
    const item: DueReminder = {
      ref: { kind: "case", caseSlug: "legal/cases/1", title: "Frist", dueDate: inDays(0) },
      title: "Frist",
      dueDate: inDays(0),
      daysRemaining: 0,
      stage: 0,
      vorfristReached: false,
      isNotfrist: false,
      unreviewedAi: false,
    };
    const { deadlines, changed } = markCaseDeadlines(
      [{ title: "Frist", date: inDays(0) }],
      [item],
      "T"
    );
    expect(changed).toBe(true);
    expect(deadlines[0].reminder_stages_sent).toEqual([7, 3, 1, 0]);
  });
});

describe("unconfirmed AI deadlines", () => {
  it("still remind, but are flagged as an unconfirmed AI suggestion", () => {
    const groups = collectDueReminders(
      [matter({ slug: "legal/cases/1" })],
      [
        deadlinePage("d/ai", { title: "Berufung", due_date: inDays(3), source: "ai_document" }),
        deadlinePage("d/manual", {
          title: "Klagebeantwortung",
          due_date: inDays(3),
          review_status: "unreviewed",
        }),
        deadlinePage("d/confirmed", {
          title: "Rekurs",
          due_date: inDays(3),
          source: "ai_document",
          review_status: "approved",
        }),
      ],
      now
    );
    const byTitle = Object.fromEntries(groups.flatMap((g) => g.items).map((i) => [i.title, i]));
    expect(byTitle.Berufung.unreviewedAi).toBe(true);
    // Manually entered deadlines start "unreviewed" too — no AI origin, no flag.
    expect(byTitle.Klagebeantwortung.unreviewedAi).toBe(false);
    expect(byTitle.Rekurs.unreviewedAi).toBe(false);
  });
});

describe("wiedervorlagen (legal_follow_up)", () => {
  const followUp = (slug: string, fm: Record<string, unknown>): ReminderPage => ({
    slug,
    title: String(fm.title ?? "WV"),
    frontmatter: { type: "legal_follow_up", ...fm },
  });

  it("reminds for open follow-ups on their date, staged like deadlines", () => {
    const groups = collectDueReminders([matter({ slug: "legal/cases/1" })], [], now, [
      followUp("legal/wiedervorlagen/a", {
        title: "Schriftsatz nachreichen",
        date: inDays(3),
        case_slug: "legal/cases/1",
        completed: false,
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].caseLabel).toBe("2026/101");
    expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0].isFollowUp).toBe(true);
    expect(groups[0].items[0].stage).toBe(3);
    expect(groups[0].items[0].ref).toEqual({ kind: "page", slug: "legal/wiedervorlagen/a" });
  });

  it("skips completed follow-ups and those on archived matters", () => {
    const groups = collectDueReminders(
      [
        matter({ slug: "legal/cases/1" }),
        matter({ slug: "legal/cases/old", frontmatter: { status: "archived" } }),
      ],
      [],
      now,
      [
        followUp("legal/wiedervorlagen/done", {
          title: "Erledigt",
          date: inDays(0),
          case_slug: "legal/cases/1",
          completed: true,
        }),
        followUp("legal/wiedervorlagen/archived", {
          title: "Archiviert",
          date: inDays(0),
          case_slug: "legal/cases/old",
          completed: false,
        }),
        followUp("legal/wiedervorlagen/open", {
          title: "Offen",
          date: inDays(0),
          case_slug: "legal/cases/1",
          completed: false,
        }),
      ]
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.title)).toEqual(["Offen"]);
  });

  it("overdue follow-ups do not remind (daily digest reports them)", () => {
    const groups = collectDueReminders([], [], now, [
      followUp("legal/wiedervorlagen/late", { title: "Überfällig", date: inDays(-2) }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("a follow-up without a case groups under 'Ohne Akte'", () => {
    const groups = collectDueReminders([], [], now, [
      followUp("legal/wiedervorlagen/free", { title: "Freie WV", date: inDays(1) }),
    ]);
    expect(groups[0].caseLabel).toBe("Ohne Akte");
    expect(groups[0].items[0].isFollowUp).toBe(true);
  });

  it("sent stages on the follow-up frontmatter are respected", () => {
    const groups = collectDueReminders([], [], now, [
      followUp("legal/wiedervorlagen/sent", {
        title: "Schon erinnert",
        date: inDays(3),
        reminder_stages_sent: [7, 3],
      }),
    ]);
    expect(groups).toHaveLength(0);
  });
});

describe("annotateDelegations", () => {
  const absence = (over: Partial<AbsenceRecord> = {}): AbsenceRecord => ({
    id: "absence-1",
    user_email: "mueller@kanzlei.at",
    user_name: "RA Müller",
    delegate_email: "vertreter@kanzlei.at",
    delegate_name: "RA Vertreter",
    start_date: "2026-09-10",
    end_date: "2026-09-25",
    status: "active",
    auto_route_enabled: true,
    reassigned_rundown_items: [],
    forwarded_deadlines: [],
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...over,
  });

  it("names the stand-in when the responsible lawyer is absent", () => {
    const groups = collectDueReminders(
      [matter({ slug: "legal/cases/1" })],
      [deadlinePage("d/1", { title: "Berufung", due_date: inDays(1), case_slug: "legal/cases/1" })],
      now
    );
    annotateDelegations(groups, new Map([["legal/cases/1", "RA Müller"]]), [absence()], now);
    expect(groups[0].delegation).toEqual({
      responsible: "RA Müller",
      delegateName: "RA Vertreter",
      delegateEmail: "vertreter@kanzlei.at",
      until: "2026-09-25",
    });
  });

  it("ignores absences outside their window and cancelled ones", () => {
    const groups = collectDueReminders(
      [matter({ slug: "legal/cases/1" })],
      [deadlinePage("d/1", { title: "Berufung", due_date: inDays(1), case_slug: "legal/cases/1" })],
      now
    );
    const cases = new Map([["legal/cases/1", "RA Müller"]]);
    annotateDelegations(
      groups,
      cases,
      [
        absence({ status: "cancelled" }),
        absence({ id: "a2", start_date: "2026-12-01", end_date: "2026-12-10" }),
      ],
      now
    );
    expect(groups[0].delegation).toBeUndefined();
  });

  it("leaves groups without a responsible lawyer or without a case untouched", () => {
    const groups = collectDueReminders(
      [],
      [deadlinePage("d/free", { title: "Freie Frist", due_date: inDays(1) })],
      now
    );
    annotateDelegations(groups, new Map(), [absence()], now);
    expect(groups[0].delegation).toBeUndefined();
  });

  it("a deadline's own responsible field wins over the matter's lawyer", () => {
    const groups = collectDueReminders(
      [matter({ slug: "legal/cases/1" })],
      [
        deadlinePage("d/own", {
          title: "Berufung",
          due_date: inDays(1),
          case_slug: "legal/cases/1",
          responsible: "vertreter@kanzlei.at",
        }),
      ],
      now
    );
    // The matter's lawyer is present — no group delegation. The item's own
    // responsible person is absent → item-level delegation.
    const itemAbsent = absence({
      user_email: "vertreter@kanzlei.at",
      user_name: "RA Vertreter",
      delegate_name: "RA Dritte",
      delegate_email: "dritte@kanzlei.at",
    });
    annotateDelegations(groups, new Map([["legal/cases/1", "RA Müller"]]), [itemAbsent], now);
    expect(groups[0].delegation).toBeUndefined();
    expect(groups[0].items[0].delegation).toEqual({
      responsible: "vertreter@kanzlei.at",
      delegateName: "RA Dritte",
      delegateEmail: "dritte@kanzlei.at",
      until: "2026-09-25",
    });
  });

  it("item-level delegation coexists with case-level delegation", () => {
    const groups = collectDueReminders(
      [matter({ slug: "legal/cases/1" })],
      [deadlinePage("d/1", { title: "Berufung", due_date: inDays(1), case_slug: "legal/cases/1" })],
      now
    );
    annotateDelegations(groups, new Map([["legal/cases/1", "RA Müller"]]), [absence()], now);
    expect(groups[0].delegation?.delegateName).toBe("RA Vertreter");
    expect(groups[0].items[0].delegation).toBeUndefined(); // no own responsible → case-level only
  });
});

describe("parseReminderStages (firm-configured stages)", () => {
  it("parses a comma-separated settings string into descending day offsets", () => {
    expect(parseReminderStages("14,7,3,1,0")).toEqual([14, 7, 3, 1, 0]);
    expect(parseReminderStages("30, 7,1")).toEqual([30, 7, 1]);
    expect(parseReminderStages([10, 2])).toEqual([10, 2]);
  });

  it("dedupes, sorts and drops invalid entries", () => {
    expect(parseReminderStages("7,7,3,abc,-2,999")).toEqual([7, 3]);
  });

  it("falls back to the statutory-safe default on empty/garbage input", () => {
    for (const bad of ["", "abc", null, undefined, {}, [], "  , ,"]) {
      expect(parseReminderStages(bad)).toEqual([7, 3, 1, 0]);
    }
  });

  it("custom stages drive nextDueStage and collectDueReminders", () => {
    const stages = parseReminderStages("14,2");
    expect(nextDueStage({}, inDays(14), now, stages)).toBe(14);
    // 7 days out: the 14-day stage already passed → it fires (min of due).
    expect(nextDueStage({}, inDays(7), now, stages)).toBe(14);
    expect(nextDueStage({ reminder_stages_sent: [14] }, inDays(7), now, stages)).toBeUndefined();
    expect(nextDueStage({}, inDays(1), now, stages)).toBe(2);
    expect(nextDueStage({}, inDays(20), now, stages)).toBeUndefined();

    const groups = collectDueReminders(
      [],
      [deadlinePage("d/custom", { title: "14-Tage-Frist", due_date: inDays(14) })],
      now,
      [],
      stages
    );
    expect(groups[0].items[0].stage).toBe(14);
  });

  it("sentFields marks only configured stages as passed", () => {
    const stages = parseReminderStages("14,2,0");
    expect(
      sentFields({}, { stage: 2, vorfristReached: false, daysRemaining: 2 }, "T", stages)
        .reminder_stages_sent
    ).toEqual([14, 2]);
  });
});
