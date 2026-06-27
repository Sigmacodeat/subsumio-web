// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock withRetry to pass through
vi.mock("@/lib/retry", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
  externalFetchTimeout: vi.fn((ms: number) => AbortSignal.timeout(ms)),
}));

vi.mock("@/lib/errors", () => ({
  JudgementsSearchError: class JudgementsSearchError extends Error {
    constructor(
      msg: string,
      public opts?: Record<string, unknown>
    ) {
      super(msg);
    }
  },
}));

import {
  searchRisOgd,
  searchOpenLegalData,
  searchOpenCaseLaw,
  searchJudgements,
} from "./judgements";

function makeJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("searchRisOgd", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("returns empty array when no results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({ OgdSearchResult: { OgdDocumentResults: {} } })
    );
    const hits = await searchRisOgd({ q: "test" });
    expect(hits).toEqual([]);
  });

  test("parses single OgdDocumentReference (non-array)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({
        OgdSearchResult: {
          OgdDocumentResults: {
            OgdDocumentReference: {
              Data: {
                Metadaten: {
                  Technisch: { ID: "T001", Organ: "OGH" },
                  Allgemein: { DokumentUrl: "https://ris.bka.gv.at/doc/T001" },
                  Judikatur: {
                    Justiz: { Gericht: "OGH", Rechtsgebiete: { item: "Zivilrecht" } },
                    Geschaeftszahl: { item: "1 Ob 1/2024" },
                    Entscheidungsdatum: "2024-01-15",
                    EuropeanCaseLawIdentifier: "ECLI:AT:OGH:2024:1Ob1.2024",
                    Schlagworte: "Schadenersatz",
                  },
                },
              },
            },
          },
        },
      })
    );
    const hits = await searchRisOgd({ q: "Schadenersatz" });
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("ECLI:AT:OGH:2024:1Ob1.2024");
    expect(hits[0].court).toBe("OGH");
    expect(hits[0].caseNumber).toBe("1 Ob 1/2024");
    expect(hits[0].source).toBe("ris-ogd");
    expect(hits[0].url).toBe("https://ris.bka.gv.at/doc/T001");
  });

  test("parses array of OgdDocumentReferences", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({
        OgdSearchResult: {
          OgdDocumentResults: {
            OgdDocumentReference: [
              {
                Data: {
                  Metadaten: {
                    Technisch: { ID: "T001" },
                    Judikatur: { Justiz: { Gericht: "LG Wien" }, Entscheidungsdatum: "2024-03-01" },
                  },
                },
              },
              {
                Data: {
                  Metadaten: {
                    Technisch: { ID: "T002" },
                    Judikatur: {
                      Justiz: { Gericht: "OLG Wien" },
                      Entscheidungsdatum: "2024-04-01",
                    },
                  },
                },
              },
            ],
          },
        },
      })
    );
    const hits = await searchRisOgd({ q: "test" });
    expect(hits).toHaveLength(2);
    expect(hits[0].court).toBe("LG Wien");
    expect(hits[1].court).toBe("OLG Wien");
  });

  test("skips entries without ID", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({
        OgdSearchResult: {
          OgdDocumentResults: {
            OgdDocumentReference: [
              { Data: { Metadaten: { Technisch: {}, Judikatur: {} } } },
              { Data: { Metadaten: { Technisch: { ID: "T002" }, Judikatur: { Justiz: {} } } } },
            ],
          },
        },
      })
    );
    const hits = await searchRisOgd({ q: "test" });
    expect(hits).toHaveLength(1);
  });

  test("throws on non-200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeJsonResponse({}, 500));
    await expect(searchRisOgd({ q: "test" })).rejects.toThrow();
  });

  test("respects limit parameter", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({ OgdSearchResult: { OgdDocumentResults: {} } })
    );
    await searchRisOgd({ q: "test", limit: 5 });
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("DokumenteProSeite=Ten");
  });
});

describe("searchOpenLegalData", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("returns empty array when no results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeJsonResponse({ results: [] }));
    const hits = await searchOpenLegalData({ q: "test" });
    expect(hits).toEqual([]);
  });

  test("parses results correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({
        results: [
          {
            id: 1,
            slug: "test-case",
            ecli: "ECLI:DE:BGH:2024:1ZR1.24",
            court: { name: "BGH" },
            file_number: "I ZR 1/24",
            date: "2024-05-01",
            type: "Urteil",
          },
        ],
      })
    );
    const hits = await searchOpenLegalData({ q: "test" });
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("ECLI:DE:BGH:2024:1ZR1.24");
    expect(hits[0].court).toBe("BGH");
    expect(hits[0].caseNumber).toBe("I ZR 1/24");
    expect(hits[0].source).toBe("openlegaldata");
  });

  test("handles missing ecli (falls back to old-{id})", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({
        results: [{ id: 42, slug: "case-42", court: { name: "LG" } }],
      })
    );
    const hits = await searchOpenLegalData({ q: "test" });
    expect(hits[0].id).toBe("old-42");
  });

  test("throws on non-200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeJsonResponse({}, 403));
    await expect(searchOpenLegalData({ q: "test" })).rejects.toThrow();
  });
});

describe("searchOpenCaseLaw", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("returns empty array when no results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeJsonResponse({ results: [] }));
    const hits = await searchOpenCaseLaw({ q: "test" });
    expect(hits).toEqual([]);
  });

  test("parses results correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({
        results: [
          {
            decision_id: "BGE_150_III_1",
            court: "bger",
            title: "BGE 150 III 1",
            decision_date: "2024-02-15",
            citation_string_de: "BGE 150 III 1",
            legal_area: "Zivilrecht",
            canonical_url: "https://opencaselaw.ch/entscheid/BGE_150_III_1",
            regeste: "Wichtiger Entscheid",
          },
        ],
      })
    );
    const hits = await searchOpenCaseLaw({ q: "test" });
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("BGE_150_III_1");
    expect(hits[0].court).toBe("bger");
    expect(hits[0].caseNumber).toBe("BGE 150 III 1");
    expect(hits[0].source).toBe("opencaselaw");
  });

  test("throws on non-200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeJsonResponse({}, 500));
    await expect(searchOpenCaseLaw({ q: "test" })).rejects.toThrow();
  });
});

describe("searchJudgements", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("searches only AT when jurisdiction=at", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      makeJsonResponse({ OgdSearchResult: { OgdDocumentResults: {} } })
    );
    const { results, errors } = await searchJudgements({ q: "test", jurisdiction: "at" });
    expect(results).toEqual([]);
    expect(errors).toEqual([]);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  test("searches only DE when jurisdiction=de", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(makeJsonResponse({ results: [] }));
    const { results, errors } = await searchJudgements({ q: "test", jurisdiction: "de" });
    expect(results).toEqual([]);
    expect(errors).toEqual([]);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  test("searches all jurisdictions when jurisdiction=all", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeJsonResponse({ OgdSearchResult: { OgdDocumentResults: {} } }))
      .mockResolvedValueOnce(makeJsonResponse({ results: [] }))
      .mockResolvedValueOnce(makeJsonResponse({ results: [] }));
    const { errors } = await searchJudgements({ q: "test", jurisdiction: "all" });
    expect(errors).toEqual([]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  test("collects errors from failed sources", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeJsonResponse({}, 500));
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeJsonResponse({ results: [] }));
    const { results, errors } = await searchJudgements({ q: "test", jurisdiction: "at" });
    expect(errors.length).toBe(1);
    expect(results).toEqual([]);
  });

  test("merges results from multiple sources", async () => {
    // AT source
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        makeJsonResponse({
          OgdSearchResult: {
            OgdDocumentResults: {
              OgdDocumentReference: {
                Data: {
                  Metadaten: {
                    Technisch: { ID: "AT1" },
                    Judikatur: { Justiz: { Gericht: "OGH" } },
                  },
                },
              },
            },
          },
        })
      )
      // DE source
      .mockResolvedValueOnce(
        makeJsonResponse({
          results: [{ id: 1, court: { name: "BGH" }, slug: "de-1" }],
        })
      )
      // CH source
      .mockResolvedValueOnce(makeJsonResponse({ results: [] }));
    const { results } = await searchJudgements({ q: "test", jurisdiction: "all" });
    expect(results.length).toBe(2);
    expect(results[0].source).toBe("ris-ogd");
    expect(results[1].source).toBe("openlegaldata");
  });
});
