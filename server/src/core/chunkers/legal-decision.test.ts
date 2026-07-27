import { describe, it, expect } from "vitest";
import {
  chunkLegalDecision,
  formatLegalDecisionEmbeddingContext,
  LEGAL_DECISION_CHUNKER_VERSION,
} from "./legal-decision.ts";

const BASE_META = {
  court: "OGH",
  case_number: "2Ob226/27",
  decision_date: "2026-04-22",
  ecli: "ECLI:AT:OGH0002:1927:RS0026645",
  legal_area: "Zivilrecht",
  jurisdiction: "at",
};

const SAMPLE_DECISION = `# OGH — 2Ob226/27

## Gericht

OGH

## Rechtssatznummer

RS0026645

## Entscheidungsdatum

22.04.2026

## Geschäftszahl

2Ob226/27; 6Ob313/64

## Norm

EO §141

ABGB §1300 B

## Rechtssatz

Eine vertragsmäßige Haftung des Sachverständigen gemäß den §§ 1299 und 1300 ABGB besteht nur gegenüber demjenigen, der das Gutachten bestellte, nicht aber auch gegenüber einem Dritten, der dieses Gutachten verwendete.

## Entscheidungstexte

TE OGH 1927-03-30 2 Ob 226/27

Veröff: SZ 9/76

TE OGH 1964-12-02 6 Ob 313/64

Beisatz: Ablehnung der Rechtsansicht von Scheucher in ÖJZ 1961,225 ff. (T1) Veröff: EvBl 1965/321

TE OGH 1965-02-17 6 Ob 47/65

## European Case Law Identifier

ECLI:AT:OGH0002:1927:RS0026645

*Quelle: [RIS-OGD](https://www.ris.bka.gv.at/Dokument.wxe)*`;

describe("legal-decision chunker", () => {
  it("emits a single 'full' chunk for unstructured text", () => {
    const body = "Dies ist ein einfacher Text ohne Strukturüberschriften.";
    const chunks = chunkLegalDecision(body, BASE_META);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.chunk_role).toBe("full");
    expect(chunks[0].metadata.court).toBe("OGH");
    expect(chunks[0].metadata.jurisdiction).toBe("at");
  });

  it("hard-splits a long unstructured decision", () => {
    const chunks = chunkLegalDecision("SehrLangesWort".repeat(2_000), BASE_META);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 6000)).toBe(true);
  });

  it("builds self-identifying embedding context", () => {
    const context = formatLegalDecisionEmbeddingContext({
      ...BASE_META,
      chunk_role: "entscheidungsgruende",
    });
    expect(context).toContain("OGH | 2Ob226/27 | 2026-04-22");
    expect(context).toContain("Abschnitt: entscheidungsgruende");
    expect(context).toContain(BASE_META.ecli);
  });

  it("emits a leitsatz chunk for the Rechtssatz section", () => {
    const chunks = chunkLegalDecision(SAMPLE_DECISION, BASE_META);
    const leitsatz = chunks.find((c) => c.metadata.chunk_role === "leitsatz");
    expect(leitsatz).toBeDefined();
    expect(leitsatz!.text).toContain("vertragsmäßige Haftung");
    expect(leitsatz!.text).toContain("Sachverständigen");
  });

  it("emits a metadata chunk combining short metadata sections", () => {
    const chunks = chunkLegalDecision(SAMPLE_DECISION, BASE_META);
    const meta = chunks.find((c) => c.metadata.chunk_role === "metadata");
    expect(meta).toBeDefined();
    expect(meta!.text).toContain("OGH");
    expect(meta!.text).toContain("RS0026645");
    expect(meta!.text).toContain("22.04.2026");
  });

  it("emits entscheidungstext chunks for each TE entry", () => {
    const chunks = chunkLegalDecision(SAMPLE_DECISION, BASE_META);
    const teChunks = chunks.filter((c) => c.metadata.chunk_role === "entscheidungstext");
    expect(teChunks.length).toBe(3);

    // Each TE chunk should carry its marker
    expect(teChunks[0].metadata.te_marker).toContain("TE OGH 1927-03-30");
    expect(teChunks[1].metadata.te_marker).toContain("TE OGH 1964-12-02");
    expect(teChunks[2].metadata.te_marker).toContain("TE OGH 1965-02-17");
  });

  it("TE chunk text includes the TE marker line", () => {
    const chunks = chunkLegalDecision(SAMPLE_DECISION, BASE_META);
    const teChunks = chunks.filter((c) => c.metadata.chunk_role === "entscheidungstext");
    expect(teChunks[0].text).toContain("TE OGH 1927-03-30");
    expect(teChunks[0].text).toContain("SZ 9/76");
  });

  it("all chunks carry the decision metadata", () => {
    const chunks = chunkLegalDecision(SAMPLE_DECISION, BASE_META);
    for (const c of chunks) {
      expect(c.metadata.court).toBe("OGH");
      expect(c.metadata.case_number).toBe("2Ob226/27");
      expect(c.metadata.decision_date).toBe("2026-04-22");
      expect(c.metadata.ecli).toBe("ECLI:AT:OGH0002:1927:RS0026645");
      expect(c.metadata.legal_area).toBe("Zivilrecht");
      expect(c.metadata.jurisdiction).toBe("at");
    }
  });

  it("produces chunks with sequential indices", () => {
    const chunks = chunkLegalDecision(SAMPLE_DECISION, BASE_META);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
  });

  it("handles empty body", () => {
    const chunks = chunkLegalDecision("", BASE_META);
    expect(chunks).toHaveLength(0);
  });

  it("handles whitespace-only body", () => {
    const chunks = chunkLegalDecision("   \n\n  \n  ", BASE_META);
    expect(chunks).toHaveLength(0);
  });

  it("handles Sachverhalt and Entscheidungsgründe sections", () => {
    const body = `# BFH — VI R 42/23

## Sachverhalt

Der Kläger begehrt die Feststellung, dass die Beklagte verpflichtet ist, ihm Schadensersatz zu leisten. Der Kläger war am 15. März 2023 in einen Verkehrsunfall verwickelt.

## Entscheidungsgründe

Die Klage ist begründet. Die Beklagte hat den Schaden dem Grunde nach zu verantworten. Die Höhe des Schadens beträgt 5.000 Euro.

## Tenor

Die Beklagte wird verurteilt, an den Kläger 5.000 Euro nebst Zinsen zu zahlen.`;

    const chunks = chunkLegalDecision(body, {
      ...BASE_META,
      court: "BFH",
      case_number: "VI R 42/23",
      jurisdiction: "de",
    });

    const sachverhalt = chunks.find((c) => c.metadata.chunk_role === "sachverhalt");
    expect(sachverhalt).toBeDefined();
    expect(sachverhalt!.text).toContain("Kläger");

    const gruende = chunks.find((c) => c.metadata.chunk_role === "entscheidungsgruende");
    expect(gruende).toBeDefined();
    expect(gruende!.text).toContain("Klage ist begründet");

    const tenor = chunks.find((c) => c.metadata.chunk_role === "tenor");
    expect(tenor).toBeDefined();
    expect(tenor!.text).toContain("5.000 Euro");
  });

  it("handles long Rechtssatz by sub-splitting at sentence boundaries", () => {
    const longLeitsatz =
      "Dies ist ein sehr langer Rechtssatz. " +
      "Er besteht aus vielen Sätzen die jeweils eine bestimmte Länge haben. ".repeat(100);
    const body = `## Rechtssatz\n\n${longLeitsatz}`;
    const chunks = chunkLegalDecision(body, BASE_META);
    const leitsatzChunks = chunks.filter((c) => c.metadata.chunk_role === "leitsatz");
    expect(leitsatzChunks.length).toBeGreaterThan(1);
    for (const c of leitsatzChunks) {
      expect(c.text.length).toBeLessThanOrEqual(6000);
    }
  });

  it("handles long Entscheidungstexte by splitting at paragraph boundaries", () => {
    const longTE =
      "TE OGH 2025-01-01 1 Ob 1/25\n\n" + "Sehr langer Entscheidungstext. ".repeat(200);
    const body = `## Rechtssatz\n\nKurzer Leitsatz.\n\n## Entscheidungstexte\n\n${longTE}`;
    const chunks = chunkLegalDecision(body, BASE_META);
    const teChunks = chunks.filter((c) => c.metadata.chunk_role === "entscheidungstext");
    expect(teChunks.length).toBeGreaterThan(1);
  });

  it("exports LEGAL_DECISION_CHUNKER_VERSION", () => {
    expect(LEGAL_DECISION_CHUNKER_VERSION).toBe(4);
  });

  it("handles DE jurisdiction with different section names", () => {
    const body = `# BFH — VI R 42/23\n\n## Tatbestand\n\nDer Sachverhalt.\n\n## Begründung\n\nDie Begründung.\n\n## Spruch\n\nDer Spruch.`;
    const chunks = chunkLegalDecision(body, {
      ...BASE_META,
      court: "BFH",
      case_number: "VI R 42/23",
      jurisdiction: "de",
    });
    expect(chunks.length).toBeGreaterThan(1);
    const sachverhalt = chunks.find((c) => c.metadata.chunk_role === "sachverhalt");
    expect(sachverhalt).toBeDefined();
    expect(sachverhalt!.text).toContain("Sachverhalt");
  });

  it("falls back to full chunk when only metadata sections are present", () => {
    const body = `## Gericht\n\nOGH\n\n## Entscheidungsdatum\n\n22.04.2026`;
    const chunks = chunkLegalDecision(body, BASE_META);
    // Should have at least one chunk — either metadata or full fallback
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it("preserves Norm section content in metadata or other chunk", () => {
    const chunks = chunkLegalDecision(SAMPLE_DECISION, BASE_META);
    // The Norm section should appear somewhere in the chunks
    const allText = chunks.map((c) => c.text).join(" ");
    expect(allText).toContain("EO §141");
    expect(allText).toContain("ABGB §1300");
  });
});
