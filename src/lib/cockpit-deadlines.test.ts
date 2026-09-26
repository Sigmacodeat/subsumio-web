import { describe, expect, test } from "vitest";
import { deadlineItemsFromFristen, isInPeriod } from "./cockpit-deadlines";

const NOW = new Date("2026-09-26T09:00:00");

function frist(i: number, due: string, status: string) {
  return { id: `f${i}`, title: `Frist ${i}`, due_date: due, status };
}

describe("Widget-Dashboard — Fristen aus dem Lesemodell", () => {
  test("Frist Nr. 51 (älteste Änderung) wird angezeigt", () => {
    const fristen = [
      ...Array.from({ length: 50 }, (_, i) => frist(i, "2026-12-01", "pending")),
      frist(50, "2026-09-21", "overdue"),
    ];
    const items = deadlineItemsFromFristen(fristen, NOW);
    expect(items).toHaveLength(51);
    expect(items[0]!.page.title).toBe("Frist 50");
    expect(items[0]!.overdue).toBe(true);
    expect(items[0]!.daysLeft).toBe(-5);
  });

  test("erledigte Fristen erscheinen nicht", () => {
    expect(deadlineItemsFromFristen([frist(1, "2026-09-01", "done")], NOW)).toEqual([]);
  });
});

describe("Zeitraumfilter", () => {
  test("seit 5 Tagen überfällige Frist bleibt im Zeitraum 'today' sichtbar", () => {
    const [item] = deadlineItemsFromFristen([frist(1, "2026-09-21", "overdue")], NOW);
    expect(isInPeriod(item!, "today", NOW)).toBe(true);
    expect(isInPeriod(item!, "week", NOW)).toBe(true);
  });

  test("Frist in 3 Tagen fällt aus 'today', bleibt in 'week'", () => {
    const [item] = deadlineItemsFromFristen([frist(1, "2026-09-29", "critical")], NOW);
    expect(isInPeriod(item!, "today", NOW)).toBe(false);
    expect(isInPeriod(item!, "week", NOW)).toBe(true);
  });

  test("alte Eingänge ohne Frist fallen weiterhin aus dem Zeitraum", () => {
    expect(isInPeriod({ created_at: "2026-09-01T09:00:00" }, "today", NOW)).toBe(false);
  });
});
