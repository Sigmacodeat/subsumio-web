// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const deleted = vi.hoisted(() => [] as string[]);
const caseFetches = vi.hoisted(() => [] as string[]);
const tombstoneCalls = vi.hoisted(
  () => [] as Array<{ slug: string; frontmatter?: Record<string, unknown> }>
);
const audits = vi.hoisted(() => [] as Array<{ action: string; entityId?: string }>);
const pagesByType = vi.hoisted(() => new Map<string, Array<Record<string, unknown>>>());
const listLimits = vi.hoisted(() => [] as number[]);
const casePages = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const settingsByBrain = vi.hoisted(() => new Map<string, Record<string, unknown> | Error>());

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/cron-utils", () => ({
  CRON_FULL_READ_CAP: 100_000,
  getRecipientsByBrain: async () => new Map([["brain_a", [{ id: "u1" }]]]),
}));
vi.mock("@/lib/kanzlei-settings-server", () => ({
  loadKanzleiSettingsForBrain: async (brainId: string) => {
    const s = settingsByBrain.get(brainId);
    if (s instanceof Error) throw s;
    return s ?? {};
  },
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine",
  engineHeadersForBrain: () => ({}),
  enginePatchPage: async (
    _h: unknown,
    body: { slug: string; frontmatter?: Record<string, unknown> }
  ) => {
    tombstoneCalls.push({ slug: body.slug, frontmatter: body.frontmatter });
    return new Response("{}", { status: 200 });
  },
}));
vi.mock("@/lib/engine-pages", () => ({
  listEnginePages: async (
    _h: unknown,
    type: string,
    limit: number,
    opts?: { slugPrefix?: string }
  ) => {
    listLimits.push(limit);
    const all = (pagesByType.get(type) ?? []).slice(0, limit);
    if (!opts?.slugPrefix) return all;
    return all.filter((p) => String(p.slug).startsWith(opts.slugPrefix!));
  },
}));
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async (action: string, _t: string, opts?: { entityId?: string }) => {
    audits.push({ action, entityId: opts?.entityId });
  }),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

// Engine fetch surface: page reads (case legal_hold check) + DELETE (purge).
const realFetch = globalThis.fetch;
beforeEach(() => {
  deleted.length = 0;
  listLimits.length = 0;
  caseFetches.length = 0;
  tombstoneCalls.length = 0;
  audits.length = 0;
  pagesByType.clear();
  casePages.clear();
  settingsByBrain.clear();
  settingsByBrain.set("brain_a", {});
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const m = url.match(/\/api\/pages\/(.+)$/);
    if (init?.method === "DELETE" && m) {
      deleted.push(decodeURIComponent(m[1]!));
      return new Response("{}", { status: 200 });
    }
    if (m && (!init || !init.method || init.method === "GET")) {
      const slug = decodeURIComponent(m[1]!);
      caseFetches.push(slug);
      const page = casePages.get(slug);
      if (!page) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify(page), { status: 200 });
    }
    return realFetch(input as never, init as never);
  }) as typeof fetch;
});

import { GET } from "./route";

const old = new Date(Date.now() - 40 * 86_400_000).toISOString(); // 40d > 30d
const fresh = new Date(Date.now() - 5 * 86_400_000).toISOString(); // 5d < 30d

function tombstoned(slug: string, extra: Record<string, unknown> = {}) {
  return {
    slug,
    title: slug,
    type: "document",
    frontmatter: { status: "tombstoned", tombstoned_at: old, ...extra },
  };
}

async function run() {
  const res = await GET(new NextRequest("http://x/api/cron/trash-purge"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("trash purge cron", () => {
  it("purges expired tombstoned items and audits each one", async () => {
    pagesByType.set("document", [
      tombstoned("docs/old"),
      tombstoned("docs/fresh", { tombstoned_at: fresh }),
    ]);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(deleted).toEqual(["docs/old"]);
    expect(body.purged).toBe(1);
    expect(audits).toEqual([{ action: "trash.purge", entityId: "docs/old" }]);
  });

  it("never purges legal-hold items or documents of a held case", async () => {
    casePages.set("legal/cases/held", {
      slug: "legal/cases/held",
      frontmatter: { legal_hold: true },
    });
    pagesByType.set("document", [
      tombstoned("docs/held", { legal_hold: true }),
      tombstoned("docs/in-held-case", { case_slug: "legal/cases/held" }),
      tombstoned("docs/normal", { case_slug: "legal/cases/free" }),
    ]);
    casePages.set("legal/cases/free", { slug: "legal/cases/free", frontmatter: {} });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(deleted).toEqual(["docs/normal"]);
    expect(body.skippedHold).toBe(2);
  });

  it("skips brains that disabled auto-purge", async () => {
    settingsByBrain.set("brain_a", { trashAutoPurge: false });
    pagesByType.set("document", [tombstoned("docs/old")]);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(deleted).toEqual([]);
    expect(body.brainsDisabled).toBe(1);
  });

  it("fails closed when settings are unreadable", async () => {
    settingsByBrain.set("brain_a", new Error("engine down"));
    pagesByType.set("document", [tombstoned("docs/old")]);
    const { status } = await run();
    expect(status).toBe(500);
    expect(deleted).toEqual([]);
  });

  it("clamps a zero retention to the safe default instead of purging everything", async () => {
    settingsByBrain.set("brain_a", { trashRetentionDays: 0 });
    pagesByType.set("document", [tombstoned("docs/fresh", { tombstoned_at: fresh })]);
    const { status } = await run();
    expect(status).toBe(200);
    expect(deleted).toEqual([]); // 5d < clamped minimum 7d (0 → min clamp)
  });

  it("purges a document's version snapshots along with it", async () => {
    pagesByType.set("document", [tombstoned("docs/old")]);
    pagesByType.set("document_version", [
      { slug: "legal/doc-versions/docs/old/v1", type: "document_version" },
      { slug: "legal/doc-versions/docs/old/v2", type: "document_version" },
      { slug: "legal/doc-versions/docs/other/v1", type: "document_version" },
    ]);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(deleted).toEqual([
      "docs/old",
      "legal/doc-versions/docs/old/v1",
      "legal/doc-versions/docs/old/v2",
    ]);
    expect(body.purged).toBe(3);
  });

  it("does not purge entries without a deletion timestamp", async () => {
    pagesByType.set("document", [
      { slug: "docs/no-date", title: "x", type: "document", frontmatter: { status: "tombstoned" } },
    ]);
    const { status } = await run();
    expect(status).toBe(200);
    expect(deleted).toEqual([]);
  });
});

describe("per-item retention (documents/notes)", () => {
  const pastDate = "2020-01-01";
  const futureDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  function liveDoc(slug: string, extra: Record<string, unknown> = {}) {
    return {
      slug,
      title: slug,
      type: "document",
      created_at: old,
      frontmatter: { ...extra },
    };
  }

  it("tombstones a live document whose retention_until has passed and audits it", async () => {
    pagesByType.set("document", [liveDoc("docs/expired", { retention_until: pastDate })]);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(tombstoneCalls).toEqual([
      {
        slug: "docs/expired",
        frontmatter: expect.objectContaining({
          status: "tombstoned",
          tombstone_reason: "retention_expired",
          tombstoned_by: "cron:retention",
        }),
      },
    ]);
    expect(body.retentionTombstoned).toBe(1);
    expect(audits).toEqual([{ action: "data.delete", entityId: "docs/expired" }]);
    // frisch tombstoned → geht noch nicht in den Purge
    expect(deleted).toEqual([]);
  });

  it("keeps a document whose retention_until is today (expires end of day) or later", async () => {
    const today = new Date().toISOString().slice(0, 10);
    pagesByType.set("document", [
      liveDoc("docs/today", { retention_until: today }),
      liveDoc("docs/future", { retention_until: futureDate }),
      liveDoc("docs/none"),
    ]);
    const { status } = await run();
    expect(status).toBe(200);
    expect(tombstoneCalls).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it("tombstones notes and documents with retention_days past their basis", async () => {
    pagesByType.set("document", [
      liveDoc("docs/old-days", { retention_days: 10 }), // basis: created_at (= old, 40d)
      liveDoc("docs/young-days", { retention_days: 400 }),
    ]);
    pagesByType.set("note", [
      {
        slug: "notes/expired",
        title: "n",
        type: "note",
        frontmatter: { retention_days: 5, retention_from: "2020-01-01" },
      },
    ]);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(tombstoneCalls.map((t) => t.slug).sort()).toEqual(["docs/old-days", "notes/expired"]);
    expect(body.retentionTombstoned).toBe(2);
  });

  it("fails closed on unreadable retention config and reports it", async () => {
    pagesByType.set("document", [liveDoc("docs/bad", { retention_until: "not a date" })]);
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.retentionInvalid).toBe(1);
    expect(tombstoneCalls).toEqual([]);
  });

  it("never tombstones items under legal hold (own flag or parent case)", async () => {
    casePages.set("legal/cases/held", {
      slug: "legal/cases/held",
      frontmatter: { legal_hold: true },
    });
    pagesByType.set("document", [
      liveDoc("docs/held", { retention_until: pastDate, legal_hold: true }),
      liveDoc("docs/in-held-case", {
        retention_until: pastDate,
        case_slug: "legal/cases/held",
      }),
      liveDoc("docs/free", { retention_until: pastDate }),
    ]);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(tombstoneCalls.map((t) => t.slug)).toEqual(["docs/free"]);
    expect(body.skippedHold).toBe(2);
  });

  it("GoBD-stamped receipts never fall below § 132 BAO, whatever retention_until says", async () => {
    // hashed_at 2024 → gesetzlich bis 31.12.2031; ein per Pages-API auf 2020
    // gesetztes retention_until darf den Beleg nicht löschfällig machen.
    pagesByType.set("document", [
      liveDoc("docs/beleg-jung", {
        retention_until: pastDate,
        gobd_retention: true,
        hashed_at: "2024-03-01T10:00:00.000Z",
      }),
      // hashed_at 2015 → gesetzlich bis 31.12.2022 → jetzt wirklich fällig.
      liveDoc("docs/beleg-alt", {
        retention_until: pastDate,
        gobd_retention: true,
        hashed_at: "2015-06-01T10:00:00.000Z",
      }),
      // Stempel ohne hashed_at: Mindestfrist unbestimmbar → fail-closed.
      liveDoc("docs/beleg-kaputt", { retention_until: pastDate, gobd_retention: true }),
    ]);
    const { status, body } = await run();
    expect(status).toBe(500); // wegen beleg-kaputt (retentionInvalid)
    expect(tombstoneCalls.map((t) => t.slug)).toEqual(["docs/beleg-alt"]);
    expect(body.retentionGobdFloored).toBe(1);
    expect(body.retentionInvalid).toBe(1);
    expect(String(body.errors)).toMatch(/beleg-kaputt.*hashed_at/);
  });

  it("treats an unreadable or missing parent case as held (engine 500 / 404)", async () => {
    const inner = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (
        String(input).includes("legal%2Fcases%2Fbroken") ||
        String(input).includes("legal/cases/broken")
      ) {
        return new Response("upstream error", { status: 500 });
      }
      return inner(input as never, init as never);
    }) as typeof fetch;
    pagesByType.set("document", [
      liveDoc("docs/in-broken-case", {
        retention_until: pastDate,
        case_slug: "legal/cases/broken",
      }),
      liveDoc("docs/in-gone-case", { retention_until: pastDate, case_slug: "legal/cases/gone" }),
      liveDoc("docs/free", { retention_until: pastDate }),
    ]);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(tombstoneCalls.map((t) => t.slug)).toEqual(["docs/free"]);
    expect(body.skippedHold).toBe(2);
  });

  it("does not re-tombstone already tombstoned pages", async () => {
    pagesByType.set("document", [tombstoned("docs/trashed", { retention_until: pastDate })]);
    const { status } = await run();
    expect(status).toBe(200);
    expect(tombstoneCalls).toEqual([]);
  });

  it("respects brains that disabled auto-purge", async () => {
    settingsByBrain.set("brain_a", { trashAutoPurge: false });
    pagesByType.set("document", [liveDoc("docs/expired", { retention_until: pastDate })]);
    const { status } = await run();
    expect(status).toBe(200);
    expect(tombstoneCalls).toEqual([]);
  });
});

describe("Aufbewahrungsfrist abgeschlossener Akten (§ 12 RAO, § 132 BAO)", () => {
  const thisYear = new Date().toISOString().slice(0, 10);

  it("never purges an archived matter — it is not in the trash at all", async () => {
    pagesByType.set("legal_case", [
      {
        slug: "legal/cases/done",
        title: "Abgeschlossen",
        type: "legal_case",
        frontmatter: { status: "archived", archived_at: old, closed_at: thisYear },
      },
    ]);
    pagesByType.set("document", [
      tombstoned("docs/archived-with-case", {
        tombstone_reason: "case_archived",
        case_slug: "legal/cases/done",
      }),
    ]);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(deleted).toEqual([]);
    expect(body.purged).toBe(0);
  });

  it("keeps a deleted matter closed this year and counts it as floored", async () => {
    pagesByType.set("legal_case", [
      {
        slug: "legal/cases/closed",
        title: "Geschlossen",
        type: "legal_case",
        frontmatter: {
          status: "tombstoned",
          tombstoned_at: old,
          tombstone_reason: "manual_delete",
          archived_at: old,
          closed_at: thisYear,
        },
      },
    ]);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(deleted).toEqual([]);
    expect(body.retentionCaseFloored).toBe(1);
  });

  it("keeps trash entries of a matter whose period still runs", async () => {
    casePages.set("legal/cases/archived", {
      slug: "legal/cases/archived",
      frontmatter: { status: "archived", closed_at: thisYear },
    });
    pagesByType.set("document", [
      tombstoned("docs/deleted-before-close", { case_slug: "legal/cases/archived" }),
    ]);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(deleted).toEqual([]);
    expect(body.retentionCaseFloored).toBe(1);
  });

  it("purges a matter after the period and the trash window — pages before the matter", async () => {
    const caseFm = {
      status: "tombstoned",
      tombstoned_at: old,
      tombstone_reason: "manual_delete",
      status_before_delete: "archived",
      archived_at: "2015-02-01T10:00:00.000Z",
      closed_at: "2015-02-01T10:00:00.000Z",
      retention_until: "2022-12-31",
    };
    pagesByType.set("legal_case", [
      { slug: "legal/cases/expired", title: "Alt", type: "legal_case", frontmatter: caseFm },
    ]);
    casePages.set("legal/cases/expired", { slug: "legal/cases/expired", frontmatter: caseFm });
    pagesByType.set("document", [
      tombstoned("docs/of-expired", {
        tombstone_reason: "case_deleted",
        case_slug: "legal/cases/expired",
      }),
    ]);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(deleted).toEqual(["docs/of-expired", "legal/cases/expired"]);
    expect(body.retentionCaseFloored).toBe(0);
  });

  it("purges a matter created by mistake after the trash window", async () => {
    pagesByType.set("legal_case", [
      {
        slug: "legal/cases/mistake",
        title: "Irrtum",
        type: "legal_case",
        frontmatter: {
          status: "tombstoned",
          tombstoned_at: old,
          tombstone_reason: "manual_delete",
        },
      },
    ]);
    const { status } = await run();
    expect(status).toBe(200);
    expect(deleted).toEqual(["legal/cases/mistake"]);
  });
});

describe("purge covers every deletable matter page type", () => {
  it("purges an expired deleted matter note", async () => {
    pagesByType.set("legal_note", [
      {
        slug: "notes/n1",
        title: "n",
        type: "legal_note",
        frontmatter: { status: "tombstoned", tombstoned_at: old },
      },
    ]);
    const { status } = await run();
    expect(status).toBe(200);
    expect(deleted).toEqual(["notes/n1"]);
  });
});

describe("AML records: retention end is enforced (§ 12 Abs 3 RAO)", () => {
  function kycPage(extra: Record<string, unknown>) {
    return {
      slug: "legal/kyc/k1",
      title: "KYC",
      type: "kyc_verification",
      frontmatter: {
        case_slug: "legal/cases/m",
        identification: { document_file_slug: "docs/ausweis" },
        ...extra,
      },
    };
  }

  it("tombstones a record past retain_until (older field) together with its ID copy", async () => {
    casePages.set("legal/cases/m", { slug: "legal/cases/m", frontmatter: {} });
    pagesByType.set("kyc_verification", [kycPage({ retain_until: "2020-01-01" })]);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(tombstoneCalls.map((t) => t.slug)).toEqual(["legal/kyc/k1", "docs/ausweis"]);
    expect(tombstoneCalls[1]!.frontmatter).toMatchObject({ tombstone_reason: "retention_expired" });
    expect(body.retentionTombstoned).toBe(2);
  });

  it("keeps it under a legal hold on the matter", async () => {
    casePages.set("legal/cases/m", { slug: "legal/cases/m", frontmatter: { legal_hold: true } });
    pagesByType.set("kyc_verification", [kycPage({ retention_until: "2020-01-01" })]);
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(tombstoneCalls).toEqual([]);
    expect(body.skippedHold).toBe(1);
  });

  it("an expired AML record is purged even while its archived matter is still retained", async () => {
    casePages.set("legal/cases/m", {
      slug: "legal/cases/m",
      frontmatter: { status: "archived", closed_at: new Date().toISOString().slice(0, 10) },
    });
    pagesByType.set("kyc_verification", [
      {
        ...kycPage({ status: "tombstoned", tombstoned_at: old }),
        frontmatter: {
          ...kycPage({}).frontmatter,
          status: "tombstoned",
          tombstoned_at: old,
          tombstone_reason: "retention_expired",
        },
      },
    ]);
    const { status } = await run();
    expect(status).toBe(200);
    expect(deleted).toEqual(["legal/kyc/k1"]);
  });
});

describe("full reads, no silent cap (R12-9)", () => {
  it("reaches an expired entry beyond the first 5 000 of a type", async () => {
    const fresh5d = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const docs = Array.from({ length: 6000 }, (_, i) =>
      tombstoned(`docs/fresh-${i}`, { tombstoned_at: fresh5d })
    );
    docs.push(tombstoned("docs/oldest"));
    pagesByType.set("document", docs);
    const { status } = await run();
    expect(status).toBe(200);
    expect(deleted).toEqual(["docs/oldest"]);
    expect(Math.min(...listLimits)).toBeGreaterThanOrEqual(100_000);
  });
});
