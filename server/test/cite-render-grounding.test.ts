/**
 * Anti-hallucination: `validateCitationsAgainstContext` enforces that every
 * citation the model emits points at context actually retrieved for the
 * synthesis. A citation to a slug/row that was never gathered is a fabrication
 * and must be dropped + flagged. This is the grounding guarantee the think
 * prompt only asks for — these tests make it load-bearing.
 */
import { describe, test, expect } from "bun:test";
import {
  validateCitationsAgainstContext,
  type ParsedCitation,
  type CitationContext,
} from "../src/core/think/cite-render.ts";

function ctx(pageSlugs: string[], takeKeys: string[]): CitationContext {
  return {
    pageSlugs: new Set(pageSlugs.map((s) => s.toLowerCase())),
    takeKeys: new Set(takeKeys.map((s) => s.toLowerCase())),
  };
}

function cite(page_slug: string, row_num: number | null, idx = 1): ParsedCitation {
  return { page_slug, row_num, citation_index: idx };
}

describe("validateCitationsAgainstContext", () => {
  test("keeps citations that point at gathered pages and takes", () => {
    const c = ctx(["legal/statutes/de/bgb/p-307"], ["people/alice-example#3"]);
    const { valid, invalid, warnings } = validateCitationsAgainstContext(
      [cite("legal/statutes/de/bgb/p-307", null), cite("people/alice-example", 3)],
      c
    );
    expect(valid.length).toBe(2);
    expect(invalid.length).toBe(0);
    expect(warnings.length).toBe(0);
  });

  test("drops a page citation to a slug never gathered (fabricated)", () => {
    const c = ctx(["legal/statutes/de/bgb/p-307"], []);
    const { valid, invalid, warnings } = validateCitationsAgainstContext(
      [cite("legal/statutes/de/bgb/p-309", null)],
      c
    );
    expect(valid.length).toBe(0);
    expect(invalid.length).toBe(1);
    expect(warnings).toContain("CITATION_NOT_IN_CONTEXT: legal/statutes/de/bgb/p-309");
  });

  test("drops a take citation whose row was never in the gathered take set", () => {
    const c = ctx(["people/alice-example"], ["people/alice-example#3"]);
    // page_slug is in context, but row 9 was never gathered → fabricated take.
    const { valid, invalid, warnings } = validateCitationsAgainstContext(
      [cite("people/alice-example", 9)],
      c
    );
    expect(valid.length).toBe(0);
    expect(invalid.length).toBe(1);
    expect(warnings).toContain("CITATION_NOT_IN_CONTEXT: people/alice-example#9");
  });

  test("a gathered take's page_slug is a valid page-level citation target", () => {
    // Only the take was gathered; a page-level [slug] citation to its page is fine.
    const c = ctx(["companies/acme-example"], ["companies/acme-example#1"]);
    const { valid } = validateCitationsAgainstContext([cite("companies/acme-example", null)], c);
    expect(valid.length).toBe(1);
  });

  test("is case-insensitive on slugs (matches normalizeStructuredCitations)", () => {
    const c = ctx(["legal/statutes/de/bgb/p-307"], []);
    const { valid } = validateCitationsAgainstContext(
      [cite("Legal/Statutes/DE/BGB/P-307", null)],
      c
    );
    expect(valid.length).toBe(1);
  });

  test("partitions a mixed batch: keeps grounded, drops fabricated", () => {
    const c = ctx(
      ["legal/statutes/de/bgb/p-307", "people/alice-example"],
      ["people/alice-example#3"]
    );
    const { valid, invalid } = validateCitationsAgainstContext(
      [
        cite("legal/statutes/de/bgb/p-307", null, 1), // grounded
        cite("people/alice-example", 3, 2), // grounded
        cite("legal/statutes/de/hgb/p-1", null, 3), // fabricated page
        cite("people/alice-example", 99, 4), // fabricated row
      ],
      c
    );
    expect(valid.map((v) => v.citation_index)).toEqual([1, 2]);
    expect(invalid.map((v) => v.citation_index)).toEqual([3, 4]);
  });

  test("empty citation list yields empty result, no warnings", () => {
    const { valid, invalid, warnings } = validateCitationsAgainstContext([], ctx([], []));
    expect(valid.length).toBe(0);
    expect(invalid.length).toBe(0);
    expect(warnings.length).toBe(0);
  });
});
