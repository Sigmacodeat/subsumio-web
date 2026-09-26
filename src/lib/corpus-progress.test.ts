// @vitest-environment node
// Fortschritt über die Zeit (/ops/corpus): Tempo, Restdauer, „stockt".
import { describe, expect, it } from "vitest";
import { openOf, sumSeries, trendOf, type DailyPoint } from "./corpus-progress";
import { parseSyncHistory } from "./corpus-sync-history";

const p = (day: string, confirmed: number, open: number): DailyPoint => ({
  day,
  confirmed,
  open,
  total: confirmed + open,
});

describe("trendOf", () => {
  it("rechnet Tempo und Restdauer aus dem Abbau offener Dokumente", () => {
    const t = trendOf([
      p("2026-09-20", 0, 1000),
      p("2026-09-25", 400, 600),
      p("2026-09-26", 500, 500),
    ]);
    expect(t.state).toBe("moving");
    expect(t.confirmedDelta).toBe(100);
    expect(t.perDay).toBe(500 / 6);
    expect(t.etaDays).toBe(6);
  });
  it("meldet Stillstand erst nach drei Tagen Verlauf", () => {
    expect(trendOf([p("2026-09-25", 5, 5), p("2026-09-26", 5, 5)]).state).toBe("unknown");
    expect(
      trendOf([p("2026-09-20", 0, 10), p("2026-09-23", 5, 5), p("2026-09-26", 5, 5)]).state
    ).toBe("stalled");
  });
  it("wachsende offene Arbeit ist kein Fortschritt", () => {
    expect(trendOf([p("2026-09-25", 5, 5), p("2026-09-26", 5, 9)]).state).toBe("growing");
  });
  it("fertig, sobald nichts Schließbares offen ist", () => {
    expect(trendOf([p("2026-09-26", 10, 0)]).state).toBe("done");
    expect(trendOf([]).state).toBe("unknown");
  });
});

describe("openOf / sumSeries", () => {
  it("„RIS ohne Text“ zählt nicht als offene Arbeit", () => {
    expect(
      openOf({
        confirmed: 9,
        mismatch: 1,
        defective: 1,
        unchecked: 1,
        importOpen: 1,
        fetchOpen: 1,
        unreachable: 50,
      })
    ).toBe(5);
  });
  it("summiert je Tag über Quellen", () => {
    expect(
      sumSeries([[p("2026-09-26", 1, 2)], [p("2026-09-25", 3, 4), p("2026-09-26", 5, 6)]])
    ).toEqual([p("2026-09-25", 3, 4), p("2026-09-26", 6, 8)]);
  });
});

describe("parseSyncHistory", () => {
  it("nimmt je Wiener Tag den letzten Stand und verwirft Altes und Kaputtes", () => {
    const line = (at: string, confirmed: number) =>
      JSON.stringify({ at, s: { "at-normen": [100, confirmed, 0, 0, 0, 0, 100 - confirmed, 0] } });
    const jsonl = [
      line("2026-08-01T10:00:00Z", 1), // älter als 30 Tage
      line("2026-09-25T10:00:00Z", 10),
      line("2026-09-25T21:30:00Z", 20), // 23:30 Wien, noch der 25.
      line("2026-09-25T22:30:00Z", 30), // 00:30 Wien → der 26.
      "kaputt",
      JSON.stringify({ at: "2026-09-26T08:00:00Z", s: { "at-normen": [1, 2] } }),
    ].join("\n");
    const out = parseSyncHistory(jsonl, Date.parse("2026-09-26T12:00:00Z"));
    expect(out["at-normen"]).toEqual([p("2026-09-25", 20, 80), p("2026-09-26", 30, 70)]);
  });
});
