import { describe, test, expect } from "vitest";
import { chunkText } from "@/lib/legal-graph/import";

describe("chunkText", () => {
  test("returns empty array for empty text", () => {
    expect(chunkText("")).toEqual([]);
  });

  test("returns empty array for whitespace-only text", () => {
    expect(chunkText("   \n\n\t  ")).toEqual([]);
  });

  test("returns single chunk for short text", () => {
    const text = "Dies ist ein kurzer Text.";
    const chunks = chunkText(text);
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe(text);
    expect(chunks[0].type).toBe("leitsatz");
  });

  test("splits long text into multiple chunks", () => {
    const words = Array.from({ length: 1000 }, (_, i) => `Wort${i}`);
    const text = words.join(" ");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("first chunk is classified as leitsatz", () => {
    const text = "Erster Absatz des Urteils. " + "Wort ".repeat(500);
    const chunks = chunkText(text);
    expect(chunks[0].type).toBe("leitsatz");
  });

  test("second chunk is classified as tenor", () => {
    const words = Array.from({ length: 1000 }, (_, i) => `Wort${i}`);
    const text = words.join(" ");
    const chunks = chunkText(text);
    if (chunks.length > 1) {
      expect(chunks[1].type).toBe("tenor");
    }
  });

  test("chunks have token counts", () => {
    const text = "Dies ist ein Test mit einigen Wörtern.";
    const chunks = chunkText(text);
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });

  test("chunks overlap", () => {
    const words = Array.from({ length: 1000 }, (_, i) => `Wort${i}`);
    const text = words.join(" ");
    const chunks = chunkText(text);
    if (chunks.length > 1) {
      // Check that there's some overlap between consecutive chunks
      const firstChunkWords = chunks[0].text.split(" ");
      const secondChunkWords = chunks[1].text.split(" ");
      const overlap = secondChunkWords.filter((w) => firstChunkWords.includes(w));
      expect(overlap.length).toBeGreaterThan(0);
    }
  });
});
