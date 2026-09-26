// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));

import { checkStoredPageRelease } from "./ai-release-guard";
import { contentHashOf, signRelease } from "./ai-release";

function page(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(body, { status }))
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("checkStoredPageRelease (E-Mail-Anhang, Portal-Download)", () => {
  it("lets documents without AI origin through", async () => {
    page({ content: "Upload", frontmatter: {} });
    expect(await checkStoredPageRelease({}, "docs/a", "b1")).toEqual({ ok: true, ai: false });
  });

  it("blocks an AI draft without release", async () => {
    page({ content: "KI", frontmatter: { ai_generated: true } });
    expect(await checkStoredPageRelease({}, "docs/a", "b1")).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("allows an AI draft whose current text is released", async () => {
    const ai_release = signRelease({
      brainId: "b1",
      contentHash: contentHashOf("KI"),
      state: "VERIFIED",
      releasedBy: "u1",
      releasedAt: "2026-09-24T10:00:00.000Z",
      citationsVerified: 0,
      citationsUnverified: 0,
    });
    page({ content: "KI", frontmatter: { ai_generated: true, ai_release } });
    expect(await checkStoredPageRelease({}, "docs/a", "b1")).toEqual({ ok: true, ai: true });
  });

  it("fails closed when the page cannot be read", async () => {
    page({}, 500);
    expect(await checkStoredPageRelease({}, "docs/a", "b1")).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });
});
