// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { OpenItem } from "@/lib/fibu";

const mockFetch = vi.fn();
const mockListEnginePages = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: (...args: unknown[]) => mockListEnginePages(...args),
}));

import { createOpenItemForInvoice, closeOpenItemForInvoice, applyOpenItemFee } from "./open-items";

const headers = { "x-subsumio-source": "brain-at" };
const invoiceSlug = "legal/invoices/R-2026-0001";

const invoiceFm = {
  invoice_number: "R-2026-0001",
  client: "Max Muster",
  client_slug: "legal/contacts/muster",
  total: 780,
  due_date: "2026-02-15",
  case_slugs: ["legal/cases/2026-0001"],
};

const existingItem: OpenItem = {
  id: "opos-legal-invoices-R-2026-0001",
  invoice_id: invoiceSlug,
  invoice_number: "R-2026-0001",
  case_slug: "legal/cases/2026-0001",
  client_name: "Max Muster",
  amount: 780,
  paid_amount: 0,
  open_amount: 780,
  due_date: "2026-02-15",
  dunning_level: 0,
  dunning_fee: 0,
  status: "open",
  created_at: "2026-01-20T00:00:00.000Z",
  updated_at: "2026-01-20T00:00:00.000Z",
};

function pageOf(fm: Record<string, unknown>) {
  return { slug: `legal/open-items/${fm.id}`, frontmatter: fm };
}

describe("createOpenItemForInvoice", () => {
  beforeEach(() => vi.clearAllMocks());

  test("creates an open item for a sent invoice", async () => {
    mockListEnginePages.mockResolvedValueOnce([]);
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await createOpenItemForInvoice(headers, invoiceSlug, invoiceFm);
    expect(res.created).toBe(true);
    expect(res.item?.amount).toBe(780);
    expect(res.item?.open_amount).toBe(780);
    expect(res.item?.due_date).toBe("2026-02-15");
    expect(res.item?.case_slug).toBe("legal/cases/2026-0001");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://engine-test:3001/api/pages");
    const payload = JSON.parse(String(init.body));
    expect(payload.type).toBe("open_item");
    expect(payload.slug).toBe("legal/open-items/opos-legal-invoices-R-2026-0001");
    expect(payload.frontmatter.invoice_id).toBe(invoiceSlug);
    expect(payload.frontmatter.status).toBe("open");
  });

  test("looks up the invoice's OP by engine filter, not in the list of all OPs (R11-3)", async () => {
    // An old OP with payments outside any newest-N window: the targeted
    // lookup still finds it, so it is not overwritten with a fresh one.
    mockListEnginePages.mockResolvedValueOnce([
      pageOf({ ...existingItem, paid_amount: 300, open_amount: 480, dunning_level: 2 }),
    ]);
    const res = await createOpenItemForInvoice(headers, invoiceSlug, invoiceFm);
    expect(res.created).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockListEnginePages).toHaveBeenCalledWith(
      headers,
      "open_item",
      expect.any(Number),
      expect.objectContaining({
        strict: true,
        failOnTruncate: true,
        frontmatter: { invoice_id: invoiceSlug },
      })
    );
  });

  test("an incomplete lookup throws instead of writing a fresh OP", async () => {
    mockListEnginePages.mockRejectedValueOnce(new Error("list open_item truncated at 1000"));
    await expect(createOpenItemForInvoice(headers, invoiceSlug, invoiceFm)).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("is idempotent — existing open item is not duplicated", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      pageOf(existingItem as unknown as Record<string, unknown>),
    ]);
    const res = await createOpenItemForInvoice(headers, invoiceSlug, invoiceFm);
    expect(res.created).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("skips invoices without a positive total", async () => {
    mockListEnginePages.mockResolvedValueOnce([]);
    const res = await createOpenItemForInvoice(headers, invoiceSlug, {
      ...invoiceFm,
      total: 0,
    });
    expect(res.created).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("recreates after write-off (storno → neue Rechnung)", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      pageOf({ ...existingItem, status: "written_off" } as unknown as Record<string, unknown>),
    ]);
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await createOpenItemForInvoice(headers, invoiceSlug, invoiceFm);
    expect(res.created).toBe(true);
  });

  test("propagates engine write failures (fail loud)", async () => {
    mockListEnginePages.mockResolvedValueOnce([]);
    mockFetch.mockResolvedValueOnce(new Response("broken", { status: 500 }));
    await expect(createOpenItemForInvoice(headers, invoiceSlug, invoiceFm)).rejects.toThrow();
  });
});

describe("closeOpenItemForInvoice", () => {
  beforeEach(() => vi.clearAllMocks());

  test("marks the open item paid", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      pageOf(existingItem as unknown as Record<string, unknown>),
    ]);
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const closed = await closeOpenItemForInvoice(headers, invoiceSlug, "paid");
    expect(closed).toBe(true);
    const payload = JSON.parse(String((mockFetch.mock.calls[0] as [string, RequestInit])[1].body));
    expect(payload.frontmatter.status).toBe("paid");
    expect(payload.frontmatter.open_amount).toBe(0);
    expect(payload.frontmatter.paid_amount).toBe(780);
  });

  test("writes off the open item on storno with a note", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      pageOf(existingItem as unknown as Record<string, unknown>),
    ]);
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const closed = await closeOpenItemForInvoice(
      headers,
      invoiceSlug,
      "written_off",
      "Storniert durch R-2026-0002"
    );
    expect(closed).toBe(true);
    const payload = JSON.parse(String((mockFetch.mock.calls[0] as [string, RequestInit])[1].body));
    expect(payload.frontmatter.status).toBe("written_off");
    expect(payload.frontmatter.notes).toContain("R-2026-0002");
  });

  test("returns false when no open item exists", async () => {
    mockListEnginePages.mockResolvedValueOnce([]);
    const closed = await closeOpenItemForInvoice(headers, invoiceSlug, "paid");
    expect(closed).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("does not touch already-closed items", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      pageOf({ ...existingItem, status: "paid" } as unknown as Record<string, unknown>),
    ]);
    const closed = await closeOpenItemForInvoice(headers, invoiceSlug, "written_off");
    expect(closed).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("applyOpenItemFee", () => {
  beforeEach(() => vi.clearAllMocks());

  test("adds the reminder fee to dunning_fee and open_amount", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      pageOf(existingItem as unknown as Record<string, unknown>),
    ]);
    mockFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const ok = await applyOpenItemFee(headers, invoiceSlug, 25);
    expect(ok).toBe(true);
    const payload = JSON.parse(String((mockFetch.mock.calls[0] as [string, RequestInit])[1].body));
    expect(payload.frontmatter.dunning_fee).toBe(25);
    expect(payload.frontmatter.open_amount).toBe(805);
    expect(payload.frontmatter.status).toBe("reminded");
  });

  test("rejects non-positive fees and closed items", async () => {
    mockListEnginePages.mockResolvedValueOnce([
      pageOf(existingItem as unknown as Record<string, unknown>),
    ]);
    expect(await applyOpenItemFee(headers, invoiceSlug, 0)).toBe(false);

    mockListEnginePages.mockResolvedValueOnce([
      pageOf({ ...existingItem, status: "written_off" } as unknown as Record<string, unknown>),
    ]);
    expect(await applyOpenItemFee(headers, invoiceSlug, 25)).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
