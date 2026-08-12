import { describe, it, expect } from "vitest";
import {
  chunkLegalSection,
  formatLegalSectionEmbeddingContext,
  formatStatuteRef,
  LEGAL_CHUNKER_VERSION,
} from "./legal-statute.ts";

const BASE_META = {
  paragraph_ref: "933",
  statute_abbr: "ABGB",
  jurisdiction: "at",
};

describe("legal-statute chunker", () => {
  it("emits a single chunk for short § bodies", () => {
    const body =
      "Wer eine Sache einem anderen abgenommen hat, ist ihm zum Ersatz des Schadens verpflichtet.";
    const chunks = chunkLegalSection(body, BASE_META);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.chunk_role).toBe("full");
    expect(chunks[0].metadata.absatz).toBeNull();
    expect(chunks[0].metadata.paragraph_ref).toBe("933");
    expect(chunks[0].metadata.statute_abbr).toBe("ABGB");
    expect(chunks[0].metadata.jurisdiction).toBe("at");
    expect(chunks[0].index).toBe(0);
  });

  it("emits a single chunk when under char threshold even if word count is high", () => {
    // 200 words but under 2000 chars
    const body = "Wort ".repeat(200).trim();
    const chunks = chunkLegalSection(body, BASE_META);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.chunk_role).toBe("full");
  });

  it("splits long § at Absatz markers", () => {
    const filler =
      "Zusätzlicher Text um die Länge zu erhöhen und sicherzustellen dass der Chunker aufteilt. ";
    const absatz1 =
      "(1) Die Gewährleistungspflicht des Übergebers erstreckt sich auf solche Mängel der übergebenen Sache, die den gemeinen Gebrauch aufheben oder mindern. " +
      filler.repeat(8);
    const absatz2 =
      "(2) Wurden solche Mängel in dem Vertrage nicht ausdrücklich ausbedungen, so ist der Übergeber zur Verbesserung, mangels dieser zur Verminderung des Entgelts oder, wenn der Mangel nicht verbesserungsfähig ist, zur Aufhebung des Vertrages verpflichtet. " +
      filler.repeat(8);
    const absatz3 =
      "(3) Der Übernehmer ist berechtigt, wegen der Mängel den bedungenen Preis zu verweigern, bis der Übergeber die Mängel verbessert hat. " +
      filler.repeat(8);
    const body = [absatz1, absatz2, absatz3].join("\n\n");

    const chunks = chunkLegalSection(body, BASE_META);

    expect(chunks.length).toBeGreaterThan(1);
    // At least one chunk should have absatz metadata
    const absatzChunks = chunks.filter((c) => c.metadata.absatz !== null);
    expect(absatzChunks.length).toBeGreaterThan(0);
    // All chunks should carry the § metadata
    for (const c of chunks) {
      expect(c.metadata.paragraph_ref).toBe("933");
      expect(c.metadata.statute_abbr).toBe("ABGB");
      expect(c.metadata.jurisdiction).toBe("at");
    }
  });

  it("preserves Absatz number in chunk metadata", () => {
    const absatz1 =
      "(1) " +
      "Erster Absatz mit ausreichend Text um die Mindestlänge zu erreichen und sicherzustellen dass der Chunker hier eine Aufteilung vornimmt. ".repeat(
        10
      );
    const absatz2 =
      "(2) " +
      "Zweiter Absatz mit ausreichend Text um die Mindestlänge zu erreichen und sicherzustellen dass der Chunker hier eine Aufteilung vornimmt. ".repeat(
        10
      );
    const absatz3 =
      "(3) " +
      "Dritter Absatz mit ausreichend Text um die Mindestlänge zu erreichen und sicherzustellen dass der Chunker hier eine Aufteilung vornimmt. ".repeat(
        10
      );
    const body = [absatz1, absatz2, absatz3].join("\n\n");

    const chunks = chunkLegalSection(body, BASE_META);
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Check that absatz numbers are captured
    const absatzValues = chunks.map((c) => c.metadata.absatz).filter((a) => a !== null);
    expect(absatzValues).toContain("1");
    expect(absatzValues).toContain("2");
    expect(absatzValues).toContain("3");
  });

  it("strips leading § N. norm designation to detect first Absatz (RIS XML)", () => {
    // RIS XML norm files embed the norm designation at the start of the first
    // Absatz: "§ 933. (1) Der Übergeber…". Without stripping, the (1) marker
    // is hidden from ABSATZ_MARKER and Absatz 1 gets absatz=null.
    const filler =
      "Absatz mit ausreichend Text um die Mindestlänge zu erreichen und sicherzustellen dass der Chunker hier eine Aufteilung vornimmt. ";
    const absatz1 = `§ 933. (1) ${filler.repeat(10)}`;
    const absatz2 = `(2) ${filler.repeat(10)}`;
    const absatz3 = `(3) ${filler.repeat(10)}`;
    const body = [absatz1, absatz2, absatz3].join("\n\n");

    const chunks = chunkLegalSection(body, BASE_META);
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    const absatzValues = chunks.map((c) => c.metadata.absatz).filter((a) => a !== null);
    expect(absatzValues).toContain("1");
    expect(absatzValues).toContain("2");
    expect(absatzValues).toContain("3");
  });

  it("strips leading Art. N. norm designation to detect first Absatz (RIS XML)", () => {
    // RIS XML norm files for Artikel norms embed the designation at the
    // start of the first Absatz: "Art. 24. (1) Die Differenzbesteuerung…".
    // Without stripping, the (1) marker is hidden from ABSATZ_MARKER.
    const filler =
      "Absatz mit ausreichend Text um die Mindestlänge zu erreichen und sicherzustellen dass der Chunker hier eine Aufteilung vornimmt. ";
    const absatz1 = `Art. 24. (1) ${filler.repeat(10)}`;
    const absatz2 = `(2) ${filler.repeat(10)}`;
    const absatz3 = `(3) ${filler.repeat(10)}`;
    const body = [absatz1, absatz2, absatz3].join("\n\n");

    const chunks = chunkLegalSection(body, {
      paragraph_ref: "Art. 24",
      statute_abbr: "UStG 1994",
      jurisdiction: "at",
    });
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    const absatzValues = chunks.map((c) => c.metadata.absatz).filter((a) => a !== null);
    expect(absatzValues).toContain("1");
    expect(absatzValues).toContain("2");
    expect(absatzValues).toContain("3");
  });

  it("falls back to paragraph splitting when no Absatz markers exist", () => {
    // Long text with paragraph breaks but no (N) markers
    const para1 =
      "Dies ist der erste Abschnitt des Paragraphen mit ausreichend Text um eine gewisse Länge zu erreichen und sicherzustellen dass der Chunker hier etwas macht. ".repeat(
        3
      );
    const para2 =
      "Dies ist der zweite Abschnitt des Paragraphen mit ausreichend Text um eine gewisse Länge zu erreichen und sicherzustellen dass der Chunker hier etwas macht. ".repeat(
        3
      );
    const body = [para1, para2].join("\n\n");

    const chunks = chunkLegalSection(body, BASE_META);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Without Absatz markers, absatz should be null
    for (const c of chunks) {
      expect(c.metadata.absatz).toBeNull();
    }
  });

  it("handles empty body", () => {
    const chunks = chunkLegalSection("", BASE_META);
    expect(chunks).toHaveLength(0);
  });

  it("handles whitespace-only body", () => {
    const chunks = chunkLegalSection("   \n\n  \n  ", BASE_META);
    expect(chunks).toHaveLength(0);
  });

  it("produces chunks with sequential indices", () => {
    const absatz1 = "(1) " + "Text ".repeat(100);
    const absatz2 = "(2) " + "Text ".repeat(100);
    const absatz3 = "(3) " + "Text ".repeat(100);
    const body = [absatz1, absatz2, absatz3].join("\n\n");

    const chunks = chunkLegalSection(body, BASE_META);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
  });

  it("sets absatz=null when multiple short Absätze merge into one chunk", () => {
    // When a norm has multiple Absätze but the total body is under the
    // chunk-size threshold, all Absätze merge into one chunk. The absatz
    // metadata must be null (not the last Absatz) — otherwise the canonical
    // label claims "Abs. 5" for a chunk that contains Abs. 1-5, and
    // absatz-specific search misses it.
    const absatz1 = "(1) Kurzer Absatz Text. ".repeat(5);
    const absatz2 = "(2) Kurzer Absatz Text. ".repeat(5);
    const absatz3 = "(3) Kurzer Absatz Text. ".repeat(5);
    const body = [absatz1, absatz2, absatz3].join("\n\n");

    const chunks = chunkLegalSection(body, BASE_META);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.absatz).toBeNull();
    expect(chunks[0].metadata.chunk_role).toBe("full");
  });

  it("preserves absatz value when a single Absatz forms one chunk", () => {
    // A single long Absatz that gets its own chunk should keep its absatz
    // value — the multi-absatz null override must not trigger here.
    const absatz1 = "(1) " + "Langer Absatz Text für Chunking. ".repeat(100);
    const body = absatz1;

    const chunks = chunkLegalSection(body, BASE_META);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // The first (and likely only) chunk should have absatz="1"
    expect(chunks[0].metadata.absatz).toBe("1");
  });

  it("includes the Absatz marker in chunk text for keyword search", () => {
    const absatz1 =
      "(1) Erster Absatz mit ausreichend Text um die Mindestlänge zu erreichen. ".repeat(5);
    const absatz2 =
      "(2) Zweiter Absatz mit ausreichend Text um die Mindestlänge zu erreichen. ".repeat(5);
    const body = [absatz1, absatz2].join("\n\n");

    const chunks = chunkLegalSection(body, BASE_META);
    // At least one chunk text should contain "(1)" or "(2)"
    const hasAbsatzInText = chunks.some((c) => c.text.includes("(1)") || c.text.includes("(2)"));
    expect(hasAbsatzInText).toBe(true);
  });

  it("respects maxChars hard cap", () => {
    // Very long single Absatz without paragraph breaks
    const body = "(1) " + "SehrLangesWortOhneLeerzeichen".repeat(500);
    const chunks = chunkLegalSection(body, BASE_META);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(6000);
    }
  });

  it("builds self-identifying embedding context", () => {
    const chunk = chunkLegalSection("(2) Der Anspruch verjährt.", BASE_META)[0];
    const context = formatLegalSectionEmbeddingContext({
      ...chunk.metadata,
      absatz: "2",
      chunk_role: "absatz",
    });
    expect(context).toContain("ABGB § 933");
    expect(context).toContain("Abs. 2");
    expect(context).toContain("Jurisdiktion: at");
  });

  it("exports LEGAL_CHUNKER_VERSION", () => {
    expect(LEGAL_CHUNKER_VERSION).toBe(4);
  });

  it("handles CH jurisdiction with Art. references", () => {
    const body =
      "Der Vertrag ist nach dem Recht zu beurteilen, das die Parteien gewählt haben. Fehlt eine solche Wahl, so ist das Recht des Staates anwendbar, mit dem der Vertrag am engsten zusammenhängt. ".repeat(
        5
      );
    const chunks = chunkLegalSection(body, {
      paragraph_ref: "116",
      statute_abbr: "OR",
      jurisdiction: "ch",
    });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].metadata.jurisdiction).toBe("ch");
    expect(chunks[0].metadata.statute_abbr).toBe("OR");
  });

  it("handles EU regulation Artikel references", () => {
    const body =
      "Die Verarbeitung personenbezogener Daten darf nur auf Grundlage einer der in diesem Artikel genannten Rechtsgrundlagen erfolgen. ".repeat(
        5
      );
    const chunks = chunkLegalSection(body, {
      paragraph_ref: "6",
      statute_abbr: "DSGVO",
      jurisdiction: "eu",
    });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].metadata.jurisdiction).toBe("eu");
  });
});

describe("formatStatuteRef — double-marker prevention", () => {
  // RIS XML norm files store the full RIS designation in `paragraph`
  // frontmatter: "§ 1", "Art. 5", "Anl. 2", "Art. 4 § 1". The label builders
  // must NOT prepend another marker — that produced "UWG § § 1", "AktG § Art. 5".

  it("passes through paragraph_ref that already starts with §", () => {
    expect(formatStatuteRef("§ 1", "at")).toBe("§ 1");
    expect(formatStatuteRef("§ 933a", "at")).toBe("§ 933a");
  });

  it("passes through paragraph_ref that already starts with Art.", () => {
    expect(formatStatuteRef("Art. 5", "at")).toBe("Art. 5");
    expect(formatStatuteRef("Art. 4 § 1", "at")).toBe("Art. 4 § 1");
  });

  it("passes through paragraph_ref that already starts with Anl.", () => {
    expect(formatStatuteRef("Anl. 2", "at")).toBe("Anl. 2");
    expect(formatStatuteRef("Anl. 1/1a", "at")).toBe("Anl. 1/1a");
  });

  it("prepends § for bare refs in DE/AT jurisdiction", () => {
    expect(formatStatuteRef("933", "at")).toBe("§ 933");
    expect(formatStatuteRef("1a", "de")).toBe("§ 1a");
  });

  it("prepends Art. for bare refs in CH/EU jurisdiction", () => {
    expect(formatStatuteRef("116", "ch")).toBe("Art. 116");
    expect(formatStatuteRef("6", "eu")).toBe("Art. 6");
  });

  it("returns Norm for empty paragraph_ref", () => {
    expect(formatStatuteRef("", "at")).toBe("Norm");
    expect(formatStatuteRef("", "ch")).toBe("Norm");
  });

  it("prevents double-§ in embedding context for RIS norm files", () => {
    // RIS XML norm file: paragraph: "§ 1" → paragraph_ref: "§ 1"
    const context = formatLegalSectionEmbeddingContext({
      paragraph_ref: "§ 1",
      statute_abbr: "AGG",
      jurisdiction: "at",
      absatz: null,
      chunk_role: "full",
    });
    expect(context).toContain("AGG § 1");
    expect(context).not.toContain("§ §");
  });

  it("prevents § Art. in embedding context for Artikel norms", () => {
    const context = formatLegalSectionEmbeddingContext({
      paragraph_ref: "Art. 5",
      statute_abbr: "AktG",
      jurisdiction: "at",
      absatz: null,
      chunk_role: "full",
    });
    expect(context).toContain("AktG Art. 5");
    expect(context).not.toContain("§ Art.");
  });

  it("still works for bare refs from the split-statute monolith path", () => {
    const context = formatLegalSectionEmbeddingContext({
      paragraph_ref: "933",
      statute_abbr: "ABGB",
      jurisdiction: "at",
      absatz: "2",
      chunk_role: "absatz",
    });
    expect(context).toContain("ABGB § 933");
    expect(context).toContain("Abs. 2");
  });
});
