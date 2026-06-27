import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeStatuteCode,
  lookupSplitParagraph,
  lookupCorpusParagraph,
  groundCitations,
  CORPUS_META,
} from "@/lib/legal-grounding";
import type { RawCitation } from "@/lib/types";
import { promises as fs } from "node:fs";

vi.mock("node:fs", () => {
  const fn = vi.fn();
  return {
    default: { promises: { readFile: fn } },
    promises: { readFile: fn },
  };
});

describe("normalizeStatuteCode", () => {
  it("lowercases and replaces non-alphanumeric chars with underscores", () => {
    expect(normalizeStatuteCode("BGB")).toBe("bgb");
    expect(normalizeStatuteCode("StGB (AT)")).toBe("stgb_at_");
    expect(normalizeStatuteCode("ZPO--AT")).toBe("zpo_at");
  });

  it("collapses consecutive underscores", () => {
    expect(normalizeStatuteCode("StGB  __  AT")).toBe("stgb_at");
  });

  it("handles already-normalized input", () => {
    expect(normalizeStatuteCode("bgb")).toBe("bgb");
  });
});

describe("CORPUS_META", () => {
  it("contains entries for AT, DE, and CH jurisdictions", () => {
    const jurisdictions = new Set(Object.values(CORPUS_META).map((m) => m.jurisdiction));
    expect(jurisdictions.has("at")).toBe(true);
    expect(jurisdictions.has("de")).toBe(true);
    expect(jurisdictions.has("ch")).toBe(true);
  });

  it("every entry has a label and file", () => {
    for (const [key, meta] of Object.entries(CORPUS_META)) {
      expect(meta.label).toBeTruthy();
      expect(meta.file).toBeTruthy();
      expect(key).toBeTruthy();
    }
  });
});

describe("lookupSplitParagraph", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paragraph text when split file exists", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("This is paragraph text.");
    const result = await lookupSplitParagraph("BGB", "433");
    expect(result).toBe("This is paragraph text.");
  });

  it("strips frontmatter from split file", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      "---\ntitle: BGB § 433\ntype: statute\n---\nThis is the paragraph body."
    );
    const result = await lookupSplitParagraph("BGB", "433");
    expect(result).toBe("This is the paragraph body.");
  });

  it("returns null when file does not exist", async () => {
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("ENOENT"));
    const result = await lookupSplitParagraph("NONEXISTENT", "999");
    expect(result).toBeNull();
  });
});

describe("lookupCorpusParagraph", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null for unknown codeKey", async () => {
    const result = await lookupCorpusParagraph("nonexistent_key", "1");
    expect(result).toBeNull();
  });

  it("extracts DE-style paragraph (## § N ...)", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      "## § 433 Vertragstypische Pflichten\n\n(1) Verkäufer ist verpflichtet...\n\n## § 434 Sachmangel\n\n..."
    );
    const result = await lookupCorpusParagraph("bgb", "433");
    expect(result).toContain("Verkäufer ist verpflichtet");
    expect(result).not.toContain("Sachmangel");
  });

  it("extracts AT-style paragraph (§ N.)", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      "Some preamble\n§ 922. (1) Der Verkäufer...\n§ 923. (1) ..."
    );
    const result = await lookupCorpusParagraph("abgb", "922");
    expect(result).toContain("922");
    expect(result).toContain("Verkäufer");
  });

  it("returns null when paragraph not found in corpus text", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("## § 1 First\n\nText");
    const result = await lookupCorpusParagraph("bgb", "999");
    expect(result).toBeNull();
  });

  it("returns null on file read error", async () => {
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("ENOENT"));
    const result = await lookupCorpusParagraph("bgb", "433");
    expect(result).toBeNull();
  });
});

describe("groundCitations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array for empty input", async () => {
    const result = await groundCitations([]);
    expect(result).toEqual([]);
  });

  it("skips citations missing code or paragraph", async () => {
    const raw: RawCitation[] = [
      { code: "", paragraph: "433" },
      { code: "BGB", paragraph: "" },
      { code: undefined, paragraph: "1" },
    ];
    const result = await groundCitations(raw);
    expect(result).toHaveLength(0);
  });

  it("marks citation as verified when source text is found", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("Kaufvertragsgewährleistung...");
    const result = await groundCitations([
      { code: "BGB", paragraph: "433", context: "Kaufvertrag" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].verified).toBe(true);
    expect(result[0].code).toBe("BGB");
    expect(result[0].paragraph).toBe("433");
    expect(result[0].context).toBe("Kaufvertrag");
    expect(result[0].source_text).toBeTruthy();
  });

  it("marks citation as unverified when no source found", async () => {
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("ENOENT"));
    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("ENOENT"));
    const result = await groundCitations([
      { code: "NONEXISTENT", paragraph: "999", context: "test" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].verified).toBe(false);
    expect(result[0].source_text).toBeUndefined();
  });

  it("limits to 20 citations", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    const raw: RawCitation[] = Array.from({ length: 30 }, (_, i) => ({
      code: "BGB",
      paragraph: String(i + 1),
    }));
    const result = await groundCitations(raw);
    expect(result).toHaveLength(20);
  });

  it("truncates source_text to 600 chars", async () => {
    const longText = "A".repeat(1000);
    vi.mocked(fs.readFile).mockResolvedValueOnce(longText);
    const result = await groundCitations([{ code: "BGB", paragraph: "1", context: "" }]);
    expect(result[0].source_text).toHaveLength(600);
  });
});
