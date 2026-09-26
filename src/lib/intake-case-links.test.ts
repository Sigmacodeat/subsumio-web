// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const patches: Array<Record<string, unknown>> = [];
let patchOk = true;
const listed = new Map<string, Array<{ slug: string; frontmatter: Record<string, unknown> }>>();
const pages = new Map<string, Record<string, unknown>>();
const allocate = vi.fn(async (..._a: unknown[]) => "MK-26-0042");

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  enginePatchPage: async (_h: unknown, body: Record<string, unknown>) => {
    patches.push(body);
    return new Response("{}", { status: patchOk ? 200 : 503 });
  },
}));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: async (
    _h: unknown,
    type: string,
    _l: number,
    opts: { frontmatter?: Record<string, string> }
  ) =>
    (listed.get(type) ?? []).filter((p) =>
      Object.entries(opts.frontmatter ?? {}).every(([k, v]) => p.frontmatter[k] === v)
    ),
}));
vi.mock("@/lib/case-numbering", () => ({
  allocateCaseNumber: (...a: unknown[]) => allocate(...a),
}));

import { checkSignedPoa, relinkIntakeRecords, resolveIntakeCaseNumber } from "./intake-case-links";

beforeEach(() => {
  patches.length = 0;
  patchOk = true;
  listed.clear();
  pages.clear();
  allocate.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const slug = decodeURIComponent(new URL(url).pathname.replace(/^\/api\/pages\//, ""));
      const page = pages.get(slug);
      if (page === undefined) return new Response("nf", { status: 404 });
      if (page === null) return new Response("busy", { status: 503 });
      return Response.json(page);
    })
  );
});

const intake = (fm: Record<string, unknown> = {}) => ({
  slug: "legal/intake/2026-09-26/a",
  title: "Intake: A",
  frontmatter: fm,
});

describe("resolveIntakeCaseNumber (W4-02)", () => {
  it("takes the next number of the firm's range and reserves it on the intake first", async () => {
    const nr = await resolveIntakeCaseNumber({}, "brain-1", intake());
    expect(nr).toBe("MK-26-0042");
    expect(allocate).toHaveBeenCalledWith({}, "brain-1");
    expect(patches[0]).toMatchObject({
      slug: "legal/intake/2026-09-26/a",
      frontmatter: { reserved_case_number: "MK-26-0042" },
    });
  });

  it("a retry reuses the reserved number — no gap, no second matter", async () => {
    const nr = await resolveIntakeCaseNumber(
      {},
      "brain-1",
      intake({ reserved_case_number: "MK-26-0041" })
    );
    expect(nr).toBe("MK-26-0041");
    expect(allocate).not.toHaveBeenCalled();
  });

  it("a number that cannot be reserved is not used", async () => {
    patchOk = false;
    await expect(resolveIntakeCaseNumber({}, "brain-1", intake())).rejects.toThrow();
  });

  it("an explicitly requested number wins", async () => {
    expect(await resolveIntakeCaseNumber({}, "b", intake(), " 26-0100 ")).toBe("26-0100");
    expect(allocate).not.toHaveBeenCalled();
  });
});

describe("checkSignedPoa (W4-04)", () => {
  const wf = (poa: Record<string, unknown>) =>
    ({ poa }) as unknown as Parameters<typeof checkSignedPoa>[1];
  const now = new Date("2026-09-26T10:00:00.000Z");

  it("a ticked 'signed' without a linked record is refused", async () => {
    const r = await checkSignedPoa({}, wf({ required: true, status: "signed" }), now);
    expect(r).toMatchObject({ ok: false, code: "poa_not_signed" });
  });

  it("a linked record that is only a draft is refused", async () => {
    pages.set("legal/poa/p1", { type: "power_of_attorney", frontmatter: { status: "draft" } });
    const r = await checkSignedPoa(
      {},
      wf({ required: true, status: "signed", poa_slug: "legal/poa/p1" }),
      now
    );
    expect(r.ok).toBe(false);
  });

  it("an expired signed record is refused", async () => {
    pages.set("legal/poa/p1", {
      type: "power_of_attorney",
      frontmatter: { status: "signed", expires_at: "2026-01-01" },
    });
    const r = await checkSignedPoa(
      {},
      wf({ required: true, status: "signed", poa_slug: "legal/poa/p1" }),
      now
    );
    expect(r.ok).toBe(false);
  });

  it("a signed, valid record passes; not required passes", async () => {
    pages.set("legal/poa/p1", { type: "power_of_attorney", frontmatter: { status: "signed" } });
    expect(
      await checkSignedPoa(
        {},
        wf({ required: true, status: "signed", poa_slug: "legal/poa/p1" }),
        now
      )
    ).toEqual({ ok: true });
    expect(await checkSignedPoa({}, wf({ required: false, status: "not_required" }), now)).toEqual({
      ok: true,
    });
  });

  it("an unreadable record blocks (fail closed)", async () => {
    pages.set("legal/poa/p1", null as unknown as Record<string, unknown>);
    const r = await checkSignedPoa(
      {},
      wf({ required: true, status: "signed", poa_slug: "legal/poa/p1" }),
      now
    );
    expect(r).toMatchObject({ ok: false, code: "poa_unreadable" });
  });
});

describe("relinkIntakeRecords (W4-04/W4-13)", () => {
  it("moves power of attorney, fee agreement and engagement letter to the matter", async () => {
    listed.set("power_of_attorney", [
      { slug: "legal/poa/p1", frontmatter: { case_slug: "legal/intake/2026-09-26/a" } },
      { slug: "legal/poa/other", frontmatter: { case_slug: "legal/cases/other" } },
    ]);
    listed.set("fee_agreement", [
      { slug: "legal/fee-agreements/f1", frontmatter: { case_slug: "legal/intake/2026-09-26/a" } },
    ]);
    pages.set("intake/x/engagement-letter-1", {
      type: "legal_document",
      title: "Mandatsannahme-Schreiben",
      frontmatter: {},
    });
    const r = await relinkIntakeRecords(
      {},
      {
        intakeSlug: "legal/intake/2026-09-26/a",
        caseSlug: "legal/cases/mk-26-0042-a",
        engagementLetterSlug: "intake/x/engagement-letter-1",
      }
    );
    expect(r).toEqual({
      powers_of_attorney: ["legal/poa/p1"],
      fee_agreements: ["legal/fee-agreements/f1"],
      documents: ["intake/x/engagement-letter-1"],
      failed: [],
    });
    expect(patches.map((p) => p.slug)).toEqual([
      "legal/poa/p1",
      "legal/fee-agreements/f1",
      "intake/x/engagement-letter-1",
    ]);
    for (const p of patches) {
      expect((p.frontmatter as Record<string, unknown>).case_slug).toBe("legal/cases/mk-26-0042-a");
    }
  });

  it("records it could not move are named, not dropped", async () => {
    patchOk = false;
    listed.set("power_of_attorney", [
      { slug: "legal/poa/p1", frontmatter: { case_slug: "legal/intake/2026-09-26/a" } },
    ]);
    const r = await relinkIntakeRecords(
      {},
      { intakeSlug: "legal/intake/2026-09-26/a", caseSlug: "legal/cases/c" }
    );
    expect(r.failed).toEqual(["legal/poa/p1"]);
  });
});
