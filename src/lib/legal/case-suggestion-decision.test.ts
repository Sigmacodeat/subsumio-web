// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));

import {
  decideSuggestedCaseField,
  decideSuggestedParty,
  partyPlacement,
} from "./case-suggestion-decision";
import type { MatterConflictOutcome } from "@/lib/conflict-gate";

const CASE = "legal/cases/akte-1";

function engine(caseFm: Record<string, unknown>, pages: Record<string, unknown> = {}) {
  const writes: Array<{ slug: string; body: Record<string, unknown> }> = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      writes.push({ slug: String(body.slug), body });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    const slug = decodeURIComponent(String(url).split("/api/pages/")[1] ?? "");
    if (slug === CASE) {
      return new Response(JSON.stringify({ slug, frontmatter: caseFm }), { status: 200 });
    }
    const page = pages[slug];
    return page
      ? new Response(JSON.stringify(page), { status: 200 })
      : new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchFn, writes };
}

const clear: MatterConflictOutcome = { checked: true, severity: "none", parties: [], blocking: [] };
const blocking: MatterConflictOutcome = {
  checked: true,
  severity: "critical",
  parties: [],
  blocking: [
    {
      name: "Widget-Co GmbH",
      type: "case",
      slug: "legal/cases/other",
      title: "Andere Akte",
      role: "client",
      assessment: "critical",
      party: "Widget-Co GmbH",
      party_side: "opponent",
    },
  ],
};

const base = { caseSlug: CASE, index: 0, reviewer: "anwalt@kanzlei.at", reviewerRole: "lawyer" };

describe("decideSuggestedParty", () => {
  it("accepting a Gegner checks conflicts, creates the contact and fills the opponent", async () => {
    const { fetchFn, writes } = engine({
      client_name: "Anna Beispiel",
      version: 3,
      suggested_parties: [{ name: "Widget-Co GmbH", role: "gegner", confirmed: false }],
    });
    const conflictCheck = vi.fn(async () => clear);
    const r = await decideSuggestedParty(
      {},
      { ...base, action: "approve" },
      { fetchFn, conflictCheck }
    );
    expect(r).toMatchObject({ ok: true, applied: ["opponent_name"] });
    expect(conflictCheck).toHaveBeenCalledWith(
      {},
      [{ name: "Widget-Co GmbH", side: "opponent", ownContactSlugs: [] }],
      { selfCaseSlug: CASE }
    );
    const contact = writes.find((w) => w.slug === "legal/contacts/widget-co-gmbh");
    expect(contact?.body).toMatchObject({
      type: "legal_contact",
      frontmatter: { role: "opponent", name: "Widget-Co GmbH" },
    });
    const caseWrite = writes.find((w) => w.slug === CASE)!.body.frontmatter as Record<
      string,
      unknown
    >;
    expect(caseWrite).toMatchObject({
      opponent_name: "Widget-Co GmbH",
      opponent_slugs: ["legal/contacts/widget-co-gmbh"],
      conflict_status: "conflict_cleared",
      version: 4,
    });
    expect((caseWrite.suggested_parties as Array<Record<string, unknown>>)[0]).toMatchObject({
      review_status: "approved",
      contact_slug: "legal/contacts/widget-co-gmbh",
    });
  });

  it("a blocking conflict without waiver writes nothing", async () => {
    const { fetchFn, writes } = engine({
      suggested_parties: [{ name: "Widget-Co GmbH", role: "gegner" }],
    });
    const r = await decideSuggestedParty(
      {},
      { ...base, action: "approve" },
      { fetchFn, conflictCheck: async () => blocking }
    );
    expect(r).toMatchObject({ ok: false, status: 409, code: "conflict_detected" });
    expect(writes).toHaveLength(0);
  });

  it("a waiver needs a lawyer or admin", async () => {
    const { fetchFn, writes } = engine({
      suggested_parties: [{ name: "Widget-Co GmbH", role: "gegner" }],
    });
    const r = await decideSuggestedParty(
      {},
      { ...base, reviewerRole: "assistant", action: "approve", conflictWaiverReason: "geprüft" },
      { fetchFn, conflictCheck: async () => blocking }
    );
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(writes).toHaveLength(0);
  });

  it("a conflict check that cannot run blocks (fail-closed)", async () => {
    const { fetchFn, writes } = engine({
      suggested_parties: [{ name: "Anna Beispiel", role: "mandant" }],
    });
    const r = await decideSuggestedParty(
      {},
      { ...base, action: "approve" },
      {
        fetchFn,
        conflictCheck: async () => {
          throw new Error("down");
        },
      }
    );
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(writes).toHaveLength(0);
  });

  it("Kläger/Beklagter without a chosen side is not taken over silently", async () => {
    const { fetchFn, writes } = engine({
      suggested_parties: [{ name: "Widget-Co GmbH", role: "beklagte_partei" }],
    });
    const r = await decideSuggestedParty({}, { ...base, action: "approve" }, { fetchFn });
    expect(r).toMatchObject({ ok: false, status: 400, code: "role_required" });
    expect(writes).toHaveLength(0);
  });

  it("links the contact chosen in the dialog and never overwrites an existing client", async () => {
    const { fetchFn, writes } = engine(
      {
        client_name: "Bestehender Mandant",
        suggested_parties: [{ name: "Anna Beispiel", role: "klagende_partei" }],
      },
      { "legal/contacts/anna": { type: "legal_contact", frontmatter: { name: "Anna Beispiel" } } }
    );
    const r = await decideSuggestedParty(
      {},
      { ...base, action: "approve", role: "mandant", contactSlug: "legal/contacts/anna" },
      { fetchFn, conflictCheck: async () => clear }
    );
    expect(r).toMatchObject({ ok: true, applied: [], contactSlug: "legal/contacts/anna" });
    // No new contact page, client stays.
    expect(writes.map((w) => w.slug)).toEqual([CASE]);
    const fm = writes[0]!.body.frontmatter as Record<string, unknown>;
    expect(fm.client_name).toBeUndefined();
  });

  it("rejecting marks the suggestion only", async () => {
    const { fetchFn, writes } = engine({
      suggested_parties: [
        { name: "X", role: "gegner" },
        { name: "Y", role: "gegner" },
      ],
    });
    const r = await decideSuggestedParty({}, { ...base, index: 1, action: "reject" }, { fetchFn });
    expect(r.ok).toBe(true);
    const list = (writes[0]!.body.frontmatter as Record<string, unknown>)
      .suggested_parties as Array<Record<string, unknown>>;
    expect(list[0]!.review_status).toBeUndefined();
    expect(list[1]!.review_status).toBe("rejected");
  });
});

describe("partyPlacement", () => {
  it("a second opponent is added, the first one stays", () => {
    const { patch } = partyPlacement(
      { opponent_name: "Erste GmbH", opponent_slugs: ["legal/contacts/erste"] },
      "gegner",
      "Zweite AG",
      "legal/contacts/zweite"
    );
    expect(patch).toEqual({
      additional_opponents: [{ name: "Zweite AG", slug: "legal/contacts/zweite" }],
    });
  });
});

describe("decideSuggestedCaseField", () => {
  it("accepting the Streitwert sets exactly that field", async () => {
    const { fetchFn, writes } = engine({
      dispute_value: 5000,
      suggested_case_fields: [{ field: "dispute_value", value: 8450, review_status: "pending" }],
    });
    const r = await decideSuggestedCaseField(
      {},
      { caseSlug: CASE, index: 0, action: "approve", reviewer: "anwalt@kanzlei.at" },
      fetchFn
    );
    expect(r).toMatchObject({ ok: true, applied: ["dispute_value"] });
    const fm = writes[0]!.body.frontmatter as Record<string, unknown>;
    expect(fm.dispute_value).toBe(8450);
    expect((fm.suggested_case_fields as Array<Record<string, unknown>>)[0]).toMatchObject({
      review_status: "approved",
      previous_value: 5000,
    });
  });

  it("the lawyer's corrected Geschäftszahl wins over the suggestion", async () => {
    const { fetchFn, writes } = engine({
      suggested_case_fields: [{ field: "case_number", value: "12 C 345/26k" }],
    });
    await decideSuggestedCaseField(
      {},
      { caseSlug: CASE, index: 0, action: "approve", reviewer: "a", value: "12 C 345/26m" },
      fetchFn
    );
    expect((writes[0]!.body.frontmatter as Record<string, unknown>).case_number).toBe(
      "12 C 345/26m"
    );
  });
});
