// @vitest-environment node
// Translation and obligation extraction run an LLM call in the engine: both
// declare a credit price, so the shared guard answers 402 at balance 0 before
// the engine is called, and the proxy books the credit after it delivered.
import { describe, expect, it, vi } from "vitest";

const seen = vi.hoisted(() => new Map<string, { credits?: string }>());

vi.mock("@/lib/api-handler", () => ({
  createEngineProxy: (opts: { enginePath: string; credits?: string }) => {
    seen.set(opts.enginePath, opts);
    return async () => new Response(null);
  },
}));

describe("LLM engine proxies declare their credit price", () => {
  it("translate bills document_analysis", async () => {
    await import("./route");
    expect(seen.get("/api/legal/translate")?.credits).toBe("document_analysis");
  });

  it("obligation-extract bills document_analysis", async () => {
    await import("../obligation-extract/route");
    expect(seen.get("/api/legal/obligation-extract")?.credits).toBe("document_analysis");
  });
});
