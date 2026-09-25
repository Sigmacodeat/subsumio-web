// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));

import { createPageVisibilityChecker } from "./realtime-access";

function engine(pages: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    const slug = decodeURIComponent(url.replace("http://engine.test/api/pages/", ""));
    return slug in pages
      ? new Response(JSON.stringify(pages[slug]), { status: 200 })
      : new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("createPageVisibilityChecker", () => {
  it("denies pages the engine hides, walled matters and their documents", async () => {
    engine({
      "cases/open": { type: "legal_case", frontmatter: {} },
      "cases/walled": {
        type: "legal_case",
        frontmatter: { permissions: { blocked_users: ["u1"] } },
      },
      "docs/in-walled": { type: "document", frontmatter: { case_slug: "cases/walled" } },
      "docs/in-open": { type: "document", frontmatter: { case_slug: "cases/open" } },
    });
    const can = createPageVisibilityChecker({ "x-subsumio-source": "b" }, "u1");
    expect(await can("cases/open")).toBe(true);
    expect(await can("docs/in-open")).toBe(true);
    expect(await can("cases/walled")).toBe(false);
    expect(await can("docs/in-walled")).toBe(false);
    expect(await can("cases/out-of-scope")).toBe(false);
  });

  it("caches per stream and treats engine errors as not visible", async () => {
    const fetchMock = engine({ "cases/open": { type: "legal_case", frontmatter: {} } });
    const can = createPageVisibilityChecker({}, "u1");
    await can("cases/open");
    await can("cases/open");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      })
    );
    const can2 = createPageVisibilityChecker({}, "u1");
    expect(await can2("cases/open")).toBe(false);
  });
});
