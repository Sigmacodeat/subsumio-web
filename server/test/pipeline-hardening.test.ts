import { describe, it, expect } from "bun:test";

// Tests for pipeline hardening utilities and edge cases

// ── clampScore logic ────────────────────────────────────────

describe("clampScore", () => {
  function clampScore(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  it("clamps positive overflow to 100", () => {
    expect(clampScore(150)).toBe(100);
    expect(clampScore(99999)).toBe(100);
  });

  it("clamps negative to 0", () => {
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(-999)).toBe(0);
  });

  it("preserves valid scores", () => {
    expect(clampScore(0)).toBe(0);
    expect(clampScore(50)).toBe(50);
    expect(clampScore(100)).toBe(100);
  });

  it("rounds floats", () => {
    expect(clampScore(72.4)).toBe(72);
    expect(clampScore(72.5)).toBe(73);
    expect(clampScore(72.6)).toBe(73);
  });

  it("returns 0 for non-numbers", () => {
    expect(clampScore(null)).toBe(0);
    expect(clampScore(undefined)).toBe(0);
    expect(clampScore("50")).toBe(0);
    expect(clampScore(NaN)).toBe(0);
    expect(clampScore(Infinity)).toBe(0);
    expect(clampScore(-Infinity)).toBe(0);
    expect(clampScore({})).toBe(0);
    expect(clampScore([])).toBe(0);
  });
});

// ── sanitizeSlug logic ──────────────────────────────────────

describe("sanitizeSlug", () => {
  function sanitizeSlug(slug: string): string | null {
    if (!slug || typeof slug !== "string") return null;
    const trimmed = slug.trim();
    if (!trimmed) return null;
    if (trimmed.length > 200) return null;
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) return null;
    return trimmed;
  }

  it("accepts valid slugs", () => {
    expect(sanitizeSlug("my-case-2024")).toBe("my-case-2024");
    expect(sanitizeSlug("case_001")).toBe("case_001");
    expect(sanitizeSlug("AKTE.2024")).toBe("AKTE.2024");
    expect(sanitizeSlug("123")).toBe("123");
  });

  it("trims whitespace", () => {
    expect(sanitizeSlug("  my-case  ")).toBe("my-case");
  });

  it("rejects empty strings", () => {
    expect(sanitizeSlug("")).toBeNull();
    expect(sanitizeSlug("   ")).toBeNull();
  });

  it("rejects non-string inputs", () => {
    expect(sanitizeSlug(null as unknown as string)).toBeNull();
    expect(sanitizeSlug(undefined as unknown as string)).toBeNull();
  });

  it("rejects slugs over 200 chars", () => {
    const long = "a".repeat(201);
    expect(sanitizeSlug(long)).toBeNull();
  });

  it("accepts slugs of exactly 200 chars", () => {
    const max = "a".repeat(200);
    expect(sanitizeSlug(max)).toBe(max);
  });

  it("rejects path traversal attempts", () => {
    expect(sanitizeSlug("../etc/passwd")).toBeNull();
    expect(sanitizeSlug("..\\windows\\system32")).toBeNull();
  });

  it("rejects slugs with spaces", () => {
    expect(sanitizeSlug("my case")).toBeNull();
  });

  it("rejects slugs with special characters", () => {
    expect(sanitizeSlug("my-case!")).toBeNull();
    expect(sanitizeSlug("my-case#")).toBeNull();
    expect(sanitizeSlug("my-case$")).toBeNull();
    expect(sanitizeSlug("my/case")).toBeNull();
  });
});

// ── safeStringify logic ─────────────────────────────────────

describe("safeStringify", () => {
  function safeStringify(obj: unknown): string {
    try {
      return JSON.stringify(obj);
    } catch {
      try {
        return JSON.stringify(String(obj));
      } catch {
        return "[unserializable]";
      }
    }
  }

  it("handles normal objects", () => {
    expect(safeStringify({ a: 1 })).toBe('{"a":1}');
    expect(safeStringify([1, 2, 3])).toBe("[1,2,3]");
    expect(safeStringify("hello")).toBe('"hello"');
    expect(safeStringify(42)).toBe("42");
    expect(safeStringify(null)).toBe("null");
  });

  it("handles circular references without throwing", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    const result = safeStringify(circular);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles undefined", () => {
    expect(safeStringify(undefined)).toBeUndefined();
  });
});

// ── extractChildText logic ──────────────────────────────────

describe("extractChildText", () => {
  function safeStringify(obj: unknown): string {
    try {
      return JSON.stringify(obj);
    } catch {
      try {
        return JSON.stringify(String(obj));
      } catch {
        return "[unserializable]";
      }
    }
  }

  function extractChildText(result: unknown): string {
    if (typeof result === "string") return result;
    const obj = result as { text?: string } | null;
    if (obj && typeof obj.text === "string") return obj.text;
    return safeStringify(result);
  }

  it("returns string directly", () => {
    expect(extractChildText("hello")).toBe("hello");
  });

  it("extracts .text from object", () => {
    expect(extractChildText({ text: "hello" })).toBe("hello");
  });

  it("handles null", () => {
    expect(extractChildText(null)).toBe("null");
  });

  it("handles undefined", () => {
    expect(extractChildText(undefined)).toBeUndefined();
  });

  it("handles object without .text", () => {
    expect(extractChildText({ foo: "bar" })).toBe('{"foo":"bar"}');
  });

  it("handles object with non-string .text", () => {
    expect(extractChildText({ text: 123 })).toBe('{"text":123}');
  });

  it("handles circular reference in object", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    const result = extractChildText(circular);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── tryParseJSON with edge cases ────────────────────────────

function tryParseJSON(text: string): Record<string, unknown> | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/```\s*$/, "");
  try {
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

describe("tryParseJSON edge cases", () => {
  it("parses clean JSON", () => {
    expect(tryParseJSON('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses JSON in code fences", () => {
    expect(tryParseJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("parses JSON in plain fences", () => {
    expect(tryParseJSON('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("extracts JSON from prose text", () => {
    expect(tryParseJSON('Here is the result: {"a":1} done')).toEqual({ a: 1 });
  });

  it("returns null for non-JSON", () => {
    expect(tryParseJSON("hello world")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(tryParseJSON("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(tryParseJSON('{a:1}')).toBeNull();
  });

  it("handles whitespace-only input", () => {
    expect(tryParseJSON("   \n  ")).toBeNull();
  });

  it("parses nested objects", () => {
    const result = tryParseJSON('{"a":{"b":{"c":1}}}');
    expect(result).toEqual({ a: { b: { c: 1 } } });
  });

  it("parses arrays as values", () => {
    const result = tryParseJSON('{"items":[1,2,3]}');
    expect(result).toEqual({ items: [1, 2, 3] });
  });
});

// ── Netto EV calculation with edge cases ────────────────────

describe("EV calculation edge cases", () => {
  function calculateNettoEV(brutto: number, widerklage: number, aufrechnung: number): number {
    return brutto - widerklage - aufrechnung;
  }

  it("handles zero values", () => {
    expect(calculateNettoEV(0, 0, 0)).toBe(0);
  });

  it("handles negative brutto (defensive case)", () => {
    expect(calculateNettoEV(-5000, 0, 0)).toBe(-5000);
  });

  it("handles all costs exceeding brutto", () => {
    expect(calculateNettoEV(10000, 8000, 5000)).toBe(-3000);
  });

  it("handles large values", () => {
    expect(calculateNettoEV(1000000, 500000, 200000)).toBe(300000);
  });

  it("handles fractional values", () => {
    expect(calculateNettoEV(15000.50, 3000.25, 1000.75)).toBe(10999.5);
  });
});

// ── Cost award calculation with edge cases ──────────────────

describe("cost award calculation edge cases", () => {
  function calculateNettoCost(eigeneKosten: number, erfolgsquote: number): number {
    const erstattung = eigeneKosten * (erfolgsquote / 100);
    return eigeneKosten - erstattung;
  }

  it("handles 0% success (full loss)", () => {
    expect(calculateNettoCost(10000, 0)).toBe(10000);
  });

  it("handles 100% success (full win)", () => {
    expect(calculateNettoCost(10000, 100)).toBe(0);
  });

  it("handles 50% success", () => {
    expect(calculateNettoCost(10000, 50)).toBe(5000);
  });

  it("handles 33.33% success", () => {
    expect(Math.round(calculateNettoCost(9999, 33.33))).toBe(6666);
  });

  it("handles zero costs", () => {
    expect(calculateNettoCost(0, 50)).toBe(0);
  });

  it("handles negative costs (defensive)", () => {
    expect(calculateNettoCost(-1000, 50)).toBe(-500);
  });
});

// ── Verjährungsfrist edge cases ─────────────────────────────

describe("verjährungsfrist edge cases", () => {
  function calculateFristEnde(beginn: Date, fristJahre: number): Date {
    const ende = new Date(beginn);
    ende.setFullYear(ende.getFullYear() + fristJahre);
    return ende;
  }

  function daysBetween(from: Date, to: Date): number {
    return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  }

  it("handles leap year (Feb 29 → Mar 1)", () => {
    const beginn = new Date("2024-02-29");
    const ende = calculateFristEnde(beginn, 3);
    expect(ende.getFullYear()).toBe(2027);
    expect(ende.getMonth()).toBe(2);
  });

  it("handles year 2000 (leap year)", () => {
    const beginn = new Date("2000-02-29");
    const ende = calculateFristEnde(beginn, 3);
    expect(ende.getFullYear()).toBe(2003);
  });

  it("handles 30-year frist", () => {
    const beginn = new Date("2024-01-01");
    const ende = calculateFristEnde(beginn, 30);
    expect(ende.getFullYear()).toBe(2054);
  });

  it("handles 0-year frist (edge case)", () => {
    const beginn = new Date("2024-06-15");
    const ende = calculateFristEnde(beginn, 0);
    expect(daysBetween(beginn, ende)).toBe(0);
  });

  it("handles negative frist (defensive)", () => {
    const beginn = new Date("2024-06-15");
    const ende = calculateFristEnde(beginn, -1);
    expect(ende.getFullYear()).toBe(2023);
  });
});
