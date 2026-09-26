import { describe, expect, test } from "vitest";
import { createAbsence, type AbsenceRecord } from "@/lib/absence";
import {
  createStaffMember,
  isVacationAbsence,
  vacationAccount,
  workdaysBetween,
} from "@/lib/staff";

const member = { ...createStaffMember({ name: "Mag. Muster", email: "muster@kanzlei.at" }) };

function urlaub(start: string, end: string, over: Partial<AbsenceRecord> = {}): AbsenceRecord {
  return {
    ...createAbsence({
      user_email: "muster@kanzlei.at",
      user_name: "Mag. Muster",
      delegate_email: "vertretung@kanzlei.at",
      delegate_name: "Vertretung",
      start_date: start,
      end_date: end,
      kind: "urlaub",
    }),
    ...over,
  };
}

describe("workdaysBetween — österreichische Feiertage", () => {
  test("Woche mit Ostermontag = 4 Tage", () => {
    // 2026: Ostermontag 6.4.
    expect(workdaysBetween("2026-04-06", "2026-04-10")).toBe(4);
  });

  test("Karfreitag ist ein Arbeitstag (seit 2019 kein allgemeiner Feiertag)", () => {
    expect(workdaysBetween("2026-04-03", "2026-04-03")).toBe(1);
  });

  test("8. Dezember zählt nicht", () => {
    // 2026-12-07 Mo … 2026-12-11 Fr, 8.12. Di
    expect(workdaysBetween("2026-12-07", "2026-12-11")).toBe(4);
  });
});

describe("vacationAccount", () => {
  const NOW = new Date("2026-07-01T10:00:00+02:00");

  test("28.12.–5.1. wird auf beide Jahre aufgeteilt", () => {
    const a = urlaub("2026-12-28", "2027-01-05");
    // 2026: 28.–31.12. = Mo–Do → 4; 2027: 1.1. Feiertag, 4./5.1. → 2 (6.1. außerhalb)
    expect(vacationAccount(member, [a], 2026, NOW).planned).toBe(4);
    expect(vacationAccount(member, [a], 2027, NOW).planned).toBe(2);
  });

  test("kind: urlaub ohne Freitext zählt; andere Arten nicht", () => {
    const a = urlaub("2026-08-03", "2026-08-07");
    expect(isVacationAbsence(a)).toBe(true);
    expect(vacationAccount(member, [a], 2026, NOW).planned).toBe(5);
    const krank = urlaub("2026-08-03", "2026-08-07", { kind: "krankheit", reason: "Urlaub" });
    expect(vacationAccount(member, [krank], 2026, NOW).planned).toBe(0);
  });

  test("ältere Einträge ohne Art werden am Grund erkannt", () => {
    const legacy = urlaub("2026-08-03", "2026-08-07", { kind: undefined, reason: "Sommerurlaub" });
    expect(isVacationAbsence(legacy)).toBe(true);
  });

  test("vergangener Urlaub mit status planned zählt als verbraucht", () => {
    const a = urlaub("2026-03-02", "2026-03-06", { status: "planned" });
    const acc = vacationAccount(member, [a], 2026, NOW);
    expect(acc.used).toBe(5);
    expect(acc.planned).toBe(0);
    expect(acc.remaining).toBe(20);
  });

  test("laufender Urlaub: vergangene Tage verbraucht, restliche geplant", () => {
    // Mo 29.6. – Fr 3.7.; heute Mi 1.7.
    const acc = vacationAccount(member, [urlaub("2026-06-29", "2026-07-03")], 2026, NOW);
    expect(acc.used).toBe(2);
    expect(acc.planned).toBe(3);
  });

  test("vorzeitig abgeschlossener Urlaub endet am Tag des Abschlusses", () => {
    const a = urlaub("2026-06-29", "2026-07-10", {
      status: "completed",
      updated_at: "2026-06-30T15:00:00Z",
    });
    const acc = vacationAccount(member, [a], 2026, NOW);
    expect(acc.used + acc.planned).toBe(2);
  });

  test("stornierter Urlaub zählt nicht", () => {
    const a = urlaub("2026-03-02", "2026-03-06", { status: "cancelled" });
    expect(vacationAccount(member, [a], 2026, NOW).used).toBe(0);
  });
});
