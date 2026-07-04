import { describe, it, expect } from "bun:test";
import { detectJurisdiction } from "../src/commands/web-api.ts";
import { classifyLegalDocument, legalDocTypeLabel } from "../src/core/legal/doc-classifier.ts";
import { pruefeGZKonsistenz, validiereGZ } from "../src/core/legal/gz-validate.ts";

// ─── C1: Jurisdiction detection regression tests ─────────────────────

describe("detectJurisdiction (C1 fix)", () => {
  it("StPO alone does not bias toward AT — DE-specific indicators win", () => {
    // A German criminal case mentioning StPO + BGB + BRAO should be DE, not AT
    const text =
      "Gemäß § 198 StPO wird Einspruch eingelegt. Das BGB regelt die Zivilrechtlichen Ansprüche. BRAO § 43.";
    const result = detectJurisdiction({}, text);
    expect(result.jurisdiction).toBe("de");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("StPO alone does not bias toward AT — AT-specific indicators win", () => {
    // An Austrian case with ABGB + StPO + Landesgericht should be AT
    const text = "Gemäß § 321 ABGB und § 9 StPO wird beantragt. Das Landesgericht Wien verhandelt.";
    const result = detectJurisdiction({}, text);
    expect(result.jurisdiction).toBe("at");
  });

  it("GZ pattern is a strong AT indicator", () => {
    // A document with a GZ pattern but no other jurisdiction indicators
    const text = "Aktenzeichen 10 C 125/95t - 1. Beschluss vom 3.5.2024.";
    const result = detectJurisdiction({}, text);
    expect(result.jurisdiction).toBe("at");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("OWiG is counted as DE-only indicator", () => {
    const text = "Gemäß § 24 OWiG wird Bußgeld verhängt. Das Amtsgericht München entscheidet.";
    const result = detectJurisdiction({}, text);
    expect(result.jurisdiction).toBe("de");
  });

  it("ON\\s?d regex with /g flag catches multiple ON-Nummern", () => {
    const text = "ON 123 ON456 ON 789 — drei Eintragungen im Verzeichnis.";
    const result = detectJurisdiction({}, text);
    expect(result.jurisdiction).toBe("at");
  });

  it("explicit frontmatter jurisdiction overrides heuristics with confidence 1.0", () => {
    const result = detectJurisdiction({ jurisdiction: "ch" }, "BGB ZPO StPO ABGB");
    expect(result.jurisdiction).toBe("ch");
    expect(result.confidence).toBe(1.0);
    expect(result.unverified).toBe(false);
  });

  it("no indicators returns AT default with confidence 0 and unverified", () => {
    const result = detectJurisdiction({}, "Hello world, this is a generic text.");
    expect(result.jurisdiction).toBe("at");
    expect(result.confidence).toBe(0);
    expect(result.unverified).toBe(true);
  });

  it("close tie marks as unverified", () => {
    // Equal weight AT and DE — should be unverified
    const text = "ABGB BGB StPO ZPO";
    const result = detectJurisdiction({}, text);
    expect(result.unverified).toBe(true);
  });

  it("C3: returns confidence and unverified fields", () => {
    const result = detectJurisdiction({}, "ABGB ABGB ABGV Landesgericht Wien");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("unverified");
    expect(typeof result.confidence).toBe("number");
    expect(typeof result.unverified).toBe("boolean");
  });
});

// ─── E3: Doc-classifier regression tests ─────────────────────────────

describe("classifyLegalDocument (E3 fix)", () => {
  it("classifies ladung (court summons)", () => {
    const text =
      "Ladung zur Hauptverhandlung. Sie werden geladen, am 15.3.2024 um 9:00 Uhr im Saal 3 zu erscheinen. Terminsverlegung beantragt.";
    const result = classifyLegalDocument(text);
    expect(result.type).toBe("ladung");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("classifies zahlungsbefehl (payment order)", () => {
    const text =
      "Zahlungsbefehl: Der Schuldner wird verpflichtet, die Hauptforderung von € 5.000 sowie Zinsen zu zahlen. Mahnverfahren wurde durchgeführt.";
    const result = classifyLegalDocument(text);
    expect(result.type).toBe("zahlungsbefehl");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("classifies erv_erledigung (ERV message)", () => {
    const text =
      "ERV-Erledigung über elektronischen Rechtsverkehr. Zustellung via justiz.gv.at. ERV-Rückverkehr bestätigt.";
    const result = classifyLegalDocument(text);
    expect(result.type).toBe("erv_erledigung");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("témoin typo is fixed — witness statement with French text", () => {
    // The typo "témain" was fixed to "témoin" — this should classify as witness_statement
    const text =
      "Audition du témoin. Le témoin a fait une déposition sous serment. témoignage enregistré.";
    const result = classifyLegalDocument(text);
    expect(result.type).toBe("witness_statement");
  });

  it("legalDocTypeLabel has labels for all new types", () => {
    expect(legalDocTypeLabel("ladung")).toBe("Ladung");
    expect(legalDocTypeLabel("zahlungsbefehl")).toBe("Zahlungsbefehl");
    expect(legalDocTypeLabel("erv_erledigung")).toBe("ERV-Erledigung");
  });

  it("legalDocTypeLabel falls back for unknown types", () => {
    expect(legalDocTypeLabel("legal_document")).toBe("Rechtsdokument");
  });
});

// ─── A1: GZ validation in pipeline regression tests ──────────────────

describe("GZ validation wiring (A1 regression)", () => {
  it("pruefeGZKonsistenz catches OCR-confusable GZ that would enter pipeline", () => {
    // Simulate what the pipeline does: extract GZ raws from ON entries
    const gzRaws = ["10 C 125/95t - 1", "1O C l25/95t - 2"]; // Second has OCR confusables
    const result = pruefeGZKonsistenz(gzRaws);
    expect(result.einheitlich).toBe(false);
    expect(result.abweichungen.length).toBeGreaterThan(0);
    // The pipeline should detect fehler-level befunde
    const fehler = result.befundeProGZ.flatMap((v) =>
      v.befunde.filter((b) => b.schwere === "fehler")
    );
    expect(fehler.length).toBeGreaterThan(0);
  });

  it("pruefeGZKonsistenz passes clean GZ set — pipeline should not flag", () => {
    const gzRaws = ["10 C 125/95t - 1", "10 C 125/95t - 2", "10 C 125/95t - 3"];
    const result = pruefeGZKonsistenz(gzRaws);
    expect(result.einheitlich).toBe(true);
    const fehler = result.befundeProGZ.flatMap((v) =>
      v.befunde.filter((b) => b.schwere === "fehler")
    );
    expect(fehler).toHaveLength(0);
  });

  it("validiereGZ detects OCR confusable O instead of 0", () => {
    const v = validiereGZ("1O C 125/95t");
    expect(v.gueltig).toBe(false);
    expect(v.befunde.some((b) => b.code === "ocr_verdacht")).toBe(true);
  });

  it("validiereGZ detects OCR confusable l instead of 1", () => {
    const v = validiereGZ("l0 C 125/95t");
    expect(v.gueltig).toBe(false);
    expect(v.befunde.some((b) => b.code === "ocr_verdacht")).toBe(true);
  });

  it("pruefeGZKonsistenz returns verfahrenstyp from valid GZ", () => {
    const result = pruefeGZKonsistenz(["10 C 125/95t - 1"]);
    const verfahrenstyp = result.befundeProGZ.find((v) => v.verfahrenstyp)?.verfahrenstyp;
    expect(verfahrenstyp).toBe("zivil");
  });

  it("pruefeGZKonsistenz returns leitzahl for uniform GZ set", () => {
    const result = pruefeGZKonsistenz(["10 C 125/95t - 1", "10 C 125/95t - 2"]);
    expect(result.leitzahl).toBe("10 C 125/95t");
  });

  it("empty GZ list returns no leitzahl and is not einheitlich", () => {
    const result = pruefeGZKonsistenz([]);
    expect(result.leitzahl).toBeNull();
    expect(result.einheitlich).toBe(false);
  });
});
