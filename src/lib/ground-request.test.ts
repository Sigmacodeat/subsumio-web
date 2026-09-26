// @vitest-environment node
import { describe, expect, test } from "vitest";
import { groundRequestSchema } from "@/lib/ground-request";
import { groundAnswerCitations } from "@/lib/citation-gate";

describe("citation check of long texts", () => {
  test("an 80,000-character draft is accepted for the check", () => {
    const text = `${"Sachverhalt und Würdigung. ".repeat(3_000)} Nach § 1295 ABGB haftet der Schädiger.`;
    expect(text.length).toBeGreaterThan(80_000);
    expect(groundRequestSchema.safeParse({ text }).success).toBe(true);
  });

  test("the citation at the end of a long text is still found", async () => {
    const text = `${"Lorem ipsum dolor. ".repeat(5_000)} Nach § 1295 ABGB haftet der Schädiger.`;
    const meta = await groundAnswerCitations(text, { jurisdiction: "at" });
    expect(meta.grounded_citations.map((c) => `${c.paragraph} ${c.code}`)).toContain("§ 1295 ABGB");
  });
});
