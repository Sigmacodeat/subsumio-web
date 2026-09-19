// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sent = vi.hoisted(() => [] as Array<{ endpoint: string; payload: string }>);

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
  clientIp: () => "203.0.113.7",
}));
vi.mock("@/lib/portal-token", () => ({
  verifyPortalToken: vi.fn(async (t: string) =>
    t === "tok" ? { case_slug: "cases/mueller", brain_id: "brain_a", exp: 9_999_999_999 } : null
  ),
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string) => {
      sent.push({ endpoint: sub.endpoint, payload });
    }),
  },
}));

import * as documentRoute from "./document/route";
import * as pushRoute from "./push/route";
import * as manifestRoute from "./manifest/route";
import * as sessionRoute from "./session/route";
import { isPushServiceEndpoint, notifyPortalClients } from "@/lib/portal-push";

const ENGINE = "http://localhost:3001";
const FCM = "https://fcm.googleapis.com/fcm/send/abc123";

function engine(caseFm: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === `${ENGINE}/api/pages/cases%2Fmueller`) {
        return Response.json({ slug: "cases/mueller", frontmatter: caseFm });
      }
      if (url === `${ENGINE}/api/files/docs/urteil`) {
        return new Response("%PDF", {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="u.pdf"',
          },
        });
      }
      return new Response("{}", { status: 404 });
    })
  );
}

const openCase = {
  portal_enabled: true,
  status: "open",
  documents: [
    { slug: "docs/urteil", name: "Urteil", portal_visible: true },
    { slug: "docs/intern", name: "Notiz", portal_visible: false },
  ],
};

beforeEach(() => {
  sent.length = 0;
  vi.stubEnv("SUBSUMIO_API_URL", ENGINE);
  vi.stubEnv("WEB_PUSH_PUBLIC_KEY", "pub");
  vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "priv");
});

describe("portal document", () => {
  const get = (slug: string, token = "tok") =>
    documentRoute.GET(new NextRequest(`http://x/api/portal/document?token=${token}&slug=${slug}`));

  it("opens a released document inline", async () => {
    engine(openCase);
    const res = await get("docs/urteil");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^inline/);
  });

  it("refuses unreleased documents, other tokens and closed portals", async () => {
    engine(openCase);
    expect((await get("docs/intern")).status).toBe(404);
    expect((await get("docs/urteil", "other")).status).toBe(403);
    engine({ ...openCase, portal_enabled: false });
    expect((await get("docs/urteil")).status).toBe(403);
  });
});

describe("portal push", () => {
  const post = (body: unknown) =>
    pushRoute.POST(
      new NextRequest("http://x/api/portal/push", { method: "POST", body: JSON.stringify(body) })
    );

  it("accepts only real push services", () => {
    expect(isPushServiceEndpoint(FCM)).toBe(true);
    expect(isPushServiceEndpoint("https://web.push.apple.com/QX")).toBe(true);
    expect(isPushServiceEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPushServiceEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(isPushServiceEndpoint("https://fcm.googleapis.com.evil.at/x")).toBe(false);
  });

  it("subscribes a device and tells it about a reply without the content", async () => {
    engine(openCase);
    const keys = { p256dh: "k", auth: "a" };
    expect(
      (await post({ token: "tok", subscription: { endpoint: "https://10.0.0.1/x", keys } })).status
    ).toBe(400);
    expect((await post({ token: "tok", subscription: { endpoint: FCM, keys } })).status).toBe(200);

    const reached = await notifyPortalClients("brain_a", "cases/mueller", {
      title: "Neue Nachricht Ihrer Kanzlei",
      body: "Ihre Kanzlei hat Ihnen im Mandantenportal geantwortet.",
    });
    expect(reached).toBe(1);
    const payload = JSON.parse(sent[0]!.payload);
    expect(payload).toMatchObject({
      title: "Neue Nachricht Ihrer Kanzlei",
      data: { url: "/portal/tok" },
    });
    expect(await notifyPortalClients("brain_b", "cases/mueller", payload)).toBe(0);
  });
});

describe("portal manifest", () => {
  it("installs as this client's matter", async () => {
    const res = await manifestRoute.GET(new Request("http://x/api/portal/manifest?token=tok"));
    const manifest = await res.json();
    expect(manifest).toMatchObject({
      start_url: "/portal/tok",
      scope: "/portal/",
      display: "standalone",
    });
    expect(
      (await manifestRoute.GET(new Request("http://x/api/portal/manifest?token=bad"))).status
    ).toBe(404);
  });
});

describe("portal session", () => {
  it("swaps the link's token for an HttpOnly cookie the routes accept", async () => {
    engine(openCase);
    const res = await sessionRoute.POST(
      new NextRequest("http://x/api/portal/session", {
        method: "POST",
        body: JSON.stringify({ token: "tok" }),
      })
    );
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^subsumio_portal=tok;/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");

    const withCookie = await documentRoute.GET(
      new NextRequest("http://x/api/portal/document?token=meine-akte&slug=docs/urteil", {
        headers: { cookie: "other=1; subsumio_portal=tok" },
      })
    );
    expect(withCookie.status).toBe(200);
    const without = await documentRoute.GET(
      new NextRequest("http://x/api/portal/document?token=meine-akte&slug=docs/urteil")
    );
    expect(without.status).toBe(403);
  });

  it("refuses an invalid token and signs out", async () => {
    const bad = await sessionRoute.POST(
      new NextRequest("http://x/api/portal/session", {
        method: "POST",
        body: JSON.stringify({ token: "bad" }),
      })
    );
    expect(bad.status).toBe(403);
    const out = await sessionRoute.DELETE(
      new NextRequest("http://x/api/portal/session", { method: "DELETE" })
    );
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
