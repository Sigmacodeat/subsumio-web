// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  createCaseSafely,
  generateCaseSlug,
  normalizeCaseNumber,
  type SafeCaseCreateDeps,
} from "./safe-case-create";
import type { CurrentPageRead } from "./page-write-guards";

function fakeDeps(opts: {
  existing?: string[];
  readError?: boolean;
  conflictsFor?: string[];
  conflictUnavailable?: boolean;
  writeFails?: number;
}): SafeCaseCreateDeps & { writes: Array<{ slug: string; frontmatter: Record<string, unknown> }> } {
  const existing = new Set(opts.existing ?? []);
  const writes: Array<{ slug: string; frontmatter: Record<string, unknown> }> = [];
  return {
    writes,
    readPage: vi.fn(async (slug: string): Promise<CurrentPageRead> => {
      if (opts.readError) return { kind: "error" };
      return existing.has(slug) ? { kind: "found", page: { slug } } : { kind: "missing" };
    }),
    conflictCheck: vi.fn(async (name: string) => {
      if (opts.conflictUnavailable) throw new Error("down");
      return (opts.conflictsFor ?? []).includes(name)
        ? [{ name, slug: "contacts/x", type: "legal_contact" }]
        : [];
    }),
    writePage: vi.fn(async (page) => {
      if (opts.writeFails) return { ok: false as const, status: opts.writeFails, message: "" };
      writes.push({ slug: page.slug, frontmatter: page.frontmatter });
      return { ok: true as const };
    }),
  };
}

const base = {
  title: "1 Cg 12/24 — Max Muster",
  frontmatter: {
    client_name: "Max Muster",
    opponent_name: "Gegner GmbH",
    case_number: "1 Cg 12/24",
  },
  slugHint: "1 Cg 12/24",
};

describe("createCaseSafely", () => {
  it("creates with a server slug: readable hint plus random suffix, never the hint alone", async () => {
    const deps = fakeDeps({});
    const res = await createCaseSafely(deps, base);
    expect(res.status).toBe("created");
    const slug = (res as { slug: string }).slug;
    expect(slug).toMatch(/^legal\/cases\/1-cg-12-24-[0-9a-f]{8}$/);
    expect(slug).not.toBe("legal/cases/1-cg-12-24");
    expect(deps.writes[0]!.frontmatter).toMatchObject({
      type: "legal_case",
      conflict_status: "conflict_cleared",
    });
  });

  it("two creates with the same Aktenzeichen get different slugs", () => {
    expect(generateCaseSlug("2025/0042")).not.toBe(generateCaseSlug("2025/0042"));
  });

  it("never writes over a requested slug that already exists", async () => {
    const deps = fakeDeps({ existing: ["legal/cases/mueller"] });
    const res = await createCaseSafely(deps, { ...base, requestedSlug: "legal/cases/mueller" });
    expect(res).toEqual({ status: "exists", slug: "legal/cases/mueller" });
    expect(deps.writePage).not.toHaveBeenCalled();
    expect(deps.conflictCheck).not.toHaveBeenCalled();
  });

  it("rejects a requested slug outside legal/cases/", async () => {
    const deps = fakeDeps({});
    const res = await createCaseSafely(deps, { ...base, requestedSlug: "legal/invoices/r-1" });
    expect(res).toMatchObject({ status: "error", code: "invalid_case_slug" });
    expect(deps.writePage).not.toHaveBeenCalled();
  });

  it("writes nothing when the existence check fails (fail closed)", async () => {
    const deps = fakeDeps({ readError: true });
    const res = await createCaseSafely(deps, base);
    expect(res).toMatchObject({ status: "error", code: "guard_unavailable" });
    expect(deps.writePage).not.toHaveBeenCalled();
  });

  it("checks every party and writes nothing on a conflict hit", async () => {
    const deps = fakeDeps({ conflictsFor: ["Gegner GmbH"] });
    const res = await createCaseSafely(deps, base);
    expect(res.status).toBe("conflict");
    expect(deps.conflictCheck).toHaveBeenCalledWith("Max Muster", "client", []);
    expect(deps.conflictCheck).toHaveBeenCalledWith("Gegner GmbH", "opponent", []);
    expect(deps.writePage).not.toHaveBeenCalled();
  });

  it("writes nothing when the conflict check is unavailable", async () => {
    const deps = fakeDeps({ conflictUnavailable: true });
    const res = await createCaseSafely(deps, base);
    expect(res).toMatchObject({ status: "error", code: "conflict_check_unavailable" });
    expect(deps.writePage).not.toHaveBeenCalled();
  });

  it("reports an engine refusal as an error, not as created", async () => {
    const deps = fakeDeps({ writeFails: 500 });
    const res = await createCaseSafely(deps, base);
    expect(res).toMatchObject({ status: "error", code: "engine_write_failed" });
  });
});

describe("normalizeCaseNumber", () => {
  it("ignores case and spacing but keeps separators", () => {
    expect(normalizeCaseNumber("  1  Cg 12/24 ")).toBe(normalizeCaseNumber("1 cg 12/24"));
    expect(normalizeCaseNumber("1 Cg 12/24")).not.toBe(normalizeCaseNumber("1-Cg-12-24"));
  });
});
