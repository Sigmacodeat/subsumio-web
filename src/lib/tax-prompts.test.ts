import { describe, test, expect } from "vitest";
import {
  taxAnalysisSystemPrompt,
  taxSummarizeSystemPrompt,
  taxDeadlineExtractionPrompt,
  taxRiskAssessmentPrompt,
  taxReturnPlausibilityPrompt,
} from "./tax-prompts";

describe("tax-prompts", () => {
  test("taxAnalysisSystemPrompt includes AO reference", () => {
    const prompt = taxAnalysisSystemPrompt();
    expect(prompt).toContain("AO");
    expect(prompt).toContain("Steuerberater");
  });

  test("taxAnalysisSystemPrompt includes jurisdiction", () => {
    const de = taxAnalysisSystemPrompt({ jurisdiction: "DE" });
    const at = taxAnalysisSystemPrompt({ jurisdiction: "AT" });
    expect(de).toContain("deutsches");
    expect(at).toContain("österreichisches");
  });

  test("taxAnalysisSystemPrompt includes tax type", () => {
    const prompt = taxAnalysisSystemPrompt({ taxType: "USt" });
    expect(prompt).toContain("USt");
  });

  test("taxSummarizeSystemPrompt is concise", () => {
    const prompt = taxSummarizeSystemPrompt();
    expect(prompt).toContain("Steuerberater-Assistent");
    expect(prompt.length).toBeLessThan(1000);
  });

  test("taxDeadlineExtractionPrompt includes document text", () => {
    const prompt = taxDeadlineExtractionPrompt("Einspruchsfrist: 15.03.2025");
    expect(prompt).toContain("Einspruchsfrist");
    expect(prompt).toContain("legal_basis");
    expect(prompt).toContain("urgency");
  });

  test("taxDeadlineExtractionPrompt sanitizes HTML", () => {
    const prompt = taxDeadlineExtractionPrompt("<script>alert(1)</script>");
    expect(prompt).not.toContain("<script>");
  });

  test("taxRiskAssessmentPrompt includes risk categories", () => {
    const prompt = taxRiskAssessmentPrompt("Bescheid vom 01.03.2025");
    expect(prompt).toContain("Verspätungszuschlag");
    expect(prompt).toContain("Steuerhinterziehung");
    expect(prompt).toContain("Festsetzungsverjährung");
  });

  test("taxReturnPlausibilityPrompt includes declared values", () => {
    const prompt = taxReturnPlausibilityPrompt("ESt", { einkommen: 50000, steuer: 8000 });
    expect(prompt).toContain("einkommen: 50000");
    expect(prompt).toContain("steuer: 8000");
    expect(prompt).toContain("ESt");
  });

  test("all prompts contain critical rules", () => {
    const analysis = taxAnalysisSystemPrompt();
    expect(analysis).toContain("KRITISCHE REGELN");
    expect(analysis).toContain("NIEMALS");
  });
});
