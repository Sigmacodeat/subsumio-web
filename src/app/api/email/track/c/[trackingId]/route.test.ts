// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session-core", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session-core")>()),
  getAuthSecret: () => "test-secret",
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
  clientIp: () => "203.0.113.1",
}));
const logged: Array<{ trackingId: string }> = [];
vi.mock("@/lib/email/tracking", async (orig) => {
  const real = await orig<typeof import("@/lib/email/tracking")>();
  return {
    ...real,
    logTrackingEvent: vi.fn(async (e: { trackingId: string }) => {
      logged.push(e);
      return null;
    }),
    getMessageIdByTrackingId: vi.fn(async () => null),
    getFirstOpenEvent: vi.fn(async () => null),
  };
});

import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { injectTracking } from "@/lib/email/tracking";
import { GET } from "./route";

function linkOf(trackingId: string) {
  const html = injectTracking('<a href="https://example.com/ziel">x</a>', trackingId);
  const m = html.match(/href="([^"]+)"/)!;
  return new URL(m[1]!);
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  logged.length = 0;
});

describe("click tracking redirect", () => {
  it("a link of this mail redirects and is counted", async () => {
    const u = linkOf("trk_a");
    const res = await GET(new NextRequest(`http://x${u.pathname}${u.search}`));
    expect(res.headers.get("location")).toBe("https://example.com/ziel");
    await flush();
    expect(logged.map((e) => e.trackingId)).toEqual(["trk_a"]);
  });

  it("the signed target of one mail is not accepted under another tracking id", async () => {
    const u = linkOf("trk_a");
    const path = u.pathname.replace("trk_a", "trk_b");
    const res = await GET(new NextRequest(`http://x${path}${u.search}`));
    expect(res.headers.get("location")).not.toBe("https://example.com/ziel");
    await flush();
    expect(logged).toHaveLength(0);
  });

  it("links from older mails (target-only signature) still redirect but are not counted", async () => {
    const encoded = Buffer.from("https://example.com/alt").toString("base64url");
    const sig = createHmac("sha256", "test-secret").update(encoded).digest("base64url");
    const res = await GET(
      new NextRequest(`http://x/api/email/track/c/trk_x?l=lnk_1&u=${encoded}&s=${sig}`)
    );
    expect(res.headers.get("location")).toBe("https://example.com/alt");
    await flush();
    expect(logged).toHaveLength(0);
  });
});
