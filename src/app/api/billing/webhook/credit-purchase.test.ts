// @vitest-environment node
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const credited = new Set<string>();
const addCredits = vi.fn(
  async (_owner: string, _type: string, _credits: number, opts: { stripeSessionId?: string }) => {
    // Same idempotency as the real ledger: keyed on the checkout session.
    credited.add(`credit-purchase-${opts.stripeSessionId}`);
  }
);

vi.mock("@/lib/billing/credits", () => ({
  addCredits: (...a: Parameters<typeof addCredits>) => addCredits(...a),
  getCreditPack: () => ({ id: "p1", name: "Pack", credits: 100 }),
}));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getById: async () => ({ id: "u1" }), update: vi.fn() }),
  getOrgStore: () => ({ getById: async () => null }),
  getSharedPgPool: () => null,
}));
vi.mock("@/lib/billing/billing-account", () => ({
  billingAccountFor: () => ({ ownerId: "u1", ownerType: "user" }),
}));
vi.mock("./helpers", () => ({
  isDuplicateEvent: async () => false,
  markEventProcessed: async () => undefined,
}));
vi.mock("@/lib/billing/saas-billing-sync", () => ({
  createSaasOrgForUser: vi.fn(),
  updateSaasPlan: vi.fn(),
  cancelSaasOrg: vi.fn(),
}));
vi.mock("@/lib/billing/plans", () => ({ planForPriceId: () => null }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(), isMailConfigured: () => false }));
vi.mock("@/lib/billing/dunning", () => ({
  incrementFailure: vi.fn(),
  resetFailure: vi.fn(),
  applyDunningToPlan: vi.fn(),
  getDunningState: vi.fn(),
  buildDunningEmailBody: vi.fn(),
  buildReactivationEmailBody: vi.fn(),
}));
vi.mock("@/lib/api-handler", () => ({
  createWebhookHandler:
    (_o: unknown, fn: (body: unknown, req: Request) => Promise<Response>) => (req: Request) =>
      fn(undefined, req),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const SECRET = "whsec_test";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;

import { POST } from "./route";
import { checkoutIsPaid, verifyStripeSignature } from "@/lib/stripe-webhook";

function signed(event: unknown): Request {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", SECRET).update(`${t}.${payload}`).digest("hex");
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${t},v1=${sig}` },
    body: payload,
  });
}

const session = (payment_status: string) => ({
  id: "cs_1",
  client_reference_id: "u1",
  payment_status,
  metadata: { purchase_type: "credits", pack_id: "p1" },
});

const call = (req: Request) => (POST as unknown as (r: Request) => Promise<Response>)(req);

beforeEach(() => {
  addCredits.mockClear();
  credited.clear();
});

describe("Stripe credit purchase (GELD-22)", () => {
  it("completed but unpaid (delayed method): no credit", async () => {
    await call(
      signed({
        id: "evt_1",
        type: "checkout.session.completed",
        data: { object: session("unpaid") },
      })
    );
    expect(addCredits).not.toHaveBeenCalled();
  });

  it("then async_payment_succeeded: credited exactly once", async () => {
    await call(
      signed({
        id: "evt_1",
        type: "checkout.session.completed",
        data: { object: session("unpaid") },
      })
    );
    await call(
      signed({
        id: "evt_2",
        type: "checkout.session.async_payment_succeeded",
        data: { object: session("paid") },
      })
    );
    expect(addCredits).toHaveBeenCalledOnce();
    expect(credited).toEqual(new Set(["credit-purchase-cs_1"]));
  });

  it("paid at completion: credited", async () => {
    await call(
      signed({ id: "evt_3", type: "checkout.session.completed", data: { object: session("paid") } })
    );
    expect(addCredits).toHaveBeenCalledOnce();
  });

  it("async_payment_failed: nothing credited", async () => {
    await call(
      signed({
        id: "evt_4",
        type: "checkout.session.async_payment_failed",
        data: { object: session("unpaid") },
      })
    );
    expect(addCredits).not.toHaveBeenCalled();
  });

  it("checkoutIsPaid", () => {
    expect(checkoutIsPaid("checkout.session.completed", { payment_status: "unpaid" })).toBe(false);
    expect(checkoutIsPaid("checkout.session.completed", { payment_status: "paid" })).toBe(true);
  });
});

describe("Stripe signature during secret rotation (GELD-25)", () => {
  it("accepts a header whose second v1 signature matches", () => {
    const payload = '{"id":"evt"}';
    const t = Math.floor(Date.now() / 1000);
    const good = createHmac("sha256", SECRET).update(`${t}.${payload}`).digest("hex");
    const other = createHmac("sha256", "whsec_old").update(`${t}.${payload}`).digest("hex");
    expect(verifyStripeSignature(payload, `t=${t},v1=${good},v1=${other}`, SECRET)).toBe(true);
    expect(verifyStripeSignature(payload, `t=${t},v1=${other},v1=${good}`, SECRET)).toBe(true);
    expect(verifyStripeSignature(payload, `t=${t},v1=${other}`, SECRET)).toBe(false);
  });
});
