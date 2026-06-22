// @vitest-environment node

import { describe, test, expect } from "vitest";
import { parseIntent } from "./actions";

// ─── Basic Intents ─────────────────────────────────────────────────────────────

describe("parseIntent — help", () => {
  test("'hilfe' → help", () => {
    expect(parseIntent("hilfe")).toEqual({ kind: "help" });
  });

  test("'help' → help", () => {
    expect(parseIntent("help")).toEqual({ kind: "help" });
  });

  test("'?' → help", () => {
    expect(parseIntent("?")).toEqual({ kind: "help" });
  });

  test("'HILFE' (case-insensitive) → help", () => {
    expect(parseIntent("HILFE")).toEqual({ kind: "help" });
  });
});

describe("parseIntent — confirm", () => {
  test("'ja' → confirm", () => {
    expect(parseIntent("ja")).toEqual({ kind: "confirm" });
  });

  test("'ok' → confirm", () => {
    expect(parseIntent("ok")).toEqual({ kind: "confirm" });
  });

  test("'okay' → confirm", () => {
    expect(parseIntent("okay")).toEqual({ kind: "confirm" });
  });

  test("'speichern' → confirm", () => {
    expect(parseIntent("speichern")).toEqual({ kind: "confirm" });
  });

  test("'bestätigen' → confirm", () => {
    expect(parseIntent("bestätigen")).toEqual({ kind: "confirm" });
  });

  test("'bestaetigen' → confirm", () => {
    expect(parseIntent("bestaetigen")).toEqual({ kind: "confirm" });
  });
});

describe("parseIntent — cancel", () => {
  test("'nein' → cancel", () => {
    expect(parseIntent("nein")).toEqual({ kind: "cancel" });
  });

  test("'abbrechen' → cancel", () => {
    expect(parseIntent("abbrechen")).toEqual({ kind: "cancel" });
  });

  test("'verwerfen' → cancel", () => {
    expect(parseIntent("verwerfen")).toEqual({ kind: "cancel" });
  });

  test("'stopp' → cancel", () => {
    expect(parseIntent("stopp")).toEqual({ kind: "cancel" });
  });

  test("'stop' → cancel", () => {
    expect(parseIntent("stop")).toEqual({ kind: "cancel" });
  });
});

// ─── Time Entry ────────────────────────────────────────────────────────────────

describe("parseIntent — time_entry", () => {
  test("'30m akt 2026-014 telefonat' → time_entry with 30 min", () => {
    const r = parseIntent("30m akt 2026-014 telefonat");
    expect(r.kind).toBe("time_entry");
    if (r.kind !== "time_entry") return;
    expect(r.minutes).toBe(30);
    expect(r.caseRef).toBe("2026-014");
    expect(r.billable).toBe(true);
  });

  test("'1,5h akt 2026-014' → 90 minutes", () => {
    const r = parseIntent("1,5h akt 2026-014");
    expect(r.kind).toBe("time_entry");
    if (r.kind !== "time_entry") return;
    expect(r.minutes).toBe(90);
  });

  test("'2 std akt 2026-014 besprechung' → 120 minutes", () => {
    const r = parseIntent("2 std akt 2026-014 besprechung");
    expect(r.kind).toBe("time_entry");
    if (r.kind !== "time_entry") return;
    expect(r.minutes).toBe(120);
  });

  test("'45 min akt 2026-014 nicht abrechenbar' → billable false", () => {
    const r = parseIntent("45 min akt 2026-014 nicht abrechenbar");
    expect(r.kind).toBe("time_entry");
    if (r.kind !== "time_entry") return;
    expect(r.minutes).toBe(45);
    expect(r.billable).toBe(false);
  });

  test("'2 stunden akt 2026-014' → 120 minutes", () => {
    const r = parseIntent("2 stunden akt 2026-014");
    expect(r.kind).toBe("time_entry");
    if (r.kind !== "time_entry") return;
    expect(r.minutes).toBe(120);
  });

  test("time without case ref → free_text", () => {
    const r = parseIntent("30m telefonat");
    expect(r.kind).toBe("free_text");
  });

  test("description defaults to 'Zeiterfassung via WhatsApp' when empty", () => {
    const r = parseIntent("30m akt 2026-014");
    expect(r.kind).toBe("time_entry");
    if (r.kind !== "time_entry") return;
    expect(r.description).toBe("Zeiterfassung via WhatsApp");
  });
});

// ─── Expense ───────────────────────────────────────────────────────────────────

describe("parseIntent — expense", () => {
  test("'auslage akt 2026-014: 12,50 eur kopien' → expense", () => {
    const r = parseIntent("auslage akt 2026-014: 12,50 eur kopien");
    expect(r.kind).toBe("expense");
    if (r.kind !== "expense") return;
    expect(r.amount).toBe(12.5);
    expect(r.caseRef).toBe("2026-014");
    expect(r.description).toBe("kopien");
    expect(r.billable).toBe(true);
  });

  test("'kosten akt 2026-014: 50€ gerichtskosten' → expense 50", () => {
    const r = parseIntent("kosten akt 2026-014: 50€ gerichtskosten");
    expect(r.kind).toBe("expense");
    if (r.kind !== "expense") return;
    expect(r.amount).toBe(50);
  });

  test("'spesen akt 2026-014: 25,00 nicht abrechenbar' → billable false", () => {
    const r = parseIntent("spesen akt 2026-014: 25,00 nicht abrechenbar");
    expect(r.kind).toBe("expense");
    if (r.kind !== "expense") return;
    expect(r.amount).toBe(25);
    expect(r.billable).toBe(false);
  });

  test("expense without case ref → expense with empty caseRef", () => {
    const r = parseIntent("auslage 15,90 parkgebühren");
    expect(r.kind).toBe("expense");
    if (r.kind !== "expense") return;
    expect(r.caseRef).toBe("");
  });

  test("expense without amount → free_text", () => {
    const r = parseIntent("auslage akt 2026-014: kopien ohne betrag");
    expect(r.kind).toBe("free_text");
  });
});

// ─── Case Note & Standalone Note ───────────────────────────────────────────────

describe("parseIntent — case_note", () => {
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
});

describe("parseIntent — standalone_note", () => {
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

// ─── Invoice Status ────────────────────────────────────────────────────────────

describe("parseIntent — invoice_status", () => {
  test("'status akt 2026-014' → invoice_status", () => {
    const r = parseIntent("status akt 2026-014");
    expect(r.kind).toBe("invoice_status");
    if (r.kind !== "invoice_status") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'abrechnung akt 2026-014' → invoice_status", () => {
    const r = parseIntent("abrechnung akt 2026-014");
    expect(r.kind).toBe("invoice_status");
    if (r.kind !== "invoice_status") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'offen akt 2026-014' → invoice_status", () => {
    const r = parseIntent("offen akt 2026-014");
    expect(r.kind).toBe("invoice_status");
    if (r.kind !== "invoice_status") return;
    expect(r.caseRef).toBe("2026-014");
  });
});

// ─── Task & Deadline ───────────────────────────────────────────────────────────

describe("parseIntent — task", () => {
  test("'aufgabe akt 2026-014: klageentwurf prüfen' → task", () => {
    const r = parseIntent("aufgabe akt 2026-014: klageentwurf prüfen");
    expect(r.kind).toBe("task");
    if (r.kind !== "task") return;
    expect(r.caseRef).toBe("2026-014");
    expect(r.title).toBe("klageentwurf prüfen");
    expect(r.dueDate).toBeUndefined();
  });

  test("'aufgabe akt 2026-014: klage prüfen bis 2026-07-01' → task with dueDate", () => {
    const r = parseIntent("aufgabe akt 2026-014: klage prüfen bis 2026-07-01");
    expect(r.kind).toBe("task");
    if (r.kind !== "task") return;
    expect(r.dueDate).toBe("2026-07-01");
  });

  test("'todo akt 2026-014: frist prüfen am 01.07.2026' → task with German date", () => {
    const r = parseIntent("todo akt 2026-014: frist prüfen am 01.07.2026");
    expect(r.kind).toBe("task");
    if (r.kind !== "task") return;
    expect(r.dueDate).toBe("2026-07-01");
  });

  test("task without case ref → task with empty caseRef", () => {
    const r = parseIntent("aufgabe klageentwurf prüfen");
    expect(r.kind).toBe("task");
    if (r.kind !== "task") return;
    expect(r.caseRef).toBe("");
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

  test("'termin akt 2026-014: 15.07.2026 14:00 LG München' → appointment, not deadline", () => {
    const r = parseIntent("termin akt 2026-014: 15.07.2026 14:00 LG München");
    expect(r.kind).toBe("appointment");
    if (r.kind !== "appointment") return;
    expect(r.caseRef).toBe("2026-014");
    expect(r.date).toBe("2026-07-15");
    expect(r.time).toBe("14:00");
    expect(r.title).toBe("LG München");
  });

  test("deadline without date → free_text", () => {
    const r = parseIntent("frist akt 2026-014: irgendwann");
    expect(r.kind).toBe("free_text");
  });
});

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
    const status = parseIntent("dokumente status akt 2026-014");
    expect(status.kind).toBe("document_status");

    const review = parseIntent("dokument geprüft akt 2026-014: Klageentwurf");
    expect(review.kind).toBe("review_document");
    if (review.kind !== "review_document") return;
    expect(review.status).toBe("confirmed");
  });

  test("beA and DATEV status commands", () => {
    expect(parseIntent("bea").kind).toBe("bea_status");
    expect(parseIntent("posteingang").kind).toBe("bea_status");
    expect(parseIntent("datev").kind).toBe("datev_status");
    expect(parseIntent("datev export").kind).toBe("datev_status");
  });
});

// ─── Case Summary ──────────────────────────────────────────────────────────────

describe("parseIntent — case_summary", () => {
  test("'akte 2026-014 zusammenfassung' → case_summary", () => {
    const r = parseIntent("akte 2026-014 zusammenfassung");
    expect(r.kind).toBe("case_summary");
    if (r.kind !== "case_summary") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'zusammenfassung akt 2026-014' → case_summary", () => {
    const r = parseIntent("zusammenfassung akt 2026-014");
    expect(r.kind).toBe("case_summary");
    if (r.kind !== "case_summary") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'summary akt 2026-014' → case_summary", () => {
    const r = parseIntent("summary akt 2026-014");
    expect(r.kind).toBe("case_summary");
    if (r.kind !== "case_summary") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'überblick akt 2026-014' → case_summary", () => {
    const r = parseIntent("überblick akt 2026-014");
    expect(r.kind).toBe("case_summary");
    if (r.kind !== "case_summary") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'wie ist der status akt 2026-014' → case_summary (NL)", () => {
    const r = parseIntent("wie ist der status akt 2026-014");
    expect(r.kind).toBe("case_summary");
    if (r.kind !== "case_summary") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'was ist mit akt 2026-014' → case_summary (NL)", () => {
    const r = parseIntent("was ist mit akt 2026-014");
    expect(r.kind).toBe("case_summary");
    if (r.kind !== "case_summary") return;
    expect(r.caseRef).toBe("2026-014");
  });
});

// ─── Brain Query ───────────────────────────────────────────────────────────────

describe("parseIntent — brain_query", () => {
  test("'frage: was weißt du über Müller Vergleich?' → brain_query", () => {
    const r = parseIntent("frage: was weißt du über Müller Vergleich?");
    expect(r.kind).toBe("brain_query");
    if (r.kind !== "brain_query") return;
    expect(r.query).toBe("was weißt du über Müller Vergleich?");
  });

  test("'suche: bgb § 433' → brain_query", () => {
    const r = parseIntent("suche: bgb § 433");
    expect(r.kind).toBe("brain_query");
    if (r.kind !== "brain_query") return;
    expect(r.query).toBe("bgb § 433");
  });

  test("'wissen: rücktrittsrecht' → brain_query", () => {
    const r = parseIntent("wissen: rücktrittsrecht");
    expect(r.kind).toBe("brain_query");
    if (r.kind !== "brain_query") return;
    expect(r.query).toBe("rücktrittsrecht");
  });

  test("'brain: aktuelle juris zu bgb 280' → brain_query", () => {
    const r = parseIntent("brain: aktuelle juris zu bgb 280");
    expect(r.kind).toBe("brain_query");
    if (r.kind !== "brain_query") return;
    expect(r.query).toBe("aktuelle juris zu bgb 280");
  });
});

// ─── RVG Calc ──────────────────────────────────────────────────────────────────

describe("parseIntent — rvg_calc", () => {
  test("'rvg 50000' → rvg_calc 50000", () => {
    const r = parseIntent("rvg 50000");
    expect(r.kind).toBe("rvg_calc");
    if (r.kind !== "rvg_calc") return;
    expect(r.streitwert).toBe(50000);
  });

  test("'rvg 50.000' → rvg_calc 50000 (German thousands)", () => {
    const r = parseIntent("rvg 50.000");
    expect(r.kind).toBe("rvg_calc");
    if (r.kind !== "rvg_calc") return;
    expect(r.streitwert).toBe(50000);
  });

  test("'streitwert 50000 eur' → rvg_calc", () => {
    const r = parseIntent("streitwert 50000 eur");
    expect(r.kind).toBe("rvg_calc");
    if (r.kind !== "rvg_calc") return;
    expect(r.streitwert).toBe(50000);
  });

  test("'rvg 1234,56' → rvg_calc 1234.56 (German decimal)", () => {
    const r = parseIntent("rvg 1234,56");
    expect(r.kind).toBe("rvg_calc");
    if (r.kind !== "rvg_calc") return;
    expect(r.streitwert).toBeCloseTo(1234.56);
  });

  test("'gebühren 100000' → rvg_calc", () => {
    const r = parseIntent("gebühren 100000");
    expect(r.kind).toBe("rvg_calc");
    if (r.kind !== "rvg_calc") return;
    expect(r.streitwert).toBe(100000);
  });

  test("'rvg berechnen 25000' → rvg_calc with 'berechnen' keyword", () => {
    const r = parseIntent("rvg berechnen 25000");
    expect(r.kind).toBe("rvg_calc");
    if (r.kind !== "rvg_calc") return;
    expect(r.streitwert).toBe(25000);
  });
});

// ─── Deadline Calc ─────────────────────────────────────────────────────────────

describe("parseIntent — deadline_calc", () => {
  test("'frist berechnen zpo-berufung 2026-03-15 BY' → deadline_calc", () => {
    const r = parseIntent("frist berechnen zpo-berufung 2026-03-15 BY");
    expect(r.kind).toBe("deadline_calc");
    if (r.kind !== "deadline_calc") return;
    expect(r.ruleKey).toBe("zpo-berufung");
    expect(r.startDate).toBe("2026-03-15");
    expect(r.bundesland).toBe("BY");
  });

  test("'frist berechnen zpo-berufung 15.03.2026' → deadline_calc with German date, default BY", () => {
    const r = parseIntent("frist berechnen zpo-berufung 15.03.2026");
    expect(r.kind).toBe("deadline_calc");
    if (r.kind !== "deadline_calc") return;
    expect(r.startDate).toBe("2026-03-15");
    expect(r.bundesland).toBe("BY");
  });

  test("'deadline berechnen zpo-klage 01.02.2026 NW' → deadline_calc", () => {
    const r = parseIntent("deadline berechnen zpo-klage 01.02.2026 NW");
    expect(r.kind).toBe("deadline_calc");
    if (r.kind !== "deadline_calc") return;
    expect(r.ruleKey).toBe("zpo-klage");
    expect(r.startDate).toBe("2026-02-01");
    expect(r.bundesland).toBe("NW");
  });
});

// ─── Conflict Check ────────────────────────────────────────────────────────────

describe("parseIntent — conflict_check", () => {
  test("'konflikt Müller' → conflict_check", () => {
    const r = parseIntent("konflikt Müller");
    expect(r.kind).toBe("conflict_check");
    if (r.kind !== "conflict_check") return;
    expect(r.name).toBe("Müller");
    expect(r.caseRef).toBeUndefined();
  });

  test("'konflikt-check Schmidt akt 2026-014' → conflict_check with caseRef", () => {
    const r = parseIntent("konflikt-check Schmidt akt 2026-014");
    expect(r.kind).toBe("conflict_check");
    if (r.kind !== "conflict_check") return;
    expect(r.name).toBe("Schmidt");
    expect(r.caseRef).toBe("2026-014");
  });

  test("'conflict Meier' → conflict_check", () => {
    const r = parseIntent("conflict Meier");
    expect(r.kind).toBe("conflict_check");
    if (r.kind !== "conflict_check") return;
    expect(r.name).toBe("Meier");
  });
});

// ─── Document Fetch ────────────────────────────────────────────────────────────

describe("parseIntent — document_fetch", () => {
  test("'dokument akt 2026-014: klage' → document_fetch", () => {
    const r = parseIntent("dokument akt 2026-014: klage");
    expect(r.kind).toBe("document_fetch");
    if (r.kind !== "document_fetch") return;
    expect(r.caseRef).toBe("2026-014");
    expect(r.query).toBe("klage");
  });

  test("'unterlagen akt 2026-014: vertrag' → document_fetch", () => {
    const r = parseIntent("unterlagen akt 2026-014: vertrag");
    expect(r.kind).toBe("document_fetch");
    if (r.kind !== "document_fetch") return;
    expect(r.caseRef).toBe("2026-014");
    expect(r.query).toBe("vertrag");
  });

  test("'hole dokument akt 2026-014 klageentwurf' → document_fetch (no colon, query is full rest)", () => {
    const r = parseIntent("hole dokument akt 2026-014 klageentwurf");
    expect(r.kind).toBe("document_fetch");
    if (r.kind !== "document_fetch") return;
    expect(r.caseRef).toBe("");
    expect(r.query).toBe("akt 2026-014 klageentwurf");
  });
});

// ─── List Intents ──────────────────────────────────────────────────────────────

describe("parseIntent — list_cases", () => {
  test("'akten' → list_cases", () => {
    expect(parseIntent("akten")).toEqual({ kind: "list_cases" });
  });

  test("'fälle' → list_cases", () => {
    expect(parseIntent("fälle")).toEqual({ kind: "list_cases" });
  });

  test("'faelle' → list_cases", () => {
    expect(parseIntent("faelle")).toEqual({ kind: "list_cases" });
  });

  test("'liste akten' → list_cases", () => {
    expect(parseIntent("liste akten")).toEqual({ kind: "list_cases" });
  });

  test("'case list' → list_cases", () => {
    expect(parseIntent("case list")).toEqual({ kind: "list_cases" });
  });
});

describe("parseIntent — list_tasks", () => {
  test("'aufgaben' → list_tasks", () => {
    expect(parseIntent("aufgaben")).toEqual({ kind: "list_tasks" });
  });

  test("'offene aufgaben' → list_tasks", () => {
    expect(parseIntent("offene aufgaben")).toEqual({ kind: "list_tasks" });
  });

  test("'todos' → list_tasks", () => {
    expect(parseIntent("todos")).toEqual({ kind: "list_tasks" });
  });

  test("'was ist zu tun' → list_tasks", () => {
    expect(parseIntent("was ist zu tun")).toEqual({ kind: "list_tasks" });
  });

  test("'todo' → list_tasks", () => {
    expect(parseIntent("todo")).toEqual({ kind: "list_tasks" });
  });
});

describe("parseIntent — list_deadlines", () => {
  test("'fristen' → list_deadlines", () => {
    expect(parseIntent("fristen")).toEqual({ kind: "list_deadlines" });
  });

  test("'offene fristen' → list_deadlines", () => {
    expect(parseIntent("offene fristen")).toEqual({ kind: "list_deadlines" });
  });

  test("'fristliste' → list_deadlines", () => {
    expect(parseIntent("fristliste")).toEqual({ kind: "list_deadlines" });
  });

  test("'deadline list' → list_deadlines", () => {
    expect(parseIntent("deadline list")).toEqual({ kind: "list_deadlines" });
  });
});

describe("parseIntent — today", () => {
  test("'heute' → today", () => {
    expect(parseIntent("heute")).toEqual({ kind: "today" });
  });

  test("'was steht an' → today", () => {
    expect(parseIntent("was steht an")).toEqual({ kind: "today" });
  });

  test("'agenda' → today", () => {
    expect(parseIntent("agenda")).toEqual({ kind: "today" });
  });

  test("'today' → today", () => {
    expect(parseIntent("today")).toEqual({ kind: "today" });
  });

  test("'übersicht' → today", () => {
    expect(parseIntent("übersicht")).toEqual({ kind: "today" });
  });
});

// ─── Case Lookup ───────────────────────────────────────────────────────────────

describe("parseIntent — case_lookup", () => {
  test("'akt 2026-014' → case_lookup", () => {
    const r = parseIntent("akt 2026-014");
    expect(r.kind).toBe("case_lookup");
    if (r.kind !== "case_lookup") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'akte 2026-014' → case_lookup", () => {
    const r = parseIntent("akte 2026-014");
    expect(r.kind).toBe("case_lookup");
    if (r.kind !== "case_lookup") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'az 2026-014' → case_lookup", () => {
    const r = parseIntent("az 2026-014");
    expect(r.kind).toBe("case_lookup");
    if (r.kind !== "case_lookup") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'aktenzeichen 2026/14' → case_lookup with slash", () => {
    const r = parseIntent("aktenzeichen 2026/14");
    expect(r.kind).toBe("case_lookup");
    if (r.kind !== "case_lookup") return;
    expect(r.caseRef).toBe("2026/14");
  });
});

// ─── Mark Done ─────────────────────────────────────────────────────────────────

describe("parseIntent — mark_done", () => {
  test("'erledigt akt 2026-014: klageentwurf' → mark_done (task)", () => {
    const r = parseIntent("erledigt akt 2026-014: klageentwurf");
    expect(r.kind).toBe("mark_done");
    if (r.kind !== "mark_done") return;
    expect(r.caseRef).toBe("2026-014");
    expect(r.itemType).toBe("task");
    expect(r.query).toBe("klageentwurf");
  });

  test("'frist erledigt akt 2026-014: Berufung' → mark_done (deadline)", () => {
    const r = parseIntent("frist erledigt akt 2026-014: Berufung");
    expect(r.kind).toBe("mark_done");
    if (r.kind !== "mark_done") return;
    expect(r.itemType).toBe("deadline");
    expect(r.query).toBe("Berufung");
  });

  test("'deadline erledigt akt 2026-014: frist' → mark_done (deadline)", () => {
    const r = parseIntent("deadline erledigt akt 2026-014: frist");
    expect(r.kind).toBe("mark_done");
    if (r.kind !== "mark_done") return;
    expect(r.itemType).toBe("deadline");
  });

  test("'aufgabe erledigt akt 2026-014: todo' → mark_done (task)", () => {
    const r = parseIntent("aufgabe erledigt akt 2026-014: todo");
    expect(r.kind).toBe("mark_done");
    if (r.kind !== "mark_done") return;
    expect(r.itemType).toBe("task");
  });
});

// ─── Search ────────────────────────────────────────────────────────────────────

describe("parseIntent — search", () => {
  test("'finde Müller' → search", () => {
    const r = parseIntent("finde Müller");
    expect(r.kind).toBe("search");
    if (r.kind !== "search") return;
    expect(r.query).toBe("Müller");
  });

  test("'finde Schmidt' → search", () => {
    const r = parseIntent("finde Schmidt");
    expect(r.kind).toBe("search");
    if (r.kind !== "search") return;
    expect(r.query).toBe("Schmidt");
  });

  test("'wer ist Meier' → search", () => {
    const r = parseIntent("wer ist Meier");
    expect(r.kind).toBe("search");
    if (r.kind !== "search") return;
    expect(r.query).toBe("Meier");
  });

  test("'wo ist Becker' → search", () => {
    const r = parseIntent("wo ist Becker");
    expect(r.kind).toBe("search");
    if (r.kind !== "search") return;
    expect(r.query).toBe("Becker");
  });
});

// ─── Financial Overview ────────────────────────────────────────────────────────

describe("parseIntent — financial_overview", () => {
  test("'offene kosten' → financial_overview", () => {
    expect(parseIntent("offene kosten")).toEqual({ kind: "financial_overview" });
  });

  test("'umsatz' → financial_overview", () => {
    expect(parseIntent("umsatz")).toEqual({ kind: "financial_overview" });
  });

  test("'abrechnung' → financial_overview", () => {
    expect(parseIntent("abrechnung")).toEqual({ kind: "financial_overview" });
  });

  test("'konto' → financial_overview", () => {
    expect(parseIntent("konto")).toEqual({ kind: "financial_overview" });
  });

  test("'finanzen' → financial_overview", () => {
    expect(parseIntent("finanzen")).toEqual({ kind: "financial_overview" });
  });

  test("'finanzielle übersicht' → financial_overview", () => {
    expect(parseIntent("finanzielle übersicht")).toEqual({ kind: "financial_overview" });
  });
});

// ─── Case Activity ─────────────────────────────────────────────────────────────

describe("parseIntent — case_activity", () => {
  test("'verlauf akt 2026-014' → case_activity", () => {
    const r = parseIntent("verlauf akt 2026-014");
    expect(r.kind).toBe("case_activity");
    if (r.kind !== "case_activity") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'historie akt 2026-014' → case_activity", () => {
    const r = parseIntent("historie akt 2026-014");
    expect(r.kind).toBe("case_activity");
    if (r.kind !== "case_activity") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'aktivitäten akt 2026-014' → case_activity", () => {
    const r = parseIntent("aktivitäten akt 2026-014");
    expect(r.kind).toBe("case_activity");
    if (r.kind !== "case_activity") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'log 2026-014' → case_activity", () => {
    const r = parseIntent("log 2026-014");
    expect(r.kind).toBe("case_activity");
    if (r.kind !== "case_activity") return;
    expect(r.caseRef).toBe("2026-014");
  });
});

// ─── Create Case ───────────────────────────────────────────────────────────────

describe("parseIntent — create_case", () => {
  test("'neue akte Müller vs. Schmidt Familienrecht' → create_case", () => {
    const r = parseIntent("neue akte Müller vs. Schmidt Familienrecht");
    expect(r.kind).toBe("create_case");
    if (r.kind !== "create_case") return;
    expect(r.clientName).toBe("Müller");
    expect(r.opponentName).toBe("Schmidt");
    expect(r.legalArea).toBe("family");
  });

  test("'neuer fall Müller gegen Schmidt Strafrecht' → create_case", () => {
    const r = parseIntent("neuer fall Müller gegen Schmidt Strafrecht");
    expect(r.kind).toBe("create_case");
    if (r.kind !== "create_case") return;
    expect(r.clientName).toBe("Müller");
    expect(r.opponentName).toBe("Schmidt");
    expect(r.legalArea).toBe("criminal");
  });

  test("'neue akte Müller vs. Schmidt Arbeitsrecht klage' → create_case with description", () => {
    const r = parseIntent("neue akte Müller vs. Schmidt Arbeitsrecht klage");
    expect(r.kind).toBe("create_case");
    if (r.kind !== "create_case") return;
    expect(r.legalArea).toBe("labor");
    expect(r.description).toBe("klage");
  });

  test("'neue akte Müller' (no opponent) → create_case with empty opponent", () => {
    const r = parseIntent("neue akte Müller");
    expect(r.kind).toBe("create_case");
    if (r.kind !== "create_case") return;
    expect(r.clientName).toBe("Müller");
    expect(r.opponentName).toBe("");
    expect(r.legalArea).toBe("civil");
  });

  test("'akte anlegen Müller vs. Becker Handelsrecht' → create_case", () => {
    const r = parseIntent("akte anlegen Müller vs. Becker Handelsrecht");
    expect(r.kind).toBe("create_case");
    if (r.kind !== "create_case") return;
    expect(r.legalArea).toBe("commercial");
  });

  test("'neue sache Müller vs. Schmidt Verwaltungsrecht' → create_case", () => {
    const r = parseIntent("neue sache Müller vs. Schmidt Verwaltungsrecht");
    expect(r.kind).toBe("create_case");
    if (r.kind !== "create_case") return;
    expect(r.legalArea).toBe("administrative");
  });

  test("'neue akte Müller vs. Schmidt Gewerblicher Rechtsschutz' → create_case IP", () => {
    const r = parseIntent("neue akte Müller vs. Schmidt Gewerblicher Rechtsschutz");
    expect(r.kind).toBe("create_case");
    if (r.kind !== "create_case") return;
    expect(r.legalArea).toBe("ip");
  });
});

// ─── Create Client ─────────────────────────────────────────────────────────────

describe("parseIntent — create_client", () => {
  test("'neuer mandant Thomas Müller' → create_client", () => {
    const r = parseIntent("neuer mandant Thomas Müller");
    expect(r.kind).toBe("create_client");
    if (r.kind !== "create_client") return;
    expect(r.name).toBe("Thomas Müller");
    expect(r.phone).toBeUndefined();
    expect(r.email).toBeUndefined();
  });

  test("'neuer mandant Thomas Müller +49 170 1234567' → create_client with phone", () => {
    const r = parseIntent("neuer mandant Thomas Müller +49 170 1234567");
    expect(r.kind).toBe("create_client");
    if (r.kind !== "create_client") return;
    expect(r.name).toBe("Thomas Müller");
    expect(r.phone).toBe("+49 170 1234567");
  });

  test("'neuer mandant Thomas Müller thomas@example.com' → create_client with email", () => {
    const r = parseIntent("neuer mandant Thomas Müller thomas@example.com");
    expect(r.kind).toBe("create_client");
    if (r.kind !== "create_client") return;
    expect(r.email).toBe("thomas@example.com");
  });

  test("'neuer mandant Thomas Müller +49 170 1234567 thomas@example.com' → both phone and email", () => {
    const r = parseIntent("neuer mandant Thomas Müller +49 170 1234567 thomas@example.com");
    expect(r.kind).toBe("create_client");
    if (r.kind !== "create_client") return;
    expect(r.phone).toBeTruthy();
    expect(r.email).toBe("thomas@example.com");
    expect(r.name).toBe("Thomas Müller");
  });

  test("'neuer kunde Schmidt' → create_client", () => {
    const r = parseIntent("neuer kunde Schmidt");
    expect(r.kind).toBe("create_client");
    if (r.kind !== "create_client") return;
    expect(r.name).toBe("Schmidt");
  });
});

// ─── Close Case ────────────────────────────────────────────────────────────────

describe("parseIntent — close_case", () => {
  test("'akte abschließen 2026-014' → close_case", () => {
    const r = parseIntent("akte abschließen 2026-014");
    expect(r.kind).toBe("close_case");
    if (r.kind !== "close_case") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'fall schließen 2026-014' → close_case", () => {
    const r = parseIntent("fall schließen 2026-014");
    expect(r.kind).toBe("close_case");
    if (r.kind !== "close_case") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'abschließen akt 2026-014' → close_case (reversed order)", () => {
    const r = parseIntent("abschließen akt 2026-014");
    expect(r.kind).toBe("close_case");
    if (r.kind !== "close_case") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'archivieren 2026-014' → close_case", () => {
    const r = parseIntent("archivieren 2026-014");
    expect(r.kind).toBe("close_case");
    if (r.kind !== "close_case") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("'beenden 2026-014' → close_case", () => {
    const r = parseIntent("beenden 2026-014");
    expect(r.kind).toBe("close_case");
    if (r.kind !== "close_case") return;
    expect(r.caseRef).toBe("2026-014");
  });
});

// ─── Create Invoice ────────────────────────────────────────────────────────────

describe("parseIntent — create_invoice", () => {
  test("'rechnung akt 2026-014: 2500 eur für Klageentwurf' → create_invoice", () => {
    const r = parseIntent("rechnung akt 2026-014: 2500 eur für Klageentwurf");
    expect(r.kind).toBe("create_invoice");
    if (r.kind !== "create_invoice") return;
    expect(r.caseRef).toBe("2026-014");
    expect(r.amount).toBe(2500);
    expect(r.description).toBe("Klageentwurf");
  });

  test("'rechnung akt 2026-014: 1500,50' → create_invoice with decimal", () => {
    const r = parseIntent("rechnung akt 2026-014: 1500,50");
    expect(r.kind).toBe("create_invoice");
    if (r.kind !== "create_invoice") return;
    expect(r.amount).toBeCloseTo(1500.5);
  });

  test("'invoice akt 2026-014: 3000€ für Gutachten' → create_invoice", () => {
    const r = parseIntent("invoice akt 2026-014: 3000€ für Gutachten");
    expect(r.kind).toBe("create_invoice");
    if (r.kind !== "create_invoice") return;
    expect(r.amount).toBe(3000);
    expect(r.description).toBe("Gutachten");
  });

  test("invoice without description → default description", () => {
    const r = parseIntent("rechnung akt 2026-014: 500");
    expect(r.kind).toBe("create_invoice");
    if (r.kind !== "create_invoice") return;
    expect(r.amount).toBe(500);
    expect(r.description).toBe("Rechnung via WhatsApp");
  });

  test("invoice with zero amount → not create_invoice (amount must be > 0)", () => {
    const r = parseIntent("rechnung akt 2026-014: 0");
    expect(r.kind).not.toBe("create_invoice");
  });
});

// ─── Free Text & Edge Cases ────────────────────────────────────────────────────

describe("parseIntent — free_text", () => {
  test("unrecognized text → free_text", () => {
    const r = parseIntent("irgendein text der auf nichts passt");
    expect(r.kind).toBe("free_text");
    if (r.kind !== "free_text") return;
    expect(r.text).toBe("irgendein text der auf nichts passt");
  });

  test("empty string → free_text", () => {
    const r = parseIntent("");
    expect(r.kind).toBe("free_text");
    if (r.kind !== "free_text") return;
    expect(r.text).toBe("");
  });

  test("whitespace-only → free_text with empty text", () => {
    const r = parseIntent("   ");
    expect(r.kind).toBe("free_text");
    if (r.kind !== "free_text") return;
    expect(r.text).toBe("");
  });

  test("random question → free_text", () => {
    const r = parseIntent("was ist der Unterschied zwischen Kauf und Werkvertrag?");
    expect(r.kind).toBe("free_text");
  });
});

// ─── Edge Cases & Ambiguity ────────────────────────────────────────────────────

describe("parseIntent — edge cases", () => {
  test("case-insensitive: 'HILFE' → help", () => {
    expect(parseIntent("HILFE").kind).toBe("help");
  });

  test("case-insensitive: 'JA' → confirm", () => {
    expect(parseIntent("JA").kind).toBe("confirm");
  });

  test("leading/trailing whitespace is trimmed", () => {
    expect(parseIntent("  hilfe  ").kind).toBe("help");
  });

  test("'kosten 50000' matches expense (not rvg_calc) because expense regex runs first", () => {
    const r = parseIntent("kosten 50000");
    expect(r.kind).toBe("expense");
  });

  test("'auslage akt 2026-014: 100€' → expense (not rvg_calc) because 'auslage' prefix", () => {
    const r = parseIntent("auslage akt 2026-014: 100€");
    expect(r.kind).toBe("expense");
  });

  test("'frist berechnen' without rule → not deadline_calc (no date)", () => {
    const r = parseIntent("frist berechnen");
    expect(r.kind).not.toBe("deadline_calc");
  });

  test("German date 2-digit year '15.03.26' → normalized to '2026-03-15'", () => {
    const r = parseIntent("frist akt 2026-014: test 15.03.26");
    expect(r.kind).toBe("deadline");
    if (r.kind !== "deadline") return;
    expect(r.dueDate).toBe("2026-03-15");
  });

  test("'bestätigen' with umlaut → confirm", () => {
    expect(parseIntent("bestätigen").kind).toBe("confirm");
  });

  test("'abschließen akt 2026-014' → close_case (not mark_done)", () => {
    const r = parseIntent("abschließen akt 2026-014");
    expect(r.kind).toBe("close_case");
  });

  test("'erledigt akt 2026-014: klage' → mark_done (not close_case)", () => {
    const r = parseIntent("erledigt akt 2026-014: klage");
    expect(r.kind).toBe("mark_done");
  });

  test("time_entry with 'minute' singular: '20 minute akt X test'", () => {
    const r = parseIntent("20 minute akt 2026-014 test");
    expect(r.kind).toBe("time_entry");
    if (r.kind !== "time_entry") return;
    expect(r.minutes).toBe(20);
  });

  test("time_entry with decimal hours '0,5h akt X' → 30 min", () => {
    const r = parseIntent("0,5h akt 2026-014");
    expect(r.kind).toBe("time_entry");
    if (r.kind !== "time_entry") return;
    expect(r.minutes).toBe(30);
  });

  test("time_entry minimum 1 minute (0m → 1)", () => {
    const r = parseIntent("0m akt 2026-014");
    expect(r.kind).toBe("time_entry");
    if (r.kind !== "time_entry") return;
    expect(r.minutes).toBe(1);
  });

  test("rvg with euro suffix: 'rvg 50000 eur'", () => {
    const r = parseIntent("rvg 50000 eur");
    expect(r.kind).toBe("rvg_calc");
    if (r.kind !== "rvg_calc") return;
    expect(r.streitwert).toBe(50000);
  });

  test("rvg with euro sign: 'rvg 50000€'", () => {
    const r = parseIntent("rvg 50000€");
    expect(r.kind).toBe("rvg_calc");
    if (r.kind !== "rvg_calc") return;
    expect(r.streitwert).toBe(50000);
  });

  test("create_case with 'neuer fall' prefix", () => {
    const r = parseIntent("neuer fall Müller vs. Schmidt");
    expect(r.kind).toBe("create_case");
  });

  test("create_case with Steuerrecht → tax", () => {
    const r = parseIntent("neue akte Müller vs. Schmidt Steuerrecht");
    expect(r.kind).toBe("create_case");
    if (r.kind !== "create_case") return;
    expect(r.legalArea).toBe("tax");
  });

  test("create_case default legalArea is civil when not specified", () => {
    const r = parseIntent("neue akte Müller vs. Schmidt");
    expect(r.kind).toBe("create_case");
    if (r.kind !== "create_case") return;
    expect(r.legalArea).toBe("civil");
  });

  test("create_client with 'mandant anlegen' prefix", () => {
    const r = parseIntent("mandant anlegen Thomas Müller");
    expect(r.kind).toBe("create_client");
    if (r.kind !== "create_client") return;
    expect(r.name).toBe("Thomas Müller");
  });

  test("close_case with 'schliessen' (ae-spelling)", () => {
    const r = parseIntent("akte schliessen 2026-014");
    expect(r.kind).toBe("close_case");
    if (r.kind !== "close_case") return;
    expect(r.caseRef).toBe("2026-014");
  });

  test("close_case with 'abschliessen' (ae-spelling)", () => {
    const r = parseIntent("akte abschliessen 2026-014");
    expect(r.kind).toBe("close_case");
    if (r.kind !== "close_case") return;
    expect(r.caseRef).toBe("2026-014");
  });
});

// ─── G1: Appointment Intent ───────────────────────────────────────────────────

describe("parseIntent — appointment", () => {
  test("'termin akt 2026-014: 15.07.2026 14:00 LG München Verhandlung' → appointment", () => {
    const r = parseIntent("termin akt 2026-014: 15.07.2026 14:00 LG München Verhandlung");
    expect(r.kind).toBe("appointment");
    if (r.kind !== "appointment") return;
    expect(r.caseRef).toBe("2026-014");
    expect(r.date).toBe("2026-07-15");
    expect(r.time).toBe("14:00");
    expect(r.title).toBe("LG München Verhandlung");
  });

  test("'termin 15.07.2026 9:00 Besprechung' → appointment (no case)", () => {
    const r = parseIntent("termin 15.07.2026 9:00 Besprechung");
    expect(r.kind).toBe("appointment");
    if (r.kind !== "appointment") return;
    expect(r.caseRef).toBe("");
    expect(r.date).toBe("2026-07-15");
    expect(r.time).toBe("09:00");
    expect(r.title).toBe("Besprechung");
  });

  test("'gerichtstermin akt 2026-003: 01.08.2026 10:30 OLG Stuttgart' → appointment", () => {
    const r = parseIntent("gerichtstermin akt 2026-003: 01.08.2026 10:30 OLG Stuttgart");
    expect(r.kind).toBe("appointment");
    if (r.kind !== "appointment") return;
    expect(r.caseRef).toBe("2026-003");
    expect(r.date).toBe("2026-08-01");
    expect(r.time).toBe("10:30");
    expect(r.title).toBe("OLG Stuttgart");
  });

  test("'besprechung 20.07.2026 14.00 Telefonat Mandant' → appointment (dot in time)", () => {
    const r = parseIntent("besprechung 20.07.2026 14.00 Telefonat Mandant");
    expect(r.kind).toBe("appointment");
    if (r.kind !== "appointment") return;
    expect(r.time).toBe("14:00");
    expect(r.title).toBe("Telefonat Mandant");
  });

  test("appointment takes priority over deadline for 'termin' prefix with time", () => {
    const r = parseIntent("termin 15.07.2026 14:00 Verhandlung");
    expect(r.kind).toBe("appointment");
    expect(r.kind).not.toBe("deadline");
  });

  test("'termin' without time falls through to deadline", () => {
    const r = parseIntent("termin 15.07.2026 Klageerwiderung");
    expect(r.kind).toBe("deadline");
  });
});

// ─── G1: List Appointments ────────────────────────────────────────────────────

describe("parseIntent — list_appointments", () => {
  test("'termine' → list_appointments", () => {
    expect(parseIntent("termine")).toEqual({ kind: "list_appointments" });
  });

  test("'anstehende termine' → list_appointments", () => {
    expect(parseIntent("anstehende termine")).toEqual({ kind: "list_appointments" });
  });

  test("'kalender' → list_appointments", () => {
    expect(parseIntent("kalender")).toEqual({ kind: "list_appointments" });
  });

  test("'terminkalender' → list_appointments", () => {
    expect(parseIntent("terminkalender")).toEqual({ kind: "list_appointments" });
  });
});
