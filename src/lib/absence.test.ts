import { describe, it, expect } from "vitest";
import {
  absenceDisplayStatus,
  activeDelegateFor,
  createAbsence,
  deadlineSlugsCoveredByAbsence,
  isAbsenceActive,
  type AbsenceRecord,
} from "@/lib/absence";

function absence(over: Partial<AbsenceRecord> = {}): AbsenceRecord {
  return {
    ...createAbsence({
      user_email: "huber@kanzlei.at",
      user_name: "Mag. Huber",
      delegate_email: "berger@kanzlei.at",
      delegate_name: "Dr. Berger",
      start_date: "2026-09-14",
      end_date: "2026-09-28",
    }),
    ...over,
  };
}

const DURING = new Date("2026-09-20T09:00:00Z");
const AFTER = new Date("2026-10-05T09:00:00Z");

describe("activeDelegateFor", () => {
  it("finds the stand-in by the lawyer's name", () => {
    expect(activeDelegateFor("Mag. Huber", [absence()], DURING)).toEqual({
      name: "Dr. Berger",
      email: "berger@kanzlei.at",
      until: "2026-09-28",
    });
  });

  it("finds the stand-in by e-mail, ignoring case and spacing", () => {
    expect(activeDelegateFor("  HUBER@kanzlei.at ", [absence()], DURING)?.name).toBe("Dr. Berger");
  });

  it("returns nothing outside the absence", () => {
    expect(activeDelegateFor("Mag. Huber", [absence()], AFTER)).toBeNull();
  });

  it("returns nothing for a cancelled absence", () => {
    expect(activeDelegateFor("Mag. Huber", [absence({ status: "cancelled" })], DURING)).toBeNull();
  });

  it("returns nothing when auto-routing is disabled for the absence", () => {
    expect(
      activeDelegateFor("Mag. Huber", [absence({ auto_route_enabled: false })], DURING)
    ).toBeNull();
  });

  it("returns nothing for another lawyer or an empty name", () => {
    expect(activeDelegateFor("Dr. Berger", [absence()], DURING)).toBeNull();
    expect(activeDelegateFor("", [absence()], DURING)).toBeNull();
    expect(activeDelegateFor(undefined, [absence()], DURING)).toBeNull();
  });
});

describe("isAbsenceActive", () => {
  const a = absence(); // 2026-09-14 → 2026-09-28

  it("is active inside the range", () => {
    expect(isAbsenceActive(a, DURING)).toBe(true);
  });

  it("counts the last day — the end date is a calendar day, not midnight", () => {
    // 10:00 UTC on the end date = 12:00 Vienna: the old midnight-UTC
    // comparison already read this as inactive.
    expect(isAbsenceActive(a, new Date("2026-09-28T10:00:00Z"))).toBe(true);
    // 22:30 UTC = 00:30 Vienna on the 29th — genuinely past the end.
    expect(isAbsenceActive(a, new Date("2026-09-28T22:30:00Z"))).toBe(false);
  });

  it("counts the first day", () => {
    expect(isAbsenceActive(a, new Date("2026-09-14T10:00:00Z"))).toBe(true);
  });

  it("is inactive before start, after end, and when cancelled", () => {
    expect(isAbsenceActive(a, new Date("2026-09-13T12:00:00Z"))).toBe(false);
    expect(isAbsenceActive(a, AFTER)).toBe(false);
    expect(isAbsenceActive(absence({ status: "cancelled" }), DURING)).toBe(false);
  });
});

describe("deadlineSlugsCoveredByAbsence", () => {
  const responsible = new Map([
    ["legal/cases/1", "Mag. Huber"],
    ["legal/cases/2", "Dr. Berger"],
  ]);

  function dl(slug: string, over: Record<string, unknown> = {}) {
    return { slug, case_slug: "legal/cases/1", due_date: "2026-09-20", ...over };
  }

  it("collects open deadlines of the absent lawyer inside the window", () => {
    expect(
      deadlineSlugsCoveredByAbsence(
        absence(),
        [dl("d/1"), dl("d/2", { due_date: "2026-09-28" })],
        responsible
      )
    ).toEqual(["d/1", "d/2"]);
  });

  it("skips deadlines outside the window, done, or on other lawyers' cases", () => {
    expect(
      deadlineSlugsCoveredByAbsence(
        absence(),
        [
          dl("d/early", { due_date: "2026-09-13" }),
          dl("d/late", { due_date: "2026-09-29" }),
          dl("d/done", { status: "erledigt" }),
          dl("d/rejected", { review_status: "rejected" }),
          dl("d/completed", { completed: true }),
          dl("d/other", { case_slug: "legal/cases/2" }),
          dl("d/nocase", { case_slug: undefined }),
        ],
        responsible
      )
    ).toEqual([]);
  });

  it("matches the absent user by e-mail as well", () => {
    const byEmail = new Map([["legal/cases/1", "huber@kanzlei.at"]]);
    expect(deadlineSlugsCoveredByAbsence(absence(), [dl("d/1")], byEmail)).toEqual(["d/1"]);
  });
});

describe("absenceDisplayStatus", () => {
  const NOW = new Date("2026-09-26T10:00:00+02:00");
  const running = { start_date: "2026-09-20", end_date: "2026-10-05" };

  it("gespeichertes 'completed' bei laufendem Zeitraum → Abgeschlossen (kein 'Aktiv')", () => {
    expect(absenceDisplayStatus(absence({ ...running, status: "completed" }), NOW)).toBe(
      "completed"
    );
  });

  it("storniert gewinnt immer", () => {
    expect(absenceDisplayStatus(absence({ ...running, status: "cancelled" }), NOW)).toBe(
      "cancelled"
    );
  });

  it("gespeichert 'planned' → Status nach Zeitraum (Europe/Vienna, letzter Tag zählt)", () => {
    expect(absenceDisplayStatus(absence({ ...running, status: "planned" }), NOW)).toBe("active");
    expect(
      absenceDisplayStatus(
        absence({ start_date: "2026-09-01", end_date: "2026-09-26", status: "planned" }),
        new Date("2026-09-26T23:30:00+02:00")
      )
    ).toBe("active");
    expect(
      absenceDisplayStatus(
        absence({ start_date: "2026-09-01", end_date: "2026-09-25", status: "planned" }),
        NOW
      )
    ).toBe("completed");
    expect(
      absenceDisplayStatus(
        absence({ start_date: "2026-10-01", end_date: "2026-10-05", status: "planned" }),
        NOW
      )
    ).toBe("planned");
  });
});
