// WhatsApp "rechnung akt …" creates the draft the same way as POST
// /api/invoices: firm VAT rate, cent-exact sums, a consecutive number from
// the firm counter, create-only write through the shared helper.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkStoredInvoiceTotals } from "@/lib/invoice-totals";

const m = vi.hoisted(() => ({
  settings: vi.fn(),
  allocate: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: (...a: unknown[]) => m.settings(...a),
}));
vi.mock("@/lib/invoice-numbering", () => ({
  allocateInvoiceNumber: (...a: unknown[]) => m.allocate(...a),
  highestInvoiceNumber: () => 0,
}));
vi.mock("@/lib/invoice-billing-lock", () => ({
  createInvoiceReservingEntries: (...a: unknown[]) => m.create(...a),
}));

import { handleLegalChatMessage } from "./actions";
import type { WhatsAppIdentity } from "@/lib/whatsapp/types";

const CASE_SLUG = "legal/cases/2026-014";
const LAWYER_PHONE = "+4915512345";

function identity(): WhatsAppIdentity {
  return {
    id: "id-1",
    orgId: "org-a",
    phoneHash: "hash",
    matterScope: [CASE_SLUG],
    status: "active",
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phone: LAWYER_PHONE,
    brainId: "org-a",
    role: "lawyer",
  };
}

let pages: Record<string, Record<string, unknown>>;
let appends: Array<{ slug: string; field: string; items: unknown[] }>;

beforeEach(() => {
  vi.clearAllMocks();
  appends = [];
  pages = {
    [CASE_SLUG]: {
      slug: CASE_SLUG,
      title: "Müller ./. Schmidt",
      type: "legal_case",
      frontmatter: { case_number: "2026-014", client_name: "Max Muster" },
    },
  };
  m.settings.mockResolvedValue({ country: "AT", zahlungszielTage: "14" });
  m.allocate.mockResolvedValue("R-2026-0042");
  m.create.mockResolvedValue({
    kind: "created",
    page: {},
    claimed: { time: [], expenses: [] },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "POST" && u.endsWith("/api/pages/array-append")) {
        appends.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (init?.method === "POST" && u.endsWith("/api/pages")) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        const slug = String(body.slug);
        const existing = pages[slug];
        const frontmatter =
          body.merge && existing
            ? { ...(existing.frontmatter as object), ...(body.frontmatter as object) }
            : (body.frontmatter ?? {});
        pages[slug] = { ...(existing ?? {}), ...body, frontmatter };
        return new Response(JSON.stringify({ slug }), { status: 200 });
      }
      const listMatch = u.match(/\/api\/pages\?type=([^&]+)/);
      if (listMatch) {
        const type = decodeURIComponent(listMatch[1]);
        return new Response(JSON.stringify(Object.values(pages).filter((p) => p.type === type)), {
          status: 200,
        });
      }
      const getMatch = u.match(/\/api\/pages\/(.+)$/);
      if (getMatch) {
        const page = pages[decodeURIComponent(getMatch[1])];
        return page
          ? new Response(JSON.stringify(page), { status: 200 })
          : new Response("{}", { status: 404 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    })
  );
});

function send(text: string) {
  return handleLegalChatMessage({
    sender: identity(),
    fromPhone: LAWYER_PHONE,
    messageId: `m-${Math.random()}`,
    text,
  });
}

describe("create_invoice via WhatsApp", () => {
  it("previews with the firm's VAT rate (AT 20 %), never a fixed 19 %", async () => {
    const reply = await send("rechnung akt 2026-014: 1000 eur für Klageentwurf");
    expect(reply).toContain("USt (20 %): 200.00 EUR");
    expect(reply).toContain("Brutto: 1200.00 EUR");
    expect(reply).not.toContain("19");
    expect(m.create).not.toHaveBeenCalled();
  });

  it("creates the draft with an allocated number and consistent sums after JA", async () => {
    await send("rechnung akt 2026-014: 1000,10 eur für Klageentwurf");
    const reply = await send("ja");

    expect(m.allocate).toHaveBeenCalledWith("org-a", expect.any(Number), 0);
    expect(m.create).toHaveBeenCalledTimes(1);
    const input = m.create.mock.calls[0][2] as {
      slug: string;
      invoiceNumber: string;
      caseSlug: string;
      frontmatter: Record<string, unknown>;
    };
    expect(input.invoiceNumber).toBe("R-2026-0042");
    expect(input.slug).toBe("legal/invoices/R-2026-0042");
    expect(input.caseSlug).toBe(CASE_SLUG);
    const fm = input.frontmatter;
    expect(fm.invoice_number).toBe("R-2026-0042");
    expect(fm.status).toBe("draft");
    expect(fm.vat_rate).toBe(0.2);
    expect(fm.subtotal).toBe(1000.1);
    expect(fm.tax).toBe(200.02);
    expect(fm.total).toBe(1200.12);
    expect(fm.case_slugs).toEqual([CASE_SLUG]);
    // Same check POST /api/invoices applies.
    expect(checkStoredInvoiceTotals(fm)).toEqual([]);

    expect(reply).toContain("Rechnungsnummer: R-2026-0042");
    expect(reply).toContain("USt (20 %): 200.02 EUR");
    expect(appends.map((a) => a.field).sort()).toEqual(["audit_log", "invoices"]);
  });

  it("uses the German rate for a firm in Germany", async () => {
    m.settings.mockResolvedValue({ country: "DE" });
    await send("rechnung akt 2026-014: 100 eur");
    await send("ja");
    expect(m.create.mock.calls[0][2].frontmatter.vat_rate).toBe(0.19);
    expect(m.create.mock.calls[0][2].frontmatter.tax).toBe(19);
  });

  it("creates nothing when the firm settings cannot be read", async () => {
    m.settings.mockRejectedValue(new Error("unavailable"));
    const reply = await send("rechnung akt 2026-014: 100 eur");
    expect(reply).toMatch(/nicht lesbar/);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("reports a failed create instead of claiming an invoice", async () => {
    m.create.mockResolvedValue({ kind: "exists" });
    await send("rechnung akt 2026-014: 100 eur");
    const reply = await send("ja");
    expect(reply).toMatch(/konnte nicht angelegt werden/);
    expect(appends).toHaveLength(0);
  });
});
