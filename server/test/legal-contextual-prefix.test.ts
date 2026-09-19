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
    const prefix = buildLegalContextualPrefix(
      "§ 138 BGB — Sittenwidrige Rechtsgeschäfte",
      fm,
      null
    );
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
    const prefix = buildLegalContextualPrefix(
      "§ 13 StGB — Begehen durch Unterlassen",
      fm,
      "Synopsis text here"
    );
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

describe("canonical schema v1 pages", () => {
  it("statute: abbr, paragraph_ref and short_title build the citation context", () => {
    const p = buildLegalContextualPrefix(
      "Allgemeines bürgerliches Gesetzbuch",
      {
        jurisdiction: "at",
        abbr: "ABGB",
        paragraph_ref: "§ 1295",
        short_title: "Allgemeines bürgerliches Gesetzbuch",
        doc_class: "statute",
      },
      null
    );
    expect(p).toContain("AT ABGB § 1295");
    expect(p).toContain("Allgemeines bürgerliches Gesetzbuch");
  });

  it("decision: court, case number and date identify it", () => {
    const p = buildLegalContextualPrefix(
      "Verwaltungsgerichtshof — Ra 2019/12/0005",
      {
        jurisdiction: "at",
        court: "Verwaltungsgerichtshof",
        case_number: "Ra 2019/12/0005",
        decision_date: "2019-05-02",
        doc_class: "decision",
        abbr: null,
        paragraph_ref: null,
      },
      null
    );
    expect(p).toContain("AT Verwaltungsgerichtshof Ra 2019/12/0005 2019-05-02");
  });

  it("null canonical fields are ignored, not printed", () => {
    const p = buildLegalContextualPrefix(
      "Titel",
      { jurisdiction: "at", abbr: null, paragraph_ref: null, short_title: null },
      null
    );
    expect(p).not.toContain("null");
  });
  it("keeps the abbreviation's spelling", () => {
    const p = buildLegalContextualPrefix(
      "Steiermärkisches Feuerwehrgesetz",
      { jurisdiction: "at", abbr: "StFWG", paragraph_ref: "§ 39", doc_class: "statute" },
      null
    );
    expect(p).toContain("AT StFWG § 39");
    expect(p).not.toContain("STFWG");
  });

  it("takes the law name from legal_area and drops a title that repeats the header", () => {
    const p = buildLegalContextualPrefix(
      "§ 403 ABGB",
      {
        jurisdiction: "at",
        abbr: "ABGB",
        paragraph_ref: "§ 403",
        short_title: null,
        legal_area: ["20/01 Allgemeines bürgerliches Gesetzbuch (ABGB)"],
        doc_class: "statute",
      },
      null
    );
    expect(p).toBe(
      "<context>AT ABGB § 403 | Allgemeines bürgerliches Gesetzbuch (ABGB)\n</context>\n"
    );
  });

  it("norm without abbreviation still names its law area", () => {
    const p = buildLegalContextualPrefix(
      "Übertragung von Aufgaben",
      {
        jurisdiction: "at",
        abbr: null,
        paragraph_ref: "§ 2",
        legal_area: ["31/01 Allgemeines Haushaltsrecht, Bundesbudget"],
        doc_class: "statute",
      },
      null
    );
    expect(p).toContain(
      "AT § 2 | Übertragung von Aufgaben | Allgemeines Haushaltsrecht, Bundesbudget"
    );
  });
  it("ignores the placeholder area RIS sets on decisions", () => {
    const p = buildLegalContextualPrefix(
      "Verwaltungsgerichtshof (VwGH) — 2012/03/0069",
      {
        jurisdiction: "at",
        court: "Verwaltungsgerichtshof (VwGH)",
        case_number: "2012/03/0069",
        decision_date: "2012-10-22",
        legal_area: ["Allgemein"],
        doc_class: "decision",
      },
      null
    );
    expect(p).toBe(
      "<context>AT Verwaltungsgerichtshof (VwGH) 2012/03/0069 2012-10-22\n</context>\n"
    );
  });
  it("state law names its state", () => {
    const p = buildLegalContextualPrefix(
      "Steiermärkisches Feuerwehrgesetz",
      {
        jurisdiction: "at",
        region: "Steiermark",
        abbr: "StFWG",
        paragraph_ref: "§ 39",
        doc_class: "statute",
      },
      null
    );
    expect(p).toContain("AT Steiermark StFWG § 39");
  });
});
