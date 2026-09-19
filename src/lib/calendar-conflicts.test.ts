import { describe, it, expect } from "vitest";
import {
  findCalendarConflicts,
  conflictsForEntry,
  toLocalIsoDate,
  parseTimeToMinutes,
  minutesToTime,
  type CalendarEntry,
} from "./calendar-conflicts";

const appt = (id: string, date: string, time?: string, extra: Partial<CalendarEntry> = {}) =>
  ({ id, title: id, date, time, kind: "appointment", ...extra }) as CalendarEntry;
const frist = (id: string, date: string, extra: Partial<CalendarEntry> = {}) =>
  ({ id, title: id, date, kind: "deadline", ...extra }) as CalendarEntry;

describe("toLocalIsoDate", () => {
  it("uses the local calendar day, not the UTC day", () => {
    // Local midnight: toISOString() would roll back to the previous day east of UTC.
    expect(toLocalIsoDate(new Date(2026, 8, 20))).toBe("2026-09-20");
    expect(toLocalIsoDate(new Date(2026, 8, 19, 23, 59))).toBe("2026-09-19");
    expect(toLocalIsoDate(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });
});

describe("time helpers", () => {
  it("parses HH:MM and rejects garbage", () => {
    expect(parseTimeToMinutes("09:30")).toBe(570);
    expect(parseTimeToMinutes("9:05")).toBe(545);
    expect(parseTimeToMinutes("25:00")).toBeNull();
    expect(parseTimeToMinutes("")).toBeNull();
    expect(parseTimeToMinutes(undefined)).toBeNull();
  });
  it("formats minutes and clamps at midnight", () => {
    expect(minutesToTime(570)).toBe("09:30");
    expect(minutesToTime(24 * 60 + 30)).toBe("23:59");
  });
});

describe("findCalendarConflicts", () => {
  it("detects overlapping appointments on the same day", () => {
    const c = findCalendarConflicts([
      appt("A", "2026-10-08", "09:00", { durationMin: 60 }),
      appt("B", "2026-10-08", "09:30", { durationMin: 30 }),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "overlap", date: "2026-10-08" });
    expect(c[0].a.id).toBe("A");
    expect(c[0].b.id).toBe("B");
  });

  it("treats back-to-back appointments as no conflict", () => {
    expect(
      findCalendarConflicts([
        appt("A", "2026-10-08", "09:00", { durationMin: 60 }),
        appt("B", "2026-10-08", "10:00"),
      ])
    ).toEqual([]);
  });

  it("uses the default duration of 60 minutes", () => {
    expect(
      findCalendarConflicts([appt("A", "2026-10-08", "09:00"), appt("B", "2026-10-08", "09:59")])
    ).toHaveLength(1);
  });

  it("ignores appointments on different days and all-day appointments", () => {
    expect(
      findCalendarConflicts([
        appt("A", "2026-10-08", "09:00"),
        appt("B", "2026-10-09", "09:00"),
        appt("C", "2026-10-08"),
      ])
    ).toEqual([]);
  });

  it("reports every overlapping pair once", () => {
    const c = findCalendarConflicts([
      appt("A", "2026-10-08", "09:00", { durationMin: 120 }),
      appt("B", "2026-10-08", "09:30"),
      appt("C", "2026-10-08", "10:00"),
    ]);
    expect(c.map((x) => `${x.a.id}-${x.b.id}`).sort()).toEqual(["A-B", "A-C", "B-C"]);
  });

  it("does not flag the same appointment mirrored from two sources", () => {
    expect(
      findCalendarConflicts([
        { ...appt("local", "2026-10-08", "09:00"), title: "Mandantengespräch" },
        { ...appt("outlook", "2026-10-08", "09:00"), title: "  mandantengespräch " },
      ])
    ).toEqual([]);
  });

  it("flags a deadline on a hearing day", () => {
    const c = findCalendarConflicts([
      frist("Berufungsfrist", "2026-11-05"),
      appt("Tagsatzung", "2026-11-05", "09:30", { isHearing: true }),
      appt("Besprechung", "2026-11-05", "14:00"),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "deadline_on_hearing_day", date: "2026-11-05" });
    expect(c[0].a.id).toBe("Berufungsfrist");
    expect(c[0].b.id).toBe("Tagsatzung");
  });

  it("ignores done entries and invalid dates", () => {
    expect(
      findCalendarConflicts([
        frist("F", "2026-11-05", { done: true }),
        appt("T", "2026-11-05", "09:30", { isHearing: true }),
        appt("X", "not-a-date", "09:30"),
        appt("Y", "not-a-date", "09:30"),
      ])
    ).toEqual([]);
  });

  it("sorts conflicts by date", () => {
    const c = findCalendarConflicts([
      frist("F2", "2026-12-01"),
      appt("H2", "2026-12-01", undefined, { isHearing: true }),
      frist("F1", "2026-10-01"),
      appt("H1", "2026-10-01", undefined, { isHearing: true }),
    ]);
    expect(c.map((x) => x.date)).toEqual(["2026-10-01", "2026-12-01"]);
  });
});

describe("conflictsForEntry", () => {
  it("returns only conflicts involving the draft", () => {
    const existing = [
      appt("A", "2026-10-08", "09:00"),
      appt("B", "2026-10-08", "09:30"),
      appt("C", "2026-10-08", "15:00"),
    ];
    const c = conflictsForEntry(appt("draft", "2026-10-08", "15:30"), existing);
    expect(c).toHaveLength(1);
    expect(c[0].a.id).toBe("C");
  });

  it("does not collide an edited appointment with its stored version", () => {
    const existing = [appt("A", "2026-10-08", "09:00")];
    expect(conflictsForEntry(appt("A", "2026-10-08", "09:15"), existing)).toEqual([]);
  });
});
