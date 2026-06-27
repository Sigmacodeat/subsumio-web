/**
 * Natural Language Console parser tests (v0.43.0).
 * Validates intent recognition and response formatting.
 */

import { describe, test, expect } from "bun:test";
import { parseNLQuery, formatNLResponse } from "../src/core/nl-console.ts";

describe("parseNLQuery", () => {
  test("detects brain status intent", () => {
    expect(parseNLQuery("How many pages?").intent).toBe("brain_status");
    expect(parseNLQuery("Brain overview").intent).toBe("brain_status");
    expect(parseNLQuery("Status der Quellen").intent).toBe("brain_status");
  });

  test("detects health intent", () => {
    expect(parseNLQuery("Health check").intent).toBe("health");
    expect(parseNLQuery("Any tokens expiring?").intent).toBe("health");
  });

  test("detects agents intent", () => {
    expect(parseNLQuery("Connected agents").intent).toBe("agents");
    expect(parseNLQuery("Show clients").intent).toBe("agents");
  });

  test("detects outgoing links intent", () => {
    const r = parseNLQuery("Links from people/alice");
    expect(r.intent).toBe("page_links");
    expect(r.slug).toBe("people/alice");
  });

  test("detects backlinks intent", () => {
    const r = parseNLQuery("Backlinks to companies/acme");
    expect(r.intent).toBe("page_backlinks");
    expect(r.slug).toBe("companies/acme");
  });

  test("detects search intent", () => {
    const r = parseNLQuery("Search for startup funding");
    expect(r.intent).toBe("search");
    expect(r.query).toContain("startup");
  });

  test("falls back to search for unknown queries", () => {
    expect(parseNLQuery("Tell me a joke").intent).toBe("search");
  });
});

describe("formatNLResponse", () => {
  test("formats brain status", () => {
    const text = formatNLResponse("brain_status", {
      pages: 42,
      sources: 2,
      chunks: 120,
      embedding_coverage_pct: 95,
      links_current: 30,
      links_historical: 5,
    });
    expect(text).toContain("42");
    expect(text).toContain("2");
    expect(text).toContain("95%");
    expect(text).toContain("30");
  });

  test("formats health", () => {
    const text = formatNLResponse("health", { expiring_soon: 3, error_rate: "1.2%" });
    expect(text).toContain("3");
    expect(text).toContain("1.2%");
  });

  test("formats links", () => {
    const text = formatNLResponse("page_links", [
      { to_slug: "companies/acme", link_type: "works_at" },
    ]);
    expect(text).toContain("companies/acme");
    expect(text).toContain("works_at");
  });

  test("formats empty results", () => {
    expect(formatNLResponse("page_backlinks", [])).toBe("No incoming links found.");
    expect(formatNLResponse("search", [])).toBe("No results found.");
  });
});
