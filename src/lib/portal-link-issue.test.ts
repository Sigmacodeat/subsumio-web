// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ register: vi.fn(), casePage: null as unknown }));

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/mail", () => ({ siteUrl: () => "https://app.example" }));
vi.mock("@/lib/portal-links", () => ({
  registerPortalLink: (...a: unknown[]) => m.register(...a),
}));
vi.mock("@/lib/portal-token", () => ({
  signPortalToken: async () => "tok.en",
  verifyPortalToken: async () => ({ exp: 2_000_000_000 }),
}));

import { issueRegisteredPortalLink } from "./portal-link-issue";

const input = {
  headers: { "x-subsumio-source": "brain-at" },
  brainId: "brain-at",
  caseSlug: "legal/cases/a",
  createdBy: "system:test",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      m.casePage ? Response.json(m.casePage) : new Response("nf", { status: 404 })
    )
  );
});

describe("issueRegisteredPortalLink", () => {
  it("issues an absolute link and registers only its hash entry", async () => {
    m.casePage = { frontmatter: { portal_enabled: true } };
    const url = await issueRegisteredPortalLink(input);
    expect(url).toBe("https://app.example/portal/tok.en");
    expect(m.register).toHaveBeenCalledWith(
      input.headers,
      "legal/cases/a",
      expect.objectContaining({ token: "tok.en", created_by: "system:test" })
    );
  });

  it("issues nothing for a matter without portal release or an archived one", async () => {
    m.casePage = { frontmatter: { portal_enabled: false } };
    expect(await issueRegisteredPortalLink(input)).toBeNull();
    m.casePage = { frontmatter: { portal_enabled: true, status: "archived" } };
    expect(await issueRegisteredPortalLink(input)).toBeNull();
    m.casePage = null;
    expect(await issueRegisteredPortalLink(input)).toBeNull();
    expect(m.register).not.toHaveBeenCalled();
  });
});
