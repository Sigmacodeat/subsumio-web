// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  PRESET_STYLES,
  DEFAULT_STYLE,
  applyStyleToPrompt,
  getStyle,
  listStyles,
  saveStyle,
  deleteStyle,
  type WritingStyle,
} from "./writing-styles";

describe("PRESET_STYLES", () => {
  test("contains 5 preset styles", () => {
    expect(PRESET_STYLES).toHaveLength(5);
  });

  test("every preset has valid enum values", () => {
    for (const style of PRESET_STYLES) {
      expect(style.tone).toMatch(/^(formal|modern|classical|persuasive|neutral)$/);
      expect(style.formality).toBeGreaterThanOrEqual(1);
      expect(style.formality).toBeLessThanOrEqual(5);
      expect(style.length).toMatch(/^(concise|standard|detailed|exhaustive)$/);
      expect(style.language).toMatch(/^de-(AT|DE|CH)$/);
      expect(style.perspective).toMatch(/^(first_person|third_person|passive)$/);
      expect(style.citation_style).toMatch(/^(inline|footnote|endnote)$/);
      expect(style.sentence_style).toMatch(/^(short|medium|long|varied)$/);
    }
  });

  test("default style is neutral-standard", () => {
    expect(DEFAULT_STYLE.id).toBe("neutral-standard");
    expect(DEFAULT_STYLE.tone).toBe("neutral");
    expect(DEFAULT_STYLE.formality).toBe(3);
  });
});

describe("applyStyleToPrompt", () => {
  test("includes all style dimensions", () => {
    const prompt = applyStyleToPrompt(DEFAULT_STYLE);
    expect(prompt).toContain("SCHREIBSTIL-KONFIGURATION");
    expect(prompt).toContain("Tonfall:");
    expect(prompt).toContain("Formalität:");
    expect(prompt).toContain("Länge:");
    expect(prompt).toContain("Sprache:");
    expect(prompt).toContain("Perspektive:");
    expect(prompt).toContain("Zitierweise:");
    expect(prompt).toContain("Satzstil:");
  });

  test("includes custom instructions when present", () => {
    const style: WritingStyle = {
      ...DEFAULT_STYLE,
      custom_instructions: "Always cite BGB paragraphs",
      firm_name: "Musterkanzlei",
      signature: "Dr. Max Mustermann",
    };
    const prompt = applyStyleToPrompt(style);
    expect(prompt).toContain("Always cite BGB paragraphs");
    expect(prompt).toContain("Musterkanzlei");
    expect(prompt).toContain("Dr. Max Mustermann");
  });

  test("does not include optional fields when absent", () => {
    const prompt = applyStyleToPrompt(DEFAULT_STYLE);
    expect(prompt).not.toContain("Kanzlei:");
    expect(prompt).not.toContain("Signatur:");
    expect(prompt).not.toContain("Zusätzliche Anweisungen:");
  });
});

describe("style registry", () => {
  test("getStyle returns preset by id", () => {
    expect(getStyle("formal-classic")?.id).toBe("formal-classic");
  });

  test("getStyle returns null for unknown style", () => {
    expect(getStyle("nonexistent")).toBeNull();
  });

  test("listStyles includes all presets", () => {
    const styles = listStyles();
    expect(styles.length).toBeGreaterThanOrEqual(PRESET_STYLES.length);
    expect(styles.map((s) => s.id)).toContain("modern-concise");
  });

  test("saveStyle and deleteStyle work for custom styles", () => {
    const custom: WritingStyle = {
      ...DEFAULT_STYLE,
      id: "custom-test",
      name: "Custom Test",
    };
    saveStyle(custom);
    expect(getStyle("custom-test")).toEqual(custom);
    expect(deleteStyle("custom-test")).toBe(true);
    expect(getStyle("custom-test")).toBeNull();
  });

  test("preset styles cannot be deleted", () => {
    expect(deleteStyle("formal-classic")).toBe(false);
    expect(getStyle("formal-classic")).toBeDefined();
  });
});
