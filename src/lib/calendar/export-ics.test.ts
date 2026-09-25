import { describe, expect, it } from "vitest";
import { generateIcal } from "./export-ics";

const unfold = (ics: string) =>
  ics
    .replace(/\r\n[ \t]/g, "")
    .split("\r\n")
    .filter(Boolean);

describe("generateIcal (Kalender-Export)", () => {
  const ics = generateIcal([
    {
      id: "frist:legal/deadlines/a",
      title: "Klagebeantwortung in der Rechtssache gegen die Österreichische Versicherung AG",
      date: "2026-07-20",
      kind: "deadline",
      vorfristDate: "2026-07-13",
    },
    {
      id: "legal/appointments/late",
      title: "Nachtsitzung",
      date: "2026-12-10",
      time: "23:30",
      durationMin: 60,
      kind: "appointment",
    },
  ]);
  const lines = unfold(ics);

  it("sets the absolute Vorfrist alarm in UTC (08:00 Vienna summer time = 06:00Z)", () => {
    expect(lines).toContain("TRIGGER;VALUE=DATE-TIME:20260713T060000Z");
  });

  it("declares the Vienna time zone it references and rolls the end past midnight", () => {
    expect(lines).toContain("BEGIN:VTIMEZONE");
    expect(lines).toContain("TZID:Europe/Vienna");
    expect(lines).toContain("DTSTART;TZID=Europe/Vienna:20261210T233000");
    expect(lines).toContain("DTEND;TZID=Europe/Vienna:20261211T003000");
  });

  it("uses CRLF and folds long lines to 75 octets", () => {
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
    for (const physical of ics.split("\r\n")) {
      expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
    }
  });
});
