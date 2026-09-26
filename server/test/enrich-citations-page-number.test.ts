/**
 * enrichCitations (web-api.ts): the PDF page of a citation comes from the
 * chunk retrieval actually matched, located in the compiled text — never from
 * chunk 0 "as the most representative chunk". Without a matched chunk, without
 * a hit in the text, or without page markers there is NO page number.
 */
import { describe, expect, test } from "bun:test";
import { enrichCitations } from "../src/commands/web-api.ts";
import type { BrainEngine } from "../src/core/engine.ts";

const PAGE1 = "Erste Seite: Präambel, Parteienbezeichnung und Vertragsgegenstand der Vereinbarung.";
const PAGE3 = "Dritte Seite: Haftungsklausel, Kündigungsfrist vier Wochen zum Monatsende.";
const PAGE4 = "Vierte Seite: Gerichtsstand Wien, Schlussbestimmungen und Unterschriften.";

// Page 2 had no text layer and is skipped by the extractor — the marker
// numbers are the real pages, a plain separator count would be off by one.
const TRUTH = [
  "--- Page 1 ---",
  PAGE1,
  "###***###",
  "--- Page 3 ---",
  PAGE3,
  "###***###",
  "--- Page 4 ---",
  PAGE4,
].join("\n");

const SLUG = "akten/2026-001/vertrag";

function stubEngine(opts: { truth?: string; pages?: number; chunks?: string[] }): BrainEngine {
  const chunkTexts = opts.chunks ?? [PAGE1, PAGE3, PAGE4];
  return {
    executeRaw: async (sql: string) => {
      if (sql.includes("content_chunks")) {
        return chunkTexts.map((chunk_text, chunk_index) => ({
          page_slug: SLUG,
          chunk_index,
          chunk_text,
        }));
      }
      return [
        {
          slug: SLUG,
          title: "Mietvertrag",
          case_slug: "akten/2026-001",
          page_count: opts.pages ?? 4,
          compiled_truth: opts.truth ?? TRUTH,
        },
      ];
    },
  } as unknown as BrainEngine;
}

describe("enrichCitations: page number from the matched chunk", () => {
  test("matched passage on page 3 → page_number 3 and that chunk's index", async () => {
    const [cite] = await enrichCitations(
      stubEngine({}),
      [{ page_slug: SLUG, row_num: null }],
      "default",
      undefined,
      [{ slug: SLUG, text: PAGE3.slice(0, 80) }]
    );
    expect(cite.page_number).toBe(3);
    expect(cite.chunk_index).toBe(1);
    expect(cite.quote.startsWith("Dritte Seite")).toBe(true);
    expect(cite.char_offset_start).toBe(TRUTH.indexOf(PAGE3));
  });

  test("passage on the last page → page 4 (not the separator count)", async () => {
    const [cite] = await enrichCitations(
      stubEngine({}),
      [{ page_slug: SLUG, row_num: null }],
      "default",
      undefined,
      [{ slug: SLUG, text: PAGE4 }]
    );
    expect(cite.page_number).toBe(4);
    expect(cite.chunk_index).toBe(2);
  });

  test("passage with chunk_index resolves by index", async () => {
    const [cite] = await enrichCitations(
      stubEngine({}),
      [{ page_slug: SLUG, row_num: null }],
      "default",
      undefined,
      [{ slug: SLUG, text: "", chunk_index: 2 }]
    );
    expect(cite.page_number).toBe(4);
    expect(cite.chunk_index).toBe(2);
  });

  test("no matched passages → quote from chunk 0 but NO page number", async () => {
    const [cite] = await enrichCitations(
      stubEngine({}),
      [{ page_slug: SLUG, row_num: null }],
      "default"
    );
    expect(cite.title).toBeTruthy();
    expect(cite.quote.length).toBeGreaterThan(0);
    expect(cite.chunk_index).toBe(0);
    expect(cite.page_number).toBeUndefined();
    expect(cite.char_offset_start).toBeUndefined();
  });

  test("passage that matches no chunk → NO page number", async () => {
    const [cite] = await enrichCitations(
      stubEngine({}),
      [{ page_slug: SLUG, row_num: null }],
      "default",
      undefined,
      [{ slug: SLUG, text: "Dieser Text kommt in keinem Chunk des Dokuments vor, gar nicht." }]
    );
    expect(cite.page_number).toBeUndefined();
  });

  test("matched chunk but text without page markers → NO page number", async () => {
    const [cite] = await enrichCitations(
      stubEngine({ truth: [PAGE1, PAGE3, PAGE4].join("\n\n"), pages: 1 }),
      [{ page_slug: SLUG, row_num: null }],
      "default",
      undefined,
      [{ slug: SLUG, text: PAGE3 }]
    );
    expect(cite.chunk_index).toBe(1);
    expect(cite.page_number).toBeUndefined();
    // The passage was still located: offsets are reported.
    expect(cite.char_offset_start).toBeGreaterThan(0);
  });

  test("matched chunk whose text is not in compiled_truth → NO page number", async () => {
    const [cite] = await enrichCitations(
      stubEngine({
        chunks: [PAGE1, "Ein Chunk, der im Volltext nicht mehr vorkommt (alte Fassung)."],
      }),
      [{ page_slug: SLUG, row_num: null }],
      "default",
      undefined,
      [{ slug: SLUG, text: "Ein Chunk, der im Volltext nicht mehr vorkommt" }]
    );
    expect(cite.chunk_index).toBe(1);
    expect(cite.page_number).toBeUndefined();
  });

  test("older extract with separators but no markers → separator count", async () => {
    const truth = [PAGE1, "###***###", PAGE3].join("\n");
    const [cite] = await enrichCitations(
      stubEngine({ truth, pages: 2, chunks: [PAGE1, PAGE3] }),
      [{ page_slug: SLUG, row_num: null }],
      "default",
      undefined,
      [{ slug: SLUG, text: PAGE3 }]
    );
    expect(cite.page_number).toBe(2);
  });
});
