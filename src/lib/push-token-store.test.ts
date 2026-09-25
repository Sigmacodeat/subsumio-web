// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));
vi.mock("@/lib/schema-init", () => ({ createSchemaInit: () => async () => {} }));

import {
  deletePushTokensForUser,
  getPushTokensForUser,
  registerPushToken,
  unregisterPushEndpoint,
} from "./push-token-store";
import { revokeAllSessions } from "@/lib/auth/revocation-store";

const webToken = (endpoint: string) =>
  JSON.stringify({ endpoint, keys: { p256dh: "k", auth: "a" } });

describe("push registrations follow the sign-in state", () => {
  it("logout with the browser's endpoint removes only that device", async () => {
    await registerPushToken("u-logout", webToken("https://push.example/a"), "web", "web:a");
    await registerPushToken("u-logout", webToken("https://push.example/b"), "web", "web:b");
    expect(await unregisterPushEndpoint("u-logout", "https://push.example/a")).toBe(1);
    const left = await getPushTokensForUser("u-logout");
    expect(left.map((t) => t.deviceId)).toEqual(["web:b"]);
  });

  it("signing out everywhere (deactivation, reset) removes every registration", async () => {
    await registerPushToken("u-deact", webToken("https://push.example/c"), "web", "web:c");
    await registerPushToken("u-deact", "apns-token", "ios", "ios:1");
    await revokeAllSessions("u-deact");
    expect(await getPushTokensForUser("u-deact")).toEqual([]);
  });

  it("'sign out other devices' keeps the calling browser", async () => {
    await registerPushToken("u-others", webToken("https://push.example/me"), "web", "web:me");
    await registerPushToken("u-others", webToken("https://push.example/old"), "web", "web:old");
    await registerPushToken("u-others", "fcm-token", "android", "android:1");
    expect(
      await deletePushTokensForUser("u-others", { exceptEndpoint: "https://push.example/me" })
    ).toBe(2);
    expect((await getPushTokensForUser("u-others")).map((t) => t.deviceId)).toEqual(["web:me"]);
  });
});
