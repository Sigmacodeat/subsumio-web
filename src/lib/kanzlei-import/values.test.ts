import { describe, expect, it } from "vitest";
import {
  parseAmount,
  parseCaseStatus,
  parseContactRole,
  parseDate,
  parseMinutes,
  parseYesNo,
} from "./values";

describe("parseDate", () => {
  it("reads Austrian, ISO and Excel dates", () => {
    expect(parseDate("31.12.2026")).toBe("2026-12-31");
    expect(parseDate("1.3.26")).toBe("2026-03-01");
    expect(parseDate("05/10/2026")).toBe("2026-10-05");
    expect(parseDate("2026-12-31T00:00:00Z")).toBe("2026-12-31");
    expect(parseDate("17.09.2026 14:30")).toBe("2026-09-17");
    expect(parseDate("46282")).toBe("2026-09-17");
  });
  it("refuses dates that do not exist instead of rolling over", () => {
    expect(parseDate("31.02.2026")).toBeNull();
    expect(parseDate("13.13.2026")).toBeNull();
    expect(parseDate("morgen")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("parseAmount", () => {
  it("reads euro amounts in both notations", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("€ 250,-")).toBe(250);
    expect(parseAmount("280")).toBe(280);
    expect(parseAmount("1.500")).toBe(1500);
    expect(parseAmount("2,5")).toBe(2.5);
    expect(parseAmount("viel")).toBeNull();
  });
});

describe("parseMinutes", () => {
  it("reads h:mm, the column unit and explicit units", () => {
    expect(parseMinutes("1:30", "minutes")).toBe(90);
    expect(parseMinutes("01:30:00", "hours")).toBe(90);
    expect(parseMinutes("45", "minutes")).toBe(45);
    expect(parseMinutes("0,75", "hours")).toBe(45);
    expect(parseMinutes("1,5 h", "minutes")).toBe(90);
    expect(parseMinutes("20 min", "hours")).toBe(20);
    expect(parseMinutes("2 Std", "minutes")).toBe(120);
  });
  it("refuses empty, zero and implausible durations", () => {
    expect(parseMinutes("", "minutes")).toBeNull();
    expect(parseMinutes("0", "minutes")).toBeNull();
    expect(parseMinutes("30", "hours")).toBeNull();
  });
});

describe("status words", () => {
  it("maps yes/no, matter states and contact roles", () => {
    expect(parseYesNo("Ja")).toBe(true);
    expect(parseYesNo("x")).toBe(true);
    expect(parseYesNo("nein")).toBe(false);
    expect(parseYesNo("vielleicht")).toBeNull();
    expect(parseCaseStatus("Erledigt")).toEqual({ status: "archived", known: true });
    expect(parseCaseStatus("laufend")).toEqual({ status: "open", known: true });
    expect(parseCaseStatus("in Klärung")).toEqual({ status: "open", known: false });
    expect(parseContactRole("Mandantin").role).toBe("client");
    expect(parseContactRole("Gegenanwalt").role).toBe("lawyer");
    expect(parseContactRole("Hausverwaltung")).toEqual({ role: "other", known: false });
  });
});
