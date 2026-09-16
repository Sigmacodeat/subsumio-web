// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  suggestCaseFromTitle,
  detectJurisdictionFromTitle,
  defaultCaseValues,
  KEYWORD_RULES,
} from "./legal-case-suggest";

describe("KEYWORD_RULES", () => {
  test("contains multiple legal areas", () => {
    expect(KEYWORD_RULES.length).toBeGreaterThan(10);
    const areas = new Set(KEYWORD_RULES.map((r) => r.suggestion.legalArea));
    expect(areas).toContain("Mietrecht");
    expect(areas).toContain("Arbeitsrecht");
    expect(areas).toContain("Strafrecht");
  });

  test("every rule has de and en reason", () => {
    for (const rule of KEYWORD_RULES) {
      expect(rule.reason.de).toBeTruthy();
      expect(rule.reason.en).toBeTruthy();
    }
  });
});

describe("suggestCaseFromTitle", () => {
  test("detects Mietrecht", () => {
    const suggestion = suggestCaseFromTitle("Mietverhältnis Kündigung Wohnung", "de");
    expect(suggestion?.legalArea).toBe("Mietrecht");
    expect(suggestion?.reason).toBe("Mietrecht erkannt");
  });

  test("detects Arbeitsrecht", () => {
    const suggestion = suggestCaseFromTitle("Arbeitsvertrag Abfindung", "de");
    expect(suggestion?.legalArea).toBe("Arbeitsrecht");
    expect(suggestion?.priority).toBe("high");
  });

  test("detects DSGVO", () => {
    const suggestion = suggestCaseFromTitle("DSGVO Verstoß Auftragsverarbeitung", "de");
    expect(suggestion?.legalArea).toBe("Datenschutzrecht");
  });

  test("returns English reason when requested", () => {
    const suggestion = suggestCaseFromTitle("Mietrecht", "en");
    expect(suggestion?.reason).toBe("Rental law detected");
  });

  test("returns null for short or empty title", () => {
    expect(suggestCaseFromTitle("ab")).toBeNull();
    expect(suggestCaseFromTitle("   ")).toBeNull();
  });

  test("returns null for unrelated title", () => {
    expect(suggestCaseFromTitle("Wetterbericht für morgen")).toBeNull();
  });
});

describe("detectJurisdictionFromTitle", () => {
  test("detects Austria", () => {
    expect(detectJurisdictionFromTitle("Österreichisches Mietrecht")).toBe("at");
    expect(detectJurisdictionFromTitle("AT-Recht")).toBe("at");
  });

  test("does not activate archived Swiss jurisdiction", () => {
    expect(detectJurisdictionFromTitle("Schweizer Zivilrecht")).toBeNull();
    expect(detectJurisdictionFromTitle("CH-Recht")).toBeNull();
  });

  test("detects EU", () => {
    expect(detectJurisdictionFromTitle("EU Datenschutz")).toBe("eu");
    expect(detectJurisdictionFromTitle("Brüssel Verordnung")).toBe("eu");
  });

  test("does not activate archived German jurisdiction", () => {
    expect(detectJurisdictionFromTitle("Deutsches Vertragsrecht")).toBeNull();
  });

  test("returns null when no jurisdiction is mentioned", () => {
    expect(detectJurisdictionFromTitle("Mietrecht allgemein")).toBeNull();
  });
});

describe("defaultCaseValues", () => {
  test("returns Austrian pilot defaults", () => {
    expect(defaultCaseValues()).toEqual({
      jurisdiction: "at",
      status: "open",
      priority: "medium",
    });
  });
});
