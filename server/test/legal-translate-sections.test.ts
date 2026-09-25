/**
 * Long documents are translated section by section, so nothing breaks off
 * mid-document; a cut-off JSON answer is reported as an incomplete
 * translation instead of being shown as one.
 */
import { describe, it, expect } from "bun:test";
import {
  splitForTranslation,
  translateDocument,
  TRANSLATION_SECTION_CHARS,
} from "../src/core/legal/translate.ts";
import type { BrainEngine } from "../src/core/engine.ts";

const engine = {} as BrainEngine;

function longText(chars: number): string {
  const paras: string[] = [];
  let n = 0;
  while (paras.join("\n\n").length < chars) {
    paras.push(`Absatz ${++n}: ` + "Der Vertrag regelt die Pflichten der Parteien. ".repeat(20).trim());
  }
  return paras.join("\n\n");
}

describe("splitForTranslation", () => {
  it("keeps every character in sections within the limit, cut at paragraphs", () => {
    const text = longText(60_000);
    const sections = splitForTranslation(text, TRANSLATION_SECTION_CHARS);
    expect(sections.length).toBeGreaterThan(1);
    for (const s of sections) expect(s.length).toBeLessThanOrEqual(TRANSLATION_SECTION_CHARS);
    expect(sections.join("\n\n")).toBe(text);
  });

  it("hard-cuts a single run longer than the limit", () => {
    const sections = splitForTranslation("x".repeat(30_000), 12_000);
    expect(sections.map((s) => s.length)).toEqual([12_000, 12_000, 6_000]);
  });
});

describe("translateDocument", () => {
  it("translates a 60 000-character document completely, section by section", async () => {
    const text = longText(60_000);
    let calls = 0;
    const llm = async ({ user }: { user: string }) => {
      calls++;
      const body = user.slice(user.indexOf(":\n\n") + 3);
      return JSON.stringify({
        translated_text: body.replace(/Absatz/g, "Paragraph"),
        glossary: [],
      });
    };
    const res = await translateDocument(engine, { text, target_language: "en", llm });
    expect(calls).toBeGreaterThan(1);
    expect(res.warnings).toEqual([]);
    const lastPara = text
      .split("\n\n")
      .pop()!
      .replace(/Absatz/g, "Paragraph");
    expect(res.translated_text.endsWith(lastPara)).toBe(true);
    expect(res.translated_text.length).toBe(text.length + text.match(/Absatz/g)!.length * 3);
  });

  it("a cut-off JSON answer is an error, not a translation", async () => {
    const llm = async () => '{"translated_text": "The contract regul';
    const res = await translateDocument(engine, {
      text: "Der Vertrag regelt.",
      target_language: "en",
      llm,
    });
    expect(res.translated_text).toBe("");
    expect(res.warnings[0]).toMatch(/^TRANSLATION_INCOMPLETE/);
  });
});
