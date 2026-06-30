import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock the engine module
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://localhost:3001",
  engineHeadersForBrain: () => ({ "x-subsumio-source": "legal-graph" }),
}));

vi.mock("@/lib/env", () => ({
  env: () => undefined,
}));

import { embedBatch } from "./embedding";

describe("embedding service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("embedBatch returns empty array for empty input", async () => {
    const result = await embedBatch([]);
    expect(result).toEqual([]);
  });

  test("embedBatch splits into sub-batches", async () => {
    const mockFetch = vi.fn().mockImplementation(async (_url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body);
      const count = body.texts.length;
      return {
        ok: true,
        json: async () => ({
          embeddings: Array.from({ length: count }, () => [0.1, 0.2, 0.3]),
          dimensions: 3,
          model: "test-model",
        }),
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    // EMBED_BATCH_SIZE is 100, so 150 texts should result in 2 calls
    const texts = Array.from({ length: 150 }, (_, i) => `text ${i}`);
    const result = await embedBatch(texts);
    expect(result.length).toBe(150);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("embedBatch calls engine /api/embed endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: [[0.1, 0.2]],
        dimensions: 2,
        model: "test",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await embedBatch(["test text"]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("http://localhost:3001/api/embed");
    expect(call[1].method).toBe("POST");
    const body = JSON.parse(call[1].body);
    expect(body.texts).toEqual(["test text"]);
    expect(body.input_type).toBe("document");
  });
});
