// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  buildChronology,
  exportChronologyMarkdown,
  exportChronologyJSON,
} from "./chronology-builder";

describe("buildChronology", () => {
  test("builds empty chronology", () => {
    const chrono = buildChronology("case-1", {});
    expect(chrono.case_slug).toBe("case-1");
    expect(chrono.entries).toHaveLength(0);
    expect(chrono.title).toContain("case-1");
  });

  test("parses DD.MM.YYYY dates to ISO", () => {
    const chrono = buildChronology("case-1", {
      forensicReport: {
        chronologie: [{ datum: "15.03.2024", ereignis: "Ereignis A" }],
      },
    });
    expect(chrono.entries[0].date_iso).toBe("2024-03-15");
  });

  test("sorts entries by date", () => {
    const chrono = buildChronology("case-1", {
      forensicReport: {
        chronologie: [
          { datum: "15.03.2024", ereignis: "Später" },
          { datum: "10.01.2024", ereignis: "Früher" },
        ],
      },
    });
    expect(chrono.entries[0].event).toBe("Früher");
    expect(chrono.entries[1].event).toBe("Später");
  });

  test("categorizes deadlines and hearings", () => {
    const chrono = buildChronology("case-1", {
      forensicReport: {
        chronologie: [
          { datum: "15.03.2024", ereignis: "Frist zur Klageerwiderung" },
          { datum: "16.03.2024", ereignis: "Vernehmung des Zeugen" },
        ],
      },
    });
    expect(chrono.entries[0].category).toBe("deadline");
    expect(chrono.entries[1].category).toBe("hearing");
  });

  test("includes damage entries with amounts", () => {
    const chrono = buildChronology("case-1", {
      damageTable: [{ datum: "01.04.2024", position: "Schaden A", betrag: "1.000 €", on: "ON-1" }],
    });
    expect(chrono.entries[0].event).toContain("Schaden A");
    expect(chrono.entries[0].event).toContain("1.000 €");
    expect(chrono.entries[0].on_reference).toBe("ON-1");
  });

  test("includes deadline entries", () => {
    const chrono = buildChronology("case-1", {
      deadlineCalendar: [{ datum: "01.04.2024", frist: "Klageerwiderung", beleg_on: "ON-2" }],
    });
    expect(chrono.entries[0].event).toContain("Klageerwiderung");
    expect(chrono.entries[0].category).toBe("deadline");
  });
});

describe("exportChronologyMarkdown", () => {
  test("includes title and table", () => {
    const chrono = buildChronology("case-1", {
      forensicReport: {
        chronologie: [{ datum: "15.03.2024", ereignis: "Ereignis A", quote: "Zitat" }],
      },
    });
    const md = exportChronologyMarkdown(chrono);
    expect(md).toContain(chrono.title);
    expect(md).toContain("| Datum | Ereignis |");
    expect(md).toContain("Ereignis A");
    expect(md).toContain("Zitat");
  });
});

describe("exportChronologyJSON", () => {
  test("returns valid JSON", () => {
    const chrono = buildChronology("case-1", {});
    const json = exportChronologyJSON(chrono);
    const parsed = JSON.parse(json);
    expect(parsed.case_slug).toBe("case-1");
    expect(parsed.entries).toEqual([]);
  });
});
