// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fm = Record<string, unknown>;
const pages = new Map<string, { type?: string; frontmatter: Fm }>();

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: async (_h: unknown, type: string) =>
    [...pages]
      .filter(([, p]) => p.type === type)
      .map(([slug, p]) => ({ slug, frontmatter: { ...p.frontmatter } })),
}));
vi.mock("@/lib/keyed-lock", () => ({
  withKeyedLock: (_k: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { importAndMatchTransactions } from "./fibu-import.server";
import { parseCamt053 } from "./camt053";

const INV = "legal/invoices/r-42";
const OP = "legal/open-items/opos-legal-invoices-r-42";

const CAMT = `<?xml version="1.0"?>
<Document><BkToCstmrStmt><Stmt>
  <Acct><Id><IBAN>AT611904300234573201</IBAN></Id></Acct>
  <Ntry>
    <Amt Ccy="EUR">600.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
    <BookgDt><Dt>2026-03-02</Dt></BookgDt>
    <NtryDtls><TxDtls><RmtInf><Ustrd>R-2026-0042 Teilzahlung</Ustrd></RmtInf></TxDtls></NtryDtls>
  </Ntry>
</Stmt></BkToCstmrStmt></Document>`;

beforeEach(() => {
  pages.clear();
  pages.set(INV, {
    type: "invoice",
    frontmatter: { status: "sent", invoice_number: "R-2026-0042", total: 1200 },
  });
  pages.set(OP, {
    type: "open_item",
    frontmatter: {
      id: "opos-legal-invoices-r-42",
      invoice_id: INV,
      invoice_number: "R-2026-0042",
      client_name: "M",
      amount: 1200,
      paid_amount: 0,
      open_amount: 1200,
      due_date: "2026-03-15",
      dunning_level: 0,
      dunning_fee: 0,
      status: "open",
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          slug: string;
          type?: string;
          frontmatter: Fm;
          merge?: boolean;
          if_absent?: boolean;
        };
        const existing = pages.get(body.slug);
        if (body.if_absent && existing) {
          return Response.json({ error: "page_exists" }, { status: 409 });
        }
        pages.set(body.slug, {
          type: body.type ?? existing?.type,
          frontmatter: body.merge
            ? { ...(existing?.frontmatter ?? {}), ...body.frontmatter }
            : body.frontmatter,
        });
        return Response.json({ ok: true });
      }
      const slug = decodeURIComponent(u.pathname.replace(/^\/api\/pages\//, ""));
      const p = pages.get(slug);
      return p
        ? Response.json({ slug, type: p.type, frontmatter: p.frontmatter })
        : new Response("{}", { status: 404 });
    })
  );
});

describe("importAndMatchTransactions (GELD-16 / GELD-17)", () => {
  it("the same camt statement imported twice pays the open item only once", async () => {
    const first = await importAndMatchTransactions({}, parseCamt053(CAMT).transactions);
    expect(first).toMatchObject({ imported: 1, matched: 1, duplicates: 0 });
    expect(pages.get(OP)!.frontmatter.paid_amount).toBe(600);

    const second = await importAndMatchTransactions({}, parseCamt053(CAMT).transactions);
    expect(second).toMatchObject({ imported: 0, matched: 0, duplicates: 1 });
    expect(pages.get(OP)!.frontmatter.paid_amount).toBe(600);
    expect(pages.get(OP)!.frontmatter.status).toBe("open");
  });

  it("a full payment settles the open item and sets the invoice to paid", async () => {
    const full = CAMT.replace("600.00", "1200.00");
    const res = await importAndMatchTransactions({}, parseCamt053(full).transactions);
    expect(res.invoicesPaid).toBe(1);
    expect(pages.get(OP)!.frontmatter.status).toBe("paid");
    const inv = pages.get(INV)!.frontmatter;
    expect(inv.status).toBe("paid");
    expect(inv.paid_amount).toBe(1200);
    expect(inv.paid_at).toBe("2026-03-02");
    // Only process fields were written onto the invoice.
    expect(inv.total).toBe(1200);
  });

  it("a duplicate within one batch is skipped", async () => {
    const [t] = parseCamt053(CAMT).transactions;
    const res = await importAndMatchTransactions({}, [t, { ...t }]);
    expect(res).toMatchObject({ imported: 1, duplicates: 1 });
    expect(pages.get(OP)!.frontmatter.paid_amount).toBe(600);
  });
});
