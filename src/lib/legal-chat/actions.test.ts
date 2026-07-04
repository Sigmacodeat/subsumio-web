// @vitest-environment node

import { describe, test, expect } from "vitest";
import { parseIntent } from "./actions";

// ─── Simple kind-only assertions (table-driven) ──────────────────────────────

describe("parseIntent — simple kind routing", () => {
  const cases: Array<[string, string]> = [
    // help
    ["hilfe", "help"],
    ["help", "help"],
    ["?", "help"],
    ["HILFE", "help"],
    // confirm
    ["ja", "confirm"],
    ["ok", "confirm"],
    ["okay", "confirm"],
    ["speichern", "confirm"],
    ["bestätigen", "confirm"],
    ["bestaetigen", "confirm"],
    ["JA", "confirm"],
    // cancel
    ["nein", "cancel"],
    ["abbrechen", "cancel"],
    ["verwerfen", "cancel"],
    ["stopp", "cancel"],
    ["stop", "cancel"],
    // list_cases
    ["akten", "list_cases"],
    ["fälle", "list_cases"],
    ["faelle", "list_cases"],
    ["liste akten", "list_cases"],
    ["case list", "list_cases"],
    // list_tasks
    ["aufgaben", "list_tasks"],
    ["offene aufgaben", "list_tasks"],
    ["todos", "list_tasks"],
    ["was ist zu tun", "list_tasks"],
    ["todo", "list_tasks"],
    // list_deadlines
    ["fristen", "list_deadlines"],
    ["offene fristen", "list_deadlines"],
    ["fristliste", "list_deadlines"],
    ["deadline list", "list_deadlines"],
    // today
    ["heute", "today"],
    ["was steht an", "today"],
    ["agenda", "today"],
    ["today", "today"],
    ["übersicht", "today"],
    // financial_overview
    ["offene kosten", "financial_overview"],
    ["umsatz", "financial_overview"],
    ["abrechnung", "financial_overview"],
    ["konto", "financial_overview"],
    ["finanzen", "financial_overview"],
    ["finanzielle übersicht", "financial_overview"],
    // list_appointments
    ["termine", "list_appointments"],
    ["anstehende termine", "list_appointments"],
    ["kalender", "list_appointments"],
    ["terminkalender", "list_appointments"],
    // bea / datev
    ["bea", "bea_status"],
    ["posteingang", "bea_status"],
    ["datev", "datev_status"],
    ["datev export", "datev_status"],
    // free_text
    ["irgendein text der auf nichts passt", "free_text"],
    ["", "free_text"],
    ["   ", "free_text"],
    ["was ist der Unterschied zwischen Kauf und Werkvertrag?", "free_text"],
  ];

  test.each(cases)("%# %s → %s", (input, expected) => {
    expect(parseIntent(input).kind).toBe(expected);
  });

  test("whitespace-only → free_text with empty text", () => {
    const r = parseIntent("   ");
    expect(r.kind).toBe("free_text");
    if (r.kind !== "free_text") return;
    expect(r.text).toBe("");
  });

  test("unrecognized text → free_text preserves text", () => {
    const r = parseIntent("irgendein text der auf nichts passt");
    expect(r.kind).toBe("free_text");
    if (r.kind !== "free_text") return;
    expect(r.text).toBe("irgendein text der auf nichts passt");
  });
});

// ─── Time Entry (table-driven for minutes/billable) ──────────────────────────

describe("parseIntent — time_entry", () => {
  const cases: Array<[string, number, string, boolean]> = [
    ["30m akt 2026-014 telefonat", 30, "2026-014", true],
    ["1,5h akt 2026-014", 90, "2026-014", true],
    ["2 std akt 2026-014 besprechung", 120, "2026-014", true],
    ["45 min akt 2026-014 nicht abrechenbar", 45, "2026-014", false],
    ["2 stunden akt 2026-014", 120, "2026-014", true],
    ["20 minute akt 2026-014 test", 20, "2026-014", true],
    ["0,5h akt 2026-014", 30, "2026-014", true],
    ["0m akt 2026-014", 1, "2026-014", true],
  ];

  test.each(cases)("%# %s → %i min, case %s, billable %s", (input, mins, caseRef, billable) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("time_entry");
    if (r.kind !== "time_entry") return;
    expect(r.minutes).toBe(mins);
    expect(r.caseRef).toBe(caseRef);
    expect(r.billable).toBe(billable);
  });

  test("time without case ref → free_text", () => {
    expect(parseIntent("30m telefonat").kind).toBe("free_text");
  });

  test("description defaults to 'Zeiterfassung via WhatsApp' when empty", () => {
    const r = parseIntent("30m akt 2026-014");
    expect(r.kind).toBe("time_entry");
    if (r.kind !== "time_entry") return;
    expect(r.description).toBe("Zeiterfassung via WhatsApp");
  });
});

// ─── Expense (table-driven) ───────────────────────────────────────────────────

describe("parseIntent — expense", () => {
  const cases: Array<[string, number, string, string, boolean]> = [
    ["auslage akt 2026-014: 12,50 eur kopien", 12.5, "2026-014", "kopien", true],
    ["kosten akt 2026-014: 50€ gerichtskosten", 50, "2026-014", "gerichtskosten", true],
    ["spesen akt 2026-014: 25,00 nicht abrechenbar", 25, "2026-014", "", false],
    ["auslage 15,90 parkgebühren", 15.9, "", "parkgebühren", true],
    ["kosten 50000", 50000, "", "", true],
    ["auslage akt 2026-014: 100€", 100, "2026-014", "", true],
  ];

  test.each(cases)("%# %s → amount %i, caseRef %s", (input, amount, caseRef) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("expense");
    if (r.kind !== "expense") return;
    expect(r.amount).toBe(amount);
    expect(r.caseRef).toBe(caseRef);
  });

  test("expense without amount → free_text", () => {
    expect(parseIntent("auslage akt 2026-014: kopien ohne betrag").kind).toBe("free_text");
  });
});

// ─── Case Note & Standalone Note ──────────────────────────────────────────────

describe("parseIntent — notes", () => {
  test("'notiz akt 2026-014: gegner bietet 8000 eur' → case_note", () => {
    const r = parseIntent("notiz akt 2026-014: gegner bietet 8000 eur");
    expect(r.kind).toBe("case_note");
    if (r.kind !== "case_note") return;
    expect(r.caseRef).toBe("2026-014");
    expect(r.note).toBe("gegner bietet 8000 eur");
  });

  test("'notiz zu akt 2026-014: rückruf erbeten' → case_note", () => {
    const r = parseIntent("notiz zu akt 2026-014: rückruf erbeten");
    expect(r.kind).toBe("case_note");
    if (r.kind !== "case_note") return;
    expect(r.caseRef).toBe("2026-014");
    expect(r.note).toBe("rückruf erbeten");
  });

  test("'notiz: müller angerufen, bittet rückruf' → standalone_note", () => {
    const r = parseIntent("notiz: müller angerufen, bittet rückruf");
    expect(r.kind).toBe("standalone_note");
    if (r.kind !== "standalone_note") return;
    expect(r.note).toBe("müller angerufen, bittet rückruf");
  });

  test("'notiz Müller angerufen' (without colon, no 'akt') → standalone_note", () => {
    const r = parseIntent("notiz Müller angerufen");
    expect(r.kind).toBe("standalone_note");
    if (r.kind !== "standalone_note") return;
    expect(r.note).toBe("Müller angerufen");
  });
});

// ─── Invoice Status (table-driven) ────────────────────────────────────────────

describe("parseIntent — invoice_status", () => {
  test.each([
    ["status akt 2026-014", "2026-014"],
    ["abrechnung akt 2026-014", "2026-014"],
    ["offen akt 2026-014", "2026-014"],
  ])("%# %s → invoice_status, caseRef %s", (input, caseRef) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("invoice_status");
    if (r.kind !== "invoice_status") return;
    expect(r.caseRef).toBe(caseRef);
  });
});

// ─── Task & Deadline ──────────────────────────────────────────────────────────

describe("parseIntent — task", () => {
  test.each([
    ["aufgabe akt 2026-014: klageentwurf prüfen", "2026-014", "klageentwurf prüfen", undefined],
    ["aufgabe akt 2026-014: klage prüfen bis 2026-07-01", "2026-014", "klage prüfen", "2026-07-01"],
    ["todo akt 2026-014: frist prüfen am 01.07.2026", "2026-014", "frist prüfen", "2026-07-01"],
    ["aufgabe klageentwurf prüfen", "", "klageentwurf prüfen", undefined],
  ])("%# %s", (input, caseRef, title, dueDate) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("task");
    if (r.kind !== "task") return;
    expect(r.caseRef).toBe(caseRef);
    expect(r.title).toBe(title);
    expect(r.dueDate).toBe(dueDate);
  });
});

describe("parseIntent — deadline", () => {
  test("'frist akt 2026-014: Berufung 2026-07-01' → deadline", () => {
    const r = parseIntent("frist akt 2026-014: Berufung 2026-07-01");
    expect(r.kind).toBe("deadline");
    if (r.kind !== "deadline") return;
    expect(r.caseRef).toBe("2026-014");
    expect(r.title).toBe("Berufung");
    expect(r.dueDate).toBe("2026-07-01");
  });

  test("'termin akt 2026-014: mündliche Verhandlung 15.03.2026' → deadline with German date", () => {
    const r = parseIntent("termin akt 2026-014: mündliche Verhandlung 15.03.2026");
    expect(r.kind).toBe("deadline");
    if (r.kind !== "deadline") return;
    expect(r.dueDate).toBe("2026-03-15");
  });

  test("deadline without date → free_text", () => {
    expect(parseIntent("frist akt 2026-014: irgendwann").kind).toBe("free_text");
  });
});

// ─── Workflow updates ─────────────────────────────────────────────────────────

describe("parseIntent — workflow updates", () => {
  test("task reschedule command", () => {
    const r = parseIntent("aufgabe verschieben akt 2026-014: klageentwurf auf 2026-07-03");
    expect(r.kind).toBe("update_task");
    if (r.kind !== "update_task") return;
    expect(r.caseRef).toBe("2026-014");
    expect(r.query).toBe("klageentwurf");
    expect(r.dueDate).toBe("2026-07-03");
  });

  test("task delegate command", () => {
    const r = parseIntent("aufgabe delegieren akt 2026-014: klageentwurf an Anna");
    expect(r.kind).toBe("delegate_task");
    if (r.kind !== "delegate_task") return;
    expect(r.assignee).toBe("Anna");
  });

  test("deadline reschedule and cancel commands", () => {
    const move = parseIntent("frist verschieben akt 2026-014: Berufung auf 08.07.2026");
    expect(move.kind).toBe("update_deadline");
    if (move.kind !== "update_deadline") return;
    expect(move.dueDate).toBe("2026-07-08");

    const cancel = parseIntent("frist streichen akt 2026-014: Berufung");
    expect(cancel.kind).toBe("cancel_deadline");
  });

  test("appointment reschedule and cancel commands", () => {
    const move = parseIntent("termin verschieben akt 2026-014: Verhandlung auf 16.07.2026 09:30");
    expect(move.kind).toBe("update_appointment");
    if (move.kind !== "update_appointment") return;
    expect(move.date).toBe("2026-07-16");
    expect(move.time).toBe("09:30");

    const cancel = parseIntent("termin absagen akt 2026-014: Verhandlung");
    expect(cancel.kind).toBe("cancel_appointment");
  });

  test("document status and review commands", () => {
    expect(parseIntent("dokumente status akt 2026-014").kind).toBe("document_status");
    const review = parseIntent("dokument geprüft akt 2026-014: Klageentwurf");
    expect(review.kind).toBe("review_document");
    if (review.kind !== "review_document") return;
    expect(review.status).toBe("confirmed");
  });
});

// ─── Case Summary (table-driven) ──────────────────────────────────────────────

describe("parseIntent — case_summary", () => {
  test.each([
    ["akte 2026-014 zusammenfassung"],
    ["zusammenfassung akt 2026-014"],
    ["summary akt 2026-014"],
    ["überblick akt 2026-014"],
    ["wie ist der status akt 2026-014"],
    ["was ist mit akt 2026-014"],
  ])("%# %s → case_summary, caseRef 2026-014", (input) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("case_summary");
    if (r.kind !== "case_summary") return;
    expect(r.caseRef).toBe("2026-014");
  });
});

// ─── Brain Query (table-driven) ───────────────────────────────────────────────

describe("parseIntent — brain_query", () => {
  test.each([
    ["frage: was weißt du über Müller Vergleich?", "was weißt du über Müller Vergleich?"],
    ["suche: bgb § 433", "bgb § 433"],
    ["wissen: rücktrittsrecht", "rücktrittsrecht"],
    ["brain: aktuelle juris zu bgb 280", "aktuelle juris zu bgb 280"],
  ])("%# %s → brain_query", (input, query) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("brain_query");
    if (r.kind !== "brain_query") return;
    expect(r.query).toBe(query);
  });
});

// ─── RVG Calc (table-driven) ──────────────────────────────────────────────────

describe("parseIntent — rvg_calc", () => {
  test.each([
    ["rvg 50000", 50000],
    ["rvg 50.000", 50000],
    ["streitwert 50000 eur", 50000],
    ["rvg 1234,56", 1234.56],
    ["gebühren 100000", 100000],
    ["rvg berechnen 25000", 25000],
    ["rvg 50000 eur", 50000],
    ["rvg 50000€", 50000],
  ])("%# %s → rvg_calc %s", (input, streitwert) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("rvg_calc");
    if (r.kind !== "rvg_calc") return;
    if (typeof streitwert === "number" && !Number.isInteger(streitwert)) {
      expect(r.streitwert).toBeCloseTo(streitwert);
    } else {
      expect(r.streitwert).toBe(streitwert);
    }
  });
});

// ─── Deadline Calc (table-driven) ─────────────────────────────────────────────

describe("parseIntent — deadline_calc", () => {
  test.each([
    ["frist berechnen zpo-berufung 2026-03-15 BY", "zpo-berufung", "2026-03-15", "BY"],
    ["frist berechnen zpo-berufung 15.03.2026", "zpo-berufung", "2026-03-15", "BY"],
    ["deadline berechnen zpo-klage 01.02.2026 NW", "zpo-klage", "2026-02-01", "NW"],
  ])("%# %s", (input, ruleKey, startDate, bundesland) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("deadline_calc");
    if (r.kind !== "deadline_calc") return;
    expect(r.ruleKey).toBe(ruleKey);
    expect(r.startDate).toBe(startDate);
    expect(r.bundesland).toBe(bundesland);
  });

  test("'frist berechnen' without rule → not deadline_calc", () => {
    expect(parseIntent("frist berechnen").kind).not.toBe("deadline_calc");
  });
});

// ─── Conflict Check (table-driven) ────────────────────────────────────────────

describe("parseIntent — conflict_check", () => {
  test.each([
    ["konflikt Müller", "Müller", undefined],
    ["konflikt-check Schmidt akt 2026-014", "Schmidt", "2026-014"],
    ["conflict Meier", "Meier", undefined],
  ])("%# %s", (input, name, caseRef) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("conflict_check");
    if (r.kind !== "conflict_check") return;
    expect(r.name).toBe(name);
    expect(r.caseRef).toBe(caseRef);
  });
});

// ─── Document Fetch (table-driven) ────────────────────────────────────────────

describe("parseIntent — document_fetch", () => {
  test.each([
    ["dokument akt 2026-014: klage", "2026-014", "klage"],
    ["unterlagen akt 2026-014: vertrag", "2026-014", "vertrag"],
  ])("%# %s", (input, caseRef, query) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("document_fetch");
    if (r.kind !== "document_fetch") return;
    expect(r.caseRef).toBe(caseRef);
    expect(r.query).toBe(query);
  });

  test("'hole dokument akt 2026-014 klageentwurf' → document_fetch (no colon)", () => {
    const r = parseIntent("hole dokument akt 2026-014 klageentwurf");
    expect(r.kind).toBe("document_fetch");
    if (r.kind !== "document_fetch") return;
    expect(r.caseRef).toBe("");
    expect(r.query).toBe("akt 2026-014 klageentwurf");
  });
});

// ─── Case Lookup (table-driven) ───────────────────────────────────────────────

describe("parseIntent — case_lookup", () => {
  test.each([
    ["akt 2026-014", "2026-014"],
    ["akte 2026-014", "2026-014"],
    ["az 2026-014", "2026-014"],
    ["aktenzeichen 2026/14", "2026/14"],
  ])("%# %s → case_lookup, caseRef %s", (input, caseRef) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("case_lookup");
    if (r.kind !== "case_lookup") return;
    expect(r.caseRef).toBe(caseRef);
  });
});

// ─── Mark Done (table-driven) ─────────────────────────────────────────────────

describe("parseIntent — mark_done", () => {
  test.each([
    ["erledigt akt 2026-014: klageentwurf", "2026-014", "task", "klageentwurf"],
    ["frist erledigt akt 2026-014: Berufung", "2026-014", "deadline", "Berufung"],
    ["deadline erledigt akt 2026-014: frist", "2026-014", "deadline", "frist"],
    ["aufgabe erledigt akt 2026-014: todo", "2026-014", "task", "todo"],
  ])("%# %s", (input, caseRef, itemType, query) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("mark_done");
    if (r.kind !== "mark_done") return;
    expect(r.caseRef).toBe(caseRef);
    expect(r.itemType).toBe(itemType);
    expect(r.query).toBe(query);
  });
});

// ─── Search (table-driven) ────────────────────────────────────────────────────

describe("parseIntent — search", () => {
  test.each([
    ["finde Müller", "Müller"],
    ["finde Schmidt", "Schmidt"],
    ["wer ist Meier", "Meier"],
    ["wo ist Becker", "Becker"],
  ])("%# %s → search, query %s", (input, query) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("search");
    if (r.kind !== "search") return;
    expect(r.query).toBe(query);
  });
});

// ─── Case Activity (table-driven) ─────────────────────────────────────────────

describe("parseIntent — case_activity", () => {
  test.each([
    ["verlauf akt 2026-014"],
    ["historie akt 2026-014"],
    ["aktivitäten akt 2026-014"],
    ["log 2026-014"],
  ])("%# %s → case_activity, caseRef 2026-014", (input) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("case_activity");
    if (r.kind !== "case_activity") return;
    expect(r.caseRef).toBe("2026-014");
  });
});

// ─── Create Case (table-driven for legalArea mapping) ─────────────────────────

describe("parseIntent — create_case", () => {
  test.each([
    ["neue akte Müller vs. Schmidt Familienrecht", "Müller", "Schmidt", "family", undefined],
    ["neuer fall Müller gegen Schmidt Strafrecht", "Müller", "Schmidt", "criminal", undefined],
    ["neue akte Müller vs. Schmidt Arbeitsrecht klage", "Müller", "Schmidt", "labor", "klage"],
    ["neue akte Müller", "Müller", "", "civil", undefined],
    ["akte anlegen Müller vs. Becker Handelsrecht", "Müller", "Becker", "commercial", undefined],
    [
      "neue sache Müller vs. Schmidt Verwaltungsrecht",
      "Müller",
      "Schmidt",
      "administrative",
      undefined,
    ],
    [
      "neue akte Müller vs. Schmidt Gewerblicher Rechtsschutz",
      "Müller",
      "Schmidt",
      "ip",
      undefined,
    ],
    ["neue akte Müller vs. Schmidt Steuerrecht", "Müller", "Schmidt", "tax", undefined],
    ["neue akte Müller vs. Schmidt", "Müller", "Schmidt", "civil", undefined],
    ["neuer fall Müller vs. Schmidt", "Müller", "Schmidt", "civil", undefined],
  ])("%# %s", (input, clientName, opponentName, legalArea, description) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("create_case");
    if (r.kind !== "create_case") return;
    expect(r.clientName).toBe(clientName);
    expect(r.opponentName).toBe(opponentName);
    expect(r.legalArea).toBe(legalArea);
    if (description !== undefined) expect(r.description).toBe(description);
  });
});

// ─── Create Client (table-driven) ─────────────────────────────────────────────

describe("parseIntent — create_client", () => {
  test.each([
    ["neuer mandant Thomas Müller", "Thomas Müller", undefined, undefined],
    ["neuer mandant Thomas Müller +49 170 1234567", "Thomas Müller", "+49 170 1234567", undefined],
    [
      "neuer mandant Thomas Müller thomas@example.com",
      "Thomas Müller",
      undefined,
      "thomas@example.com",
    ],
    [
      "neuer mandant Thomas Müller +49 170 1234567 thomas@example.com",
      "Thomas Müller",
      "+49 170 1234567",
      "thomas@example.com",
    ],
    ["neuer kunde Schmidt", "Schmidt", undefined, undefined],
    ["mandant anlegen Thomas Müller", "Thomas Müller", undefined, undefined],
  ])("%# %s", (input, name, phone, email) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("create_client");
    if (r.kind !== "create_client") return;
    expect(r.name).toBe(name);
    expect(r.phone).toBe(phone);
    expect(r.email).toBe(email);
  });
});

// ─── Close Case (table-driven) ────────────────────────────────────────────────

describe("parseIntent — close_case", () => {
  test.each([
    ["akte abschließen 2026-014"],
    ["fall schließen 2026-014"],
    ["abschließen akt 2026-014"],
    ["archivieren 2026-014"],
    ["beenden 2026-014"],
    ["akte schliessen 2026-014"],
    ["akte abschliessen 2026-014"],
  ])("%# %s → close_case, caseRef 2026-014", (input) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("close_case");
    if (r.kind !== "close_case") return;
    expect(r.caseRef).toBe("2026-014");
  });
});

// ─── Create Invoice (table-driven) ────────────────────────────────────────────

describe("parseIntent — create_invoice", () => {
  test.each([
    ["rechnung akt 2026-014: 2500 eur für Klageentwurf", "2026-014", 2500, "Klageentwurf"],
    ["rechnung akt 2026-014: 1500,50", "2026-014", 1500.5, "Rechnung via WhatsApp"],
    ["invoice akt 2026-014: 3000€ für Gutachten", "2026-014", 3000, "Gutachten"],
    ["rechnung akt 2026-014: 500", "2026-014", 500, "Rechnung via WhatsApp"],
  ])("%# %s", (input, caseRef, amount, description) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("create_invoice");
    if (r.kind !== "create_invoice") return;
    expect(r.caseRef).toBe(caseRef);
    if (!Number.isInteger(amount)) {
      expect(r.amount).toBeCloseTo(amount);
    } else {
      expect(r.amount).toBe(amount);
    }
    expect(r.description).toBe(description);
  });

  test("invoice with zero amount → not create_invoice", () => {
    expect(parseIntent("rechnung akt 2026-014: 0").kind).not.toBe("create_invoice");
  });
});

// ─── Appointment ──────────────────────────────────────────────────────────────

describe("parseIntent — appointment", () => {
  test.each([
    [
      "termin akt 2026-014: 15.07.2026 14:00 LG München Verhandlung",
      "2026-014",
      "2026-07-15",
      "14:00",
      "LG München Verhandlung",
    ],
    ["termin 15.07.2026 9:00 Besprechung", "", "2026-07-15", "09:00", "Besprechung"],
    [
      "gerichtstermin akt 2026-003: 01.08.2026 10:30 OLG Stuttgart",
      "2026-003",
      "2026-08-01",
      "10:30",
      "OLG Stuttgart",
    ],
    [
      "besprechung 20.07.2026 14.00 Telefonat Mandant",
      "",
      "2026-07-20",
      "14:00",
      "Telefonat Mandant",
    ],
  ])("%# %s", (input, caseRef, date, time, title) => {
    const r = parseIntent(input);
    expect(r.kind).toBe("appointment");
    if (r.kind !== "appointment") return;
    expect(r.caseRef).toBe(caseRef);
    expect(r.date).toBe(date);
    expect(r.time).toBe(time);
    expect(r.title).toBe(title);
  });

  test("appointment takes priority over deadline for 'termin' prefix with time", () => {
    const r = parseIntent("termin 15.07.2026 14:00 Verhandlung");
    expect(r.kind).toBe("appointment");
    expect(r.kind).not.toBe("deadline");
  });

  test("'termin' without time falls through to deadline", () => {
    expect(parseIntent("termin 15.07.2026 Klageerwiderung").kind).toBe("deadline");
  });

  test("'termin akt 2026-014: 15.07.2026 14:00 LG München' → appointment, not deadline", () => {
    const r = parseIntent("termin akt 2026-014: 15.07.2026 14:00 LG München");
    expect(r.kind).toBe("appointment");
    if (r.kind !== "appointment") return;
    expect(r.caseRef).toBe("2026-014");
    expect(r.date).toBe("2026-07-15");
    expect(r.time).toBe("14:00");
    expect(r.title).toBe("LG München");
  });
});

// ─── Edge Cases & Ambiguity ───────────────────────────────────────────────────

describe("parseIntent — edge cases", () => {
  test("case-insensitive: 'HILFE' → help", () => {
    expect(parseIntent("HILFE").kind).toBe("help");
  });

  test("leading/trailing whitespace is trimmed", () => {
    expect(parseIntent("  hilfe  ").kind).toBe("help");
  });

  test("'bestätigen' with umlaut → confirm", () => {
    expect(parseIntent("bestätigen").kind).toBe("confirm");
  });

  test("'abschließen akt 2026-014' → close_case (not mark_done)", () => {
    expect(parseIntent("abschließen akt 2026-014").kind).toBe("close_case");
  });

  test("'erledigt akt 2026-014: klage' → mark_done (not close_case)", () => {
    expect(parseIntent("erledigt akt 2026-014: klage").kind).toBe("mark_done");
  });

  test("German date 2-digit year '15.03.26' → normalized to '2026-03-15'", () => {
    const r = parseIntent("frist akt 2026-014: test 15.03.26");
    expect(r.kind).toBe("deadline");
    if (r.kind !== "deadline") return;
    expect(r.dueDate).toBe("2026-03-15");
  });
});
