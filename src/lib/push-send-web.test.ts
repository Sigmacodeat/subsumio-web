import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  sent: [] as Array<{
    endpoint: string;
    payload: { title: string; data?: Record<string, string> };
  }>,
  removed: [] as string[],
  result: "sent" as "sent" | "gone" | "failed",
}));

const FCM = "https://fcm.googleapis.com/fcm/send/xyz";
const sub = JSON.stringify({ endpoint: FCM, keys: { p256dh: "k", auth: "a" } });

vi.mock("./push-token-store", () => ({
  getPushTokensForUser: async () => [
    {
      id: "1",
      userId: "u1",
      token: sub,
      platform: "web",
      deviceId: "web:1",
      createdAt: "",
      lastUsedAt: null,
    },
    {
      id: "2",
      userId: "u1",
      token: '{"endpoint":"https://10.0.0.1/x"}',
      platform: "web",
      deviceId: "web:2",
      createdAt: "",
      lastUsedAt: null,
    },
  ],
  unregisterPushToken: async (_u: string, token: string) => {
    calls.removed.push(token);
  },
}));
vi.mock("@/lib/web-push-core", async (orig) => ({
  ...(await orig<typeof import("@/lib/web-push-core")>()),
  sendWebPush: async (
    s: { endpoint: string },
    payload: { title: string; data?: Record<string, string> }
  ) => {
    calls.sent.push({ endpoint: s.endpoint, payload });
    return calls.result;
  },
}));

import { sendPushToUser } from "./push-send";

beforeEach(() => {
  calls.sent = [];
  calls.removed = [];
  calls.result = "sent";
});

describe("sendPushToUser — web", () => {
  it("sends to the browser and opens the matter on click; drops invalid subscriptions", async () => {
    const n = await sendPushToUser("u1", {
      title: "Frist: Berufung",
      body: "Akte Müller",
      data: { case_slug: "cases/mueller", type: "deadline_reminder" },
    });
    expect(n).toBe(1);
    expect(calls.sent).toHaveLength(1);
    expect(calls.sent[0]!.payload.data?.url).toBe("/dashboard/cases/cases/mueller");
    expect(calls.removed).toEqual(['{"endpoint":"https://10.0.0.1/x"}']);
  });

  it("removes a subscription the browser dropped", async () => {
    calls.result = "gone";
    expect(await sendPushToUser("u1", { title: "t", body: "b" })).toBe(0);
    expect(calls.removed).toContain(sub);
  });
});
