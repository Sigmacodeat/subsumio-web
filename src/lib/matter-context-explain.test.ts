// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { explainRetrieval } from "@/lib/matter-context";

const hit = { slug: "legal/cases/a", title: "Akte A", snippet: "Text", score: 0.8 };

afterEach(() => vi.unstubAllGlobals());

describe("explainRetrieval", () => {
  it("reads the engine's plain array answer (Copilot explain shows sources)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([hit])));
    const out = await explainRetrieval("frage", "http://engine.test", {});
    expect(out.map((r) => r.slug)).toEqual(["legal/cases/a"]);
    expect(out[0].explanation.chunk_info?.snippet).toBe("Text");
  });

  it("still accepts the wrapped { results } form", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ results: [hit] })));
    const out = await explainRetrieval("frage", "http://engine.test", {});
    expect(out).toHaveLength(1);
  });

  it("an empty or failed answer yields no sources", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
    expect(await explainRetrieval("frage", "http://engine.test", {})).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    expect(await explainRetrieval("frage", "http://engine.test", {})).toEqual([]);
  });
});
