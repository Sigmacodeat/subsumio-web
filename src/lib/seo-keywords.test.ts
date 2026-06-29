// @vitest-environment node

import { describe, test, expect } from "vitest";
import { SEO_KEYWORDS, keywordsFor } from "./seo-keywords";

describe("SEO_KEYWORDS", () => {
  test("has all expected page groups", () => {
    expect(Object.keys(SEO_KEYWORDS)).toEqual(
      expect.arrayContaining([
        "root",
        "features",
        "pricing",
        "security",
        "about",
        "download",
        "contact",
        "whatsapp",
        "mobile",
        "partners",
        "blog",
        "benchmark",
        "cities",
      ])
    );
  });

  test("every group contains non-empty keyword strings", () => {
    for (const [_group, keywords] of Object.entries(SEO_KEYWORDS)) {
      expect(keywords.length).toBeGreaterThan(0);
      for (const keyword of keywords) {
        expect(typeof keyword).toBe("string");
        expect(keyword.trim()).toBe(keyword);
        expect(keyword.length).toBeGreaterThan(0);
      }
    }
  });

  test("root keywords are German and legal-tech focused", () => {
    expect(SEO_KEYWORDS.root).toContain("Kanzleisoftware");
    expect(SEO_KEYWORDS.root).toContain("KI Kanzleisoftware");
    expect(SEO_KEYWORDS.root).toContain("Anwaltssoftware");
  });

  test("cities group contains DACH cities", () => {
    expect(SEO_KEYWORDS.cities).toContain("KI-Kanzleisoftware Wien");
    expect(SEO_KEYWORDS.cities).toContain("Anwaltssoftware Berlin");
    expect(SEO_KEYWORDS.cities).toContain("law firm software Zurich");
  });
});

describe("keywordsFor", () => {
  test("returns a copy of keywords for a group", () => {
    const result = keywordsFor("root");
    expect(result).toEqual(SEO_KEYWORDS.root);
    expect(result).not.toBe(SEO_KEYWORDS.root);
  });

  test("returns keywords for every group", () => {
    for (const _group of Object.keys(SEO_KEYWORDS) as (keyof typeof SEO_KEYWORDS)[]) {
      expect(keywordsFor(_group)).toEqual(SEO_KEYWORDS[_group]);
    }
  });
});
