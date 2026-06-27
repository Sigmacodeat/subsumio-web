/**
 * Obsidian inline tag extraction tests (v0.43.0).
 * Validates #tag parsing from markdown body text.
 */

import { describe, test, expect } from "bun:test";
import { extractInlineTags, extractAliases } from "../src/core/markdown.ts";

describe("extractInlineTags", () => {
  test("extracts simple #tags from body", () => {
    const text = "This is about #startups and #ai.";
    expect(extractInlineTags(text)).toEqual(["startups", "ai"]);
  });

  test("extracts nested #tags with slashes", () => {
    const text = "File under #projects/2024 and #status/done";
    expect(extractInlineTags(text)).toEqual(["projects/2024", "status/done"]);
  });

  test("ignores tags inside code blocks", () => {
    const text = `# Heading
\`\`\`
#not-a-tag
\`\`\`
But this is #real.
`;
    expect(extractInlineTags(text)).toEqual(["real"]);
  });

  test("ignores tags inside URLs", () => {
    const text = "See https://example.com/page#section and #topic";
    expect(extractInlineTags(text)).toEqual(["topic"]);
  });

  test("ignores pure numeric tags", () => {
    const text = "Item #123 and #real-tag";
    expect(extractInlineTags(text)).toEqual(["real-tag"]);
  });

  test("deduplicates tags", () => {
    const text = "#idea #idea #feature";
    expect(extractInlineTags(text)).toEqual(["idea", "feature"]);
  });

  test("lowercases tags", () => {
    const text = "#STARTUP #AI";
    expect(extractInlineTags(text)).toEqual(["startup", "ai"]);
  });
});

describe("extractAliases", () => {
  test("extracts array aliases", () => {
    const fm = { aliases: ["Alice C.", "A. Chen"] };
    expect(extractAliases(fm)).toEqual(["Alice C.", "A. Chen"]);
  });

  test("extracts string alias", () => {
    const fm = { aliases: "Alice C." };
    expect(extractAliases(fm)).toEqual(["Alice C."]);
  });

  test("returns empty array when no aliases", () => {
    expect(extractAliases({})).toEqual([]);
    expect(extractAliases({ aliases: null })).toEqual([]);
  });
});
