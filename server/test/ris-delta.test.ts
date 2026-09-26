import { afterEach, describe, expect, test } from "bun:test";
import { DELTA_APPLIKATIONS, fetchDelta, parseDeltaPage } from "../scripts/ris-delta.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(body: unknown) {
  globalThis.fetch = (async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

const brKons = DELTA_APPLIKATIONS.find((a) => a.applikation === "BrKons")!;

describe("parseDeltaPage", () => {
  test("an RIS error object is unusable, not 'no changes'", () => {
    expect(parseDeltaPage({ OgdSearchResult: { Error: { Message: "Wartung" } } })).toBeNull();
  });
  test("a missing result block or hit count is unusable", () => {
    expect(parseDeltaPage({ OgdSearchResult: {} })).toBeNull();
    expect(parseDeltaPage({ OgdSearchResult: { OgdDocumentResults: {} } })).toBeNull();
    expect(parseDeltaPage({})).toBeNull();
  });
  test("an explicit zero hit count is a genuine empty result", () => {
    expect(
      parseDeltaPage({ OgdSearchResult: { OgdDocumentResults: { Hits: { "#text": "0" } } } })
    ).toEqual({ refs: [], totalHits: 0 });
  });
});

describe("fetchDelta keeps the cursor on unusable answers", () => {
  test("error object → incomplete", async () => {
    stubFetch({ OgdSearchResult: { Error: { Message: "x" } } });
    const r = await fetchDelta(brKons, "2026-09-20");
    expect(r.complete).toBe(false);
    expect(r.documents).toHaveLength(0);
  });

  test("non-JSON maintenance page → incomplete", async () => {
    stubFetch("<html>Wartung</html>");
    expect((await fetchDelta(brKons, "2026-09-20")).complete).toBe(false);
  });

  test("hits reported but no references on page 1 → incomplete", async () => {
    stubFetch({ OgdSearchResult: { OgdDocumentResults: { Hits: { "#text": "12" } } } });
    expect((await fetchDelta(brKons, "2026-09-20")).complete).toBe(false);
  });

  test("explicit zero hits → complete, no documents", async () => {
    stubFetch({ OgdSearchResult: { OgdDocumentResults: { Hits: { "#text": "0" } } } });
    const r = await fetchDelta(brKons, "2026-09-20");
    expect(r.complete).toBe(true);
    expect(r.documents).toHaveLength(0);
  });
});
