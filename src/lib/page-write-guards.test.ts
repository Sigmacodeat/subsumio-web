// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkInvoiceWrite,
  guardSecondCheckWrite,
  hasServerSecondCheck,
  readCurrentPage,
} from "@/lib/page-write-guards";

const stamped = { second_check_by: "Kollegin", second_check_at: "2026-09-20T10:00:00Z" };

describe("guardSecondCheckWrite — standalone deadline", () => {
  it("strips client-supplied second_check_* fields", () => {
    const r = guardSecondCheckWrite(
      { note: "x", second_check_by: "ich selbst", second_check_at: "2026-09-23T00:00:00Z" },
      { status: "pending" }
    );
    expect("frontmatter" in r && r.frontmatter).toEqual({ note: "x" });
  });

  it("rejects done on a Notfrist even when the client sends its own second check", () => {
    const r = guardSecondCheckWrite(
      { status: "done", second_check_by: "ich selbst", second_check_at: "2026-09-23T00:00:00Z" },
      { status: "pending", is_notfrist: true }
    );
    expect("reject" in r && r.reject.error).toBe("notfrist_second_check_required");
  });

  it("rejects done when the write itself flags the deadline as Notfrist (new page)", () => {
    const r = guardSecondCheckWrite({ status: "done", second_check_required: true }, null);
    expect("reject" in r).toBe(true);
  });

  it("allows done once the server stamped the second check, and keeps the stamp", () => {
    const r = guardSecondCheckWrite(
      { status: "done", second_check_by: "fake" },
      { status: "pending", is_notfrist: true, ...stamped }
    );
    expect("frontmatter" in r && r.frontmatter).toMatchObject({ status: "done", ...stamped });
  });

  it("does not block ordinary deadlines or re-saves of an already done Notfrist", () => {
    expect("frontmatter" in guardSecondCheckWrite({ status: "done" }, { status: "pending" })).toBe(
      true
    );
    expect(
      "frontmatter" in
        guardSecondCheckWrite({ status: "done" }, { status: "done", is_notfrist: true })
    ).toBe(true);
  });
});

describe("guardSecondCheckWrite — deadlines inside a matter", () => {
  const stored = {
    deadlines: [
      { id: "a", title: "Berufung", status: "pending", is_notfrist: true },
      { id: "b", title: "Klage", status: "done", is_notfrist: true, ...stamped },
    ],
  };

  it("rejects a Notfrist set to done in the list with a client-side second check", () => {
    const r = guardSecondCheckWrite(
      {
        deadlines: [
          { ...stored.deadlines[0], status: "done", second_check_by: "ich", second_check_at: "t" },
          stored.deadlines[1],
        ],
      },
      stored
    );
    expect("reject" in r && r.reject.message).toContain("Berufung");
  });

  it("restores stored stamps that a client dropped or forged", () => {
    const r = guardSecondCheckWrite(
      {
        deadlines: [
          stored.deadlines[0],
          { id: "b", title: "Klage", status: "done", is_notfrist: true, second_check_by: "x" },
        ],
      },
      stored
    );
    expect("frontmatter" in r).toBe(true);
    const list = (r as { frontmatter: { deadlines: Array<Record<string, unknown>> } }).frontmatter
      .deadlines;
    expect(list[1]).toMatchObject(stamped);
    expect(list[0].second_check_by).toBeUndefined();
  });

  it("rejects a new Notfrist entry that arrives already done", () => {
    const r = guardSecondCheckWrite(
      { deadlines: [{ id: "new", title: "Neu", status: "done", is_notfrist: true }] },
      stored
    );
    expect("reject" in r).toBe(true);
  });
});

describe("hasServerSecondCheck", () => {
  it("needs both checker and time", () => {
    expect(hasServerSecondCheck(stamped)).toBe(true);
    expect(hasServerSecondCheck({ second_check_by: "x" })).toBe(false);
    expect(hasServerSecondCheck(null)).toBe(false);
  });
});

describe("checkInvoiceWrite", () => {
  const sent = {
    slug: "legal/invoices/R-1",
    type: "invoice",
    title: "Rechnung R-1",
    content: "",
    frontmatter: { status: "sent", total: 780, invoice_number: "R-1" },
  };

  it("leaves drafts and non-invoices alone", () => {
    expect(
      checkInvoiceWrite(
        { ...sent, frontmatter: { ...sent.frontmatter, status: "draft" } },
        { mode: "merge", frontmatter: { total: 1 } }
      )
    ).toBeNull();
    expect(
      checkInvoiceWrite({ type: "legal_case", frontmatter: { status: "sent" } }, { mode: "delete" })
    ).toBeNull();
    expect(checkInvoiceWrite(null, { mode: "replace" })).toBeNull();
  });

  it("refuses content changes, deletes and overwrites of an issued invoice", () => {
    expect(checkInvoiceWrite(sent, { mode: "merge", frontmatter: { total: 1 } })?.status).toBe(409);
    expect(checkInvoiceWrite(sent, { mode: "merge", title: "Neu" })?.error).toBe(
      "invoice_finalized"
    );
    expect(checkInvoiceWrite(sent, { mode: "delete" })).not.toBeNull();
    expect(checkInvoiceWrite(sent, { mode: "replace" })).not.toBeNull();
  });

  it("recognises the type from frontmatter too", () => {
    expect(
      checkInvoiceWrite(
        { frontmatter: { type: "invoice", status: "paid" } },
        { mode: "merge", frontmatter: { items: [] } }
      )
    ).not.toBeNull();
  });

  it("allows payment bookkeeping and unchanged values", () => {
    expect(
      checkInvoiceWrite(sent, {
        mode: "merge",
        frontmatter: { status: "paid", paid_at: "2026-09-23", paid_amount: 780, total: 780 },
      })
    ).toBeNull();
    expect(
      checkInvoiceWrite(sent, { mode: "merge", frontmatter: { e_invoice_status: "delivered" } })
    ).toBeNull();
    expect(
      checkInvoiceWrite(sent, { mode: "merge", frontmatter: { type: "invoice", version: 3 } })
    ).toBeNull();
  });

  it("refuses leaving the payment states (no cancel without Storno, cancelled is final)", () => {
    expect(
      checkInvoiceWrite(sent, { mode: "merge", frontmatter: { status: "draft" } })
    ).not.toBeNull();
    expect(
      checkInvoiceWrite(sent, { mode: "merge", frontmatter: { status: "cancelled" } })
    ).not.toBeNull();
    const cancelled = { ...sent, frontmatter: { ...sent.frontmatter, status: "cancelled" } };
    expect(
      checkInvoiceWrite(cancelled, { mode: "merge", frontmatter: { status: "paid" } })
    ).not.toBeNull();
  });
});

describe("readCurrentPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps 404 to missing and every other failure to error (fail closed)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 }))
    );
    expect((await readCurrentPage("http://e", {}, "a/b")).kind).toBe("missing");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 }))
    );
    expect((await readCurrentPage("http://e", {}, "a/b")).kind).toBe("error");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      })
    );
    expect((await readCurrentPage("http://e", {}, "a/b")).kind).toBe("error");
  });

  it("encodes each slug segment", async () => {
    const f = vi.fn(async () => Response.json({ slug: "a b/c" }));
    vi.stubGlobal("fetch", f);
    const r = await readCurrentPage("http://e", {}, "a b/c");
    expect(r.kind).toBe("found");
    expect((f.mock.calls[0] as unknown[])[0]).toBe("http://e/api/pages/a%20b/c");
  });
});
