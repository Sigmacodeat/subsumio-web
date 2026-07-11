import { describe, test, expect } from "bun:test";
import { extractCitations } from "../src/core/legal/citation-graph.ts";
import type { StatuteSection } from "../src/core/legal/split-statute.ts";

function section(ref: string, body: string): StatuteSection {
  return { marker: "§", ref, id: `p-${ref}`, title: "", body };
}

describe("extractCitations", () => {
  test("extracts a within-statute citation to a known §", () => {
    const sections = [
      section("1295", "§ 1295. Jedermann ist berechtigt... siehe auch § 1489 zur Verjährung."),
      section("1489", "§ 1489. Die Verjährung beginnt mit Kenntnis..."),
    ];
    const edges = extractCitations(sections);
    expect(edges).toContainEqual(expect.objectContaining({ fromRef: "1295", toRef: "1489" }));
  });

  test("rejects citations to §§ that don't exist in this statute", () => {
    const sections = [
      section("1", "§ 1. Verweist auf § 99999 (existiert nicht in diesem Gesetz)."),
    ];
    expect(extractCitations(sections)).toEqual([]);
  });

  test("does not create a self-loop when a § echoes its own number", () => {
    const sections = [
      section("5", "§ 5. Gesetze wirken nicht zurück (§ 5)."),
      section("6", "§ 6. Folgebestimmung."),
    ];
    const edges = extractCitations(sections);
    expect(edges.some((e) => e.fromRef === "5" && e.toRef === "5")).toBe(false);
  });

  test("dedupes repeated citations to the same § within one section", () => {
    const sections = [
      section("1", "§ 1. Verweist zweimal auf § 2, siehe § 2 nochmal."),
      section("2", "§ 2. Zielbestimmung."),
    ];
    const edges = extractCitations(sections).filter((e) => e.fromRef === "1" && e.toRef === "2");
    expect(edges.length).toBe(1);
  });

  test("handles the §§-range marker (§§ 29 und 30)", () => {
    const sections = [
      section("1", "§ 1. Siehe §§ 29 und 30 für Ausnahmen."),
      section("29", "§ 29. Erste Ausnahme."),
      section("30", "§ 30. Zweite Ausnahme."),
    ];
    const edges = extractCitations(sections);
    expect(edges.some((e) => e.fromRef === "1" && e.toRef === "29")).toBe(true);
    expect(edges.some((e) => e.fromRef === "1" && e.toRef === "30")).toBe(true);
  });

  test("caps edges per section so an enumeration clause isn't treated as a real graph", () => {
    const manyRefs = Array.from({ length: 5 }, (_, i) => `§ ${i + 2}`).join(", ");
    const sections = [
      section(
        "1",
        `§ 1. Aufgehoben sind ${manyRefs} und viele weitere: ` +
          Array.from({ length: 30 }, (_, i) => `§ ${i + 100}`).join(", ")
      ),
      ...Array.from({ length: 30 }, (_, i) => section(String(i + 100), `§ ${i + 100}. Text.`)),
    ];
    const edges = extractCitations(sections).filter((e) => e.fromRef === "1");
    expect(edges.length).toBeLessThanOrEqual(15);
  });

  test("captures a short context snippet around the citation", () => {
    const sections = [
      section(
        "1",
        "§ 1. Ein langer Einleitungssatz vor dem Verweis auf § 2 und danach noch mehr Text."
      ),
      section("2", "§ 2. Zielbestimmung."),
    ];
    const edge = extractCitations(sections).find((e) => e.toRef === "2");
    expect(edge?.context).toContain("§ 2");
  });

  test("returns [] for a statute with a single section (nothing to cite)", () => {
    const sections = [section("1", "§ 1. Einzige Bestimmung ohne Verweise.")];
    expect(extractCitations(sections)).toEqual([]);
  });
});
