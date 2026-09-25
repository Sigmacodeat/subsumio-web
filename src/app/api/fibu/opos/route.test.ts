// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";

const ENGINE = "http://engine-test:3001";
const mockListOpenItems = vi.fn();

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));
vi.mock("@/lib/open-items", () => ({
  listOpenItems: (...args: unknown[]) => mockListOpenItems(...args),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/api-handler", async () => {
  const { isAppError } = await import("@/lib/errors");
  const { apiError, apiSuccess } = await import("@/lib/api-response");
  return {
    // Same error mapping as the real createHandler: AppError → its status.
    createHandler:
      (_opts: unknown, handler: (ctx: unknown, body: unknown) => Promise<Response>) =>
      async (req: Request) => {
        const body = await req.json();
        try {
          return await handler({ headers: { "x-subsumio-source": "brain-at" } }, body);
        } catch (err) {
          if (isAppError(err)) return apiError(err.code, err.message, err.statusCode);
          return apiError("internal_error", "unexpected", 500);
        }
      },
    apiError,
    apiSuccess,
  };
});

import { POST } from "./route";

const openItem = {
  id: "op-1",
  invoice_id: "inv-1",
  invoice_number: "R-2026-0042",
  client_name: "Mandant",
  amount: 500,
  paid_amount: 0,
  open_amount: 500,
  due_date: "2026-09-01",
  dunning_level: 0,
  dunning_fee: 0,
  status: "open",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

const payment = {
  date: "2026-09-20",
  amount: 500,
  direction: "credit" as const,
  iban: "AT611904300234573201",
  sender_name: "Mandant",
  reference: "R-2026-0042",
};

function importRequest(transactions: unknown[]) {
  return new Request("http://localhost/api/fibu/opos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactions }),
  });
}

/** Engine double: stored pages by slug, optional failure for one slug prefix. */
function engineDouble(opts: { failWritesTo?: string } = {}) {
  const stored = new Map<string, unknown>();
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET") {
      const slug = decodeURIComponent(url.slice(`${ENGINE}/api/pages/`.length));
      return stored.has(slug)
        ? Response.json({ slug, frontmatter: stored.get(slug) })
        : Response.json({ error: "not_found" }, { status: 404 });
    }
    const body = JSON.parse(String(init?.body)) as {
      slug: string;
      frontmatter: Record<string, unknown>;
      if_absent?: boolean;
      merge?: boolean;
    };
    if (opts.failWritesTo && body.slug.startsWith(opts.failWritesTo)) {
      return Response.json({ error: "db down" }, { status: 500 });
    }
    // Same semantics as the engine: create-only answers 409 when the page exists.
    if (body.if_absent && stored.has(body.slug)) {
      return Response.json({ error: "page_exists" }, { status: 409 });
    }
    const prev = (stored.get(body.slug) ?? {}) as Record<string, unknown>;
    stored.set(body.slug, body.merge ? { ...prev, ...body.frontmatter } : body.frontmatter);
    return Response.json({ slug: body.slug });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { stored, fetchMock };
}

describe("POST /api/fibu/opos (bank import)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockListOpenItems.mockReset();
    mockListOpenItems.mockResolvedValue([{ ...openItem }]);
  });

  test("a refused open-item update is reported as an error and never as a match", async () => {
    const { stored } = engineDouble({ failWritesTo: "legal/open-items/" });
    const res = await POST(importRequest([payment]) as never);
    const json = (await res.json()) as { data: { matched: number; errors: number } };
    expect(json.data.matched).toBe(0);
    expect(json.data.errors).toBeGreaterThan(0);
    // The booking stays recorded but unmatched — nothing was credited, it can
    // be assigned by hand; the open item is untouched.
    const txn = [...stored.entries()].find(([k]) => k.startsWith("legal/bank-transactions/"));
    expect(txn).toBeDefined();
    expect((txn![1] as Record<string, unknown>).matched_invoice_id).toBeUndefined();
    expect(stored.has(`legal/open-items/${openItem.id}`)).toBe(false);
  });

  test("a refused transaction write is reported as an error and books nothing", async () => {
    const { stored } = engineDouble({ failWritesTo: "legal/bank-transactions/" });
    const res = await POST(importRequest([payment]) as never);
    const json = (await res.json()) as { data: { imported: number; errors: number } };
    expect(json.data).toMatchObject({ imported: 0 });
    expect(json.data.errors).toBeGreaterThan(0);
    expect(stored.has(`legal/open-items/${openItem.id}`)).toBe(false);
  });

  test("importing the same statement twice books each payment once", async () => {
    const { stored } = engineDouble();
    const first = await POST(importRequest([payment]) as never);
    expect(first.status).toBe(200);
    const firstJson = (await first.json()) as { data: { imported: number; matched: number } };
    expect(firstJson.data).toMatchObject({ imported: 1, matched: 1 });

    // Second run sees the stored OP balance (paid) — and must skip the booking.
    mockListOpenItems.mockResolvedValue([
      stored.get(`legal/open-items/${openItem.id}`) as typeof openItem,
    ]);
    const second = await POST(importRequest([payment]) as never);
    const secondJson = (await second.json()) as {
      data: { imported: number; duplicates: number; matched: number };
    };
    expect(secondJson.data).toMatchObject({ imported: 0, duplicates: 1, matched: 0 });
  });

  test("two identical payments in one statement are both booked", async () => {
    const { stored } = engineDouble();
    const res = await POST(importRequest([payment, payment]) as never);
    const json = (await res.json()) as { data: { imported: number } };
    expect(json.data.imported).toBe(2);
    const txnSlugs = [...stored.keys()].filter((k) => k.startsWith("legal/bank-transactions/"));
    expect(new Set(txnSlugs).size).toBe(2);
  });
});
