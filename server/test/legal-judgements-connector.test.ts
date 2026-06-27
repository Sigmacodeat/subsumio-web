import { describe, it, expect } from "bun:test";
import {
  LegalJudgementsConnector,
  extractRisReferences,
  mapRisReference,
  stripHtml,
} from "../src/core/ingestion/connectors/legal-judgements.ts";

// Shape verified against the live RIS-OGD v2.6 API (2026-06).
const RIS_SAMPLE = {
  OgdSearchResult: {
    OgdDocumentResults: {
      Hits: { "@pageNumber": "1", "@pageSize": "10", "#text": "3121" },
      OgdDocumentReference: [
        {
          Data: {
            Metadaten: {
              Technisch: {
                ID: "JJR_19790330_OGH0002_0010OB00010_7900000_005",
                Applikation: "Justiz",
                Organ: "OGH",
              },
              Allgemein: {
                Veroeffentlicht: "1997-06-15",
                DokumentUrl:
                  "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJR_X",
              },
              Judikatur: {
                Dokumenttyp: "Rechtssatz",
                Geschaeftszahl: { item: "1Ob10/79; 1Ob12/80" },
                Entscheidungsdatum: "2026-04-28",
                Schlagworte: "Auto; unvertretbare Rechtsansicht",
                EuropeanCaseLawIdentifier: "ECLI:AT:OGH0002:1979:RS0049912",
                Justiz: {
                  Rechtsgebiete: { item: "Zivilrecht" },
                  Gericht: "OGH",
                },
              },
            },
          },
        },
      ],
    },
  },
};

describe("extractRisReferences", () => {
  it("extracts the reference array from the v2.6 envelope", () => {
    const refs = extractRisReferences(RIS_SAMPLE as unknown as Record<string, unknown>);
    expect(refs.length).toBe(1);
  });

  it("wraps a single (non-array) hit into an array", () => {
    const single = {
      OgdSearchResult: {
        OgdDocumentResults: {
          OgdDocumentReference:
            RIS_SAMPLE.OgdSearchResult.OgdDocumentResults.OgdDocumentReference[0],
        },
      },
    };
    const refs = extractRisReferences(single as unknown as Record<string, unknown>);
    expect(refs.length).toBe(1);
  });

  it("returns [] on garbage / legacy shapes", () => {
    expect(extractRisReferences({})).toEqual([]);
    expect(extractRisReferences({ results: [{ id: "x" }] })).toEqual([]);
  });
});

describe("mapRisReference", () => {
  const ref = extractRisReferences(RIS_SAMPLE as unknown as Record<string, unknown>)[0]!;

  it("maps court, date, ECLI, Geschäftszahl, keywords", () => {
    const item = mapRisReference(ref, new Date("2026-01-01"));
    expect(item).not.toBeNull();
    expect(item!.court).toBe("OGH");
    expect(item!.ecli).toBe("ECLI:AT:OGH0002:1979:RS0049912");
    expect(item!.az).toBe("1Ob10/79");
    expect(item!.keywords).toEqual(["Auto", "unvertretbare Rechtsansicht"]);
    expect(item!.legalArea).toBe("Zivilrecht");
    expect(item!.date.startsWith("2026-04-28")).toBe(true);
  });

  it("produces a deterministic id (no Math.random) so re-syncs dedupe", () => {
    const a = mapRisReference(ref, new Date())!;
    const b = mapRisReference(ref, new Date())!;
    expect(a.id).toBe(b.id);
    expect(a.id).toBe("ris-JJR_19790330_OGH0002_0010OB00010_7900000_005");
  });

  it("rejects references without a technical ID", () => {
    expect(mapRisReference({ Data: { Metadaten: {} } }, new Date())).toBeNull();
  });
});

describe("toIngestionEvent YAML safety", () => {
  it("court names with colons/newlines cannot inject frontmatter keys", async () => {
    const connector = new LegalJudgementsConnector({});
    const malicious = {
      id: "ris-evil",
      title: "evil",
      modified_at: "2026-01-01T00:00:00Z",
      content: "",
      content_type: "text/markdown",
      url: "https://example.test/x",
      source: "ris-ogd" as const,
      court: "OGH\ntype: admin_override",
      date: "2026-01-01T00:00:00.000Z",
      ecli: undefined,
      az: "evil: yes",
      legalArea: "Zivilrecht",
      keywords: ["a: b"],
      text: "",
    };
    const event = await connector.toIngestionEvent(malicious);
    // The injected "type: admin_override" must be quoted INSIDE the court
    // value, not appear as its own frontmatter line.
    const fmBlock = event.content.split("---")[1]!;
    const lines = fmBlock.split("\n").map((l) => l.trimEnd());
    expect(lines.some((l) => l.startsWith("type: admin_override"))).toBe(false);
    expect(fmBlock).toContain("court:");
    expect(event.metadata?.slug).toMatch(/^legal\/judgements\//);
  });
});

describe("stripHtml", () => {
  it("converts simple HTML to readable text", () => {
    const text = stripHtml(
      "<p>Erster Absatz</p><p>Zweiter &amp; dritter</p><script>alert(1)</script>"
    );
    expect(text).toContain("Erster Absatz");
    expect(text).toContain("Zweiter & dritter");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("<p>");
  });
});
