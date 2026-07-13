import { describe, it, expect } from "vitest";
import {
  type CorpusReceipt,
  validateReceipt,
  isValidReceipt,
  computeContentHash,
  createReceipt,
  receiptMatchesContent,
  isCurrentlyValid,
  isOfficialSource,
  serializeReceipt,
  deserializeReceipt,
} from "./corpus-receipt.ts";

// ── Fixtures ──────────────────────────────────────────────────────────

const VALID_TEXT = "§ 1 BGB\nDas ist ein Test.\n§ 2 BGB\nNoch ein Test.";

function makeValidReceipt(overrides: Partial<CorpusReceipt> = {}): CorpusReceipt {
  return {
    slug: "law/de/bgb",
    jurisdiction: "DE",
    statute_code: "BGB",
    valid_from: "2024-01-01",
    valid_to: null,
    fetched_at: "2024-06-15T10:00:00Z",
    source_url: "https://gesetze-im-internet.de/bgb/",
    content_hash: computeContentHash(VALID_TEXT),
    parser_version: "1.0.0",
    license_status: "public",
    amendment_count: 0,
    ...overrides,
  };
}

// ── Validation Tests ──────────────────────────────────────────────────

describe("validateReceipt", () => {
  it("passes for a valid receipt", () => {
    const errors = validateReceipt(makeValidReceipt());
    expect(errors).toHaveLength(0);
  });

  it("flags empty slug", () => {
    const errors = validateReceipt(makeValidReceipt({ slug: "" }));
    expect(errors.some((e) => e.field === "slug")).toBe(true);
  });

  it("flags invalid jurisdiction", () => {
    const errors = validateReceipt(
      makeValidReceipt({ jurisdiction: "FR" as CorpusReceipt["jurisdiction"] })
    );
    expect(errors.some((e) => e.field === "jurisdiction")).toBe(true);
  });

  it("flags empty source_url (Phase 0C requirement)", () => {
    const errors = validateReceipt(makeValidReceipt({ source_url: "" }));
    expect(errors.some((e) => e.field === "source_url")).toBe(true);
    expect(errors[0]!.message).toContain("provenance");
  });

  it("flags invalid content_hash (not 64 hex chars)", () => {
    const errors = validateReceipt(makeValidReceipt({ content_hash: "abc123" }));
    expect(errors.some((e) => e.field === "content_hash")).toBe(true);
  });

  it("flags invalid valid_from date", () => {
    const errors = validateReceipt(makeValidReceipt({ valid_from: "not-a-date" }));
    expect(errors.some((e) => e.field === "valid_from")).toBe(true);
  });

  it("flags valid_to before valid_from", () => {
    const errors = validateReceipt(
      makeValidReceipt({ valid_from: "2024-06-01", valid_to: "2024-01-01" })
    );
    expect(errors.some((e) => e.field === "valid_to")).toBe(true);
  });

  it("flags negative amendment_count", () => {
    const errors = validateReceipt(makeValidReceipt({ amendment_count: -1 }));
    expect(errors.some((e) => e.field === "amendment_count")).toBe(true);
  });

  it("accepts null valid_to (currently valid)", () => {
    const errors = validateReceipt(makeValidReceipt({ valid_to: null }));
    expect(errors).toHaveLength(0);
  });

  it("accepts valid valid_to", () => {
    const errors = validateReceipt(
      makeValidReceipt({ valid_from: "2024-01-01", valid_to: "2024-12-31" })
    );
    expect(errors).toHaveLength(0);
  });
});

// ── isValidReceipt ────────────────────────────────────────────────────

describe("isValidReceipt", () => {
  it("returns true for valid receipt", () => {
    expect(isValidReceipt(makeValidReceipt())).toBe(true);
  });

  it("returns false for invalid receipt", () => {
    expect(isValidReceipt(makeValidReceipt({ source_url: "" }))).toBe(false);
  });
});

// ── createReceipt ─────────────────────────────────────────────────────

describe("createReceipt", () => {
  it("creates a valid receipt with computed hash", () => {
    const receipt = createReceipt({
      slug: "law/at/abgb",
      jurisdiction: "AT",
      statute_code: "ABGB",
      text: "§ 1 ABGB\nTest",
      source_url: "https://ris.bka.gv.at/",
      parser_version: "2.0.0",
    });
    expect(isValidReceipt(receipt)).toBe(true);
    expect(receipt.content_hash).toBe(computeContentHash("§ 1 ABGB\nTest"));
    expect(receipt.jurisdiction).toBe("AT");
    expect(receipt.license_status).toBe("public");
    expect(receipt.valid_to).toBeNull();
  });

  it("uses provided valid_from and fetched_at", () => {
    const receipt = createReceipt({
      slug: "law/de/stgb",
      jurisdiction: "DE",
      statute_code: "StGB",
      text: "test",
      source_url: "https://gesetze-im-internet.de/stgb/",
      parser_version: "1.0.0",
      valid_from: "2023-01-01",
      fetched_at: "2023-06-01T12:00:00Z",
    });
    expect(receipt.valid_from).toBe("2023-01-01");
    expect(receipt.fetched_at).toBe("2023-06-01T12:00:00Z");
  });
});

// ── receiptMatchesContent ─────────────────────────────────────────────

describe("receiptMatchesContent", () => {
  it("returns true when content matches", () => {
    const receipt = makeValidReceipt();
    expect(receiptMatchesContent(receipt, VALID_TEXT)).toBe(true);
  });

  it("returns false when content differs", () => {
    const receipt = makeValidReceipt();
    expect(receiptMatchesContent(receipt, "different text")).toBe(false);
  });
});

// ── isCurrentlyValid ──────────────────────────────────────────────────

describe("isCurrentlyValid", () => {
  it("returns true when valid_to is null", () => {
    const receipt = makeValidReceipt({ valid_to: null });
    expect(isCurrentlyValid(receipt)).toBe(true);
  });

  it("returns true when valid_to is in the future", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const receipt = makeValidReceipt({ valid_to: future.toISOString().slice(0, 10) });
    expect(isCurrentlyValid(receipt)).toBe(true);
  });

  it("returns false when valid_to is in the past", () => {
    const receipt = makeValidReceipt({
      valid_from: "2020-01-01",
      valid_to: "2021-01-01",
    });
    expect(isCurrentlyValid(receipt)).toBe(false);
  });

  it("respects asOfDate parameter", () => {
    const receipt = makeValidReceipt({
      valid_from: "2020-01-01",
      valid_to: "2021-01-01",
    });
    expect(isCurrentlyValid(receipt, "2020-06-01")).toBe(true);
    expect(isCurrentlyValid(receipt, "2021-06-01")).toBe(false);
  });
});

// ── isOfficialSource ──────────────────────────────────────────────────

describe("isOfficialSource", () => {
  it("recognizes gesetze-im-internet.de as official DE source", () => {
    expect(isOfficialSource("https://gesetze-im-internet.de/bgb/", "DE")).toBe(true);
  });

  it("recognizes RIS as official AT source", () => {
    expect(isOfficialSource("https://ris.bka.gv.at/", "AT")).toBe(true);
  });

  it("recognizes fedlex as official CH source", () => {
    expect(isOfficialSource("https://fedlex.data.admin.ch/", "CH")).toBe(true);
  });

  it("recognizes EUR-Lex as official EU source", () => {
    expect(isOfficialSource("https://eur-lex.europa.eu/", "EU")).toBe(true);
  });

  it("rejects non-official URLs", () => {
    expect(isOfficialSource("https://wikipedia.org/bgb", "DE")).toBe(false);
  });

  it("rejects wrong jurisdiction match", () => {
    expect(isOfficialSource("https://gesetze-im-internet.de/bgb/", "AT")).toBe(false);
  });
});

// ── Serialization ─────────────────────────────────────────────────────

describe("serializeReceipt / deserializeReceipt", () => {
  it("round-trips a valid receipt", () => {
    const original = makeValidReceipt();
    const json = serializeReceipt(original);
    const restored = deserializeReceipt(json);
    expect(restored).not.toBeNull();
    expect(restored!.slug).toBe(original.slug);
    expect(restored!.content_hash).toBe(original.content_hash);
  });

  it("returns null for invalid JSON", () => {
    expect(deserializeReceipt("not json")).toBeNull();
  });

  it("returns null for invalid receipt data", () => {
    expect(deserializeReceipt(JSON.stringify({ slug: "" }))).toBeNull();
  });
});
