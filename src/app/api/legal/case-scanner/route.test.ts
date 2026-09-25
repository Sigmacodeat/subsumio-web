import type { NextRequest } from "next/server";
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Case scanner on demand: a preview prices the visible matters, a start needs
 * the confirmed total and enough balance, each started matter is booked once,
 * matters that did not start are refunded, and runs that ended without a
 * result are refunded on the status call.
 */
const ledger = vi.hoisted(() => ({
  balance: 100,
  booked: new Map<string, number>(),
  refunded: [] as string[],
}));
const ctxState = vi.hoisted(() => ({ demo: false as boolean }));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown }; query?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown, q: unknown, req: Request) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = {
        brainId: "firm-a",
        headers: { "x-subsumio-source": "firm-a", "x-subsumio-identity-token": "tok" },
        user: { id: "u-1", role: "lawyer", email: "l@x.at", brainId: "firm-a" },
        billing: { ownerId: "org-a", ownerType: "org" },
        ...(ctxState.demo ? { demo: { id: "d1" } } : {}),
      };
      let body: unknown = {};
      if (opts.body) {
        try {
          body = opts.body.parse(await req.json());
        } catch {
          return Response.json({ error: "validation" }, { status: 400 });
        }
      }
      const query = opts.query
        ? opts.query.parse(Object.fromEntries(new URL(req.url).searchParams))
        : {};
      return handler(ctx, body, query, req);
    },
  apiError: (code: string, message: string, status: number, details?: unknown) =>
    Response.json({ error: message, code, ...(details ? { details } : {}) }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
  recordCreditConsumption: vi.fn(
    async (_ctx: unknown, op: string, _slug: unknown, _usage: unknown, key: string) => {
      expect(op).toBe("case_scan");
      if (ledger.booked.has(key)) return { ok: true, balance: ledger.balance };
      if (ledger.balance < 5) return { ok: false, balance: ledger.balance, required: 5 };
      ledger.balance -= 5;
      ledger.booked.set(key, 5);
      return { ok: true, balance: ledger.balance };
    }
  ),
}));

vi.mock("@/lib/billing/credits", () => ({
  ensureTrialCredits: vi.fn(async () => false),
  getBalance: vi.fn(async () => ({ balance: ledger.balance })),
  checkCredits: vi.fn(async (_o: string, _t: string, required: number) => ({
    ok: ledger.balance >= required,
    balance: ledger.balance,
    required,
  })),
  refundConsumptionBooking: vi.fn(async (_o: string, _t: string, key: string) => {
    const amount = ledger.booked.get(key);
    if (!amount || ledger.refunded.includes(key)) {
      return { refunded: 0, balanceAfter: ledger.balance };
    }
    ledger.refunded.push(key);
    ledger.balance += amount;
    return { refunded: amount, balanceAfter: ledger.balance };
  }),
}));

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));

import { GET, POST } from "./route";
import { CASE_SCAN_MAX_CASES } from "@/lib/legal/case-scan";

type EngineCall = { url: string; body: Record<string, unknown> | null };
let engineCalls: EngineCall[] = [];
let visible: string[] = ["cases/a", "cases/b", "cases/c"];
let launchFails = new Set<string>();
let runStates: Record<string, string> = {};
let engineDown = false;

function engineFetch(url: string, init?: RequestInit): Promise<Response> {
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  engineCalls.push({ url, body });
  if (engineDown) return Promise.resolve(new Response("down", { status: 502 }));
  if (url.includes("/api/legal/case-scanner/runs")) {
    const runs = Object.entries(runStates).map(([slug, status], i) => ({
      job_id: i + 1,
      case_slug: slug,
      status,
    }));
    return Promise.resolve(Response.json({ runs }));
  }
  const requested =
    body?.scope === "all_open" ? visible : ((body?.case_slugs as string[] | undefined) ?? []);
  const cases = requested
    .filter((s) => visible.includes(s))
    .map((s) => ({ case_slug: s, title: s, reasons: ["no_prior_analysis"] }));
  const skipped = requested
    .filter((s) => !visible.includes(s))
    .map((s) => ({ case_slug: s, reason: "not_found" }));
  if (body?.mode === "preview") {
    return Promise.resolve(Response.json({ cases, skipped, truncated: false, limit: 50 }));
  }
  const launched = cases
    .filter((c) => !launchFails.has(c.case_slug))
    .map((c, i) => ({ case_slug: c.case_slug, job_id: 100 + i }));
  const failed = cases
    .filter((c) => launchFails.has(c.case_slug))
    .map((c) => ({ case_slug: c.case_slug, reason: "queue_failed" }));
  return Promise.resolve(Response.json({ scan_id: body?.scan_id, launched, failed, skipped }));
}

function post(body: unknown) {
  return POST(
    new Request("http://x/api/legal/case-scanner", {
      method: "POST",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

async function data<T>(res: Response): Promise<T> {
  return ((await res.json()) as { data: T }).data;
}

beforeEach(() => {
  ledger.balance = 100;
  ledger.booked.clear();
  ledger.refunded.length = 0;
  ctxState.demo = false;
  engineCalls = [];
  visible = ["cases/a", "cases/b", "cases/c"];
  launchFails = new Set();
  runStates = {};
  engineDown = false;
  vi.stubGlobal("fetch", vi.fn(engineFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preview", () => {
  it("prices the visible matters with the canonical rate and shows the balance", async () => {
    const res = await post({ mode: "preview", scope: "all_open" });
    expect(res.status).toBe(200);
    const p = await data<{
      count: number;
      credits_per_case: number;
      total_credits: number;
      balance: number;
      sufficient: boolean;
      max_cases: number;
    }>(res);
    expect(p.count).toBe(3);
    expect(p.credits_per_case).toBe(5);
    expect(p.total_credits).toBe(15);
    expect(p.balance).toBe(100);
    expect(p.sufficient).toBe(true);
    expect(p.max_cases).toBe(CASE_SCAN_MAX_CASES);
    // A preview starts nothing and books nothing.
    expect(ledger.booked.size).toBe(0);
    expect(engineCalls.every((c) => c.body?.mode === "preview")).toBe(true);
    expect(engineCalls[0]!.body?.limit).toBe(CASE_SCAN_MAX_CASES);
  });

  it("matters the caller may not see are not priced", async () => {
    const res = await post({
      mode: "preview",
      scope: "selection",
      case_slugs: ["cases/a", "cases/walled"],
    });
    const p = await data<{ count: number; skipped: Array<{ case_slug: string }> }>(res);
    expect(p.count).toBe(1);
    expect(p.skipped.map((s) => s.case_slug)).toEqual(["cases/walled"]);
  });

  it("flags an insufficient balance", async () => {
    ledger.balance = 9;
    const p = await data<{ sufficient: boolean }>(
      await post({ mode: "preview", scope: "all_open" })
    );
    expect(p.sufficient).toBe(false);
  });

  it("refuses more matters than the cap", async () => {
    const slugs = Array.from({ length: CASE_SCAN_MAX_CASES + 1 }, (_, i) => `cases/x${i}`);
    const res = await post({ mode: "preview", scope: "selection", case_slugs: slugs });
    expect(res.status).toBe(400);
    expect(engineCalls).toHaveLength(0);
  });
});

describe("start", () => {
  it("needs the confirmed preview total", async () => {
    const missing = await post({ mode: "start", scope: "all_open" });
    expect(missing.status).toBe(400);
    const stale = await post({ mode: "start", scope: "all_open", expected_credits: 10 });
    expect(stale.status).toBe(409);
    expect(ledger.booked.size).toBe(0);
    expect(engineCalls.some((c) => c.body?.mode === "start")).toBe(false);
  });

  it("refuses with 402 before starting anything when the balance is short", async () => {
    ledger.balance = 9;
    const res = await post({ mode: "start", scope: "all_open", expected_credits: 15 });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("insufficient_credits");
    expect(body.error).toContain("15 Credits");
    expect(ledger.booked.size).toBe(0);
    expect(engineCalls.some((c) => c.body?.mode === "start")).toBe(false);
  });

  it("books each started matter once and starts exactly the booked ones", async () => {
    const res = await post({ mode: "start", scope: "all_open", expected_credits: 15 });
    expect(res.status).toBe(200);
    const r = await data<{ launched: unknown[]; charged_credits: number; scan_id: string }>(res);
    expect(r.launched).toHaveLength(3);
    expect(r.charged_credits).toBe(15);
    expect(ledger.balance).toBe(85);
    const start = engineCalls.find((c) => c.body?.mode === "start")!;
    expect(start.body?.scope).toBe("selection");
    expect(start.body?.case_slugs).toEqual(["cases/a", "cases/b", "cases/c"]);
    expect(start.body?.scan_id).toBe(r.scan_id);
  });

  it("refunds matters whose run did not start and charges nothing for them", async () => {
    launchFails = new Set(["cases/b"]);
    const r = await data<{
      launched: Array<{ case_slug: string }>;
      failed: Array<{ case_slug: string }>;
      charged_credits: number;
      refunded_credits: number;
    }>(await post({ mode: "start", scope: "all_open", expected_credits: 15 }));
    expect(r.launched.map((l) => l.case_slug)).toEqual(["cases/a", "cases/c"]);
    expect(r.failed.map((f) => f.case_slug)).toEqual(["cases/b"]);
    expect(r.charged_credits).toBe(10);
    expect(r.refunded_credits).toBe(5);
    expect(ledger.balance).toBe(90);
  });

  it("refunds every booking when the engine cannot start the runs", async () => {
    // Preview succeeds, start fails.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (body.mode === "start") return Promise.resolve(new Response("x", { status: 500 }));
        return engineFetch(url, init);
      })
    );
    const res = await post({ mode: "start", scope: "all_open", expected_credits: 15 });
    expect(res.status).toBe(503);
    expect(ledger.balance).toBe(100);
    expect(ledger.refunded).toHaveLength(3);
  });

  it("a scan limited to one matter is billed for one", async () => {
    const r = await data<{ charged_credits: number }>(
      await post({ mode: "start", scope: "case", case_slugs: ["cases/b"], expected_credits: 5 })
    );
    expect(r.charged_credits).toBe(5);
    expect(ledger.balance).toBe(95);
  });

  it("is not available in the demo", async () => {
    ctxState.demo = true;
    const res = await post({ mode: "start", scope: "all_open", expected_credits: 15 });
    expect(res.status).toBe(403);
  });
});

describe("status", () => {
  it("refunds runs that ended without a result, once", async () => {
    const r = await data<{ scan_id: string }>(
      await post({ mode: "start", scope: "all_open", expected_credits: 15 })
    );
    runStates = { "cases/a": "completed", "cases/b": "dead", "cases/c": "active" };
    const status = () =>
      GET(
        new Request(
          `http://x/api/legal/case-scanner?scan_id=${r.scan_id}`
        ) as unknown as NextRequest
      );
    const s = await data<{ runs: Array<{ case_slug: string; refunded: boolean }> }>(
      await status()
    );
    expect(s.runs.find((x) => x.case_slug === "cases/b")?.refunded).toBe(true);
    expect(s.runs.find((x) => x.case_slug === "cases/a")?.refunded).toBe(false);
    expect(ledger.balance).toBe(90);
    await status();
    expect(ledger.balance).toBe(90);
  });
});
