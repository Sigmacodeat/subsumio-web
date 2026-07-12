import { describe, test, expect } from "bun:test";
import {
  parseContextChunks,
  buildProvenance,
  provenanceSummary,
  provenanceToJSON,
} from "../src/core/provenance.ts";

// ── Fixtures ──────────────────────────────────────────────────────────

const PAGES_BLOCK = `<page slug="legal/statutes/de/bgb/p-433" rank="1">
## § 433 BGB — Vertragstypische Pflichten
(1) Der Verkäufer ist verpflichtet, dem Käufer die Sache zu übergeben und das Eigentum an ihr zu verschaffen.
(2) Der Käufer ist verpflichtet, dem Verkäufer den vereinbarten Kaufpreis zu zahlen.
</page>

<page slug="legal/statutes/de/bgb/p-434" rank="2">
## § 434 BGB — Sachmangel
(1) Die Sache ist frei von Sachmängeln, wenn sie bei Gefahrübergang die vereinbarte Beschaffenheit hat.
</page>`;

const ANSWER_WITH_CITATIONS = `Der Verkäufer ist verpflichtet, dem Käufer die Sache zu übergeben. § 433 BGB regelt die Vertragspflichten beim Kaufvertrag. § 434 BGB definiert den Sachmangel.`;

// ── parseContextChunks ────────────────────────────────────────────────

describe("parseContextChunks", () => {
  test("parses XML-tagged pages into SourceChunk objects", () => {
    const chunks = parseContextChunks(PAGES_BLOCK);
    expect(chunks.length).toBe(2);
    expect(chunks[0].slug).toBe("legal/statutes/de/bgb/p-433");
    expect(chunks[0].rank).toBe(1);
    expect(chunks[0].text).toContain("§ 433 BGB");
    expect(chunks[1].slug).toBe("legal/statutes/de/bgb/p-434");
    expect(chunks[1].rank).toBe(2);
  });

  test("returns empty array for empty input", () => {
    expect(parseContextChunks("").length).toBe(0);
  });

  test("returns empty array for non-page XML", () => {
    expect(parseContextChunks("<other>text</other>").length).toBe(0);
  });

  test("parses passage_start and passage_end offset attributes", () => {
    const block = `<page slug="legal/de/bgb/p-433" rank="1" passage_start="0" passage_end="250">
## § 433 BGB — Vertragstypische Pflichten
Der Verkäufer ist verpflichtet, dem Käufer die Sache zu übergeben.
</page>`;
    const chunks = parseContextChunks(block);
    expect(chunks.length).toBe(1);
    expect(chunks[0].chunk_start).toBe(0);
    expect(chunks[0].chunk_end).toBe(250);
  });

  test("handles pages without offset attributes (backward compat)", () => {
    const block = `<page slug="legal/de/bgb/p-433" rank="1">
## § 433 BGB
Der Verkäufer ist verpflichtet.
</page>`;
    const chunks = parseContextChunks(block);
    expect(chunks.length).toBe(1);
    expect(chunks[0].chunk_start).toBeUndefined();
    expect(chunks[0].chunk_end).toBeUndefined();
  });
});

// ── buildProvenance ───────────────────────────────────────────────────

describe("buildProvenance", () => {
  test("builds provenance links for claims with citations", () => {
    const result = buildProvenance(ANSWER_WITH_CITATIONS, PAGES_BLOCK);
    expect(result.links.length).toBeGreaterThanOrEqual(2);
    expect(result.source_chunks.length).toBe(2);
  });

  test("links claim to correct source slug", () => {
    const result = buildProvenance(ANSWER_WITH_CITATIONS, PAGES_BLOCK);
    const link433 = result.links.find((l) => l.source_slug.includes("p-433"));
    expect(link433).toBeDefined();
    expect(link433!.source_passage).toContain("433");
    expect(link433!.relevance).toBe("direct");

    const link434 = result.links.find((l) => l.source_slug.includes("p-434"));
    expect(link434).toBeDefined();
    expect(link434!.source_passage).toContain("434");
  });

  test("passage offsets are valid", () => {
    const result = buildProvenance(ANSWER_WITH_CITATIONS, PAGES_BLOCK);
    for (const link of result.links) {
      expect(link.passage_start).toBeGreaterThanOrEqual(0);
      expect(link.passage_end).toBeGreaterThan(link.passage_start);
    }
  });

  test("unsupported claims list claims with citations not found in context", () => {
    const answer = "Der Verkäufer muss die Sache übergeben. § 999 BGB regelt dies.";
    const result = buildProvenance(answer, PAGES_BLOCK);
    expect(result.unsupported_claims.length).toBe(1);
    expect(result.unsupported_claims[0]).toContain("§ 999");
  });

  test("claims without citations are not in unsupported list", () => {
    const answer = "Der Verkäufer ist verpflichtet, die Sache zu übergeben.";
    const result = buildProvenance(answer, PAGES_BLOCK);
    expect(result.links.length).toBe(0);
    expect(result.unsupported_claims.length).toBe(0);
  });

  test("relevance is 'direct' when passage contains exact § number", () => {
    const result = buildProvenance(ANSWER_WITH_CITATIONS, PAGES_BLOCK);
    const directLinks = result.links.filter((l) => l.relevance === "direct");
    expect(directLinks.length).toBeGreaterThanOrEqual(2);
  });

  test("handles empty answer", () => {
    const result = buildProvenance("", PAGES_BLOCK);
    expect(result.links.length).toBe(0);
    expect(result.unsupported_claims.length).toBe(0);
  });

  test("handles empty context", () => {
    const answer = "Der Verkäufer muss die Sache übergeben. § 433 BGB regelt dies.";
    const result = buildProvenance(answer, "");
    expect(result.links.length).toBe(0);
    expect(result.unsupported_claims.length).toBe(1);
  });

  test("multiple citations in one claim create multiple links", () => {
    const answer = "§ 433 BGB und § 434 BGB regeln gemeinsam den Kaufvertrag.";
    const result = buildProvenance(answer, PAGES_BLOCK);
    // Should find links for both § 433 and § 434
    const slugs = result.links.map((l) => l.source_slug);
    expect(slugs.some((s) => s.includes("p-433"))).toBe(true);
    expect(slugs.some((s) => s.includes("p-434"))).toBe(true);
  });
});

// ── provenanceSummary ─────────────────────────────────────────────────

describe("provenanceSummary", () => {
  test("generates human-readable summary", () => {
    const result = buildProvenance(ANSWER_WITH_CITATIONS, PAGES_BLOCK);
    const summary = provenanceSummary(result);
    expect(summary).toContain("Provenance Chain");
    expect(summary).toContain("links");
    expect(summary).toContain("Claim");
    expect(summary).toContain("Source:");
  });

  test("includes unsupported claims in summary", () => {
    const answer = "§ 999 BGB regelt dies.";
    const result = buildProvenance(answer, PAGES_BLOCK);
    const summary = provenanceSummary(result);
    expect(summary).toContain("Unsupported");
    expect(summary).toContain("§ 999");
  });
});

// ── provenanceToJSON ──────────────────────────────────────────────────

describe("provenanceToJSON", () => {
  test("converts to compact JSON format", () => {
    const result = buildProvenance(ANSWER_WITH_CITATIONS, PAGES_BLOCK);
    const json = provenanceToJSON(result);
    expect(json.length).toBe(result.links.length);
    expect(json[0]).toHaveProperty("claim_index");
    expect(json[0]).toHaveProperty("claim_text");
    expect(json[0]).toHaveProperty("source_slug");
    expect(json[0]).toHaveProperty("source_passage");
    expect(json[0]).toHaveProperty("relevance");
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────

describe("edge cases", () => {
  test("very long passage is truncated to window", () => {
    const longText = "Lorem ipsum dolor sit amet. ".repeat(50) + " § 433 BGB regelt die Pflichten. " + "Lorem ipsum dolor sit amet. ".repeat(50);
    const pagesBlock = `<page slug="test/long" rank="1">${longText}</page>`;
    const answer = "§ 433 BGB regelt die Pflichten.";
    const result = buildProvenance(answer, pagesBlock);
    expect(result.links.length).toBe(1);
    expect(result.links[0].source_passage.length).toBeLessThan(600);
  });

  test("passage extraction handles § without space", () => {
    const pagesBlock = `<page slug="test/no-space" rank="1">§433 BGB regelt die Pflichten des Verkäufers.</page>`;
    const answer = "§ 433 BGB regelt die Pflichten.";
    const result = buildProvenance(answer, pagesBlock);
    expect(result.links.length).toBe(1);
    expect(result.links[0].source_passage).toContain("433");
  });
});
