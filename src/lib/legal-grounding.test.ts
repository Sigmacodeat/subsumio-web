import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeStatuteCode,
  lookupSplitParagraph,
  lookupCorpusParagraph,
  groundCitations,
  findCodeKey,
  detectUnverifiableCitation,
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

  it("extracts article-style paragraphs for state treaties (Art. N)", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      "---\ntype: staatsvertrag\n---\nArt. 5 Vertragsstaaten.\nAlle Vertragsparteien sind verpflichtet, ...\n\nArt. 6 Behörden.\n..."
    );
    const result = await lookupCorpusParagraph("alpenkonvention", "Art 5");
    expect(result).toContain("Vertragsstaaten");
    expect(result).not.toContain("Behörden");
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

// ---------------------------------------------------------------------------
// Regression guards for the AT grounding-hardening pass (anti-hallucination).
// ---------------------------------------------------------------------------

describe("lookupSplitParagraph — file-basename slug (AT codes)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves an '(AT)' code to its <basename>-par-N split file, not the label abbr", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("§ 1. Die Aktiengesellschaft ...");
    await lookupSplitParagraph("AktG (AT)", "1");
    const calledPath = String(vi.mocked(fs.readFile).mock.calls[0][0]);
    // Must target aktg-at-par-1.md (file basename), NOT aktg-par-1.md (label).
    expect(calledPath).toContain("aktg-at-par-1.md");
    expect(calledPath).toContain(`${"at"}/`);
  });

  it("resolves ABGB to abgb-par-N and strips frontmatter", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("---\ntitle: x\n---\n§ 1295. (1) Jedermann ...");
    const r = await lookupSplitParagraph("ABGB", "1295");
    const calledPath = String(vi.mocked(fs.readFile).mock.calls[0][0]);
    expect(calledPath).toContain("abgb-par-1295.md");
    expect(r).toContain("Jedermann");
    expect(r).not.toContain("title:");
  });
});

describe("lookupCorpusParagraph — RIS raw hardening", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips the ToC stub and returns the norm text after the `Text` delimiter", async () => {
    // ToC lists "§ 1295. Schadenersatz." BEFORE `Text`; the norm is after it.
    const raw =
      "Inhaltsübersicht\n§ 1295. Schadenersatz.\n§ 1296. Zufall.\n" +
      "Text\n" +
      "§ 1295. (1) Jedermann ist berechtigt, von dem Beschädiger den Ersatz zu fordern.\n" +
      "§ 1296. Im Zweifel gilt die Vermutung, dass ein Schaden ohne Verschulden entstand.\n";
    vi.mocked(fs.readFile).mockResolvedValueOnce(raw);
    const r = await lookupCorpusParagraph("abgb", "1295");
    expect(r).toContain("Jedermann ist berechtigt");
    expect(r).not.toBe("§ 1295. Schadenersatz."); // not the ToC stub
  });

  it("bounds at the next real marker when paragraph+1 is repealed/absent", async () => {
    // § 1490 exists, § 1491 is repealed; the next marker is § 1495.
    const raw =
      "Text\n§ 1490. Klagerecht besteht fort.\n§ 1495. Zwischen Ehegatten ruht die Frist.\n";
    vi.mocked(fs.readFile).mockResolvedValueOnce(raw);
    const r = await lookupCorpusParagraph("abgb", "1490");
    expect(r).toContain("Klagerecht besteht fort");
    expect(r).not.toContain("Zwischen Ehegatten"); // stopped at the next marker
  });

  it("does NOT falsely verify: a bare marker with no body returns null", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce("Text\n§ 999.\n§ 1000. Echter Inhalt hier.\n");
    const r = await lookupCorpusParagraph("abgb", "999");
    expect(r).toBeNull();
  });
});

describe("CORPUS_META — full AT coverage", () => {
  it("includes the flagship codes that were previously unverifiable", () => {
    for (const key of ["ugb", "io", "aktg_at", "gmbhg_at", "eheg", "bewg", "wrg", "bvergg"]) {
      expect(CORPUS_META[key], `missing CORPUS_META entry: ${key}`).toBeTruthy();
      expect(CORPUS_META[key].jurisdiction).toBe("at");
    }
  });

  it("has more than 90 statutes across all jurisdictions", () => {
    expect(Object.keys(CORPUS_META).length).toBeGreaterThan(90);
  });
});

// ---------------------------------------------------------------------------
// findCodeKey — exact-match anti-hallucination lookup
// ---------------------------------------------------------------------------

describe("findCodeKey", () => {
  it("resolves unique abbreviation to slug key", () => {
    expect(findCodeKey("ABGB")).toBe("abgb");
    expect(findCodeKey("BGB")).toBe("bgb");
  });

  it("resolves (AT) suffix labels correctly", () => {
    expect(findCodeKey("AktG (AT)")).toBe("aktg_at");
    expect(findCodeKey("StGB (AT)")).toBe("stgb_at");
    expect(findCodeKey("ZPO (AT)")).toBe("zpo_at");
  });

  it("resolves cross-jurisdiction disambiguated labels", () => {
    expect(findCodeKey("StGB (DE)")).toBe("stgb");
    expect(findCodeKey("StGB (CH)")).toBe("ch_stgb");
    expect(findCodeKey("ZPO (DE)")).toBe("zpo");
    expect(findCodeKey("ZPO (CH)")).toBe("ch_zpo");
    expect(findCodeKey("StGB-AT")).toBe("stgb_at");
    expect(findCodeKey("ZPO-AT")).toBe("zpo_at");
  });

  it("returns null for ambiguous abbreviation (282× ADR)", () => {
    expect(findCodeKey("ADR")).toBeNull();
  });

  it("tokenizes punctuation and case-insensitive labels", () => {
    const ataKey =
      "st_a_t_a_abkommen_zollabkommen_uber_das_carnet_a_t_a_fur_die_vorubergehende_einfuhr_von_waren";
    expect(findCodeKey("A. T. A.")).toBe(ataKey);
    expect(findCodeKey("A-T-A Abkommen")).toBe(ataKey);
    expect(findCodeKey("A. T. A. Abkommen")).toBe(ataKey);
  });

  it("returns null for unknown code", () => {
    expect(findCodeKey("NONEXISTENT")).toBeNull();
  });

  it("resolves exact slug-key match", () => {
    expect(findCodeKey("abgb")).toBe("abgb");
    expect(findCodeKey("stgb_at")).toBe("stgb_at");
  });
});

// ---------------------------------------------------------------------------
// detectUnverifiableCitation — treaties and regional laws
// ---------------------------------------------------------------------------

describe("detectUnverifiableCitation", () => {
  it("detects treaty citations", () => {
    expect(detectUnverifiableCitation("Alpenkonvention")).toBe("Staatsvertrag");
    expect(detectUnverifiableCitation("Abkommen Kasachstan")).toBe("Staatsvertrag");
    expect(detectUnverifiableCitation("Übereinkommen")).toBe("Staatsvertrag");
  });

  it("detects regional law citations", () => {
    expect(detectUnverifiableCitation("Tiroler Baugesetz")).toBe("Landesrecht");
    expect(detectUnverifiableCitation("LGBl. 23/2020")).toBe("Landesrecht");
    expect(detectUnverifiableCitation("Salzburger Raumordnungsgesetz")).toBe("Landesrecht");
  });

  it("detects treaty keywords in context", () => {
    expect(detectUnverifiableCitation("Art 5", "Alpenkonvention")).toBe("Staatsvertrag");
  });

  it("returns null for normal statute citations", () => {
    expect(detectUnverifiableCitation("ABGB")).toBeNull();
    expect(detectUnverifiableCitation("BGB", "Kaufvertrag")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// groundCitations — unverifiable citations (treaties + regional laws)
// ---------------------------------------------------------------------------

describe("groundCitations — unverifiable citations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.readFile).mockReset();
  });

  it("marks treaty citations as unverifiable with reason when paragraph not found", async () => {
    // split lookup fails, raw corpus has only Art. 1 and Art. 2 — no Art. 5
    vi.mocked(fs.readFile)
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce("---\ntype: staatsvertrag\n---\nArt. 1 Vertragszweck.\nArt. 2 Begriffsbestimmungen.");
    const result = await groundCitations([
      { code: "Alpenkonvention", paragraph: "Art 5", context: "Staatsvertrag" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].verified).toBe(false);
    expect(result[0].unverifiable_reason).toBe("Staatsvertrag");
    expect(result[0].source_text).toBeUndefined();
    expect(result[0].category).toBe("state_treaty");
    expect(result[0].jurisdiction).toBe("at");
  });

  it("marks regional law citations as unverifiable with reason when paragraph not found", async () => {
    vi.mocked(fs.readFile)
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce("---\ntype: landesgesetz\n---\n§ 1. Geltungsbereich.\n§ 2. Begriffsbestimmungen.");
    const result = await groundCitations([
      { code: "Bodenseefischereigesetz", paragraph: "§ 12", context: "Landesrecht" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].verified).toBe(false);
    expect(result[0].unverifiable_reason).toBe("Landesrecht");
    expect(result[0].category).toBe("state_law");
    expect(result[0].jurisdiction).toBe("at");
  });

  it("never silently verifies an ambiguous treaty citation", async () => {
    // "Abkommen" is ambiguous and not in CORPUS_META, so it stays unverifiable
    vi.mocked(fs.readFile).mockResolvedValueOnce("Some text");
    const result = await groundCitations([
      { code: "Abkommen", paragraph: "Art 3", context: "Staatsvertrag" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].verified).toBe(false);
    expect(result[0].unverifiable_reason).toBe("Staatsvertrag");
  });

  it("verifies a known treaty article when the article is present in the corpus", async () => {
    vi.mocked(fs.readFile)
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValueOnce(
        "---\ntype: staatsvertrag\n---\nArt. 5 Vertragsstaaten.\nAlle Vertragsparteien sind verpflichtet, ..."
      );
    const result = await groundCitations([
      { code: "Alpenkonvention", paragraph: "Art 5", context: "Staatsvertrag" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].verified).toBe(true);
    expect(result[0].source_text).toContain("Vertragsstaaten");
    expect(result[0].category).toBe("state_treaty");
    expect(result[0].jurisdiction).toBe("at");
  });
});

// ---------------------------------------------------------------------------
// groundCitations — fake vs real paragraphs in new AT statutes
// ---------------------------------------------------------------------------

describe("groundCitations — fake vs real paragraphs (new AT statutes)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.readFile).mockReset();
  });

  it("fake paragraph in AsylG → verified:false with explicit reason", async () => {
    // § 9999 does not exist in AsylG — both split and raw lookup must fail
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    const result = await groundCitations([
      { code: "AsylG", paragraph: "9999", context: "fake paragraph" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].verified).toBe(false);
    expect(result[0].source_text).toBeUndefined();
    expect(result[0].unverifiable_reason).toBe("Paragraph not found");
    expect(result[0].category).toBe("statute");
    expect(result[0].jurisdiction).toBe("at");
  });

  it("fake paragraph in SPG → verified:false", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    const result = await groundCitations([
      { code: "SPG", paragraph: "99999", context: "fake" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].verified).toBe(false);
  });

  it("fake paragraph in ChemG → verified:false", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    const result = await groundCitations([
      { code: "ChemG", paragraph: "88888", context: "fake" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].verified).toBe(false);
  });

  it("real paragraph in AsylG → verified:true with source_text and category", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      "§ 1. (1) Dieses Bundesgesetz regelt die Einreise nach Österreich..."
    );
    const result = await groundCitations([
      { code: "AsylG", paragraph: "1", context: "Asylverfahren" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].verified).toBe(true);
    expect(result[0].source_text).toBeTruthy();
    expect(result[0].source_text).toContain("Bundesgesetz");
    expect(result[0].category).toBe("statute");
    expect(result[0].jurisdiction).toBe("at");
  });

  it("real paragraph in SPG → verified:true with source_text", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      "§ 1. (1) Dieses Bundesgesetz regelt die Aufgaben der Sicherheitsverwaltung..."
    );
    const result = await groundCitations([
      { code: "SPG", paragraph: "1", context: "Sicherheitspolizei" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].verified).toBe(true);
    expect(result[0].source_text).toContain("Sicherheitsverwaltung");
  });

  it("real paragraph in ChemG → verified:true with source_text", async () => {
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      "§ 1. (1) Dieses Bundesgesetz dient dem Schutz von Mensch und Umwelt..."
    );
    const result = await groundCitations([
      { code: "ChemG", paragraph: "1", context: "Chemikalienrecht" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].verified).toBe(true);
    expect(result[0].source_text).toContain("Umwelt");
  });
});

// ---------------------------------------------------------------------------
// CORPUS_META — CI guard (freshness + structure)
// ---------------------------------------------------------------------------

describe("CORPUS_META — CI guard", () => {
  it("has at least 950 entries", () => {
    expect(Object.keys(CORPUS_META).length).toBeGreaterThanOrEqual(950);
  });

  it("has no duplicate slug keys", () => {
    const keys = Object.keys(CORPUS_META);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("every entry has valid jurisdiction, label, and file", () => {
    for (const [key, meta] of Object.entries(CORPUS_META)) {
      expect(meta.jurisdiction).toMatch(/^(at|de|ch|eu)$/);
      expect(meta.label).toBeTruthy();
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.file).toMatch(/^(at|de|ch|eu|at-staatsvertraege|at-landesrecht)\//);
      expect(meta.file).toMatch(/\.md$/);
    }
  });

  it("contains flagship AT codes with correct labels", () => {
    expect(CORPUS_META["abgb"].label).toBe("ABGB");
    expect(CORPUS_META["stgb_at"].label).toBe("StGB-AT");
    expect(CORPUS_META["zpo_at"].label).toBe("ZPO-AT");
  });

  it("contains DE flagship codes", () => {
    expect(CORPUS_META["bgb"].jurisdiction).toBe("de");
    expect(CORPUS_META["bgb"].label).toBe("BGB");
  });
});
