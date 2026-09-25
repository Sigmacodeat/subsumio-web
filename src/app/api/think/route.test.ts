import type { NextRequest } from "next/server";
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The chat books its credit before the engine runs. When the engine delivers
 * no answer (error status, unreachable, error event mid-stream) the booking is
 * taken back; when the balance only covers one of several parallel requests,
 * only one reaches the engine.
 */
const ledger = vi.hoisted(() => ({
  balance: 1,
  booked: new Set<string>(),
  refunded: [] as string[],
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown, q: unknown, req: Request) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = {
        brainId: "firm-a",
        headers: { "x-subsumio-source": "firm-a" },
        user: { id: "u-1", role: "lawyer", email: "l@x.at", brainId: "firm-a" },
        billing: { ownerId: "org-a", ownerType: "org" },
      };
      const body = opts.body ? opts.body.parse(await req.json()) : {};
      return handler(ctx, body, {}, req);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiStream: (stream: ReadableStream) => new Response(stream, { status: 200 }),
  recordQuota: vi.fn(async () => undefined),
  // Atomic like deductCredits: a booking only succeeds while balance lasts.
  recordCreditConsumption: vi.fn(
    async (_ctx: unknown, _op: string, _slug: unknown, _usage: unknown, key: string) => {
      await new Promise((r) => setTimeout(r, 1));
      if (ledger.balance < 1) return { ok: false, balance: ledger.balance, required: 1 };
      ledger.balance -= 1;
      ledger.booked.add(key);
      return { ok: true, balance: ledger.balance };
    }
  ),
}));

vi.mock("@/lib/billing/credits", () => ({
  attachUsageToBooking: vi.fn(async () => undefined),
  insufficientCreditsResponse: (balance: number, required: number) =>
    Response.json({ error: "insufficient_credits", balance, required }, { status: 402 }),
  refundConsumptionBooking: vi.fn(async (_o: string, _t: string, key: string) => {
    if (ledger.booked.has(key) && !ledger.refunded.includes(key)) {
      ledger.refunded.push(key);
      ledger.balance += 1;
    }
    return { refunded: 1, balanceAfter: ledger.balance };
  }),
}));

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine-test:3001",
  engineHeadersWithCaseJurisdiction: async (h: Record<string, string>) => h,
}));
vi.mock("@/lib/usage", () => ({ recordQuery: vi.fn() }));
const modelChoice = vi.hoisted(() => ({
  fn: vi.fn(async (): Promise<string | undefined> => undefined),
}));
vi.mock("@/lib/model-choice", () => ({ resolveModelChoice: modelChoice.fn }));
vi.mock("@/lib/citation-gate", () => ({ createCitationGateStream: (s: ReadableStream) => s }));
vi.mock("@/lib/guardrail-stream-interceptor", () => ({
  interceptGuardrailStream: (s: ReadableStream) => s,
}));

import { POST } from "./route";

function call() {
  return POST(
    new Request("http://x/api/think", {
      method: "POST",
      body: JSON.stringify({ query: "Was gilt für die Berufungsfrist?" }),
    }) as unknown as NextRequest
  );
}

function sse(events: unknown[]): Response {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(text, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const flush = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  ledger.balance = 1;
  ledger.booked.clear();
  ledger.refunded = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/think — Nur EU", () => {
  it("a non-EU pick under EU-only: 403 with the reason, engine not called, credit refunded", async () => {
    const { ModelPolicyError } = await import("@/lib/eu-policy-refusal");
    modelChoice.fn.mockRejectedValueOnce(new ModelPolicyError());
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Nur EU/);
    expect(fetchMock).not.toHaveBeenCalled();
    await flush();
    expect(ledger.balance).toBe(1);
  });

  it("engine refuses a non-EU route: clear 403 message, no silent fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: "eu_only_refused",
            message: 'EU-only mode (SUBSUMIO_EU_ONLY=1) refused stream via "anthropic:x"',
          },
          { status: 403 }
        )
      )
    );
    const res = await call();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("eu_only_refused");
    expect(body.error).toMatch(/keine Daten übermittelt/);
    await flush();
    expect(ledger.balance).toBe(1);
  });
});

describe("POST /api/think — credits", () => {
  it("engine 502 → booking taken back, balance unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad gateway", { status: 502 }))
    );
    const res = await call();
    expect(res.status).toBe(502);
    await flush();
    expect(ledger.balance).toBe(1);
  });

  it("engine unreachable / timeout → booking taken back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out", "TimeoutError");
      })
    );
    const res = await call();
    expect(res.status).toBe(503);
    await flush();
    expect(ledger.balance).toBe(1);
  });

  it("error event before any usage → booking taken back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sse([{ error: "provider credit exhausted" }]))
    );
    const res = await call();
    await res.text();
    await flush();
    expect(ledger.balance).toBe(1);
  });

  it("a delivered answer stays booked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sse([{ chunk: "Antwort" }, { usage: { model: "m", input_tokens: 1 } }]))
    );
    const res = await call();
    await res.text();
    await flush();
    expect(ledger.balance).toBe(0);
    expect(ledger.refunded).toEqual([]);
  });

  it("5 parallel requests with balance for 1 → only one reaches the engine", async () => {
    const fetchMock = vi.fn(async () => sse([{ usage: { model: "m" } }]));
    vi.stubGlobal("fetch", fetchMock);
    const results = await Promise.all([call(), call(), call(), call(), call()]);
    expect(results.filter((r) => r.status === 402)).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forwards the client's abort to the engine request", async () => {
    let seen: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) => {
        seen = init?.signal ?? undefined;
        return sse([{ usage: {} }]);
      })
    );
    const ac = new AbortController();
    const req = new Request("http://x/api/think", {
      method: "POST",
      body: JSON.stringify({ query: "Frage" }),
      signal: ac.signal,
    });
    await POST(req as unknown as NextRequest);
    expect(seen?.aborted).toBe(false);
    ac.abort();
    expect(seen?.aborted).toBe(true);
  });
});
