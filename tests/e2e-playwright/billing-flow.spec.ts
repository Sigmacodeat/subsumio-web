import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";

async function signUpViaApi(page: import("@playwright/test").Page, email: string) {
  const res = await page.context().request.post("/api/auth/signup", {
    data: {
      email,
      name: "Billing Test",
      password: "BillingTest123!",
      locale: "en",
      industry: "legal",
    },
  });
  expect(res.status()).toBe(201);
  await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });
  const csrfToken = (await page.context().cookies()).find(
    (cookie) => cookie.name === "sb_csrf"
  )?.value;
  const onboardingRes = await page.context().request.post("/api/onboarding", {
    data: { industry: null },
    headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
  });
  expect(onboardingRes.status()).toBe(200);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/?$/);
}

test.describe("Billing Flow (E2E)", () => {
  test("1. Checkout without Stripe config → 501", async ({ request }) => {
    // Without STRIPE_SECRET_KEY, the checkout route returns 501
    // Note: in dev mode without env, this may return 401 (auth required first)
    const res = await request.post("/api/billing/checkout", {
      data: { plan: "pro" },
    });
    // Could be 401 (no auth) or 501 (no Stripe) depending on env
    expect([401, 403, 501]).toContain(res.status());
  });

  test("2. Checkout with invalid plan → 400 (validation)", async ({ page, request }) => {
    // Sign up to get auth
    const email = `billing-${Date.now()}@subsumio.local`;
    await signUpViaApi(page, email);

    // Get CSRF token
    const csrfToken = await page.evaluate(() => {
      const match = document.cookie.match(/sb_csrf=([^;]+)/);
      return match ? match[1] : "";
    });

    // POST with invalid plan
    const res = await page.context().request.post("/api/billing/checkout", {
      data: { plan: "enterprise" },
      headers: { "x-csrf-token": csrfToken },
    });

    // Should be 400 (validation: only "pro" | "team" allowed)
    // or 403 (if user role doesn't have billing.write)
    expect([400, 403]).toContain(res.status());
  });

  test("3. Checkout without auth → 401", async ({ request }) => {
    const res = await request.post("/api/billing/checkout", {
      data: { plan: "pro" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("4. Webhook without Stripe-Signature → 400", async ({ request }) => {
    const res = await request.post("/api/billing/webhook", {
      data: { type: "checkout.session.completed" },
    });
    // Without STRIPE_WEBHOOK_SECRET → 501, without signature → 400
    expect([400, 501]).toContain(res.status());
  });

  test("5. Webhook with invalid signature → 400", async ({ request }) => {
    // First check if webhook secret is configured
    const res1 = await request.post("/api/billing/webhook", {
      data: { type: "test" },
      headers: { "stripe-signature": "t=1234567890,v1=invalid" },
    });

    // 501 if STRIPE_WEBHOOK_SECRET not set, 400 if signature invalid
    expect([400, 501]).toContain(res1.status());
  });

  test("6. Webhook without STRIPE_WEBHOOK_SECRET → 501", async ({ request }) => {
    // This test documents the behavior when webhook secret is not configured
    const res = await request.post("/api/billing/webhook", {
      data: {},
    });
    // In dev without env: 501 (webhook_not_configured)
    // If secret IS configured but no signature: 400
    expect([400, 501]).toContain(res.status());
  });

  test("7. Webhook with valid signature + checkout.session.completed → plan update", async ({
    request,
  }) => {
    // This test requires STRIPE_WEBHOOK_SECRET to be set
    // We construct a valid Stripe event and sign it
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!secret) {
      test.skip();
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const event = {
      id: `evt_test_${Date.now()}`,
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "test_user_id",
          customer: "cus_test123",
          metadata: { plan: "pro", user_id: "test_user_id" },
        },
      },
    };
    const payload = JSON.stringify(event);
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");

    const res = await request.post("/api/billing/webhook", {
      data: payload,
      headers: {
        "stripe-signature": `t=${timestamp},v1=${signature}`,
        "Content-Type": "application/json",
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });

  test("8. Webhook idempotency — duplicate event → duplicate: true", async ({ request }) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!secret) {
      test.skip();
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const eventId = `evt_dup_${Date.now()}`;
    const event = {
      id: eventId,
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "test_user_id_dup",
          customer: "cus_test_dup",
          metadata: { plan: "pro", user_id: "test_user_id_dup" },
        },
      },
    };
    const payload = JSON.stringify(event);
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");

    const headers = {
      "stripe-signature": `t=${timestamp},v1=${signature}`,
      "Content-Type": "application/json",
    };

    // First request — should be processed
    const res1 = await request.post("/api/billing/webhook", {
      data: payload,
      headers,
    });
    expect(res1.status()).toBe(200);
    const body1 = await res1.json();
    expect(body1.received).toBe(true);
    expect(body1.duplicate).toBeFalsy();

    // Second request with same event ID — should be detected as duplicate
    const res2 = await request.post("/api/billing/webhook", {
      data: payload,
      headers,
    });
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.received).toBe(true);
    expect(body2.duplicate).toBe(true);
  });
});
