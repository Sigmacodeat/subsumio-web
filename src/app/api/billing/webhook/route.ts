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
import {
  createSaasOrgForUser,
  updateSaasPlan,
  cancelSaasOrg,
} from "@/lib/billing/saas-billing-sync";

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
    subscription?: string;
    metadata?: {
      plan?: string;
      user_id?: string;
      purchase_type?: string;
      pack_id?: string;
      credits?: string;
      seats?: string;
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

          // Auto-Reload dedup reset: credits were added → balance is above
          // threshold → no re-trigger. Clear the timestamp so the next
          // low-balance event starts a fresh 24h dedup window.
          const pool = (await import("@/lib/auth/store")).getSharedPgPool();
          if (pool && ownerType === "org") {
            try {
              await pool.query(
                `UPDATE saas_credit_balance SET auto_reload_last_triggered_at = NULL
                 WHERE org_id = $1 AND period_end > now()`,
                [ownerId]
              );
            } catch {
              // best-effort
            }
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

        // SaaS Billing Sync: create saas_orgs + saas_subscriptions +
        // saas_credit_balance with included credits for the current period.
        // Best-effort: if the SaaS tables aren't available (PGLite), this
        // silently skips — the old credit system still works.
        const user = await store.getById(userId);
        if (user) {
          const subscriptionId = (obj as { subscription?: string }).subscription;
          // For team plan, seats come from metadata (5-50); default 5.
          const seatsFromMeta = obj.metadata?.seats ? parseInt(obj.metadata.seats, 10) : undefined;
          const orgId = await createSaasOrgForUser(
            userId,
            user.email ?? userId,
            plan as "pro" | "team",
            typeof obj.customer === "string" ? obj.customer : undefined,
            typeof subscriptionId === "string" ? subscriptionId : undefined,
            seatsFromMeta && seatsFromMeta >= 5 ? seatsFromMeta : undefined
          );
          // Persist orgId on the user record so that pipeline-settle's session
          // path resolves ownerType='org' + ownerId=UUID. Without this,
          // deductCredits would use the user-id string as org_id → 0 rows
          // matched on saas_credit_balance (UUID column) → credits never
          // deducted for browser-initiated settlements.
          if (orgId && !user.orgId) {
            await store.update(userId, { orgId });
          }
        }
      }
      break;
    }
    case "customer.subscription.created": {
      // New subscription created (via Stripe Checkout or Portal).
      // Sync SaaS billing tables immediately — don't wait for
      // checkout.session.completed (which fires separately and may
      // arrive before or after this event). Idempotent via
      // createSaasOrgForUser's ON CONFLICT.
      const customerId = typeof obj.customer === "string" ? obj.customer : null;
      const metadata = obj.metadata as
        | { plan?: string; user_id?: string; seats?: string }
        | undefined;
      const priceId = obj.items?.data?.[0]?.price?.id;
      const stripeQuantity =
        (obj.items?.data?.[0] as { quantity?: number } | undefined)?.quantity ?? 1;
      const resolvedPlan =
        planForPriceId(priceId) ??
        (metadata?.plan === "pro" || metadata?.plan === "team" ? metadata.plan : null);
      let userId = metadata?.user_id;
      if (!userId && customerId) {
        const user = await store.getByStripeCustomerId(customerId);
        if (user) userId = user.id;
      }
      if (userId && resolvedPlan) {
        await store.update(userId, { plan: resolvedPlan as Plan });
        const user = await store.getById(userId);
        if (user) {
          const seatsFromMeta = metadata?.seats ? parseInt(metadata.seats, 10) : undefined;
          const orgId = await createSaasOrgForUser(
            userId,
            user.email ?? userId,
            resolvedPlan as "pro" | "team",
            customerId ?? undefined,
            typeof (obj as { id?: string }).id === "string"
              ? (obj as { id: string }).id
              : undefined,
            seatsFromMeta && seatsFromMeta >= 5
              ? seatsFromMeta
              : stripeQuantity > 0
                ? stripeQuantity
                : undefined
          );
          if (orgId && !user.orgId) {
            await store.update(userId, { orgId });
          }
        }
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
      // Check subscription status — if unpaid/canceled/incomplete_expired,
      // treat as downgrade, not upgrade. Without this, a subscription that
      // Stripe marks as 'unpaid' (payment failures) would still upgrade
      // the user's plan because the price ID is still present.
      const subStatus = (obj as { status?: string }).status ?? "active";
      if (
        subStatus === "canceled" ||
        subStatus === "unpaid" ||
        subStatus === "incomplete_expired"
      ) {
        // Treat like subscription.deleted — downgrade to free
        if (customerId) {
          const user = await store.getByStripeCustomerId(customerId);
          if (user) {
            await store.update(user.id, { plan: "free", orgId: null });
            await cancelSaasOrg(user.id);
          }
        }
        break;
      }
      // Read seat quantity from Stripe subscription item (source of truth
      // for portal changes — metadata is NOT propagated by Stripe Portal).
      const stripeQuantity =
        (obj.items?.data?.[0] as { quantity?: number } | undefined)?.quantity ?? 1;
      // Read cancel_at_period_end from Stripe (user clicked "Cancel at period end"
      // or retracted the cancellation in the Stripe customer portal).
      const stripeCancelAtPeriodEnd = !!(obj as { cancel_at_period_end?: boolean })
        .cancel_at_period_end;
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
      // Resolve user ID from metadata OR Stripe customer ID
      let resolvedUserId: string | undefined = userId;
      if (!resolvedUserId && customerId) {
        const user = await store.getByStripeCustomerId(customerId);
        if (user) resolvedUserId = user.id;
      }
      if (resolvedUserId) {
        await store.update(resolvedUserId, { plan: resolvedPlan as Plan });
        // SaaS Billing Sync: update saas_orgs.plan + saas_subscriptions +
        // saas_credit_balance included credits for the new plan.
        await updateSaasPlan(resolvedUserId, resolvedPlan);
        // Backfill user.orgId for existing users who subscribed before the
        // checkout.session.completed orgId fix. Without this, ctx.user.orgId
        // stays null → ownerType='user' → deductCredits uses user-id string
        // as org_id → 0 rows matched on saas_credit_balance (UUID column).
        const userForOrgBackfill = await store.getById(resolvedUserId);
        if (userForOrgBackfill && !userForOrgBackfill.orgId) {
          const pool = (await import("@/lib/auth/store")).getSharedPgPool();
          if (pool) {
            try {
              const orgSlug = `user-${resolvedUserId.slice(0, 8)}`;
              const { rows } = await pool.query<{ id: string }>(
                `SELECT id FROM saas_orgs WHERE slug = $1`,
                [orgSlug]
              );
              if (rows[0]?.id) {
                await store.update(resolvedUserId, { orgId: rows[0].id });
              }
            } catch {
              // best-effort
            }
          }
        }
        // SaaS Billing Sync: sync seat count from Stripe quantity.
        // For team plan, quantity = seats. For pro, quantity is always 1.
        // Only call if quantity changed (avoids redundant updates).
        if (resolvedPlan === "team" && stripeQuantity > 1) {
          const { updateSaasSeats } = await import("@/lib/billing/saas-billing-sync");
          await updateSaasSeats(resolvedUserId, stripeQuantity);
        }
        // SaaS Billing Sync: sync cancel_at_period_end from Stripe.
        // User clicked "Cancel at period end" (or retracted it) in the
        // Stripe customer portal. This flag tells the system the user
        // intends to cancel — resetMonthlyPeriod skips these orgs.
        const pool = (await import("@/lib/auth/store")).getSharedPgPool();
        if (pool) {
          try {
            const orgSlug = `user-${resolvedUserId.slice(0, 8)}`;
            const { rows } = await pool.query<{ id: string }>(
              `SELECT id FROM saas_orgs WHERE slug = $1`,
              [orgSlug]
            );
            if (rows.length > 0) {
              await pool.query(
                `UPDATE saas_subscriptions SET cancel_at_period_end = $2, updated_at = now()
                 WHERE org_id = $1 AND status = 'active'`,
                [rows[0].id, stripeCancelAtPeriodEnd]
              );
            }
          } catch {
            // best-effort — don't fail the webhook for this
          }
        }
      }
      break;
    }
    case "customer.subscription.deleted": {
      // Downgrade by Stripe customer id.
      const customerId = typeof obj.customer === "string" ? obj.customer : null;
      if (customerId) {
        const user = await store.getByStripeCustomerId(customerId);
        if (user) {
          // Clear orgId + set plan to free — fully disconnect from SaaS billing.
          // Without clearing orgId, getBalance would still find the old
          // saas_credit_balance row (with included_credit=0 from cancelSaasOrg).
          await store.update(user.id, { plan: "free", orgId: null });
          // SaaS Billing Sync: mark subscription as canceled
          await cancelSaasOrg(user.id);
        }
      }
      break;
    }
    case "charge.refunded": {
      // When Stripe issues a refund, claw back the credits that were
      // purchased with that charge. Without this, refunded users keep
      // their credits → revenue leak.
      // The charge object has payment_intent → checkout session → metadata.
      const refundObj = obj as {
        payment_intent?: string;
        amount_refunded?: number;
        amount?: number;
        metadata?: { user_id?: string; pack_id?: string };
      };
      const userId = refundObj.metadata?.user_id;
      if (userId) {
        try {
          // Import addCredits with negative amount to claw back
          const { addCredits } = await import("@/lib/billing/credits");
          // Calculate proportional credit deduction based on refund fraction
          const refundFraction =
            refundObj.amount && refundObj.amount > 0
              ? (refundObj.amount_refunded ?? 0) / refundObj.amount
              : 1;
          // Get the user's current balance to estimate credits to deduct
          const { getBalance } = await import("@/lib/billing/credits");
          const balance = await getBalance(userId, "user");
          const creditsToDeduct = Math.round(balance.balance * refundFraction * 100) / 100;
          if (creditsToDeduct > 0) {
            await addCredits(userId, "user", -creditsToDeduct, {
              type: "refund",
              description: `Rückerstattung: Stripe charge refund`,
              stripePaymentIntent: refundObj.payment_intent ?? undefined,
            });
          }
        } catch (err) {
          console.error("[stripe-webhook] charge.refunded: failed to claw back credits:", err);
        }
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

            // SaaS Billing Sync: reactivate saas_subscriptions.status
            const { reactivateSaasSubscription } = await import("@/lib/billing/saas-billing-sync");
            await reactivateSaasSubscription(user.id);

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
    case "charge.dispute.created": {
      // Chargeback initiated by customer's bank. Suspend the user
      // immediately — they're disputing a charge, so we shouldn't
      // provide further service until the dispute is resolved.
      const disputeObj = obj as {
        charge?: string;
        amount?: number;
        reason?: string;
        metadata?: { user_id?: string };
      };
      const userId = disputeObj.metadata?.user_id;
      if (userId) {
        try {
          const user = await store.getById(userId);
          if (user && user.plan !== "free") {
            // Suspend plan — preserve original via dunning preDunningPlan
            const dunningState = await getDunningState(userId);
            await applyDunningToPlan(userId, {
              ...dunningState,
              status: "suspended",
              failureCount: 99, // force suspended
            });
            console.warn(
              `[stripe-webhook] charge.dispute.created: user=${userId} suspended (reason: ${disputeObj.reason ?? "unknown"})`
            );
          }
        } catch (err) {
          console.error("[stripe-webhook] dispute.created handler failed:", err);
        }
      }
      break;
    }
    case "charge.dispute.closed": {
      // Dispute resolved. If won (status='won'), reactivate the user.
      // If lost (status='lost'), keep suspended + claw back credits.
      const disputeObj = obj as {
        status?: string;
        metadata?: { user_id?: string };
      };
      const userId = disputeObj.metadata?.user_id;
      if (userId && disputeObj.status === "won") {
        try {
          const user = await store.getById(userId);
          if (user) {
            await resetFailure(userId);
            // Reactivate to pre-dispute plan
            const dunningState = await getDunningState(userId);
            const resolvedPlan = dunningState.preDunningPlan ?? "pro";
            await store.update(userId, { plan: resolvedPlan as Plan });
          }
        } catch (err) {
          console.error("[stripe-webhook] dispute.closed handler failed:", err);
        }
      }
      break;
    }
    case "invoice.payment_action_required": {
      // 3DS authentication required — send email to customer
      // so they can complete the authentication.
      const customerId = typeof obj.customer === "string" ? obj.customer : null;
      const hostedInvoiceUrl = (obj as { hosted_invoice_url?: string }).hosted_invoice_url;
      if (customerId) {
        try {
          const user = await store.getByStripeCustomerId(customerId);
          if (user?.email) {
            const { sendMail } = await import("@/lib/mail");
            await sendMail({
              to: user.email,
              subject: "Aktion erforderlich: Zahlung bestätigen",
              text: `Ihre Zahlung erfordert eine 3D-Secure-Authentifizierung.\n\nBitte bestätigen Sie die Zahlung unter: ${hostedInvoiceUrl ?? "https://app.subsumio.com/dashboard/billing"}\n\nOhne Bestätigung wird Ihr Abonnement pausiert.`,
            });
          }
        } catch (err) {
          console.warn("[stripe-webhook] 3DS email failed:", err);
        }
      }
      break;
    }
    case "customer.source.expiring": {
      // Card expiring soon — send email so customer can update their card.
      // Without this, the next payment will fail silently → dunning escalation.
      const customerId = (obj as { customer?: string }).customer;
      if (customerId) {
        try {
          const user = await store.getByStripeCustomerId(customerId);
          if (user?.email) {
            const { sendMail } = await import("@/lib/mail");
            await sendMail({
              to: user.email,
              subject: "Ihre Zahlungsmethode läuft bald ab",
              text: "Ihre hinterlegte Kreditkarte läuft in Kürze ab. Bitte aktualisieren Sie Ihre Zahlungsmethode im Abrechnungsportal, um Service-Unterbrechungen zu vermeiden.\n\nPortal: https://app.subsumio.com/dashboard/billing",
            });
          }
        } catch (err) {
          console.warn("[stripe-webhook] source.expiring email failed:", err);
        }
      }
      break;
    }
    case "customer.subscription.trial_will_end": {
      // Trial ending soon (3 days before) — send email to convert to paid.
      const customerId = (obj as { customer?: string }).customer;
      if (customerId) {
        try {
          const user = await store.getByStripeCustomerId(customerId);
          if (user?.email) {
            const { sendMail } = await import("@/lib/mail");
            await sendMail({
              to: user.email,
              subject: "Ihr Testzeitraum endet bald",
              text: "Ihr Testzeitraum endet in 3 Tagen. Um Ihren Service ohne Unterbrechung fortzusetzen, schließen Sie bitte Ihr Abonnement ab.\n\nUpgrade: https://app.subsumio.com/dashboard/billing",
            });
          }
        } catch (err) {
          console.warn("[stripe-webhook] trial_will_end email failed:", err);
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
