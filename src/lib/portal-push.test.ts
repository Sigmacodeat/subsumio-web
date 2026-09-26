// @vitest-environment node
// Portal push subscriptions keep no usable access link and end with the
// link's revocation.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => null }));
const revoked = new Set<string>();
vi.mock("@/lib/portal-token", () => ({
  isPortalTokenHashRevoked: vi.fn(async (h: string) => revoked.has(h)),
}));
const sent: Array<{ endpoint: string; url: unknown }> = [];
vi.mock("@/lib/web-push-core", () => ({
  isPushServiceEndpoint: () => true,
  webPushPublicKey: () => "pk",
  sendWebPush: vi.fn(async (sub: { endpoint: string }, msg: { data?: { url?: unknown } }) => {
    sent.push({ endpoint: sub.endpoint, url: msg.data?.url });
    return "sent";
  }),
}));

import {
  PORTAL_PUSH_PATH,
  notifyPortalClients,
  removePortalSubscriptionsFor,
  savePortalSubscription,
  subscriptionsFor,
} from "./portal-push";

const keys = { p256dh: "p", auth: "a" };

beforeEach(async () => {
  sent.length = 0;
  revoked.clear();
  await removePortalSubscriptionsFor("firm", "cases/a");
  await removePortalSubscriptionsFor("firm", "cases/b");
});

describe("portal push", () => {
  it("stores only the link hash and opens the portal without a token in the URL", async () => {
    await savePortalSubscription({
      endpoint: "https://push.example/1",
      keys,
      brainId: "firm",
      caseSlug: "cases/a",
      tokenHash: "h1",
    });
    const subs = await subscriptionsFor("firm", "cases/a");
    expect(JSON.stringify(subs)).not.toContain("/portal/eyJ");
    expect(subs[0].tokenHash).toBe("h1");
    await notifyPortalClients("firm", "cases/a", { title: "t", body: "b" });
    expect(sent).toEqual([{ endpoint: "https://push.example/1", url: PORTAL_PUSH_PATH }]);
  });

  it("after 'revoke all' the matter has no subscriptions left", async () => {
    for (const [i, h] of ["h1", "h2"].entries()) {
      await savePortalSubscription({
        endpoint: `https://push.example/${i}`,
        keys,
        brainId: "firm",
        caseSlug: "cases/a",
        tokenHash: h,
      });
    }
    await savePortalSubscription({
      endpoint: "https://push.example/other",
      keys,
      brainId: "firm",
      caseSlug: "cases/b",
      tokenHash: "h9",
    });
    await removePortalSubscriptionsFor("firm", "cases/a");
    expect(await subscriptionsFor("firm", "cases/a")).toHaveLength(0);
    expect(await subscriptionsFor("firm", "cases/b")).toHaveLength(1);
  });

  it("a revoked link gets no notification and its device is dropped", async () => {
    await savePortalSubscription({
      endpoint: "https://push.example/r",
      keys,
      brainId: "firm",
      caseSlug: "cases/a",
      tokenHash: "gone",
    });
    revoked.add("gone");
    expect(await notifyPortalClients("firm", "cases/a", { title: "t", body: "b" })).toBe(0);
    expect(sent).toHaveLength(0);
    expect(await subscriptionsFor("firm", "cases/a")).toHaveLength(0);
  });
});
