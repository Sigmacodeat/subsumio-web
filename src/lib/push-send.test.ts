// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const m = vi.hoisted(() => ({
  tokens: [] as Array<{ token: string; platform: string }>,
  removed: [] as string[],
}));
vi.mock("./push-token-store", () => ({
  getPushTokensForUser: async () =>
    m.tokens.map((t, i) => ({
      id: String(i),
      userId: "u1",
      deviceId: null,
      createdAt: "",
      lastUsedAt: null,
      ...t,
    })),
  unregisterPushToken: async (_u: string, token: string) => void m.removed.push(token),
  deletePushTokensForUser: async () => 0,
}));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getById: async (id: string) => ({ id, deactivatedAt: null }) }),
}));

import { sendPushToUser, setHttp2PostForTests } from "./push-send";

const dir = mkdtempSync(join(tmpdir(), "push-"));
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const apnsKeyPath = join(dir, "apns.p8");
writeFileSync(apnsKeyPath, ec.privateKey.export({ type: "pkcs8", format: "pem" }));
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const fcmPath = join(dir, "fcm.json");
writeFileSync(
  fcmPath,
  JSON.stringify({
    project_id: "proj-1",
    client_email: "svc@proj-1.iam.example",
    private_key: rsa.privateKey.export({ type: "pkcs8", format: "pem" }),
  })
);

const payload = { title: "Frist", body: "morgen" };

beforeEach(() => {
  m.tokens = [];
  m.removed = [];
  delete process.env.APNS_KEY_ID;
  delete process.env.APNS_TEAM_ID;
  delete process.env.APNS_BUNDLE_ID;
  delete process.env.APNS_PRIVATE_KEY_PATH;
  delete process.env.FCM_SERVICE_ACCOUNT_PATH;
});
afterEach(() => {
  vi.unstubAllGlobals();
  setHttp2PostForTests(null);
});

describe("native push (R8-12)", () => {
  it("an iOS/Android device without provider configuration counts as not sent", async () => {
    m.tokens = [
      { token: "ios-tok", platform: "ios" },
      { token: "and-tok", platform: "android" },
    ];
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendPushToUser("u1", payload)).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("FCM uses the v1 endpoint and removes an UNREGISTERED token", async () => {
    process.env.FCM_SERVICE_ACCOUNT_PATH = fcmPath;
    m.tokens = [{ token: "and-tok", platform: "android" }];
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        if (String(url).includes("oauth2.googleapis.com")) {
          return Response.json({ access_token: "ya29", expires_in: 3600 });
        }
        return Response.json(
          { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } },
          { status: 404 }
        );
      })
    );
    expect(await sendPushToUser("u1", payload)).toBe(0);
    expect(urls).toContain("https://fcm.googleapis.com/v1/projects/proj-1/messages:send");
    expect(urls.some((u) => u.endsWith("/fcm/send"))).toBe(false);
    expect(m.removed).toEqual(["and-tok"]);
  });

  it("APNs goes over HTTP/2; a 410 removes the token, a 200 counts", async () => {
    process.env.APNS_KEY_ID = "KID";
    process.env.APNS_TEAM_ID = "TEAM";
    process.env.APNS_BUNDLE_ID = "io.subsumio.app";
    process.env.APNS_PRIVATE_KEY_PATH = apnsKeyPath;
    m.tokens = [
      { token: "ios-ok", platform: "ios" },
      { token: "ios-gone", platform: "ios" },
    ];
    const post = vi.fn(async (_o: string, path: string) =>
      path.endsWith("ios-gone")
        ? { status: 410, body: '{"reason":"Unregistered"}' }
        : { status: 200, body: "" }
    );
    setHttp2PostForTests(post);
    expect(await sendPushToUser("u1", payload)).toBe(1);
    expect(post.mock.calls[0][0]).toBe("https://api.sandbox.push.apple.com");
    const auth = (post.mock.calls[0] as unknown as [string, string, Record<string, string>])[2]
      .authorization;
    // ES256 JWT signature in JOSE format: 64 raw bytes.
    expect(Buffer.from(auth.split(".")[2], "base64url").length).toBe(64);
    expect(m.removed).toEqual(["ios-gone"]);
  });
});
