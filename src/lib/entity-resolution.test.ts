// @vitest-environment node

import { describe, test, expect, beforeEach } from "vitest";
import {
  EntityRegistry,
  createCanonicalEntity,
  normalizeName,
  normalizePhone,
  isCompatibleType,
  computeNameSimilarity,
  dedupe,
  mergeContact,
  ENTITY_TYPE_LABELS,
  type EntityType,
  type UnresolvedEntity,
} from "@/lib/entity-resolution";

describe("normalizeName", () => {
  test("lowercases and trims", () => {
    expect(normalizeName("  Dr. Max Mustermann  ")).toBe("dr max mustermann");
  });

  test("collapses whitespace", () => {
    expect(normalizeName("Max   Mustermann")).toBe("max mustermann");
  });

  test("removes commas and dots", () => {
    expect(normalizeName("Mustermann, Max.")).toBe("mustermann max");
  });

  test("replaces Dr. and Prof.", () => {
    expect(normalizeName("Dr. Prof. Schmidt")).toBe("dr prof schmidt");
  });
});

describe("normalizePhone", () => {
  test("removes spaces and dashes", () => {
    expect(normalizePhone("+49 30 1234-567")).toBe("0301234567");
  });

  test("removes parentheses and slashes", () => {
    expect(normalizePhone("+49 (030) 1234/567")).toBe("0301234567");
  });

  test("converts +43 to 0", () => {
    expect(normalizePhone("+43 1 234 5678")).toBe("012345678");
  });

  test("converts +41 to 0", () => {
    expect(normalizePhone("+41 44 123 45 67")).toBe("0441234567");
  });
});

describe("isCompatibleType", () => {
  test("same type → compatible", () => {
    expect(isCompatibleType("person", "person")).toBe(true);
  });

  test("person and client → compatible", () => {
    expect(isCompatibleType("person", "client")).toBe(true);
  });

  test("person and opponent → compatible", () => {
    expect(isCompatibleType("person", "opponent")).toBe(true);
  });

  test("lawyer and judge → compatible", () => {
    expect(isCompatibleType("lawyer", "judge")).toBe(true);
  });

  test("company and court → not compatible", () => {
    expect(isCompatibleType("company", "court")).toBe(false);
  });

  test("company and third_party → compatible", () => {
    expect(isCompatibleType("company", "third_party")).toBe(true);
  });

  test("court and person → not compatible", () => {
    expect(isCompatibleType("court", "person")).toBe(false);
  });
});

describe("computeNameSimilarity", () => {
  test("identical names → 1", () => {
    expect(computeNameSimilarity("max mustermann", "max mustermann")).toBe(1);
  });

  test("completely different → 0", () => {
    expect(computeNameSimilarity("max mustermann", "anna schmidt")).toBe(0);
  });

  test("partial overlap → between 0 and 1", () => {
    const score = computeNameSimilarity("max mustermann", "max meier");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  test("empty strings → 0", () => {
    expect(computeNameSimilarity("", "max")).toBe(0);
  });
});

describe("dedupe", () => {
  test("removes duplicates", () => {
    expect(dedupe(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  test("empty array → empty", () => {
    expect(dedupe([])).toEqual([]);
  });
});

describe("mergeContact", () => {
  test("prefers first non-undefined values", () => {
    const merged = mergeContact(
      { email: "a@test.com", phone: undefined },
      { email: "b@test.com", phone: "123" },
    );
    expect(merged.email).toBe("a@test.com");
    expect(merged.phone).toBe("123");
  });

  test("both undefined → undefined", () => {
    const merged = mergeContact({}, {});
    expect(merged.email).toBeUndefined();
  });
});

describe("ENTITY_TYPE_LABELS", () => {
  test("all 9 types have labels", () => {
    const types: EntityType[] = ["person", "company", "client", "opponent", "lawyer", "judge", "court", "witness", "third_party"];
    for (const type of types) {
      expect(ENTITY_TYPE_LABELS[type].label).toBeTruthy();
      expect(ENTITY_TYPE_LABELS[type].description).toBeTruthy();
    }
  });
});

describe("createCanonicalEntity", () => {
  test("creates entity with correct type and name", () => {
    const entity = createCanonicalEntity("person", "Max Mustermann", "dms", "ref-1");
    expect(entity.type).toBe("person");
    expect(entity.name).toBe("Max Mustermann");
  });

  test("generates stable-looking ID with type prefix", () => {
    const entity = createCanonicalEntity("client", "Anna Schmidt", "email", "ref-2");
    expect(entity.id).toMatch(/^client:anna-schmidt-/);
  });

  test("includes source ref", () => {
    const entity = createCanonicalEntity("person", "Max", "dms", "ref-1");
    expect(entity.source_refs).toHaveLength(1);
    expect(entity.source_refs[0].source).toBe("dms");
    expect(entity.source_refs[0].source_id).toBe("ref-1");
  });

  test("defaults to unverified", () => {
    const entity = createCanonicalEntity("person", "Max", "dms", "ref-1");
    expect(entity.verified).toBe(false);
  });

  test("confidence starts at 1.0", () => {
    const entity = createCanonicalEntity("person", "Max", "dms", "ref-1");
    expect(entity.resolution_confidence).toBe(1.0);
  });
});

describe("EntityRegistry", () => {
  let registry: EntityRegistry;

  beforeEach(() => {
    registry = new EntityRegistry();
  });

  describe("register and get", () => {
    test("register and retrieve by ID", () => {
      const entity = createCanonicalEntity("person", "Max Mustermann", "dms", "ref-1");
      registry.register(entity);
      expect(registry.get(entity.id)).toBe(entity);
    });

    test("get non-existent ID → undefined", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
    });

    test("getAll returns all entities", () => {
      const e1 = createCanonicalEntity("person", "Max", "dms", "ref-1");
      const e2 = createCanonicalEntity("company", "ACME GmbH", "dms", "ref-2");
      registry.register(e1);
      registry.register(e2);
      expect(registry.getAll()).toHaveLength(2);
    });

    test("getByType filters correctly", () => {
      const e1 = createCanonicalEntity("person", "Max", "dms", "ref-1");
      const e2 = createCanonicalEntity("company", "ACME", "dms", "ref-2");
      const e3 = createCanonicalEntity("person", "Anna", "dms", "ref-3");
      registry.register(e1);
      registry.register(e2);
      registry.register(e3);
      expect(registry.getByType("person")).toHaveLength(2);
      expect(registry.getByType("company")).toHaveLength(1);
    });
  });

  describe("resolve — email match", () => {
    test("matches by email with high confidence", () => {
      const entity = createCanonicalEntity("person", "Max Mustermann", "dms", "ref-1", {
        email: "max@example.com",
      });
      registry.register(entity);

      const result = registry.resolve({
        source: "email",
        source_id: "email-1",
        name: "M. Mustermann",
        type: "person",
        contact: { email: "max@example.com" },
      });

      expect(result.canonical_id).toBe(entity.id);
      expect(result.confidence).toBeGreaterThanOrEqual(0.95);
      expect(result.method).toBe("email_match");
    });

    test("email match is case-insensitive", () => {
      const entity = createCanonicalEntity("person", "Max", "dms", "ref-1", {
        email: "Max@Example.COM",
      });
      registry.register(entity);

      const result = registry.resolve({
        source: "email",
        source_id: "e1",
        name: "Max",
        type: "person",
        contact: { email: "max@example.com" },
      });

      expect(result.canonical_id).toBe(entity.id);
    });
  });

  describe("resolve — phone match", () => {
    test("matches by phone with high confidence", () => {
      const entity = createCanonicalEntity("person", "Max", "dms", "ref-1", {
        phone: "+49 30 1234567",
      });
      registry.register(entity);

      const result = registry.resolve({
        source: "whatsapp",
        source_id: "wa-1",
        name: "Max",
        type: "person",
        contact: { phone: "0301234567" },
      });

      expect(result.canonical_id).toBe(entity.id);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.method).toBe("phone_match");
    });
  });

  describe("resolve — exact name match", () => {
    test("matches by exact name", () => {
      const entity = createCanonicalEntity("client", "Anna Schmidt", "dms", "ref-1");
      registry.register(entity);

      const result = registry.resolve({
        source: "email",
        source_id: "e1",
        name: "Anna Schmidt",
        type: "client",
      });

      expect(result.canonical_id).toBe(entity.id);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.method).toBe("exact_name");
    });

    test("matches by alias", () => {
      const entity = createCanonicalEntity("person", "Max Mustermann", "dms", "ref-1");
      entity.aliases = ["M. Mustermann", "Max M."];
      registry.register(entity);

      const result = registry.resolve({
        source: "email",
        source_id: "e1",
        name: "M. Mustermann",
        type: "person",
      });

      expect(result.canonical_id).toBe(entity.id);
    });

    test("type-compatible match works", () => {
      const entity = createCanonicalEntity("person", "Max Mustermann", "dms", "ref-1");
      registry.register(entity);

      const result = registry.resolve({
        source: "email",
        source_id: "e1",
        name: "Max Mustermann",
        type: "client",
      });

      expect(result.canonical_id).toBe(entity.id);
    });
  });

  describe("resolve — fuzzy name match", () => {
    test("matches similar names with Jaccard >= 0.8", () => {
      const entity = createCanonicalEntity("person", "Max Mustermann", "dms", "ref-1");
      registry.register(entity);

      const result = registry.resolve({
        source: "email",
        source_id: "e1",
        name: "Mustermann Max",
        type: "person",
      });

      expect(result.canonical_id).toBe(entity.id);
      expect(result.method).toBe("fuzzy_name");
    });
  });

  describe("resolve — no match", () => {
    test("returns null for unknown entity", () => {
      const result = registry.resolve({
        source: "dms",
        source_id: "ref-1",
        name: "Unknown Person",
        type: "person",
      });

      expect(result.canonical_id).toBeNull();
      expect(result.confidence).toBe(0);
    });
  });

  describe("merge", () => {
    test("merges two entities into one", () => {
      const e1 = createCanonicalEntity("person", "Max Mustermann", "dms", "ref-1", {
        email: "max@test.com",
      });
      const e2 = createCanonicalEntity("person", "Max Mustermann", "email", "ref-2", {
        phone: "123",
      });
      registry.register(e1);
      registry.register(e2);

      const merged = registry.merge(e1.id, e2.id);
      expect(merged).not.toBeNull();
      expect(merged!.aliases).toContain("Max Mustermann");
      expect(merged!.contact.email).toBe("max@test.com");
      expect(merged!.contact.phone).toBe("123");
      expect(merged!.source_refs).toHaveLength(2);
      expect(registry.get(e2.id)).toBeUndefined();
    });

    test("merge non-existent → null", () => {
      expect(registry.merge("nonexistent", "also-nonexistent")).toBeNull();
    });
  });

  describe("update", () => {
    test("updates entity fields", () => {
      const entity = createCanonicalEntity("person", "Max", "dms", "ref-1");
      registry.register(entity);

      const updated = registry.update(entity.id, { verified: true });
      expect(updated).not.toBeNull();
      expect(updated!.verified).toBe(true);
    });

    test("update non-existent → null", () => {
      expect(registry.update("nonexistent", { verified: true })).toBeNull();
    });
  });

  describe("getStats", () => {
    test("returns correct stats", () => {
      registry.register(createCanonicalEntity("person", "Max", "dms", "r1"));
      registry.register(createCanonicalEntity("person", "Anna", "dms", "r2"));
      registry.register(createCanonicalEntity("company", "ACME", "dms", "r3"));

      const stats = registry.getStats();
      expect(stats.total).toBe(3);
      expect(stats.by_type.person).toBe(2);
      expect(stats.by_type.company).toBe(1);
      expect(stats.verified).toBe(0);
      expect(stats.avg_confidence).toBe(1.0);
    });

    test("empty registry → zero stats", () => {
      const stats = registry.getStats();
      expect(stats.total).toBe(0);
      expect(stats.avg_confidence).toBe(0);
    });
  });
});
