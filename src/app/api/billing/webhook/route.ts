// Stripe webhook: upgrades/downgrades plans on subscription events.
// Verifies the Stripe-Signature header (v1 scheme, HMAC-SHA256) without the SDK.
// Idempotency: tracks processed event IDs to prevent duplicate plan updates.

import { NextRequest, NextResponse } from "next/server";
import { getStore, type Plan } from "@/lib/auth/store";
import { verifyStripeSignature } from "@/lib/stripe-webhook";
import { createWebhookHandler } from "@/lib/api-handler";
import { planForPriceId } from "@/lib/billing/plans";
import { sendMail, isMailConfigured } from "@/lib/mail";
import {
  incrementFailure,
  resetFailure,
  applyDunningToPlan,
  getDunningState,
  buildDunningEmailBody,
  buildReactivationEmailBody,
} from "@/lib/billing/dunning";
import { addCredits, getCreditPack, type OwnerType } from "@/lib/billing/credits";
import { isDuplicateEvent, markEventProcessed } from "./helpers";

export const POST = createWebhookHandler({}, async (_body, req: NextRequest) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 501 });
  }

  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // Idempotency check: skip if this event was already processed
  const eventId = event.id;
  if (eventId) {
    const isDuplicate = await isDuplicateEvent(eventId, event.type ?? "unknown");
    if (isDuplicate) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  const store = getStore();
  const obj = (event.data?.object ?? {}) as {
    client_reference_id?: string;
    customer?: string;
    metadata?: {
      plan?: string;
      user_id?: string;
      purchase_type?: string;
      pack_id?: string;
      credits?: string;
    };
    items?: { data?: Array<{ price?: { id?: string } }> };
    payment_intent?: string;
    id?: string;
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const userId = obj.client_reference_id ?? obj.metadata?.user_id;
      const purchaseType = obj.metadata?.purchase_type;

      // ── Credit Purchase (one-time payment) ──────────────────────────
      if (userId && purchaseType === "credits") {
        const packId = obj.metadata?.pack_id;
        const creditsAmount = parseInt(obj.metadata?.credits ?? "0", 10);
        const pack = packId ? getCreditPack(packId) : undefined;
        const credits = pack ? pack.credits : creditsAmount;

        if (credits > 0) {
          // Resolve owner type: if user has orgId, credits go to org pool
          const user = await store.getById(userId);
          const ownerType: OwnerType = user?.orgId ? "org" : "user";
          const ownerId = user?.orgId ?? userId;

          await addCredits(ownerId, ownerType, credits, {
            type: "purchase",
            stripeSessionId: obj.id ?? undefined,
            stripePaymentIntent:
              typeof obj.payment_intent === "string" ? obj.payment_intent : undefined,
            description: pack
              ? `Credit pack: ${pack.name} (${pack.credits} credits)`
              : `Credit purchase: ${credits} credits`,
          });

          // Update stripeCustomerId if not yet set
          if (user && !user.stripeCustomerId && typeof obj.customer === "string") {
            await store.update(userId, { stripeCustomerId: obj.customer });
          }

          console.info(
            `[stripe-webhook] credit purchase: user=${userId} pack=${packId ?? "custom"} credits=${credits}`
          );
        }
        break;
      }

      // ── Subscription Purchase (existing logic) ───────────────────────
      const plan = obj.metadata?.plan;
      if (userId && (plan === "pro" || plan === "team")) {
        await store.update(userId, {
          plan: plan as Plan,
          stripeCustomerId: typeof obj.customer === "string" ? obj.customer : null,
        });
      }
      break;
    }
    case "customer.subscription.updated": {
      // Plan upgrade/downgrade, including changes made via the Stripe
      // customer portal (which does NOT propagate our checkout-time
      // metadata). The subscription's actual price ID — present on the
      // event object itself, signed by Stripe — is the source of truth;
      // metadata is only a fallback for legacy events that predate price
      // resolution, and only when it matches a real plan.
      const customerId = typeof obj.customer === "string" ? obj.customer : null;
      const metadata = obj.metadata as { plan?: string; user_id?: string } | undefined;
      const priceId = obj.items?.data?.[0]?.price?.id;
      const resolvedPlan =
        planForPriceId(priceId) ??
        (metadata?.plan === "pro" || metadata?.plan === "team" ? metadata.plan : null);
      const userId = metadata?.user_id;
      if (!resolvedPlan) {
        console.warn(
          `[stripe-webhook] subscription.updated: could not resolve plan for price ${priceId ?? "unknown"} (customer ${customerId ?? "unknown"})`
        );
        break;
      }
      if (userId) {
        await store.update(userId, { plan: resolvedPlan as Plan });
      } else if (customerId) {
        const user = await store.getByStripeCustomerId(customerId);
        if (user) await store.update(user.id, { plan: resolvedPlan as Plan });
      }
      break;
    }
    case "customer.subscription.deleted": {
      // Downgrade by Stripe customer id.
      const customerId = typeof obj.customer === "string" ? obj.customer : null;
      if (customerId) {
        const user = await store.getByStripeCustomerId(customerId);
        if (user) await store.update(user.id, { plan: "free" });
      }
      break;
    }
    case "invoice.payment_failed": {
      // Dunning escalation: Warning → Grace-Period → Suspension
      const customerId = typeof obj.customer === "string" ? obj.customer : null;
      const invoiceObj = obj as {
        customer?: string;
        next_payment_attempt?: number | null;
        hosted_invoice_url?: string;
      };
      const nextRetryAt = invoiceObj.next_payment_attempt
        ? new Date(invoiceObj.next_payment_attempt * 1000)
        : null;

      if (customerId) {
        const user = await store.getByStripeCustomerId(customerId);
        if (user) {
          const dunningState = await incrementFailure(user.id, nextRetryAt);
          await applyDunningToPlan(user.id, dunningState);

          // Send dunning email directly via sendMail (bypassing /api/notifications
          // which requires session auth — webhooks have no session).
          if (isMailConfigured()) {
            try {
              const { subject, body: emailBody } = buildDunningEmailBody(
                user.email ?? user.id,
                dunningState.failureCount,
                nextRetryAt,
                invoiceObj.hosted_invoice_url
              );
              await sendMail({
                to: user.email,
                subject,
                text: emailBody,
              });
            } catch (err) {
              console.warn(
                "[stripe-webhook] dunning email failed:",
                err instanceof Error ? err.message : err
              );
            }
          }

          console.warn(
            `[stripe-webhook] payment_failed dunning: user=${user.id} failure=${dunningState.failureCount} status=${dunningState.status}`
          );
        }
      }
      break;
    }
    case "invoice.payment_succeeded": {
      // Reset dunning state after successful payment
      const customerId = typeof obj.customer === "string" ? obj.customer : null;
      if (customerId) {
        const user = await store.getByStripeCustomerId(customerId);
        if (user) {
          // Read dunning state BEFORE resetFailure to preserve preDunningPlan
          const dunningState = await getDunningState(user.id);
          await resetFailure(user.id);
          // Reactivate if suspended/past_due
          if ((user.plan as string) === "suspended" || (user.plan as string) === "past_due") {
            // Resolve actual plan from subscription price ID;
            // fall back to preDunningPlan (preserved before dunning overwrote it),
            // then to "pro" as last resort
            const priceId = (obj as { items?: { data?: Array<{ price?: { id?: string } }> } }).items
              ?.data?.[0]?.price?.id;
            const resolvedPlan = planForPriceId(priceId) ?? dunningState.preDunningPlan ?? "pro";
            await store.update(user.id, { plan: resolvedPlan as Plan });

            // Reactivation email directly via sendMail
            if (isMailConfigured()) {
              try {
                const { subject, body: emailBody } = buildReactivationEmailBody(
                  user.email ?? user.id
                );
                await sendMail({
                  to: user.email,
                  subject,
                  text: emailBody,
                });
              } catch (err) {
                console.warn(
                  "[stripe-webhook] reactivation email failed:",
                  err instanceof Error ? err.message : err
                );
              }
            }
          }

          // Fire outgoing webhook for invoice.paid event
          try {
            const { dispatchWebhookEvent } = await import("@/lib/webhook-dispatch");
            const invoiceObj = obj as Record<string, unknown>;
            await dispatchWebhookEvent("invoice.paid", {
              user_id: user.id,
              customer_id: customerId,
              plan: user.plan,
              invoice_id: typeof invoiceObj.id === "string" ? invoiceObj.id : undefined,
              amount_paid:
                typeof invoiceObj.amount_paid === "number" ? invoiceObj.amount_paid : undefined,
            });
          } catch {
            // best-effort — webhook delivery should not block billing webhook processing
          }
        }
      }
      break;
    }
    default:
      break; // acknowledge everything else
  }

  // Mark event as processed AFTER successful handler execution.
  // If this fails, Stripe retries — plan updates are idempotent by user_id/customer_id.
  if (eventId) {
    await markEventProcessed(eventId, event.type ?? "unknown");
  }

  return NextResponse.json({ received: true });
});
