import { describe, test, expect } from "bun:test";
import { anonymizeText } from "../src/core/anonymize.ts";

describe("anonymizeText (regex layer, offline)", () => {
  test("redacts IBAN, email and phone", async () => {
    const text =
      "Überweisung an DE89 3704 0044 0532 0130 00, Mail kanzlei@example.de, Tel +49 30 1234567.";
    const r = await anonymizeText(text);
    expect(r.text).not.toContain("DE89 3704 0044 0532 0130 00");
    expect(r.text).not.toContain("kanzlei@example.de");
    expect(r.text).toContain("[IBAN]");
    expect(r.text).toContain("[E-MAIL]");
    expect(r.stats.iban).toBe(1);
    expect(r.stats.email).toBe(1);
    expect(r.llmUsed).toBe(false);
  });

  test("redacts Aktenzeichen", async () => {
    const r = await anonymizeText("Im Verfahren 4 O 123/26 vor dem LG.");
    expect(r.text).toContain("[AKTENZEICHEN]");
    expect(r.text).not.toContain("4 O 123/26");
  });

  test("consistent placeholders: same value → same placeholder", async () => {
    const detectNames = async () => [{ text: "Müller GmbH", type: "organization" as const }];
    const r = await anonymizeText("Müller GmbH klagt. Müller GmbH ist Mandantin.", { detectNames });
    const matches = r.text.match(/\[UNTERNEHMEN 1\]/g) ?? [];
    expect(matches.length).toBe(2);
    expect(r.text).not.toContain("Müller GmbH");
    expect(r.llmUsed).toBe(true);
  });

  test("respects the types filter", async () => {
    const r = await anonymizeText("Mail a@b.de und IBAN DE89370400440532013000.", {
      types: ["email"],
    });
    expect(r.text).toContain("[E-MAIL]");
    expect(r.text).toContain("DE89370400440532013000"); // IBAN not in filter → kept
  });

  test("clean text yields no replacements", async () => {
    const r = await anonymizeText("Der Vertrag regelt die Gewährleistung nach BGB.");
    expect(r.replacements.length).toBe(0);
    expect(r.text).toBe("Der Vertrag regelt die Gewährleistung nach BGB.");
  });

  test("name detector failure degrades to regex-only (no throw)", async () => {
    const detectNames = async () => {
      throw new Error("LLM down");
    };
    const r = await anonymizeText("Mail x@y.de", { detectNames });
    expect(r.text).toContain("[E-MAIL]");
  });
});
