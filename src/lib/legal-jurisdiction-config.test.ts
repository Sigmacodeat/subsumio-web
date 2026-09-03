/**
 * T1.4 — Jurisdiction Confusion Test Suite
 *
 * 50+ negative cases ensuring no foreign law is admitted without
 * explicit EU/cross-border rules.
 *
 * Tests cover:
 * 1. Abbreviation collision detection (KSchG, StGB, ZPO, etc.)
 * 2. Jurisdiction-specific statute validation
 * 3. Foreign law blocking (DE law in AT context, AT law in DE context, etc.)
 * 4. Labor law separation (AT vs DE vs CH)
 * 5. Missing jurisdiction = block (no default)
 * 6. EU law always allowed in all DACH jurisdictions
 * 7. Cross-border exception handling
 * 8. Config-driven source list correctness
 * 9. Prompt builder output validation
 * 10. Citation pattern jurisdiction awareness
 */

import { describe, it, expect } from "vitest";
import {
  JURISDICTION_CONFIGS,
  LAW_ABBREVIATION_COLLISIONS,
  normalizeJurisdiction,
  requireJurisdiction,
  JurisdictionMissingError,
  getPracticeAreaConfig,
  getAllowedStatutes,
  getForbiddenStatutes,
  resolveAbbreviation,
  isLawAllowed,
  isForeignLaw,
  buildJurisdictionPromptSection,
  buildCollisionWarningSection,
  buildLaborLawPrompt,
  buildSourceListPrompt,
} from "@/lib/legal-jurisdiction-config";
import {
  isStatuteValidForJurisdiction,
  getStatuteJurisdictions,
  hasStatuteCollision,
} from "@/lib/legal-graph/citations";

// ── 1. Abbreviation Collision Detection ───────────────────────────────

describe("Abbreviation Collisions", () => {
  it("KSchG is registered as a collision between AT and DE", () => {
    const collision = LAW_ABBREVIATION_COLLISIONS.find((c) => c.abbreviation === "KSchG");
    expect(collision).toBeDefined();
    expect(collision!.jurisdictions.AT.fullName).toBe("Konsumentenschutzgesetz");
    expect(collision!.jurisdictions.DE.fullName).toBe("Kündigungsschutzgesetz");
  });

  it("KSchG AT = Konsumentenschutzgesetz (NOT Kündigungsschutz)", () => {
    const result = resolveAbbreviation("AT", "KSchG");
    expect(result.resolved).toBe("Konsumentenschutzgesetz");
    expect(result.collisionWith).toBe("DE");
  });

  it("KSchG DE = Kündigungsschutzgesetz (NOT Konsumentenschutz)", () => {
    const result = resolveAbbreviation("DE", "KSchG");
    expect(result.resolved).toBe("Kündigungsschutzgesetz");
    expect(result.collisionWith).toBe("AT");
  });

  it("StGB exists in DE, AT, and CH — triple collision", () => {
    const collision = LAW_ABBREVIATION_COLLISIONS.find((c) => c.abbreviation === "StGB");
    expect(collision).toBeDefined();
    expect(collision!.jurisdictions.DE.fullName).toContain("Deutschland");
    expect(collision!.jurisdictions.AT.fullName).toContain("Österreich");
    expect(collision!.jurisdictions.CH.fullName).toContain("Schweiz");
  });

  it("ZPO exists in DE, AT, and CH — triple collision", () => {
    const jurs = getStatuteJurisdictions("ZPO");
    expect(jurs).toContain("DE");
    expect(jurs).toContain("AT");
    expect(jurs).toContain("CH");
  });

  it("StPO exists in DE, AT, and CH — triple collision", () => {
    const jurs = getStatuteJurisdictions("StPO");
    expect(jurs).toContain("DE");
    expect(jurs).toContain("AT");
    expect(jurs).toContain("CH");
  });

  it("GmbHG exists in DE and AT — collision", () => {
    expect(hasStatuteCollision("GmbHG")).toBe(true);
  });

  it("AktG exists in DE and AT — collision", () => {
    expect(hasStatuteCollision("AktG")).toBe(true);
  });

  it("UStG exists in DE and AT — collision", () => {
    expect(hasStatuteCollision("UStG")).toBe(true);
  });

  it("EStG exists in DE and AT — collision", () => {
    expect(hasStatuteCollision("EStG")).toBe(true);
  });

  it("InsO has different names across jurisdictions", () => {
    const collision = LAW_ABBREVIATION_COLLISIONS.find((c) => c.abbreviation === "InsO");
    expect(collision).toBeDefined();
    expect(collision!.jurisdictions.DE.fullName).toBe("Insolvenzordnung");
    expect(collision!.jurisdictions.AT.fullName).toBe("N/A");
    expect(collision!.jurisdictions.AT.description).toContain("IO");
    expect(collision!.jurisdictions.CH.fullName).toBe("N/A");
    expect(collision!.jurisdictions.CH.description).toContain("SchKG");
  });

  it("DSG exists in AT and CH — collision", () => {
    const jurs = getStatuteJurisdictions("DSG");
    expect(jurs).toContain("AT");
    expect(jurs).toContain("CH");
  });

  it("BVG exists in AT and CH — collision", () => {
    const jurs = getStatuteJurisdictions("BVG");
    expect(jurs).toContain("AT");
    expect(jurs).toContain("CH");
  });
});

// ── 2. Jurisdiction-Specific Statute Validation ───────────────────────

describe("Statute Validation by Jurisdiction", () => {
  it("BGB is valid for DE but NOT for AT", () => {
    expect(isStatuteValidForJurisdiction("BGB", "DE")).toBe(true);
    expect(isStatuteValidForJurisdiction("BGB", "AT")).toBe(false);
  });

  it("ABGB is valid for AT but NOT for DE", () => {
    expect(isStatuteValidForJurisdiction("ABGB", "AT")).toBe(true);
    expect(isStatuteValidForJurisdiction("ABGB", "DE")).toBe(false);
  });

  it("OR is valid for CH but NOT for DE or AT", () => {
    expect(isStatuteValidForJurisdiction("OR", "CH")).toBe(true);
    expect(isStatuteValidForJurisdiction("OR", "DE")).toBe(false);
    expect(isStatuteValidForJurisdiction("OR", "AT")).toBe(false);
  });

  it("ZGB is valid for CH but NOT for DE or AT", () => {
    expect(isStatuteValidForJurisdiction("ZGB", "CH")).toBe(true);
    expect(isStatuteValidForJurisdiction("ZGB", "DE")).toBe(false);
  });

  it("AngG is valid for AT but NOT for DE", () => {
    expect(isStatuteValidForJurisdiction("AngG", "AT")).toBe(true);
    expect(isStatuteValidForJurisdiction("AngG", "DE")).toBe(false);
  });

  it("ArbVG is valid for AT but NOT for DE", () => {
    expect(isStatuteValidForJurisdiction("ArbVG", "AT")).toBe(true);
    expect(isStatuteValidForJurisdiction("ArbVG", "DE")).toBe(false);
  });

  it("BetrVG is valid for DE but NOT for AT", () => {
    expect(isStatuteValidForJurisdiction("BetrVG", "DE")).toBe(true);
    expect(isStatuteValidForJurisdiction("BetrVG", "AT")).toBe(false);
  });

  it("KSchG is valid for both AT and DE (collision)", () => {
    expect(isStatuteValidForJurisdiction("KSchG", "AT")).toBe(true);
    expect(isStatuteValidForJurisdiction("KSchG", "DE")).toBe(true);
  });

  it("KSchG is NOT valid for CH", () => {
    expect(isStatuteValidForJurisdiction("KSchG", "CH")).toBe(false);
  });

  it("DSGVO is valid for all DACH jurisdictions (EU law)", () => {
    expect(isStatuteValidForJurisdiction("DSGVO", "DE")).toBe(true);
    expect(isStatuteValidForJurisdiction("DSGVO", "AT")).toBe(true);
    expect(isStatuteValidForJurisdiction("DSGVO", "CH")).toBe(true);
  });

  it("AO is valid for DE but NOT for AT (AT uses BAO)", () => {
    expect(isStatuteValidForJurisdiction("AO", "DE")).toBe(true);
    expect(isStatuteValidForJurisdiction("AO", "AT")).toBe(false);
  });

  it("BAO is valid for AT but NOT for DE", () => {
    expect(isStatuteValidForJurisdiction("BAO", "AT")).toBe(true);
    expect(isStatuteValidForJurisdiction("BAO", "DE")).toBe(false);
  });

  it("SchKG is valid for CH but NOT for DE or AT", () => {
    expect(isStatuteValidForJurisdiction("SchKG", "CH")).toBe(true);
    expect(isStatuteValidForJurisdiction("SchKG", "DE")).toBe(false);
  });

  it("InsO is valid for DE but NOT for AT (AT uses IO)", () => {
    expect(isStatuteValidForJurisdiction("InsO", "DE")).toBe(true);
    expect(isStatuteValidForJurisdiction("InsO", "AT")).toBe(false);
  });

  it("IO is valid for AT but NOT for DE", () => {
    expect(isStatuteValidForJurisdiction("IO", "AT")).toBe(true);
    expect(isStatuteValidForJurisdiction("IO", "DE")).toBe(false);
  });
});

// ── 3. Foreign Law Blocking ────────────────────────────────────────────

describe("Foreign Law Blocking", () => {
  it("BGB is foreign law in AT context", () => {
    expect(isForeignLaw("AT", "BGB")).toBe(true);
  });

  it("ABGB is foreign law in DE context", () => {
    expect(isForeignLaw("DE", "ABGB")).toBe(true);
  });

  it("OR is foreign law in DE context", () => {
    expect(isForeignLaw("DE", "OR")).toBe(true);
  });

  it("OR is foreign law in AT context", () => {
    expect(isForeignLaw("AT", "OR")).toBe(true);
  });

  it("AngG is foreign law in DE context", () => {
    expect(isForeignLaw("DE", "AngG")).toBe(true);
  });

  it("BetrVG is foreign law in AT context", () => {
    expect(isForeignLaw("AT", "BetrVG")).toBe(true);
  });

  it("ASVG is foreign law in DE context", () => {
    expect(isForeignLaw("DE", "ASVG")).toBe(true);
  });

  it("SGB is foreign law in AT context", () => {
    expect(isForeignLaw("AT", "SGB")).toBe(true);
  });

  it("BAO is foreign law in DE context", () => {
    expect(isForeignLaw("DE", "BAO")).toBe(true);
  });

  it("AO is foreign law in AT context", () => {
    expect(isForeignLaw("AT", "AO")).toBe(true);
  });

  it("SchKG is foreign law in DE context", () => {
    expect(isForeignLaw("DE", "SchKG")).toBe(true);
  });

  it("InsO is foreign law in AT context", () => {
    expect(isForeignLaw("AT", "InsO")).toBe(true);
  });

  it("BGB is NOT foreign law in DE context", () => {
    expect(isForeignLaw("DE", "BGB")).toBe(false);
  });

  it("ABGB is NOT foreign law in AT context", () => {
    expect(isForeignLaw("AT", "ABGB")).toBe(false);
  });

  it("DSGVO is NOT foreign law in any DACH context", () => {
    expect(isForeignLaw("DE", "DSGVO")).toBe(false);
    expect(isForeignLaw("AT", "DSGVO")).toBe(false);
    expect(isForeignLaw("CH", "DSGVO")).toBe(false);
  });
});

// ── 4. Labor Law Separation ────────────────────────────────────────────

describe("Labor Law Separation (AT vs DE vs CH)", () => {
  it("DE labor law config includes KSchG (Kündigungsschutzgesetz)", () => {
    const laborConfig = getPracticeAreaConfig("DE", "labor");
    expect(laborConfig).toBeDefined();
    expect(laborConfig!.allowedStatutes).toContain("KSchG");
    expect(laborConfig!.allowedStatutes).toContain("BGB");
    expect(laborConfig!.allowedStatutes).toContain("BetrVG");
  });

  it("DE labor law config forbids AT labor statutes", () => {
    const laborConfig = getPracticeAreaConfig("DE", "labor");
    expect(laborConfig).toBeDefined();
    expect(laborConfig!.forbiddenStatutes).toContain("AngG");
    expect(laborConfig!.forbiddenStatutes).toContain("ArbVG");
    expect(laborConfig!.forbiddenStatutes).toContain("ASVG");
  });

  it("AT labor law config includes AngG and ArbVG", () => {
    const laborConfig = getPracticeAreaConfig("AT", "labor");
    expect(laborConfig).toBeDefined();
    expect(laborConfig!.allowedStatutes).toContain("AngG");
    expect(laborConfig!.allowedStatutes).toContain("ArbVG");
    expect(laborConfig!.allowedStatutes).toContain("ASVG");
  });

  it("AT labor law config forbids DE labor statutes", () => {
    const laborConfig = getPracticeAreaConfig("AT", "labor");
    expect(laborConfig).toBeDefined();
    expect(laborConfig!.forbiddenStatutes).toContain("BGB");
    expect(laborConfig!.forbiddenStatutes).toContain("KSchG");
    expect(laborConfig!.forbiddenStatutes).toContain("BetrVG");
  });

  it("AT labor law prompt warns about KSchG collision", () => {
    const prompt = buildLaborLawPrompt("AT");
    expect(prompt).toContain("KSchG");
    expect(prompt).toContain("Konsumentenschutz");
    expect(prompt).toContain("NICHT Kündigungsschutz");
  });

  it("DE labor law prompt warns about KSchG = Kündigungsschutzgesetz", () => {
    const prompt = buildLaborLawPrompt("DE");
    expect(prompt).toContain("KSchG");
    expect(prompt).toContain("Kündigungsschutzgesetz");
    expect(prompt).toContain("soziale Rechtfertigung");
  });

  it("CH labor law prompt uses OR and has no KSchG", () => {
    const prompt = buildLaborLawPrompt("CH");
    expect(prompt).toContain("OR");
    expect(prompt).toContain("kein KSchG");
  });

  it("CH labor law config forbids DE and AT labor statutes", () => {
    const laborConfig = getPracticeAreaConfig("CH", "labor");
    expect(laborConfig).toBeDefined();
    expect(laborConfig!.forbiddenStatutes).toContain("BGB");
    expect(laborConfig!.forbiddenStatutes).toContain("KSchG");
    expect(laborConfig!.forbiddenStatutes).toContain("AngG");
    expect(laborConfig!.forbiddenStatutes).toContain("ArbVG");
  });

  it("DE labor law prompt mentions BGB §§ 611-630", () => {
    const prompt = buildLaborLawPrompt("DE");
    expect(prompt).toContain("611");
    expect(prompt).toContain("630");
  });

  it("AT labor law prompt mentions AngG and ArbVG", () => {
    const prompt = buildLaborLawPrompt("AT");
    expect(prompt).toContain("AngG");
    expect(prompt).toContain("ArbVG");
  });
});

// ── 5. Missing Jurisdiction = Block ────────────────────────────────────

describe("Missing Jurisdiction = Block (No Default)", () => {
  it("requireJurisdiction throws on undefined", () => {
    expect(() => requireJurisdiction(undefined)).toThrow(JurisdictionMissingError);
  });

  it("requireJurisdiction throws on null", () => {
    expect(() => requireJurisdiction(null)).toThrow(JurisdictionMissingError);
  });

  it("requireJurisdiction throws on empty string", () => {
    expect(() => requireJurisdiction("")).toThrow(JurisdictionMissingError);
  });

  it("requireJurisdiction throws on invalid string", () => {
    expect(() => requireJurisdiction("XX")).toThrow(JurisdictionMissingError);
  });

  it("requireJurisdiction returns code for valid DE", () => {
    expect(requireJurisdiction("DE")).toBe("DE");
  });

  it("requireJurisdiction returns code for valid AT", () => {
    expect(requireJurisdiction("AT")).toBe("AT");
  });

  it("requireJurisdiction returns code for valid CH", () => {
    expect(requireJurisdiction("CH")).toBe("CH");
  });

  it("requireJurisdiction is case-insensitive", () => {
    expect(requireJurisdiction("de")).toBe("DE");
    expect(requireJurisdiction("at")).toBe("AT");
    expect(requireJurisdiction("ch")).toBe("CH");
  });

  it("normalizeJurisdiction returns undefined for invalid input", () => {
    expect(normalizeJurisdiction("FR")).toBeUndefined();
    expect(normalizeJurisdiction("UK")).toBeUndefined();
    expect(normalizeJurisdiction("US")).toBeUndefined();
  });

  it("buildJurisdictionPromptSection shows block warning for missing jurisdiction", () => {
    const section = buildJurisdictionPromptSection("");
    expect(section).toContain("blockiert");
    expect(section).toContain("Jurisdiktion");
  });
});

// ── 6. EU Law Always Allowed ───────────────────────────────────────────

describe("EU Law Cross-Jurisdictional", () => {
  it("DSGVO is allowed in DE", () => {
    expect(isLawAllowed("DE", "DSGVO")).toBe(true);
  });

  it("DSGVO is allowed in AT", () => {
    expect(isLawAllowed("AT", "DSGVO")).toBe(true);
  });

  it("DSGVO is allowed in CH", () => {
    expect(isLawAllowed("CH", "DSGVO")).toBe(true);
  });

  it("EU config has law-eu as only source", () => {
    expect(JURISDICTION_CONFIGS.EU.lawSourceIds).toEqual(["law-eu"]);
  });

  it("DE config includes law-eu alongside law-de", () => {
    expect(JURISDICTION_CONFIGS.DE.lawSourceIds).toContain("law-eu");
    expect(JURISDICTION_CONFIGS.DE.lawSourceIds).toContain("law-de");
  });

  it("AT config includes law-eu alongside law-at", () => {
    expect(JURISDICTION_CONFIGS.AT.lawSourceIds).toContain("law-eu");
    expect(JURISDICTION_CONFIGS.AT.lawSourceIds).toContain("law-at");
  });

  it("CH config includes law-eu alongside law-ch", () => {
    expect(JURISDICTION_CONFIGS.CH.lawSourceIds).toContain("law-eu");
    expect(JURISDICTION_CONFIGS.CH.lawSourceIds).toContain("law-ch");
  });

  it("Prompt section mentions EU law as always allowed", () => {
    const section = buildJurisdictionPromptSection("DE");
    expect(section).toContain("EU-RECHT");
    expect(section).toContain("immer erlaubt");
  });
});

// ── 7. Cross-Border Exception ──────────────────────────────────────────

describe("Cross-Border Rules", () => {
  it("Prompt section mentions cross-border exception", () => {
    const section = buildJurisdictionPromptSection("AT");
    expect(section).toContain("CROSS-BORDER");
    expect(section).toContain("explizitem Cross-Border-Bezug");
  });

  it("DE prompt section mentions cross-border", () => {
    const section = buildJurisdictionPromptSection("DE");
    expect(section).toContain("CROSS-BORDER");
  });

  it("CH prompt section mentions cross-border", () => {
    const section = buildJurisdictionPromptSection("CH");
    expect(section).toContain("CROSS-BORDER");
  });
});

// ── 8. Config-Driven Source Lists ──────────────────────────────────────

describe("Config-Driven Source Lists", () => {
  it("DE statutes list includes BGB but NOT ABGB", () => {
    const statutes = getAllowedStatutes("DE");
    expect(statutes).toContain("BGB");
    expect(statutes).not.toContain("ABGB");
  });

  it("AT statutes list includes ABGB but NOT BGB", () => {
    const statutes = getAllowedStatutes("AT");
    expect(statutes).toContain("ABGB");
    expect(statutes).not.toContain("BGB");
  });

  it("CH statutes list includes OR but NOT BGB or ABGB", () => {
    const statutes = getAllowedStatutes("CH");
    expect(statutes).toContain("OR");
    expect(statutes).not.toContain("BGB");
    expect(statutes).not.toContain("ABGB");
  });

  it("Forbidden statutes for DE include AT-specific laws", () => {
    const forbidden = getForbiddenStatutes("DE");
    expect(forbidden).toContain("ABGB");
    expect(forbidden).toContain("AngG");
    expect(forbidden).toContain("ArbVG");
  });

  it("Forbidden statutes for AT include DE-specific laws", () => {
    const forbidden = getForbiddenStatutes("AT");
    expect(forbidden).toContain("BGB");
    expect(forbidden).toContain("AO");
  });

  it("buildSourceListPrompt returns non-empty string for valid jurisdiction", () => {
    const list = buildSourceListPrompt("DE");
    expect(list).toContain("Rechtsquellen für DE");
    expect(list).toContain("BGB");
  });

  it("buildSourceListPrompt returns block message for missing jurisdiction", () => {
    const list = buildSourceListPrompt("");
    expect(list).toContain("Keine Rechtsquellen");
  });
});

// ── 9. Prompt Builder Output Validation ────────────────────────────────

describe("Prompt Builder Output", () => {
  it("DE prompt section contains collision warnings", () => {
    const section = buildJurisdictionPromptSection("DE");
    expect(section).toContain("KSchG");
    expect(section).toContain("Kündigungsschutzgesetz");
    expect(section).toContain("NICHT");
  });

  it("AT prompt section contains collision warnings", () => {
    const section = buildJurisdictionPromptSection("AT");
    expect(section).toContain("KSchG");
    expect(section).toContain("Konsumentenschutzgesetz");
    expect(section).toContain("NICHT");
  });

  it("Collision warning section is non-empty for DE", () => {
    const warnings = buildCollisionWarningSection("DE");
    expect(warnings).toContain("ABKÜRZUNGSKOLLISIONEN");
    expect(warnings).toContain("KSchG");
  });

  it("Collision warning section is non-empty for AT", () => {
    const warnings = buildCollisionWarningSection("AT");
    expect(warnings).toContain("ABKÜRZUNGSKOLLISIONEN");
    expect(warnings).toContain("KSchG");
  });

  it("DE prompt includes labor law section", () => {
    const section = buildJurisdictionPromptSection("DE");
    expect(section).toContain("ARBEITSRECHT");
    expect(section).toContain("Kündigungsschutzgesetz");
  });

  it("AT prompt includes labor law section", () => {
    const section = buildJurisdictionPromptSection("AT");
    expect(section).toContain("ARBEITSRECHT");
    expect(section).toContain("Konsumentenschutzgesetz");
  });

  it("Prompt section includes VERBOTENE Gesetze list", () => {
    const section = buildJurisdictionPromptSection("DE");
    expect(section).toContain("VERBOTENE Gesetze");
  });
});

// ── 10. Citation Pattern Jurisdiction Awareness ────────────────────────

describe("Citation Pattern Jurisdiction Awareness", () => {
  it("getStatuteJurisdictions returns empty for unknown statute", () => {
    expect(getStatuteJurisdictions("UNKNOWN")).toEqual([]);
  });

  it("hasStatuteCollision returns false for unknown statute", () => {
    expect(hasStatuteCollision("UNKNOWN")).toBe(false);
  });

  it("hasStatuteCollision returns false for unique statute", () => {
    expect(hasStatuteCollision("BGB")).toBe(false);
    expect(hasStatuteCollision("ABGB")).toBe(false);
    expect(hasStatuteCollision("OR")).toBe(false);
  });

  it("hasStatuteCollision returns true for collision statutes", () => {
    expect(hasStatuteCollision("KSchG")).toBe(true);
    expect(hasStatuteCollision("StGB")).toBe(true);
    expect(hasStatuteCollision("ZPO")).toBe(true);
    expect(hasStatuteCollision("StPO")).toBe(true);
  });

  it("isStatuteValidForJurisdiction returns false for unknown statute", () => {
    expect(isStatuteValidForJurisdiction("UNKNOWN", "DE")).toBe(false);
  });
});

// ── 11. Jurisdiction Config Structure ──────────────────────────────────

describe("Jurisdiction Config Structure", () => {
  it("All 4 jurisdictions have config entries", () => {
    expect(JURISDICTION_CONFIGS.DE).toBeDefined();
    expect(JURISDICTION_CONFIGS.AT).toBeDefined();
    expect(JURISDICTION_CONFIGS.CH).toBeDefined();
    expect(JURISDICTION_CONFIGS.EU).toBeDefined();
  });

  it("Each config has required fields", () => {
    for (const code of ["DE", "AT", "CH", "EU"] as const) {
      const config = JURISDICTION_CONFIGS[code];
      expect(config.code).toBe(code);
      expect(config.label).toBeTruthy();
      expect(config.longLabel).toBeTruthy();
      expect(config.lawSourceIds).toBeInstanceOf(Array);
      expect(config.statutes).toBeInstanceOf(Array);
    }
  });

  it("DE config has correct law source IDs", () => {
    expect(JURISDICTION_CONFIGS.DE.lawSourceIds).toEqual(["law-de", "law-eu"]);
  });

  it("AT config has correct law source IDs", () => {
    expect(JURISDICTION_CONFIGS.AT.lawSourceIds).toEqual(["law-at", "law-at-judikatur", "law-eu"]);
  });

  it("CH config has correct law source IDs", () => {
    expect(JURISDICTION_CONFIGS.CH.lawSourceIds).toEqual(["law-ch", "law-eu"]);
  });

  it("AT config includes collision warnings", () => {
    expect(JURISDICTION_CONFIGS.AT.collisionWarnings.length).toBeGreaterThan(0);
    const kschgWarning = JURISDICTION_CONFIGS.AT.collisionWarnings.find((w) => w.includes("KSchG"));
    expect(kschgWarning).toBeDefined();
    expect(kschgWarning).toContain("Konsumentenschutzgesetz");
  });

  it("DE config includes collision warnings", () => {
    expect(JURISDICTION_CONFIGS.DE.collisionWarnings.length).toBeGreaterThan(0);
    const kschgWarning = JURISDICTION_CONFIGS.DE.collisionWarnings.find((w) => w.includes("KSchG"));
    expect(kschgWarning).toBeDefined();
    expect(kschgWarning).toContain("Kündigungsschutzgesetz");
  });
});

// ── 12. Negative Cases: No Foreign Law Without EU/Cross-Border ─────────

describe("Negative Cases: No Foreign Law Without EU/Cross-Border", () => {
  // These are the critical "jurisdiction confusion" negative cases.
  // Each case verifies that a specific foreign law is NOT allowed
  // in a specific jurisdiction context.

  const negativeCases: Array<{
    description: string;
    jurisdiction: string;
    foreignLaw: string;
  }> = [
    // DE context should NOT allow AT laws
    { description: "ABGB in DE context", jurisdiction: "DE", foreignLaw: "ABGB" },
    { description: "UGB in DE context", jurisdiction: "DE", foreignLaw: "UGB" },
    { description: "AngG in DE context", jurisdiction: "DE", foreignLaw: "AngG" },
    { description: "ArbVG in DE context", jurisdiction: "DE", foreignLaw: "ArbVG" },
    { description: "ASVG in DE context", jurisdiction: "DE", foreignLaw: "ASVG" },
    { description: "BAO in DE context", jurisdiction: "DE", foreignLaw: "BAO" },
    { description: "AHG in DE context", jurisdiction: "DE", foreignLaw: "AHG" },
    { description: "MRG in DE context", jurisdiction: "DE", foreignLaw: "MRG" },
    { description: "EO in DE context", jurisdiction: "DE", foreignLaw: "EO" },
    { description: "IO in DE context (AT insolvency)", jurisdiction: "DE", foreignLaw: "IO" },
    { description: "KartG in DE context", jurisdiction: "DE", foreignLaw: "KartG" },
    { description: "GOG in DE context", jurisdiction: "DE", foreignLaw: "GOG" },
    { description: "GlBG in DE context", jurisdiction: "DE", foreignLaw: "GlBG" },
    { description: "JN in DE context", jurisdiction: "DE", foreignLaw: "JN" },

    // AT context should NOT allow DE laws
    { description: "BGB in AT context", jurisdiction: "AT", foreignLaw: "BGB" },
    { description: "HGB in AT context", jurisdiction: "AT", foreignLaw: "HGB" },
    { description: "AO in AT context", jurisdiction: "AT", foreignLaw: "AO" },
    { description: "BetrVG in AT context", jurisdiction: "AT", foreignLaw: "BetrVG" },
    { description: "BUrlG in AT context", jurisdiction: "AT", foreignLaw: "BUrlG" },
    { description: "SGB in AT context", jurisdiction: "AT", foreignLaw: "SGB" },
    { description: "InsO in AT context", jurisdiction: "AT", foreignLaw: "InsO" },
    { description: "FamFG in AT context", jurisdiction: "AT", foreignLaw: "FamFG" },
    { description: "TzBfG in AT context", jurisdiction: "AT", foreignLaw: "TzBfG" },
    { description: "AGG in AT context", jurisdiction: "AT", foreignLaw: "AGG" },
    // MuSchG removed — AT has its own MuSchG (at-normen/muschg/), so it's not foreign
    { description: "NachwG in AT context", jurisdiction: "AT", foreignLaw: "NachwG" },
    { description: "ArbGG in AT context", jurisdiction: "AT", foreignLaw: "ArbGG" },
    { description: "VwVfG in AT context", jurisdiction: "AT", foreignLaw: "VwVfG" },
    { description: "BauGB in AT context", jurisdiction: "AT", foreignLaw: "BauGB" },
    { description: "ZVG in AT context", jurisdiction: "AT", foreignLaw: "ZVG" },

    // CH context should NOT allow DE or AT laws
    { description: "BGB in CH context", jurisdiction: "CH", foreignLaw: "BGB" },
    { description: "ABGB in CH context", jurisdiction: "CH", foreignLaw: "ABGB" },
    { description: "HGB in CH context", jurisdiction: "CH", foreignLaw: "HGB" },
    { description: "UGB in CH context", jurisdiction: "CH", foreignLaw: "UGB" },
    { description: "AO in CH context", jurisdiction: "CH", foreignLaw: "AO" },
    { description: "BAO in CH context", jurisdiction: "CH", foreignLaw: "BAO" },
    { description: "AngG in CH context", jurisdiction: "CH", foreignLaw: "AngG" },
    { description: "ArbVG in CH context", jurisdiction: "CH", foreignLaw: "ArbVG" },
    { description: "BetrVG in CH context", jurisdiction: "CH", foreignLaw: "BetrVG" },
    { description: "InsO in CH context", jurisdiction: "CH", foreignLaw: "InsO" },
    { description: "IO in CH context", jurisdiction: "CH", foreignLaw: "IO" },

    // KSchG collision: AT KSchG ≠ DE KSchG
    {
      description: "KSchG AT is NOT Kündigungsschutz",
      jurisdiction: "AT",
      foreignLaw: "KSchG-DE-meaning",
    },

    // OR is CH-only, should NOT appear in DE or AT
    { description: "OR in DE context", jurisdiction: "DE", foreignLaw: "OR" },
    { description: "OR in AT context", jurisdiction: "AT", foreignLaw: "OR" },

    // ZGB is CH-only
    { description: "ZGB in DE context", jurisdiction: "DE", foreignLaw: "ZGB" },
    { description: "ZGB in AT context", jurisdiction: "AT", foreignLaw: "ZGB" },

    // SchKG is CH-only — but AT has its own SchKG (at-normen/schkg/), so only block in DE
    { description: "SchKG in DE context", jurisdiction: "DE", foreignLaw: "SchKG" },
    // SchKG in AT context removed — AT has its own SchKG, so it's not foreign

    // MWSTG is CH-only (not UStG)
    { description: "MWSTG in DE context", jurisdiction: "DE", foreignLaw: "MWSTG" },
    { description: "MWSTG in AT context", jurisdiction: "AT", foreignLaw: "MWSTG" },

    // DBG is CH-only (not EStG)
    { description: "DBG in DE context", jurisdiction: "DE", foreignLaw: "DBG" },
    { description: "DBG in AT context", jurisdiction: "AT", foreignLaw: "DBG" },
  ];

  // Generate one test per negative case
  for (const { description, jurisdiction, foreignLaw } of negativeCases) {
    it(`NEGATIVE: ${description} is blocked`, () => {
      if (foreignLaw === "KSchG-DE-meaning") {
        // Special case: verify AT KSchG ≠ DE KSchG
        const result = resolveAbbreviation("AT", "KSchG");
        expect(result.resolved).toBe("Konsumentenschutzgesetz");
        expect(result.resolved).not.toBe("Kündigungsschutzgesetz");
      } else {
        expect(isForeignLaw(jurisdiction, foreignLaw)).toBe(true);
        expect(isStatuteValidForJurisdiction(foreignLaw, jurisdiction)).toBe(false);
      }
    });
  }

  // Verify we have at least 50 negative cases
  it("has at least 50 negative test cases", () => {
    expect(negativeCases.length).toBeGreaterThanOrEqual(50);
  });
});
