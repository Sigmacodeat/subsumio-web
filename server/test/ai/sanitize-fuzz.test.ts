/**
 * Fuzz-Test für sanitizeForJson — property-based testing mit fast-check.
 *
 * Generiert zufällige Objekt-Graphen (nested, mixed types, circular,
 * extreme sizes) und stellt sicher dass sanitizeForJson:
 *   1. Nie crashed (Invariant: always returns)
 *   2. Das Resultat JSON-serialisierbar ist (Invariant: JSON.stringify succeeds)
 *   3. undefined → null konvertiert werden (Property)
 *   4. Primitive Werte durchgereicht werden (Property)
 *
 * Gold-Standard für kritische Serialisierungs-Funktionen.
 */

import { describe, it, expect } from "bun:test";
import fc from "fast-check";
import { sanitizeForJson } from "../../src/core/ai/gateway.ts";

describe("sanitizeForJson — fuzz tests (fast-check)", () => {
  it("never crashes on arbitrary nested objects", () => {
    // Generate deeply nested objects with mixed types
    const arbitraryValue = fc.letrec((tie) => ({
      value: fc.oneof(
        fc.string({ maxLength: 100 }),
        fc.integer(),
        fc.double({ noDefaultInfinity: true, noNaN: true }),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined),
        fc.bigInt(),
        fc.date(),
        fc.array(tie("value"), { maxLength: 5 }),
        fc.record({
          a: tie("value"),
          b: tie("value"),
          c: fc.string({ maxLength: 50 }),
        })
      ),
    })).value;

    fc.assert(
      fc.property(arbitraryValue, (input) => {
        // Invariant 1: must not throw
        const result = sanitizeForJson(input);
        // Invariant 2: result must be JSON-serializable
        expect(() => JSON.stringify(result)).not.toThrow();
        return true;
      }),
      { numRuns: 500, verbose: false }
    );
  });

  it("never crashes on objects with circular references", () => {
    fc.assert(
      fc.property(
        fc.record({
          a: fc.integer(),
          b: fc.string({ maxLength: 50 }),
          c: fc.boolean(),
        }),
        (base) => {
          // Inject circular reference
          const obj: any = { ...base };
          obj.self = obj;
          obj.deep = { nested: { back: obj } };
          const result = sanitizeForJson(obj);
          // Circular refs → null, not crash
          expect(result).toBeDefined();
          expect(() => JSON.stringify(result)).not.toThrow();
          const parsed = JSON.parse(JSON.stringify(result));
          expect(parsed.self).toBeNull();
          expect(parsed.deep.nested.back).toBeNull();
        }
      ),
      { numRuns: 200, verbose: false }
    );
  });

  it("converts undefined to null in all positions", () => {
    fc.assert(
      fc.property(
        fc.record({
          top: fc.constant(undefined),
          nested: fc.record({ inner: fc.constant(undefined) }),
          arr: fc.array(fc.constant(undefined), { maxLength: 5 }),
        }),
        (input) => {
          const result = sanitizeForJson(input) as any;
          expect(result.top).toBeNull();
          expect(result.nested.inner).toBeNull();
          expect(result.arr.every((x: unknown) => x === null)).toBe(true);
        }
      ),
      { numRuns: 100, verbose: false }
    );
  });

  it("preserves primitive values", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string({ maxLength: 100 }), fc.integer(), fc.boolean(), fc.constant(null)),
        (primitive) => {
          const result = sanitizeForJson(primitive);
          if (primitive === null) {
            expect(result).toBeNull();
          } else {
            expect(result).toBe(primitive);
          }
        }
      ),
      { numRuns: 200, verbose: false }
    );
  });

  it("preserves Date as ISO string (or null for invalid dates)", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date("2000-01-01"), max: new Date("2100-01-01") }), (date) => {
        const result = sanitizeForJson({ d: date }) as any;
        // fast-check may generate Invalid Date (new Date(NaN)) even with min/max
        if (isNaN(date.getTime())) {
          // Invalid Date → null (not crash)
          expect(result.d).toBeNull();
        } else {
          expect(typeof result.d).toBe("string");
          expect(result.d).toBe(date.toISOString());
        }
      }),
      { numRuns: 100, verbose: false }
    );
  });

  it("handles Invalid Date (new Date(NaN)) → null", () => {
    const invalid = new Date(NaN);
    const result = sanitizeForJson({ d: invalid }) as any;
    expect(result.d).toBeNull();
  });

  it("preserves bigint as string", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 1000000n }), (bi) => {
        const result = sanitizeForJson({ id: bi }) as any;
        expect(typeof result.id).toBe("string");
        expect(result.id).toBe(bi.toString());
      }),
      { numRuns: 100, verbose: false }
    );
  });

  it("handles large arrays without crash", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }),
        fc.string({ maxLength: 20 }),
        (size, val) => {
          const arr = Array.from({ length: size }, (_, i) => ({ id: i, text: val }));
          const result = sanitizeForJson(arr);
          expect(Array.isArray(result)).toBe(true);
          expect((result as unknown[]).length).toBe(size);
          expect(() => JSON.stringify(result)).not.toThrow();
        }
      ),
      { numRuns: 20, verbose: false }
    );
  });

  it("handles deeply nested structures (50+ levels)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 10, max: 80 }), (depth) => {
        let v: any = "leaf";
        for (let i = 0; i < depth; i++) {
          v = { nested: v };
        }
        // Must not throw regardless of depth
        expect(() => sanitizeForJson(v)).not.toThrow();
        const result = sanitizeForJson(v);
        expect(() => JSON.stringify(result)).not.toThrow();
      }),
      { numRuns: 50, verbose: false }
    );
  });

  it("handles objects with special number values (NaN, Infinity)", () => {
    const special = { a: NaN, b: Infinity, c: -Infinity, d: 0, e: -0, f: 42 };
    expect(() => sanitizeForJson(special)).not.toThrow();
    const result = sanitizeForJson(special) as any;
    expect(result.a).toBeNull(); // NaN → null
    expect(result.b).toBeNull(); // Infinity → null
    expect(result.c).toBeNull(); // -Infinity → null
    expect(result.d).toBe(0);
    expect(result.f).toBe(42);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("handles Map and Set without crash", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.string({ maxLength: 20 }), fc.integer()), { maxLength: 20 }),
        fc.array(fc.integer(), { maxLength: 20 }),
        (entries, setValues) => {
          const map = new Map(entries);
          const set = new Set(setValues);
          const obj = { map, set, extra: "text" };
          expect(() => sanitizeForJson(obj)).not.toThrow();
          const result = sanitizeForJson(obj) as any;
          expect(() => JSON.stringify(result)).not.toThrow();
          expect(result.extra).toBe("text");
          // Map → object
          expect(typeof result.map).toBe("object");
          // Set → array
          expect(Array.isArray(result.set)).toBe(true);
        }
      ),
      { numRuns: 50, verbose: false }
    );
  });

  it("handles Error objects without crash", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (message) => {
        const err = new Error(message);
        const obj = { error: err, code: 42 };
        expect(() => sanitizeForJson(obj)).not.toThrow();
        const result = sanitizeForJson(obj) as any;
        expect(() => JSON.stringify(result)).not.toThrow();
        expect(result.error.message).toBe(message);
        expect(result.error.name).toBe("Error");
        expect(result.code).toBe(42);
      }),
      { numRuns: 50, verbose: false }
    );
  });

  it("result is always JSON-serializable (meta-invariant)", () => {
    // The ultimate property: for ANY input, the output must be JSON-serializable
    const arbitraryInput = fc.letrec((tie) => ({
      value: fc.oneof(
        fc.string({ maxLength: 50 }),
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined),
        fc.bigInt(),
        fc.date(),
        fc.array(tie("value"), { maxLength: 10 }),
        fc.record({
          x: tie("value"),
          y: tie("value"),
        })
      ),
    })).value;

    fc.assert(
      fc.property(arbitraryInput, (input) => {
        const result = sanitizeForJson(input);
        // The golden invariant: JSON.stringify must succeed
        const json = JSON.stringify(result);
        expect(typeof json).toBe("string");
        // And it must be parseable back
        expect(() => JSON.parse(json)).not.toThrow();
      }),
      { numRuns: 1000, verbose: false }
    );
  });
});
