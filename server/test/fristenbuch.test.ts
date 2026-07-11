import { describe, it, expect } from "bun:test";
import {
  baueIcs,
  icsEscape,
  ladeFristenbuch,
  parseDeadlineDate,
  parseDeadlineTable,
  type FristenbuchEngine,
} from "../src/core/legal/fristenbuch.ts";

const CAL_MD = [
  "| Datum | Ampel | Frist | Rechtsgrundlage | Folge | Beleg |",
  "|---|---|---|---|---|---|",
  "| 03.07.2026 | rot | Berufungsfrist | § 464 ZPO | Rechtskraft | ON 12 |",
  "| 2026-08-20 | gelb | Stellungnahme | § 257 ZPO | Präklusion | ON 14 |",
  "| 01.06.2026 | rot | Einspruchsfrist | § 248 ZPO | Zahlungsbefehl rechtskräftig | ON 3 |",
  "| o.D. | gruen | unklar | | prüfen | ON 9 |",
].join("\n");

function fakeEngine(pages: Array<{ slug: string; compiled_truth: string }>): FristenbuchEngine {
  return {
    async executeRaw<T>(): Promise<T[]> {
      return pages.map((p) => ({ ...p, frontmatter: {} })) as T[];
    },
  };
}

describe("parseDeadlineDate", () => {
  it("parses German and ISO formats", () => {
    expect(parseDeadlineDate("03.07.2026")).toBe("2026-07-03");
    expect(parseDeadlineDate("2026-07-03")).toBe("2026-07-03");
    expect(parseDeadlineDate("3.7.2026")).toBe("2026-07-03");
  });

  it("rejects non-dates and impossible dates", () => {
    expect(parseDeadlineDate("o.D.")).toBeNull();
    expect(parseDeadlineDate("31.02.2026")).toBeNull();
    expect(parseDeadlineDate("")).toBeNull();
  });
});

describe("parseDeadlineTable", () => {
  it("parses the pipeline writer's table format", () => {
    const rows = parseDeadlineTable(CAL_MD);
    expect(rows).toHaveLength(4);
    expect(rows[0]!.frist).toBe("Berufungsfrist");
    expect(rows[0]!.rechtsgrundlage).toBe("§ 464 ZPO");
    expect(rows[1]!.datum).toBe("2026-08-20");
  });

  it("ignores content outside the table", () => {
    const md = `---\ntitle: x\n---\n\nText davor\n\n${CAL_MD}\n\nText danach ohne Pipe`;
    expect(parseDeadlineTable(md)).toHaveLength(4);
  });

  it("empty markdown yields no rows", () => {
    expect(parseDeadlineTable("")).toHaveLength(0);
  });
});

describe("ladeFristenbuch", () => {
  it("classifies, sorts (überfällig zuerst) and counts unparsebar", async () => {
    const buch = await ladeFristenbuch(
      fakeEngine([{ slug: "deadline-calendars/akte-1", compiled_truth: CAL_MD }]),
      { heute: "2026-07-02" }
    );
    expect(buch.eintraege).toHaveLength(3);
    expect(buch.zusammenfassung.unparsebar).toBe(1);
    // 01.06. überfällig, 03.07. kritisch (1 Werktag), 20.08. ok
    expect(buch.eintraege[0]!.status).toBe("ueberfaellig");
    expect(buch.eintraege[0]!.datum).toBe("2026-06-01");
    expect(buch.eintraege[1]!.status).toBe("kritisch");
    expect(buch.eintraege[2]!.status).toBe("ok");
    expect(buch.zusammenfassung.ueberfaellig).toBe(1);
    expect(buch.zusammenfassung.kritisch).toBe(1);
  });

  it("eskalation flag fires for kritisch + überfällig", async () => {
    const buch = await ladeFristenbuch(
      fakeEngine([{ slug: "deadline-calendars/akte-1", compiled_truth: CAL_MD }]),
      { heute: "2026-07-02" }
    );
    expect(buch.eintraege[0]!.eskalation).toBe(true);
    expect(buch.eintraege[1]!.eskalation).toBe(true);
    expect(buch.eintraege[2]!.eskalation).toBe(false);
  });

  it("vorfrist is a Werktag before the deadline", async () => {
    const buch = await ladeFristenbuch(
      fakeEngine([{ slug: "deadline-calendars/akte-1", compiled_truth: CAL_MD }]),
      { heute: "2026-07-02" }
    );
    const stellungnahme = buch.eintraege.find((e) => e.frist === "Stellungnahme")!;
    // 20.8.2026 − 7 Tage = 13.8.2026 (Donnerstag, Werktag)
    expect(stellungnahme.vorfrist).toBe("2026-08-13");
  });

  it("case_slug is derived from the page slug", async () => {
    const buch = await ladeFristenbuch(
      fakeEngine([{ slug: "deadline-calendars/mein-fall", compiled_truth: CAL_MD }]),
      { heute: "2026-07-02" }
    );
    expect(buch.eintraege[0]!.case_slug).toBe("mein-fall");
  });

  it("rejects invalid heute", async () => {
    await expect(ladeFristenbuch(fakeEngine([]), { heute: "02.07.2026" })).rejects.toThrow();
  });
});

describe("baueIcs", () => {
  it("emits Haupt- + Vorfrist VEVENTs with VALARM", async () => {
    const buch = await ladeFristenbuch(
      fakeEngine([{ slug: "deadline-calendars/akte-1", compiled_truth: CAL_MD }]),
      { heute: "2026-07-02" }
    );
    const ics = baueIcs(buch, { dtstamp: "2026-07-02T120000Z" });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    // 3 Fristen × 2 Events
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(6);
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(3);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260703");
    expect(ics).toContain("TRIGGER:-P2D");
    expect(ics).toContain("VORFRIST:");
    // Status-Tags im Summary
    expect(ics).toContain("[KRITISCH]");
  });

  it("is deterministic given dtstamp", async () => {
    const buch = await ladeFristenbuch(
      fakeEngine([{ slug: "deadline-calendars/akte-1", compiled_truth: CAL_MD }]),
      { heute: "2026-07-02" }
    );
    const a = baueIcs(buch, { dtstamp: "2026-07-02T120000Z" });
    const b = baueIcs(buch, { dtstamp: "2026-07-02T120000Z" });
    expect(a).toBe(b);
  });

  it("escapes RFC-5545 special characters", () => {
    expect(icsEscape("a;b,c\nd")).toBe("a\\;b\\,c\\nd");
  });

  it("folds long lines to <= 75 chars", async () => {
    const buch = await ladeFristenbuch(
      fakeEngine([{ slug: "deadline-calendars/akte-1", compiled_truth: CAL_MD }]),
      { heute: "2026-07-02" }
    );
    const ics = baueIcs(buch);
    for (const line of ics.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });
});
