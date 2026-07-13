import { describe, it, expect } from "bun:test";
import {
  buildLegalContextualPrefix,
  buildContextualPrefix,
  isLegalPage,
  sanitizeTitle,
} from "../src/core/embedding-context.ts";

describe("isLegalPage", () => {
  it("returns true for type=law", () => {
    expect(isLegalPage({ type: "law" })).toBe(true);
  });

  it("returns true for type=statute", () => {
    expect(isLegalPage({ type: "statute" })).toBe(true);
  });

  it("returns false for non-law types", () => {
    expect(isLegalPage({ type: "note" })).toBe(false);
    expect(isLegalPage({ type: "code" })).toBe(false);
    expect(isLegalPage({})).toBe(false);
  });
});

describe("buildLegalContextualPrefix", () => {
  it("produces jurisdiction + abbreviation + § header for legal pages", () => {
    const fm = {
      type: "law",
      jurisdiction: "de",
      abbreviation: "BGB",
      paragraph: "138",
      statute: "Bürgerliches Gesetzbuch",
    };
    const prefix = buildLegalContextualPrefix("§ 138 BGB — Sittenwidrige Rechtsgeschäfte", fm, null);
    expect(prefix).toContain("DE");
    expect(prefix).toContain("BGB");
    expect(prefix).toContain("§ 138");
    expect(prefix).toContain("<context>");
    expect(prefix).toContain("</context>");
  });

  it("includes statute long name when different from title", () => {
    const fm = {
      type: "law",
      jurisdiction: "at",
      abbreviation: "ABGB",
      paragraph: "1",
      statute: "Allgemeines bürgerliches Gesetzbuch",
    };
    const prefix = buildLegalContextualPrefix("§ 1 ABGB — Anwendung des Rechts", fm, null);
    expect(prefix).toContain("AT");
    expect(prefix).toContain("ABGB");
    expect(prefix).toContain("§ 1");
    expect(prefix).toContain("Allgemeines bürgerliches Gesetzbuch");
  });

  it("includes synopsis when provided", () => {
    const fm = {
      type: "law",
      jurisdiction: "de",
      abbreviation: "StGB",
      paragraph: "13",
      statute: "Strafgesetzbuch",
    };
    const prefix = buildLegalContextualPrefix("§ 13 StGB — Begehen durch Unterlassen", fm, "Synopsis text here");
    expect(prefix).toContain("Synopsis text here");
  });

  it("falls back to buildContextualPrefix when no legal frontmatter", () => {
    const prefix = buildLegalContextualPrefix("Some Title", { type: "note" }, null);
    const generic = buildContextualPrefix("Some Title", null);
    expect(prefix).toBe(generic);
  });

  it("returns null when all inputs are empty", () => {
    const prefix = buildLegalContextualPrefix("", {}, null);
    expect(prefix).toBeNull();
  });

  it("deduplicates title and statute when they match", () => {
    const fm = {
      type: "law",
      jurisdiction: "de",
      abbreviation: "AO",
      paragraph: "12",
      statute: "Abgabenordnung",
    };
    const prefix = buildLegalContextualPrefix("AO", fm, null);
    // Should not have "AO | AO" — deduplication
    expect(prefix).not.toContain("AO | AO");
  });

  it("handles missing paragraph gracefully", () => {
    const fm = {
      type: "law",
      jurisdiction: "de",
      abbreviation: "GG",
      statute: "Grundgesetz",
    };
    const prefix = buildLegalContextualPrefix("Art. 1 GG", fm, null);
    expect(prefix).toContain("DE");
    expect(prefix).toContain("GG");
    expect(prefix).not.toContain("§");
  });

  it("strips </context> injection from frontmatter values", () => {
    const fm = {
      type: "law",
      jurisdiction: "de",
      abbreviation: "</context>BGB",
      paragraph: "1",
    };
    const prefix = buildLegalContextualPrefix("Test", fm, null);
    expect(prefix).not.toContain("</context>BGB");
  });
});
