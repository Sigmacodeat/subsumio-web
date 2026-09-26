// @vitest-environment node
import { describe, expect, it } from "vitest";
import { aiLiteracyCsv, membersWithoutRecord, type AiLiteracyRecord } from "./ai-literacy";

const members = [
  { id: "a", name: "Anwältin A", email: "a@k.at", role: "lawyer" },
  { id: "b", name: "Assistenz B", email: "b@k.at", role: "assistant" },
  { id: "c", name: "Mandant C", email: "c@m.at", role: "client_viewer" },
  { id: "d", name: "Ehemalig D", email: "d@k.at", role: "lawyer", deactivatedAt: "2026-01-01" },
];

const rec = (user_id: string, topic = "Grundlagen"): AiLiteracyRecord => ({
  id: `r-${user_id}`,
  brain_id: "b1",
  user_id,
  trained_on: "2026-09-01",
  topic,
  confirmed_by: "Dr. Kanzlei",
  recorded_by: "admin@k.at",
  created_at: "2026-09-02T08:00:00.000Z",
});

describe("membersWithoutRecord", () => {
  it("lists active staff without a record — not clients, not deactivated users", () => {
    expect(membersWithoutRecord(members, [rec("a")]).map((m) => m.id)).toEqual(["b"]);
    expect(membersWithoutRecord(members, [rec("a"), rec("b")])).toEqual([]);
  });
});

describe("aiLiteracyCsv", () => {
  it("exports name, date, content and confirmer; cells never become formulas", () => {
    const csv = aiLiteracyCsv([rec("a", "=HYPERLINK(1)")], members);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Mitarbeiter:in;E-Mail;Schulung am;Inhalt;Bestätigt von;Erfasst");
    expect(lines[1]).toBe("Anwältin A;a@k.at;2026-09-01;'=HYPERLINK(1);Dr. Kanzlei;2026-09-02");
  });
});
