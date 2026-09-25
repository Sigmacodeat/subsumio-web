// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  createCaseSafely,
  engineCaseCreateDeps,
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
  /** Slugs another request creates between the existence check and the write. */
  takenAtWrite?: number;
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
      if (opts.takenAtWrite && opts.takenAtWrite > 0) {
        opts.takenAtWrite--;
        return { ok: false as const, exists: true as const };
      }
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

describe("createCaseSafely — slug taken between check and write", () => {
  it("a generated slug taken at write time is retried with a fresh slug", async () => {
    const deps = fakeDeps({ takenAtWrite: 1 });
    const res = await createCaseSafely(deps, base);
    expect(res.status).toBe("created");
    const calls = vi.mocked(deps.writePage).mock.calls.map((c) => c[0].slug);
    expect(calls).toHaveLength(2);
    expect(calls[0]).not.toBe(calls[1]);
    expect((res as { slug: string }).slug).toBe(calls[1]);
    // The conflict check is not repeated for the new slug.
    expect(deps.conflictCheck).toHaveBeenCalledTimes(2);
  });

  it("gives up after the attempt budget instead of overwriting", async () => {
    const deps = fakeDeps({ takenAtWrite: 99 });
    const res = await createCaseSafely(deps, base);
    expect(res).toMatchObject({ status: "error", code: "case_slug_unavailable" });
    expect(deps.writes).toHaveLength(0);
  });

  it("a requested slug taken at write time is reported as existing", async () => {
    const deps = fakeDeps({ takenAtWrite: 1 });
    const res = await createCaseSafely(deps, { ...base, requestedSlug: "legal/cases/mueller" });
    expect(res).toEqual({ status: "exists", slug: "legal/cases/mueller" });
    expect(deps.writePage).toHaveBeenCalledTimes(1);
  });
});

describe("engineCaseCreateDeps.writePage", () => {
  const page = {
    slug: "legal/cases/a-1",
    title: "A",
    type: "legal_case" as const,
    content: "x",
    frontmatter: {},
  };

  it("writes create-only and maps 409 page_exists to exists", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "page_exists", message: "Page already exists." }), {
        status: 409,
      })
    );
    try {
      const outcome = await engineCaseCreateDeps({}).writePage(page);
      expect(outcome).toEqual({ ok: false, exists: true });
      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
      expect(body).toMatchObject({ slug: "legal/cases/a-1", if_absent: true });
      expect(body.merge).toBeUndefined();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("any other refusal stays an error", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ message: "boom" }), { status: 500 }));
    try {
      const outcome = await engineCaseCreateDeps({}).writePage(page);
      expect(outcome).toEqual({ ok: false, status: 500, message: "boom" });
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe("normalizeCaseNumber", () => {
  it("ignores case and spacing but keeps separators", () => {
    expect(normalizeCaseNumber("  1  Cg 12/24 ")).toBe(normalizeCaseNumber("1 cg 12/24"));
    expect(normalizeCaseNumber("1 Cg 12/24")).not.toBe(normalizeCaseNumber("1-Cg-12-24"));
  });
});
