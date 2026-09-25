import { describe, expect, it } from "vitest";
import {
  checkBilledEntriesWrite,
  checkBillingArrayAppend,
  checkInvoiceArrayWrite,
  guardBillingArrayMutation,
  unlessMatches,
} from "./billing-write-guards";

const sentInvoice = {
  slug: "legal/invoices/r-1",
  type: "invoice",
  frontmatter: { status: "sent", items: [{ description: "Beratung", amount: 100 }] },
};

const billed = {
  id: "te-1",
  description: "Klage",
  minutes: 60,
  billed: true,
  invoice_number: "R-1",
};
const open = { id: "te-2", description: "Telefonat", minutes: 15, billed: false };

describe("checkInvoiceArrayWrite", () => {
  it("refuses item changes on an issued invoice", () => {
    const r = checkInvoiceArrayWrite(sentInvoice, "items");
    expect(r?.status).toBe(409);
    expect(r?.error).toBe("invoice_finalized");
  });

  it("allows payment bookkeeping on an issued invoice", () => {
    expect(checkInvoiceArrayWrite(sentInvoice, "payments")).toBeNull();
  });

  it("leaves drafts and other pages alone", () => {
    expect(
      checkInvoiceArrayWrite({ ...sentInvoice, frontmatter: { status: "draft" } }, "items")
    ).toBeNull();
    expect(checkInvoiceArrayWrite({ type: "legal_case", frontmatter: {} }, "items")).toBeNull();
    expect(checkInvoiceArrayWrite(null, "items")).toBeNull();
  });
});

describe("guardBillingArrayMutation", () => {
  const fm = { time_entries: [billed, open] };

  it("adds the billed guard when the client sends none", () => {
    const g = guardBillingArrayMutation("time_entries", { match: ["te-1"], remove: true }, fm);
    expect("forward" in g && g.forward?.unless).toEqual({ eq: { billed: true } });
  });

  it("refuses to write the billing state", () => {
    const g1 = guardBillingArrayMutation(
      "time_entries",
      { match: ["te-1"], set: { billed: false } },
      fm
    );
    expect("reject" in g1 && g1.reject.error).toBe("billing_state_protected");
    const g2 = guardBillingArrayMutation(
      "expenses",
      { match: ["x"], unset: ["invoice_number"] },
      { expenses: [] }
    );
    expect("reject" in g2 && g2.reject.status).toBe(409);
  });

  it("keeps a client guard as an extra skip and still forces the billed guard", () => {
    const g = guardBillingArrayMutation(
      "time_entries",
      { match: ["te-1", "te-2"], remove: true, unless: { ne: { lawyer: "x" } } },
      { time_entries: [{ ...open, lawyer: "y" }, billed] }
    );
    if (!("forward" in g)) throw new Error("rejected");
    expect(g.preSkipped).toEqual(["te-2"]);
    expect(g.forward?.match).toEqual(["te-1"]);
    expect(g.forward?.unless).toEqual({ eq: { billed: true } });
  });

  it("does not touch other arrays", () => {
    const m = { match: ["a"], set: { billed: true } };
    const g = guardBillingArrayMutation("tasks", m, {});
    expect("forward" in g && g.forward).toBe(m);
  });
});

describe("unlessMatches mirrors the engine", () => {
  it("eq needs every pair equal, ne needs the key present and different", () => {
    expect(unlessMatches(billed, { eq: { billed: true } })).toBe(true);
    expect(unlessMatches(open, { eq: { billed: true } })).toBe(false);
    expect(unlessMatches(billed, { ne: { invoice_number: "R-2" } })).toBe(true);
    expect(unlessMatches(billed, { ne: { invoice_number: "R-1" } })).toBe(false);
    expect(unlessMatches(open, { ne: { invoice_number: "" } })).toBe(false);
  });
});

describe("checkBillingArrayAppend", () => {
  it("refuses new entries already attached to an invoice", () => {
    expect(
      checkBillingArrayAppend("time_entries", [{ id: "n", invoice_number: "R-9" }])?.status
    ).toBe(409);
  });
  it("allows plain new entries and legacy-billed imports", () => {
    expect(checkBillingArrayAppend("time_entries", [{ id: "n" }])).toBeNull();
    expect(checkBillingArrayAppend("time_entries", [{ id: "n", billed: true }])).toBeNull();
    expect(checkBillingArrayAppend("notes", [{ invoice_number: "R-9" }])).toBeNull();
  });
});

describe("checkBilledEntriesWrite", () => {
  const matter = { type: "legal_case", frontmatter: { time_entries: [billed, open] } };

  it("refuses removing a billed entry through a whole-array write", () => {
    const r = checkBilledEntriesWrite(matter, {
      mode: "merge",
      frontmatter: { time_entries: [open] },
    });
    expect(r?.error).toBe("entry_billed");
  });

  it("refuses changing or un-billing a billed entry", () => {
    expect(
      checkBilledEntriesWrite(matter, {
        mode: "merge",
        frontmatter: { time_entries: [{ ...billed, minutes: 90 }, open] },
      })?.error
    ).toBe("entry_billed");
    expect(
      checkBilledEntriesWrite(matter, {
        mode: "merge",
        frontmatter: { time_entries: [{ ...billed, billed: false }, open] },
      })?.status
    ).toBe(409);
  });

  it("refuses marking entries billed outside the billing routes", () => {
    const r = checkBilledEntriesWrite(matter, {
      mode: "merge",
      frontmatter: { time_entries: [billed, { ...open, billed: true, invoice_number: "R-5" }] },
    });
    expect(r?.error).toBe("billing_state_protected");
  });

  it("allows editing and deleting open entries and leaving billed ones as they are", () => {
    expect(
      checkBilledEntriesWrite(matter, {
        mode: "merge",
        frontmatter: { time_entries: [{ ...billed }, { ...open, minutes: 30 }] },
      })
    ).toBeNull();
    expect(
      checkBilledEntriesWrite(matter, { mode: "merge", frontmatter: { time_entries: [billed] } })
    ).toBeNull();
    expect(
      checkBilledEntriesWrite(matter, { mode: "merge", frontmatter: { title: "x" } })
    ).toBeNull();
  });

  it("freezes a billed standalone time entry page", () => {
    const page = { type: "time_entry", frontmatter: { ...billed } };
    expect(checkBilledEntriesWrite(page, { mode: "delete" })?.error).toBe("entry_billed");
    expect(
      checkBilledEntriesWrite(page, { mode: "merge", frontmatter: { billed: false } })?.status
    ).toBe(409);
    const openPage = { type: "time_entry", frontmatter: { ...open } };
    expect(
      checkBilledEntriesWrite(openPage, { mode: "merge", frontmatter: { billed: true } })?.error
    ).toBe("billing_state_protected");
    expect(
      checkBilledEntriesWrite(openPage, { mode: "merge", frontmatter: { minutes: 20 } })
    ).toBeNull();
  });
});
