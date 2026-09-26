// @vitest-environment node
import { describe, test, expect, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine" }));

import {
  decideSuggestedDeadline,
  deadlineSlugForSuggestion,
  engineGegenrechnung,
  isValidIsoDate,
} from "./deadline-decision";

type Call = { url: string; method: string; body: Record<string, unknown> | null };

function engineMock(
  casePage: Record<string, unknown> | null,
  opts: { failWriteOf?: (slug: string) => boolean } = {}
) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ url, method, body });
    if (method === "GET") {
      return casePage ? Response.json(casePage) : new Response("not found", { status: 404 });
    }
    const slug = String(body?.slug ?? "");
    if (opts.failWriteOf?.(slug)) return new Response("boom", { status: 500 });
    return Response.json({ ok: true });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const suggestions = [
  {
    title: "Berufungsfrist",
    due_date: "2026-10-01",
    confirmed: false,
    source_quote: "binnen 4 Wochen",
  },
  { title: "Äußerung", due_date: "2026-10-15", confirmed: false },
];

describe("decideSuggestedDeadline", () => {
  test("writes the deadline FIRST, then rewrites the suggestion list as an array", async () => {
    const { calls, fetchFn } = engineMock({
      frontmatter: { suggested_deadlines: suggestions },
    });
    const r = await decideSuggestedDeadline(
      {},
      { caseSlug: "legal/cases/akte-1", index: 0, action: "approve", reviewer: "ra@kanzlei.at" },
      fetchFn
    );
    expect(r.ok).toBe(true);
    const writes = calls.filter((c) => c.method === "POST");
    expect(writes).toHaveLength(2);
    expect(String(writes[0]!.body!.slug)).toMatch(/^legal\/deadlines\//);
    expect((writes[0]!.body!.frontmatter as Record<string, unknown>).review_status).toBe(
      "approved"
    );
    const list = (writes[1]!.body!.frontmatter as Record<string, unknown>)
      .suggested_deadlines as Array<Record<string, unknown>>;
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(2);
    expect(list[0]!.review_status).toBe("approved");
    expect(list[1]!.review_status).toBeUndefined();
  });

  test("a failed deadline write leaves the suggestion open and reports an error", async () => {
    const { calls, fetchFn } = engineMock(
      { frontmatter: { suggested_deadlines: suggestions } },
      { failWriteOf: (slug) => slug.startsWith("legal/deadlines/") }
    );
    const r = await decideSuggestedDeadline(
      {},
      { caseSlug: "legal/cases/akte-1", index: 0, action: "approve", reviewer: "x" },
      fetchFn
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("deadline_write_failed");
    // the case page was never patched
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  test("the lawyer's edited date wins and the AI date is kept for audit", async () => {
    const { calls, fetchFn } = engineMock({ frontmatter: { suggested_deadlines: suggestions } });
    await decideSuggestedDeadline(
      {},
      {
        caseSlug: "legal/cases/akte-1",
        index: 0,
        action: "approve",
        dueDate: "2026-09-30",
        reviewer: "x",
      },
      fetchFn
    );
    const fm = calls.find((c) => c.method === "POST")!.body!.frontmatter as Record<string, unknown>;
    expect(fm.due_date).toBe("2026-09-30");
    expect(fm.ai_due_date).toBe("2026-10-01");
  });

  test("approval without a valid date is refused", async () => {
    const { fetchFn } = engineMock({
      frontmatter: { suggested_deadlines: [{ title: "x", due_date: "binnen 14 Tagen" }] },
    });
    const r = await decideSuggestedDeadline(
      {},
      { caseSlug: "c", index: 0, action: "approve", reviewer: "x" },
      fetchFn
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("due_date_required");
  });

  test("repeating the same decision is idempotent", async () => {
    const { calls, fetchFn } = engineMock({
      frontmatter: {
        suggested_deadlines: [
          { ...suggestions[0], review_status: "approved", deadline_slug: "legal/deadlines/a" },
        ],
      },
    });
    const r = await decideSuggestedDeadline(
      {},
      { caseSlug: "c", index: 0, action: "approve", reviewer: "x" },
      fetchFn
    );
    expect(r).toEqual({ ok: true, deadlineSlug: "legal/deadlines/a", alreadyDecided: true });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  test("rejecting dismisses a pre-created unreviewed deadline", async () => {
    const { calls, fetchFn } = engineMock({
      frontmatter: {
        suggested_deadlines: [{ ...suggestions[0], deadline_slug: "legal/deadlines/pre" }],
      },
    });
    const r = await decideSuggestedDeadline(
      {},
      { caseSlug: "c", index: 0, action: "reject", reviewer: "x" },
      fetchFn
    );
    expect(r.ok).toBe(true);
    const first = calls.find((c) => c.method === "POST")!;
    expect(first.body!.slug).toBe("legal/deadlines/pre");
    expect((first.body!.frontmatter as Record<string, unknown>).review_status).toBe("rejected");
  });

  test("a corrupted (object) suggestion list is reported, not overwritten", async () => {
    const { fetchFn } = engineMock({
      frontmatter: { suggested_deadlines: { "0": { confirmed: true } } },
    });
    const r = await decideSuggestedDeadline(
      {},
      { caseSlug: "c", index: 0, action: "approve", reviewer: "x" },
      fetchFn
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("suggestions_corrupt");
  });
});

describe("helpers", () => {
  test("isValidIsoDate", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("28.02.2026")).toBe(false);
  });
  test("deadline slug is deterministic", () => {
    const a = deadlineSlugForSuggestion("legal/cases/x", suggestions[0]!, 0);
    expect(a).toBe(deadlineSlugForSuggestion("legal/cases/x", suggestions[0]!, 0));
    expect(a).not.toBe(deadlineSlugForSuggestion("legal/cases/x", suggestions[1]!, 1));
  });
});

describe("W1-18: Gegenrechnung mit der Frist-Engine bei der Freigabe", () => {
  const engineSuggestion = {
    title: "Berufungsfrist (§ 464 Abs 1 ZPO)",
    due_date: "2026-05-04",
    confirmed: false,
    zustellungsdatum: "2026-04-03",
    frist_art: "berufung",
    rechtsgrundlage: "§ 464 Abs 1 ZPO",
    notfrist: true,
  };

  test("confirmed date = engine date → stored as match, Notfrist flagged for Vier-Augen", async () => {
    const { calls, fetchFn } = engineMock({
      frontmatter: { suggested_deadlines: [engineSuggestion] },
    });
    const r = await decideSuggestedDeadline(
      {},
      { caseSlug: "legal/cases/akte-1", index: 0, action: "approve", reviewer: "ra@kanzlei.at" },
      fetchFn
    );
    expect(r.ok && r.engineCheck?.matches).toBe(true);
    const fm = calls.find((c) => c.method === "POST")!.body!.frontmatter as Record<string, unknown>;
    expect(fm).toMatchObject({
      engine_due_date: "2026-05-04",
      engine_check: "match",
      law: "§ 464 Abs 1 ZPO",
      zustellungsdatum: "2026-04-03",
      is_notfrist: true,
      second_check_required: true,
    });
  });

  test("a different confirmed date is saved but returned and stored as Abweichung", async () => {
    const { calls, fetchFn } = engineMock({
      frontmatter: { suggested_deadlines: [engineSuggestion] },
    });
    const r = await decideSuggestedDeadline(
      {},
      {
        caseSlug: "legal/cases/akte-1",
        index: 0,
        action: "approve",
        dueDate: "2026-05-11",
        reviewer: "ra@kanzlei.at",
      },
      fetchFn
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.engineCheck?.matches).toBe(false);
    expect(r.engineCheck?.message).toContain("2026-05-04");
    const fm = calls.find((c) => c.method === "POST")!.body!.frontmatter as Record<string, unknown>;
    expect(fm).toMatchObject({
      due_date: "2026-05-11",
      engine_due_date: "2026-05-04",
      engine_check: "abweichung",
    });
  });

  test("the later vhfZ date in a possible Ferialsache is flagged as such", () => {
    const check = engineGegenrechnung(
      { zustellungsdatum: "2026-07-20", frist_art: "berufung", ferialsache: "zweifel" },
      "2026-09-14"
    );
    expect(check?.matches).toBe(false);
    expect(check?.engineDueDate).toBe("2026-08-17");
    expect(check?.message).toContain("KEINE Ferialsache");
  });

  test("without Zustelldatum or Fristart there is no re-check", () => {
    expect(engineGegenrechnung({ frist_art: "berufung" }, "2026-05-04")).toBeNull();
    expect(engineGegenrechnung({ zustellungsdatum: "2026-04-03" }, "2026-05-04")).toBeNull();
  });
});
