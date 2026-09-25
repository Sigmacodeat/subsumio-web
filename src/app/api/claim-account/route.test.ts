// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fm = Record<string, unknown>;
const pages = new Map<string, Fm>();

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: async () =>
    [...pages].map(([slug, frontmatter]) => ({ slug, frontmatter: { ...frontmatter } })),
}));
const queues = new Map<string, Promise<unknown>>();
vi.mock("@/lib/keyed-lock", () => ({
  withKeyedLock: <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const run = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(fn);
    queues.set(key, run);
    return run;
  },
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
      handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const raw = req.method === "GET" ? {} : await req.json();
      const parsed = opts.body?.safeParse(raw);
      if (parsed && !parsed.success) return Response.json({ error: "invalid" }, { status: 400 });
      return handler(
        { headers: {}, brainId: "b", user: { id: "u1", email: "a@k.at" } },
        parsed?.data ?? raw,
        Object.fromEntries(new URL(req.url).searchParams)
      );
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { GET, PATCH } from "./route";
import { createClaim } from "@/lib/claim-account";

const claim = createClaim({
  case_slug: "cases/a",
  claimant_name: "Kanzlei",
  debtor_name: "Schuldner",
  principal_amount: 1000,
  interest_from: "2026-01-01",
  due_date: "2026-01-01",
  jurisdiction: "at",
});
const SLUG = `legal/claims/${claim.id}`;

beforeEach(() => {
  pages.clear();
  pages.set(SLUG, { ...claim });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          slug: string;
          frontmatter: Fm;
          merge?: boolean;
        };
        // Simulate engine latency so parallel requests would interleave.
        await new Promise((r) => setTimeout(r, 5));
        pages.set(
          body.slug,
          body.merge ? { ...(pages.get(body.slug) ?? {}), ...body.frontmatter } : body.frontmatter
        );
        return Response.json({ ok: true });
      }
      const slug = decodeURIComponent(u.pathname.replace(/^\/api\/pages\//, ""));
      const fm = pages.get(slug);
      return fm
        ? Response.json({ slug, frontmatter: { ...fm } })
        : new Response("{}", { status: 404 });
    })
  );
});

const patch = (body: Fm) =>
  (PATCH as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/claim-account", {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  );

describe("PATCH /api/claim-account (OPS-21)", () => {
  it("a manipulated claim in the body does not change the stored balance", async () => {
    const res = await patch({
      claim: { ...claim, paid_amount: 999, open_amount: 1, status: "paid" },
      payment_amount: 100,
    });
    expect(res.status).toBe(200);
    const stored = pages.get(SLUG)!;
    expect(stored.paid_amount).toBe(100);
    expect(stored.open_amount).toBe(900);
    expect(stored.status).toBe("open");
  });

  it("two parallel payments of 100 € → +200 and two journal entries", async () => {
    const [a, b] = await Promise.all([
      patch({ id: claim.id, payment_amount: 100 }),
      patch({ id: claim.id, payment_amount: 100 }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const stored = pages.get(SLUG)!;
    expect(stored.paid_amount).toBe(200);
    expect(stored.open_amount).toBe(800);
    expect(stored.payments as unknown[]).toHaveLength(2);
    expect((stored.payments as Fm[])[0]).toMatchObject({ amount: 100, booked_by: "a@k.at" });
  });

  it("an overpayment is kept as credit, the original principal stays recorded", async () => {
    await patch({ id: claim.id, payment_amount: 1200 });
    const stored = pages.get(SLUG)!;
    expect(stored.status).toBe("paid");
    expect(stored.credit_balance).toBe(200);
    expect(stored.original_principal_amount).toBe(1000);
  });

  it("status transitions are checked against the stored claim", async () => {
    const res = await patch({
      claim: { ...claim, status: "mahnbescheid" },
      action: "vollstreckung",
    });
    expect(res.status).toBe(409);
  });

  it("a stale client (expected_updated_at) gets 409", async () => {
    const res = await patch({ id: claim.id, expected_updated_at: "1999-01-01", payment_amount: 1 });
    expect(res.status).toBe(409);
  });
});

describe("GET /api/claim-account", () => {
  it("filters by case_slug", async () => {
    pages.set("legal/claims/other", { ...claim, id: "other", case_slug: "cases/b" });
    const res = await (GET as unknown as (r: Request) => Promise<Response>)(
      new Request("http://localhost/api/claim-account?case_slug=cases/b")
    );
    const { data } = await res.json();
    expect(data.claims.map((c: Fm) => c.id)).toEqual(["other"]);
  });
});
