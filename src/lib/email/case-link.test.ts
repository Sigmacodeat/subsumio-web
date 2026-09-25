import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));

import {
  MAX_CASE_ACCESS_CHECKS,
  blockedCasesForUser,
  caseAccessAllowed,
  caseAccessForUser,
} from "./case-link";

function engine(pages: Record<string, unknown>, opts: { throwFor?: string } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const slug = decodeURIComponent(url.replace("http://engine.test/api/pages/", ""));
      if (slug === opts.throwFor) throw new Error("engine down");
      return slug in pages
        ? new Response(JSON.stringify(pages[slug]), { status: 200 })
        : new Response("{}", { status: 404 });
    })
  );
}

const open = { type: "legal_case", frontmatter: {} };
const walled = {
  type: "legal_case",
  frontmatter: { permissions: { blocked_users: ["u1"] } },
};

afterEach(() => vi.unstubAllGlobals());

describe("case access (fail-closed)", () => {
  it("only 'ok' grants access", () => {
    expect(caseAccessAllowed("ok")).toBe(true);
    expect(caseAccessAllowed("blocked")).toBe(false);
    expect(caseAccessAllowed("not_found")).toBe(false);
  });

  it("classifies wall, out-of-scope 404 and non-matter pages", async () => {
    engine({ "cases/a": open, "cases/w": walled, "notes/x": { type: "note" } });
    expect(await caseAccessForUser({}, "cases/a", "u1")).toBe("ok");
    expect(await caseAccessForUser({}, "cases/w", "u1")).toBe("blocked");
    expect(await caseAccessForUser({}, "cases/hidden", "u1")).toBe("not_found");
    expect(await caseAccessForUser({}, "notes/x", "u1")).toBe("not_found");
  });

  it("treats walled, out-of-scope and unreachable matters as blocked", async () => {
    engine({ "cases/a": open, "cases/w": walled }, { throwFor: "cases/err" });
    const blocked = await blockedCasesForUser(
      {},
      ["cases/a", "cases/w", "cases/hidden", "cases/err", ""],
      "u1"
    );
    expect([...blocked].sort()).toEqual(["cases/err", "cases/hidden", "cases/w"]);
  });

  it("counts matters beyond the check budget as blocked instead of letting them through", async () => {
    const pages: Record<string, unknown> = {};
    const slugs: string[] = [];
    for (let i = 0; i < MAX_CASE_ACCESS_CHECKS + 5; i++) {
      pages[`cases/c${i}`] = open;
      slugs.push(`cases/c${i}`);
    }
    engine(pages);
    const blocked = await blockedCasesForUser({}, slugs, "u1");
    expect(blocked.size).toBe(5);
    expect(blocked.has(`cases/c${MAX_CASE_ACCESS_CHECKS}`)).toBe(true);
    expect(blocked.has("cases/c0")).toBe(false);
  });
});
