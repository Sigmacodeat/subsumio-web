import { test, expect } from "vitest";
import {
  upcomingTaxDeadlines,
  shiftToWorkingDay,
  addDaysAndShift,
  einspruchDeadline,
  einspruchsbegruendungDeadline,
  zahlungsfristDeadline,
  verspaetungszuschlagDatum,
  berichtigungsfrist,
  festsetzungsverjaehrung,
  aussenpruefungVerjaehrung,
  antragsverjaehrung,
  vorauszahlungstermine,
  elsterFristverlaengerung,
  gewerbesteuerVorauszahlungen,
  RECURRING_DEADLINES,
} from "./tax-deadlines";

test("shiftToWorkingDay moves Sunday to Monday", () => {
  const sunday = new Date("2025-06-15"); // Sunday
  const shifted = shiftToWorkingDay(sunday);
  expect(shifted.getDay()).not.toBe(0);
  expect(shifted.getDay()).not.toBe(6);
});

test("shiftToWorkingDay moves Saturday to Monday", () => {
  const saturday = new Date("2025-06-14"); // Saturday
  const shifted = shiftToWorkingDay(saturday);
  expect(shifted.getDay()).toBe(1);
});

test("shiftToWorkingDay keeps weekday unchanged", () => {
  const wednesday = new Date("2025-06-18");
  const shifted = shiftToWorkingDay(wednesday);
  expect(shifted.toISOString().split("T")[0]).toBe("2025-06-18");
});

test("shiftToWorkingDay moves holiday to next working day", () => {
  const newYear = new Date("2025-01-01"); // New Year's Day
  const shifted = shiftToWorkingDay(newYear);
  expect(shifted.toISOString().split("T")[0]).toBe("2025-01-02"); // Thursday
});

test("addDaysAndShift adds days then shifts", () => {
  const base = new Date("2025-06-13"); // Friday
  const result = addDaysAndShift(base, 2); // Friday + 2 = Sunday → Monday
  expect(result.getDay()).toBe(1);
});

test("upcomingTaxDeadlines returns sorted entries", () => {
  const deadlines = upcomingTaxDeadlines(new Date("2025-06-01"), 90);
  expect(deadlines.length).toBeGreaterThan(0);
  for (let i = 1; i < deadlines.length; i++) {
    expect(deadlines[i].dueDate >= deadlines[i - 1].dueDate).toBe(true);
  }
});

test("upcomingTaxDeadlines entries have valid fields", () => {
  const deadlines = upcomingTaxDeadlines(new Date("2025-06-01"), 90);
  for (const d of deadlines) {
    expect(d.id).toBeTruthy();
    expect(d.label).toBeTruthy();
    expect(d.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.recurring).toBeTruthy();
    expect(typeof d.daysRemaining).toBe("number");
    expect(typeof d.isOverdue).toBe("boolean");
    expect(typeof d.isUrgent).toBe("boolean");
  }
});

test("RECURRING_DEADLINES includes monthly and annual entries", () => {
  const monthly = RECURRING_DEADLINES.filter((d) => d.recurring === "monthly");
  const annual = RECURRING_DEADLINES.filter((d) => d.recurring === "annually");
  expect(monthly.length).toBeGreaterThan(0);
  expect(annual.length).toBeGreaterThan(0);
  expect(RECURRING_DEADLINES.some((d) => d.type === "UStVA")).toBe(true);
  expect(RECURRING_DEADLINES.some((d) => d.type === "ESt")).toBe(true);
});

test("einspruchDeadline adds 1 month and shifts", () => {
  const d = einspruchDeadline("2025-06-15");
  expect(d.getMonth()).toBe(6); // July (0-indexed)
  expect(d.getDay()).not.toBe(0);
  expect(d.getDay()).not.toBe(6);
});

test("festsetzungsverjaehrung returns Dec 31 of year + 4", () => {
  const d = festsetzungsverjaehrung(2024, false);
  expect(d.getFullYear()).toBe(2028);
  expect(d.getMonth()).toBe(11);
  expect(d.getDate()).toBe(31);
});

test("festsetzungsverjaehrung with Hinterziehung is 10 years", () => {
  const d = festsetzungsverjaehrung(2024, true);
  expect(d.getFullYear()).toBe(2034);
});

test("einspruchsbegruendungDeadline adds 1 month (§ 355 AO)", () => {
  const d = einspruchsbegruendungDeadline("2025-05-10");
  expect(d.getMonth()).toBe(5); // June
  expect(d.getDate()).toBe(10);
});

test("zahlungsfristDeadline adds 1 month (§ 226 AO)", () => {
  const d = zahlungsfristDeadline("2025-03-01");
  expect(d.getMonth()).toBe(3); // April
});

test("verspaetungszuschlagDatum returns next day (§ 234 AO)", () => {
  const d = verspaetungszuschlagDatum("2025-07-31");
  expect(d.getDate()).toBe(1);
  expect(d.getMonth()).toBe(7); // August
});

test("berichtigungsfrist adds 1 month (§ 153 AO)", () => {
  const d = berichtigungsfrist("2025-06-15");
  expect(d.getMonth()).toBe(6); // July
});

test("aussenpruefungVerjaehrung normal is 4 years (§ 367 AO)", () => {
  expect(aussenpruefungVerjaehrung(2021).getFullYear()).toBe(2025);
});

test("aussenpruefungVerjaehrung leichtfertig is 5 years", () => {
  expect(aussenpruefungVerjaehrung(2021, "leichtfertig").getFullYear()).toBe(2026);
});

test("aussenpruefungVerjaehrung hinterziehung is 10 years", () => {
  expect(aussenpruefungVerjaehrung(2021, "hinterziehung").getFullYear()).toBe(2031);
});

test("antragsverjaehrung is 4 years (§ 149 AO)", () => {
  const d = antragsverjaehrung(2021);
  expect(d.getFullYear()).toBe(2025);
  expect(d.getMonth()).toBe(11);
  expect(d.getDate()).toBe(31);
});

test("vorauszahlungstermine returns 4 quarters (EStG § 56)", () => {
  const terms = vorauszahlungstermine(2025);
  expect(terms.length).toBe(4);
  expect(terms[0].quarter).toBe(1);
  expect(terms[3].quarter).toBe(4);
  const q1 = new Date(terms[0].dueDate);
  expect(q1.getMonth()).toBe(2); // March
});

test("elsterFristverlaengerung extends by 1 month (§ 168 AO)", () => {
  const d = elsterFristverlaengerung("2025-07-31");
  // July 31 + 1 month = Aug 31 (Sunday) → shifted to Sep 1
  expect(d.getMonth()).toBe(8); // September
  expect(d.getDate()).toBe(1);
});

test("gewerbesteuerVorauszahlungen returns 4 quarters (GewStG § 9)", () => {
  const terms = gewerbesteuerVorauszahlungen(2025);
  expect(terms.length).toBe(4);
  const q1 = new Date(terms[0].dueDate);
  expect(q1.getMonth()).toBe(3); // April
});
