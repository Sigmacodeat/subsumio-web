import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  fm: {} as Record<string, unknown>,
  mails: [] as Array<{ to: string; subject: string; text: string }>,
}));

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine",
  enginePatchPage: vi.fn(async (_h: unknown, body: { frontmatter: Record<string, unknown> }) => {
    state.fm = { ...state.fm, ...body.frontmatter };
    return new Response("{}");
  }),
}));
vi.mock("@/lib/mail", () => ({
  siteUrl: () => "https://app.test",
  sendMail: vi.fn(async (m: { to: string; subject: string; text: string }) => {
    state.mails.push(m);
    return { sent: true };
  }),
}));

import { confirmPortalNotify, mailPortalClients, requestPortalNotify } from "./portal-notify";

beforeEach(() => {
  state.fm = {};
  state.mails = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ frontmatter: state.fm }))
  );
});

describe("portal e-mail notifications", () => {
  it("mails only after the client confirmed the address, and without content", async () => {
    await requestPortalNotify({
      headers: {},
      caseSlug: "cases/a",
      token: "tok",
      email: "Kunde@Example.at ",
    });
    expect(state.mails[0]!.to).toBe("kunde@example.at");
    expect(await mailPortalClients({}, "cases/a")).toBe(0);

    const code = new URL(state.mails[0]!.text.match(/https:\S+/)![0]).searchParams.get("code")!;
    expect(await confirmPortalNotify({}, "cases/a", "wrong-code-that-is-long-enough")).toBe(false);
    expect(await confirmPortalNotify({}, "cases/a", code)).toBe(true);

    state.mails = [];
    expect(await mailPortalClients({}, "cases/a")).toBe(1);
    expect(state.mails[0]!.text).toContain("https://app.test/portal/tok");
    expect(state.mails[0]!.subject).toBe("Neue Nachricht Ihrer Kanzlei");
  });
});
