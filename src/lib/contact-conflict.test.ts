// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  checkContactConflict,
  checkInternalConflict,
  normalizeName,
  tokenize,
  similarity,
  combinedSimilarity,
  levenshtein,
  type ContactRef,
} from "./contact-conflict";

// ── Fixtures ────────────────────────────────────────────────────────────

const EXISTING_CONTACTS: ContactRef[] = [
  { slug: "c1", name: "Max Mustermann", role: "client", company: "Mustermann GmbH" },
  { slug: "c2", name: "Anna Schmidt", role: "opponent", company: "Schmidt AG" },
  { slug: "c3", name: "LG Wien", role: "court" },
  { slug: "c4", name: "Dr. Heinrich Müller", role: "lawyer" },
  { slug: "c5", name: "Gegner AG", role: "opponent", company: "Gegner AG" },
];

// ── normalizeName ───────────────────────────────────────────────────────

describe("normalizeName", () => {
  test("lowercases and trims", () => {
    expect(normalizeName("  MAX MUSTERMANN  ")).toBe("max mustermann");
  });

  test("removes titles (Dr., Prof., Mag.)", () => {
    expect(normalizeName("Dr. Max Mustermann")).toBe("max mustermann");
    expect(normalizeName("Prof. Dr. Anna Schmidt")).toBe("anna schmidt");
    expect(normalizeName("Mag. Heinrich Müller")).toBe("heinrich müller");
  });

  test("removes legal forms (GmbH, AG, KG)", () => {
    expect(normalizeName("Mustermann GmbH")).toBe("mustermann");
    expect(normalizeName("Schmidt AG")).toBe("schmidt");
    expect(normalizeName("Müller KG")).toBe("müller");
  });

  test("removes punctuation", () => {
    expect(normalizeName("Mustermann, Max!")).toBe("mustermann max");
  });

  test("collapses multiple spaces", () => {
    expect(normalizeName("Max   Mustermann")).toBe("max mustermann");
  });

  test("empty string returns empty", () => {
    expect(normalizeName("")).toBe("");
  });
});

// ── tokenize ────────────────────────────────────────────────────────────

describe("tokenize", () => {
  test("splits normalized name into tokens", () => {
    expect(tokenize("Max Mustermann")).toEqual(["max", "mustermann"]);
  });

  test("filters single-char tokens", () => {
    expect(tokenize("A B Mustermann")).toEqual(["mustermann"]);
  });

  test("empty string returns empty array", () => {
    expect(tokenize("")).toEqual([]);
  });
});

// ── levenshtein ─────────────────────────────────────────────────────────

describe("levenshtein", () => {
  test("identical strings → 0", () => {
    expect(levenshtein("mustermann", "mustermann")).toBe(0);
  });

  test("one insertion → 1", () => {
    expect(levenshtein("mustermann", "mustermanns")).toBe(1);
  });

  test("one deletion → 1", () => {
    expect(levenshtein("mustermann", "musterman")).toBe(1);
  });

  test("one substitution → 1", () => {
    expect(levenshtein("mustermann", "mustermanna")).toBe(1);
  });

  test("completely different strings → max length", () => {
    expect(levenshtein("abc", "xyz")).toBe(3);
  });
});

// ── similarity ──────────────────────────────────────────────────────────

describe("similarity", () => {
  test("identical names → 1", () => {
    expect(similarity("Max Mustermann", "Max Mustermann")).toBe(1);
  });

  test("completely different → low", () => {
    expect(similarity("Max Mustermann", "Anna Schmidt")).toBeLessThan(0.5);
  });

  test("typo → high similarity", () => {
    expect(similarity("Mustermann", "Mustermanna")).toBeGreaterThan(0.8);
  });

  test("empty string → 0", () => {
    expect(similarity("", "Test")).toBe(0);
  });
});

// ── combinedSimilarity ──────────────────────────────────────────────────

describe("combinedSimilarity", () => {
  test("exact match → 1", () => {
    expect(combinedSimilarity("Max Mustermann", "Max Mustermann")).toBe(1);
  });

  test("reversed name order still high (token overlap)", () => {
    expect(combinedSimilarity("Max Mustermann", "Mustermann Max")).toBeGreaterThan(0.7);
  });

  test("with titles normalized → high", () => {
    expect(combinedSimilarity("Dr. Max Mustermann", "Max Mustermann")).toBeGreaterThan(0.9);
  });
});

// ── checkContactConflict ────────────────────────────────────────────────

describe("checkContactConflict — no conflicts", () => {
  test("unique name → no conflict", () => {
    const result = checkContactConflict(
      { name: "Neuer Mandant", role: "client" },
      EXISTING_CONTACTS,
    );
    expect(result.hasConflict).toBe(false);
    expect(result.severity).toBe("none");
    expect(result.hits).toHaveLength(0);
    expect(result.warning).toBeUndefined();
  });

  test("empty existing list → no conflict", () => {
    const result = checkContactConflict(
      { name: "Max Mustermann", role: "client" },
      [],
    );
    expect(result.hasConflict).toBe(false);
    expect(result.checkedContacts).toBe(0);
  });

  test("same slug is skipped", () => {
    const result = checkContactConflict(
      { slug: "c1", name: "Max Mustermann", role: "client" },
      EXISTING_CONTACTS,
    );
    const selfHit = result.hits.find((h) => h.contact.slug === "c1");
    expect(selfHit).toBeUndefined();
  });
});

describe("checkContactConflict — exact name match", () => {
  test("exact name match as same role → low severity", () => {
    const result = checkContactConflict(
      { name: "Max Mustermann", role: "client" },
      EXISTING_CONTACTS,
    );
    expect(result.hasConflict).toBe(true);
    expect(result.severity).toBe("low");
    expect(result.hits[0].matchType).toBe("exact");
    expect(result.hits[0].contact.name).toBe("Max Mustermann");
  });

  test("exact name match as different role → critical (client vs opponent)", () => {
    const result = checkContactConflict(
      { name: "Max Mustermann", role: "opponent" },
      EXISTING_CONTACTS,
    );
    expect(result.severity).toBe("critical");
    expect(result.warning).toContain("§ 43a BRAO");
  });

  test("exact name match opponent vs existing client → critical", () => {
    const result = checkContactConflict(
      { name: "Anna Schmidt", role: "client" },
      EXISTING_CONTACTS,
    );
    expect(result.severity).toBe("critical");
  });
});

describe("checkContactConflict — fuzzy match", () => {
  test("typo in name → fuzzy match", () => {
    const result = checkContactConflict(
      { name: "Max Mustermanna", role: "client" },
      EXISTING_CONTACTS,
    );
    expect(result.hasConflict).toBe(true);
    const fuzzy = result.hits.find((h) => h.matchType === "fuzzy");
    expect(fuzzy).toBeDefined();
  });

  test("reversed name order → fuzzy or exact match", () => {
    const result = checkContactConflict(
      { name: "Mustermann Max", role: "client" },
      EXISTING_CONTACTS,
    );
    expect(result.hasConflict).toBe(true);
  });
});

describe("checkContactConflict — company match", () => {
  test("same company name → company match", () => {
    const result = checkContactConflict(
      { name: "John Doe", role: "client", company: "Mustermann GmbH" },
      EXISTING_CONTACTS,
    );
    const companyHit = result.hits.find((h) => h.matchType === "company");
    expect(companyHit).toBeDefined();
    expect(companyHit!.contact.company).toBe("Mustermann GmbH");
  });
});

describe("checkContactConflict — results sorting", () => {
  test("hits sorted by similarity descending", () => {
    const result = checkContactConflict(
      { name: "Max Mustermann", role: "client" },
      [
        ...EXISTING_CONTACTS,
        { slug: "c6", name: "Max Mustermann", role: "client" },
        { slug: "c7", name: "Maxx Mustermann", role: "client" },
      ],
    );
    for (let i = 1; i < result.hits.length; i++) {
      expect(result.hits[i].similarity).toBeLessThanOrEqual(result.hits[i - 1].similarity);
    }
  });
});

// ── checkInternalConflict ───────────────────────────────────────────────

describe("checkInternalConflict", () => {
  test("no overlap → no conflict", () => {
    const contacts: ContactRef[] = [
      { name: "Max Mustermann", role: "client" },
      { name: "Anna Schmidt", role: "opponent" },
    ];
    const result = checkInternalConflict(contacts);
    expect(result.hasConflict).toBe(false);
    expect(result.severity).toBe("none");
  });

  test("same name as client and opponent → critical", () => {
    const contacts: ContactRef[] = [
      { name: "Max Mustermann", role: "client" },
      { name: "Max Mustermann", role: "opponent" },
    ];
    const result = checkInternalConflict(contacts);
    expect(result.severity).toBe("critical");
    expect(result.warning).toContain("identisch");
  });

  test("similar name as client and opponent → low", () => {
    const contacts: ContactRef[] = [
      { name: "Max Mustermann", role: "client" },
      { name: "Max Mustermanna", role: "opponent" },
    ];
    const result = checkInternalConflict(contacts);
    expect(result.hasConflict).toBe(true);
    expect(result.severity).toBe("low");
  });

  test("no clients → no conflict", () => {
    const contacts: ContactRef[] = [
      { name: "Anna Schmidt", role: "opponent" },
      { name: "Gegner AG", role: "opponent" },
    ];
    const result = checkInternalConflict(contacts);
    expect(result.hasConflict).toBe(false);
  });

  test("no opponents → no conflict", () => {
    const contacts: ContactRef[] = [
      { name: "Max Mustermann", role: "client" },
      { name: "Anna Schmidt", role: "client" },
    ];
    const result = checkInternalConflict(contacts);
    expect(result.hasConflict).toBe(false);
  });

  test("multiple clients vs multiple opponents", () => {
    const contacts: ContactRef[] = [
      { name: "Max Mustermann", role: "client" },
      { name: "Anna Schmidt", role: "client" },
      { name: "Max Mustermann", role: "opponent" },
      { name: "Gegner AG", role: "opponent" },
    ];
    const result = checkInternalConflict(contacts);
    expect(result.severity).toBe("critical");
    expect(result.hits.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────

describe("checkContactConflict — edge cases", () => {
  test("empty name → no false positives", () => {
    const result = checkContactConflict({ name: "", role: "client" }, EXISTING_CONTACTS);
    expect(result.hasConflict).toBe(false);
  });

  test("very short name → no false positives", () => {
    const result = checkContactConflict({ name: "A", role: "client" }, EXISTING_CONTACTS);
    expect(result.hasConflict).toBe(false);
  });

  test("court role never triggers critical", () => {
    const result = checkContactConflict(
      { name: "Max Mustermann", role: "court" },
      EXISTING_CONTACTS,
    );
    expect(result.severity).not.toBe("critical");
  });

  test("lawyer role never triggers critical", () => {
    const result = checkContactConflict(
      { name: "Max Mustermann", role: "lawyer" },
      EXISTING_CONTACTS,
    );
    expect(result.severity).not.toBe("critical");
  });

  test("other role never triggers critical", () => {
    const result = checkContactConflict(
      { name: "Max Mustermann", role: "other" },
      EXISTING_CONTACTS,
    );
    expect(result.severity).not.toBe("critical");
  });
});
