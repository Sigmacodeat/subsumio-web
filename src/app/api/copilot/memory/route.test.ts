import type { NextRequest } from "next/server";
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const learning = vi.hoisted(() => ({ on: true }));
const created = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const llm = vi.hoisted(() => ({ available: false, affordable: true, charge: vi.fn() }));

vi.mock("@/lib/brain-learning", () => ({ isFirmLearningEnabled: async () => learning.on }));
vi.mock("@/lib/copilot-memory-llm", () => ({
  extractMemoriesWithLLM: vi.fn(async (_m: string, opts?: { meta?: { modelCalled?: boolean } }) => {
    if (opts?.meta) opts.meta.modelCalled = true;
    return [{ type: "preference", key: "stil", value: "Kurz antworten" }];
  }),
  isLLMExtractionAvailable: () => llm.available,
}));
vi.mock("@/lib/billing/optional-llm-credits", () => ({
  canAffordOptionalLlm: vi.fn(async () => llm.affordable),
}));
vi.mock("@/lib/copilot-memory", () => ({
  listMemories: vi.fn(async () => []),
  searchMemories: vi.fn(async () => []),
  updateMemory: vi.fn(async () => {}),
  deleteMemory: vi.fn(async () => {}),
  inferMemoriesFromMessage: () => [
    { type: "preference", key: "sprache", value: "Bitte immer auf Deutsch antworten" },
  ],
  createMemory: vi.fn(async (m: Record<string, unknown>) => {
    created.push(m);
    return { id: "m1", ...m };
  }),
  createMemoryWithSupersession: vi.fn(async (m: Record<string, unknown>) => {
    created.push(m);
    return { memory: { id: "m2", ...m }, superseded: [] };
  }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = { brainId: "org_x", headers: {}, user: { id: "u1", role: "lawyer" } };
      const body =
        opts.body && req.method !== "GET" ? opts.body.parse(await req.json()) : undefined;
      return handler(ctx, body, {});
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: { code, message } }, { status }),
  recordCreditConsumption: (...args: unknown[]) => llm.charge(...args),
}));

import { POST } from "./route";

const post = (body: Record<string, unknown>) =>
  POST(
    new Request("http://x/api/copilot/memory", {
      method: "POST",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );

beforeEach(() => {
  learning.on = true;
  created.length = 0;
  llm.available = false;
  llm.affordable = true;
  llm.charge.mockClear();
});

describe("/api/copilot/memory — credits for the LLM extraction", () => {
  it("charges a think credit when the model extracted memories", async () => {
    llm.available = true;
    const res = await post({ action: "infer", message: "Bitte immer kurz antworten." });
    expect((await res.json()).method).toBe("llm");
    expect(llm.charge).toHaveBeenCalledWith(expect.anything(), "think", undefined);
  });

  it("falls back to the free rules without balance and charges nothing", async () => {
    llm.available = true;
    llm.affordable = false;
    const res = await post({ action: "infer", message: "Bitte immer auf Deutsch antworten." });
    expect((await res.json()).method).toBe("regex");
    expect(created).toHaveLength(1);
    expect(llm.charge).not.toHaveBeenCalled();
  });
});

describe("/api/copilot/memory and 'Kanzlei-Gehirn lernt mit'", () => {
  it("captures memories from a conversation while learning is on", async () => {
    await post({ action: "infer", message: "Bitte antworten Sie mir immer auf Deutsch." });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ source: "inferred" });
  });

  it("captures nothing automatically when the firm switched learning off", async () => {
    learning.on = false;
    const res = await post({
      action: "infer",
      message: "Bitte antworten Sie mir immer auf Deutsch.",
    });
    expect((await res.json()).skipped).toBe("learning_disabled");
    await post({ action: "create", type: "fact", key: "k", value: "v", source: "inferred" });
    expect(created).toHaveLength(0);
  });

  it("still saves what a person enters on purpose", async () => {
    learning.on = false;
    await post({
      action: "create",
      type: "preference",
      key: "k",
      value: "v",
      source: "user_explicit",
    });
    await post({ action: "create", type: "preference", key: "k2", value: "v2" });
    expect(created).toHaveLength(2);
  });
});
