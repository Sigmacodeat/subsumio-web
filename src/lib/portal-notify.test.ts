import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  fm: {} as Record<string, unknown>,
  mails: [] as Array<{ to: string; subject: string; text: string }>,
}));

vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
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

import {
  confirmPortalNotify,
  lookupPortalNotifyCode,
  mailPortalClients,
  requestPortalNotify,
} from "./portal-notify";

const TOKEN = "PORTAL-TOKEN-SECRET-xyz";

beforeEach(() => {
  state.fm = {};
  state.mails = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ frontmatter: state.fm }))
  );
});

function request(email: string) {
  return requestPortalNotify({ headers: {}, brainId: "brain_1", caseSlug: "cases/a", email });
}

function codeFrom(text: string): string {
  return new URL(text.match(/https:\S+/)![0]).searchParams.get("code")!;
}

describe("portal e-mail notifications", () => {
  it("mails only after the client confirmed the address, and without content", async () => {
    await request("Kunde@Example.at ");
    expect(state.mails[0]!.to).toBe("kunde@example.at");
    expect(await mailPortalClients({}, "cases/a")).toBe(0);

    const code = codeFrom(state.mails[0]!.text);
    expect(await confirmPortalNotify({}, "cases/a", "wrong-code-that-is-long-enough")).toBe(false);
    expect(await confirmPortalNotify({}, "cases/a", code)).toBe(true);

    state.mails = [];
    expect(await mailPortalClients({}, "cases/a")).toBe(1);
    expect(state.mails[0]!.text).toContain("https://app.test/portal/meine-akte");
    expect(state.mails[0]!.subject).toBe("Neue Nachricht Ihrer Kanzlei");
  });

  it("stores no portal token on the matter, and the confirmation link carries none", async () => {
    await request("kunde@example.at");
    expect(JSON.stringify(state.fm)).not.toContain(TOKEN);
    expect(JSON.stringify(state.fm)).not.toContain("/portal/");
    const link = state.mails[0]!.text.match(/https:\S+/)![0];
    expect(new URL(link).searchParams.has("token")).toBe(false);
    // The code alone finds the matter.
    expect(await lookupPortalNotifyCode(codeFrom(state.mails[0]!.text))).toEqual({
      brainId: "brain_1",
      caseSlug: "cases/a",
    });
  });

  it("drops a token-bearing link stored by older versions", async () => {
    state.fm = {
      portal_notify: [
        {
          email: "alt@example.at",
          status: "active",
          path: `/portal/${TOKEN}`,
          requested_at: "2026-01-01",
        },
      ],
    };
    await request("neu@example.at");
    expect(JSON.stringify(state.fm)).not.toContain(TOKEN);
  });

  it("six new unconfirmed requests do not displace a confirmed address", async () => {
    await request("mandant@example.at");
    await confirmPortalNotify({}, "cases/a", codeFrom(state.mails[0]!.text));
    for (let i = 0; i < 6; i++) await request(`fremd${i}@example.at`);
    const entries = state.fm.portal_notify as Array<{ email: string; status: string }>;
    expect(entries.find((e) => e.email === "mandant@example.at")?.status).toBe("active");
    expect(entries.filter((e) => e.status === "pending")).toHaveLength(5);
  });
});
