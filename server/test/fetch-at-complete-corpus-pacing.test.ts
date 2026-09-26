import { afterEach, describe, expect, test } from "bun:test";
import { fetchStaatsvertragViaOgd } from "../scripts/fetch-at-complete-corpus.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("fetchStaatsvertragViaOgd pacing", () => {
  test("every RIS request (search page and each HTML page) is followed by the pause", async () => {
    const events: string[] = [];
    const ref = (n: number) => ({
      Data: {
        Dokumentliste: {
          ContentReference: {
            Urls: {
              ContentUrl: [{ DataType: "Html", Url: `https://www.ris.bka.gv.at/doc${n}.html` }],
            },
          },
        },
      },
    });
    globalThis.fetch = (async (url: string) => {
      events.push("fetch");
      if (String(url).includes("/Bundesrecht?")) {
        return Response.json({
          OgdSearchResult: {
            OgdDocumentResults: { OgdDocumentReference: [ref(1), ref(2), ref(3)] },
          },
        });
      }
      return new Response(`<html><body>${"Staatsvertrag Text ".repeat(10)}</body></html>`);
    }) as unknown as typeof fetch;

    const text = await fetchStaatsvertragViaOgd("10000001", async () => {
      events.push("pause");
    });

    expect(text.length).toBeGreaterThan(0);
    // 1 search + 3 HTML requests, each followed by a pause — never two fetches in a row.
    expect(events).toEqual([
      "fetch",
      "pause",
      "fetch",
      "pause",
      "fetch",
      "pause",
      "fetch",
      "pause",
    ]);
  });
});
