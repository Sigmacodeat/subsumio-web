import { describe, expect, test } from "vitest";
import { isQuietDay, notfristEscalationKey } from "@/lib/deadline-notify";

// Vienna wall-clock dates: 2026-09-26 = Samstag, 2026-09-27 = Sonntag,
// 2026-09-28 = Montag. isQuietDay wertet das Datum in Europe/Vienna aus.
const AT = { rechtsraumCountry: "AT" as const, rechtsraumState: "AT" };

describe("isQuietDay", () => {
  test("Samstag ist Ruhetag", () => {
    // 2026-09-26 10:00 UTC = Samstag mittags in Wien
    expect(isQuietDay(new Date("2026-09-26T10:00:00Z"), AT)).toBe(true);
  });

  test("Sonntag ist Ruhetag", () => {
    expect(isQuietDay(new Date("2026-09-27T10:00:00Z"), AT)).toBe(true);
  });

  test("Montag ist Werktag", () => {
    expect(isQuietDay(new Date("2026-09-28T10:00:00Z"), AT)).toBe(false);
  });

  test("gesetzlicher Feiertag ist Ruhetag (25.12. AT)", () => {
    // 2026-12-25 = Freitag, Weihnachten
    expect(isQuietDay(new Date("2026-12-25T10:00:00Z"), AT)).toBe(true);
  });

  test("AT-Kanzlei OHNE Bundesland (so speichert die Einstellungsseite): Feiertage greifen trotzdem", () => {
    // Bisher: isPublicHoliday ohne State → false → 25.12. war für jede echte
    // AT-Kanzlei ein normaler Freitag. 2026-10-26 = Montag, Nationalfeiertag.
    const atNoState = { rechtsraumCountry: "AT" as const };
    expect(isQuietDay(new Date("2026-12-25T10:00:00Z"), atNoState)).toBe(true);
    expect(isQuietDay(new Date("2026-10-26T10:00:00Z"), atNoState)).toBe(true);
    // Tag der Deutschen Einheit ist in AT kein Feiertag (Samstag 2026-10-03
    // wäre ohnehin Ruhetag, daher 2026-10-05 Montag und 2025-10-03 Freitag).
    expect(isQuietDay(new Date("2025-10-03T10:00:00Z"), atNoState)).toBe(false);
  });

  test("ohne Rechtsraum nur Wochenende, keine Feiertage (kein Raten)", () => {
    expect(isQuietDay(new Date("2026-12-25T10:00:00Z"), {})).toBe(false);
  });

  test("Werktag ohne Feiertag bleibt Werktag", () => {
    // 2026-09-28 = Montag, kein Feiertag AT/DE/CH
    expect(isQuietDay(new Date("2026-09-28T10:00:00Z"), AT)).toBe(false);
  });

  test("deadlineQuietDays=false deaktiviert Ruhetage komplett", () => {
    const settings = { ...AT, deadlineQuietDays: false };
    expect(isQuietDay(new Date("2026-09-26T10:00:00Z"), settings)).toBe(false);
    expect(isQuietDay(new Date("2026-12-25T10:00:00Z"), settings)).toBe(false);
  });

  test("Default (undefined) = Ruhetage an", () => {
    expect(isQuietDay(new Date("2026-09-26T10:00:00Z"), {})).toBe(true);
  });

  test("UTC-Tag vs. Wien-Tag: Samstag 23:30 UTC ist in Wien bereits Sonntag", () => {
    // 2026-09-26 23:30 UTC = 2026-09-27 01:30 CEST → Sonntag → Ruhetag
    expect(isQuietDay(new Date("2026-09-26T23:30:00Z"), AT)).toBe(true);
  });
});

describe("notfristEscalationKey", () => {
  test("stabil für identische Frist", () => {
    const item = { title: "Berufung", dueDate: "2026-09-25", caseTitle: "Muster" };
    expect(notfristEscalationKey(item)).toBe(notfristEscalationKey({ ...item }));
  });

  test("unterscheidet Titel, Datum, Akte", () => {
    const base = { title: "Berufung", dueDate: "2026-09-25", caseTitle: "Muster" };
    expect(notfristEscalationKey({ ...base, title: "Andere" })).not.toBe(
      notfristEscalationKey(base)
    );
    expect(notfristEscalationKey({ ...base, dueDate: "2026-09-26" })).not.toBe(
      notfristEscalationKey(base)
    );
    expect(notfristEscalationKey({ ...base, caseTitle: "Andere Akte" })).not.toBe(
      notfristEscalationKey(base)
    );
  });

  test("fehlende Akte ist kein Crash", () => {
    expect(() => notfristEscalationKey({ title: "X", dueDate: "2026-01-01" })).not.toThrow();
  });
});
