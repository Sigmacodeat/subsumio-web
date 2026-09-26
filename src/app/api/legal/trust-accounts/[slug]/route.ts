import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import { withKeyedLock } from "@/lib/keyed-lock";
import {
  BOOKABLE_TRUST_TYPES,
  buildTrustBooking,
  computeBalance,
  trustAccountDeleteBlock,
  validateTrustBooking,
  type TrustAccountStatus,
  type TrustTransaction,
} from "@/lib/trust-accounting";

export const dynamic = "force-dynamic";

// Bookings are immutable: PATCH changes the account status only; bookings are
// added (and reversed) through POST, reconciliations through their own route.
const updateSchema = z.object({
  status: z.enum(["active", "frozen", "closed"]),
});

const addTransactionSchema = z.object({
  type: z.enum(BOOKABLE_TRUST_TYPES),
  amount: z.number().default(0),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/)
    .default(() => new Date().toISOString().slice(0, 10)),
  description: z.string().trim().min(1).max(2000),
  matterSlug: z.string().trim().min(1, "matter_required").max(300),
  matterTitle: z.string().max(300).optional(),
  reference: z.string().max(200).optional(),
  reversesId: z.string().max(200).optional(),
});

async function getAccount(slug: string, headers: Record<string, string>) {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return res.json();
}

export const GET = createHandler(
  { action: "brain.read", rateTier: "standard" },
  async (ctx, _body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);
    const account = await getAccount(decoded, ctx.headers);
    if (!account) return apiError("not_found", "Trust account not found", 404);
    return Response.json(account);
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: updateSchema,
  },
  async (ctx, body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);
    return withKeyedLock(`trust:${ctx.brainId}:${decoded}`, async () => {
      const existing = await getAccount(decoded, ctx.headers);
      if (!existing) return apiError("not_found", "Treuhandkonto nicht gefunden", 404);
      const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
      const res = await enginePatchPage(
        ctx.headers,
        {
          slug: decoded,
          frontmatter: { ...fm, status: body.status, updated_at: new Date().toISOString() },
          content: existing.content ?? "",
        },
        { timeoutMs: 15_000 }
      );
      if (!res.ok) return apiError("engine_error", "Status konnte nicht gespeichert werden", 502);
      void logAudit("trust.status", "trust_account", {
        entityId: decoded,
        brainId: ctx.brainId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        details: { from: fm.status, to: body.status },
      });
      return Response.json(await res.json());
    });
  }
);

export const DELETE = createHandler(
  {
    action: "brain.delete",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);

    return withKeyedLock(`trust:${ctx.brainId}:${decoded}`, async () => {
      const existing = await getAccount(decoded, ctx.headers);
      if (!existing) return Response.json({ success: true });

      // Fremdgeld must not disappear from the books: an account is deleted
      // only once its balance (recomputed from the journal) is zero.
      const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
      const transactions = (fm.transactions as TrustTransaction[]) ?? [];
      const balance = computeBalance((fm.opening_balance as number) ?? 0, transactions);
      const block = trustAccountDeleteBlock(balance);
      if (block) return apiError(block.code, block.message, 409, { balance });

      const res = await enginePatchPage(
        ctx.headers,
        {
          slug: decoded,
          frontmatter: {
            status: "tombstoned",
            tombstoned_at: new Date().toISOString(),
            tombstoned_by: ctx.user.email,
            tombstone_reason: "manual_delete",
          },
        },
        { timeoutMs: 10_000 }
      );

      if (!res.ok) return apiError("engine_error", "Delete failed", 502);
      void logAudit("trust.delete", "trust_account", {
        entityId: decoded,
        brainId: ctx.brainId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        details: { status: fm.status, transactions: transactions.length },
      });
      return Response.json({ success: true });
    });
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: addTransactionSchema,
  },
  async (ctx, body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);

    // One booking at a time per account: validation reads the balance, so two
    // concurrent payouts must not both see the same balance.
    return withKeyedLock(`trust:${ctx.brainId}:${decoded}`, async () => {
      const existing = await getAccount(decoded, ctx.headers);
      if (!existing) return apiError("not_found", "Treuhandkonto nicht gefunden", 404);

      const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
      const transactions = (fm.transactions as TrustTransaction[]) ?? [];
      const account = {
        status: ((fm.status as TrustAccountStatus) ?? "active") as TrustAccountStatus,
        currency: (fm.currency as string) ?? "EUR",
        transactions,
        // The account's legal regime (RAO vs. BRAO) decides the booking hints.
        jurisdiction: (fm.jurisdiction === "de" ? "de" : "at") as "de" | "at",
      };
      const check = validateTrustBooking(account, body);
      if (!check.ok) return apiError(check.code, check.message, 422);

      const booking = buildTrustBooking(account, body, ctx.user.email);
      const allTxs = [
        ...transactions.map((t) =>
          booking.reversesId && t.id === booking.reversesId ? { ...t, reversedById: booking.id } : t
        ),
        booking,
      ];
      const openingBalance = (fm.opening_balance as number) ?? 0;
      const now = new Date().toISOString();

      const res = await enginePatchPage(
        ctx.headers,
        {
          slug: decoded,
          frontmatter: {
            ...fm,
            transactions: allTxs,
            current_balance: computeBalance(openingBalance, allTxs),
            updated_at: now,
          },
          content: existing.content ?? "",
        },
        { timeoutMs: 15_000 }
      );
      if (!res.ok) {
        return apiError("engine_error", "Die Buchung konnte nicht gespeichert werden", 502);
      }

      void logAudit(
        booking.type === "reversal" ? "trust.reversal" : "trust.booking",
        "trust_account",
        {
          entityId: decoded,
          brainId: ctx.brainId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          details: {
            number: booking.number,
            type: booking.type,
            amount: booking.amount,
            signed: check.signed,
            matter: booking.matterSlug,
            reverses: booking.reversesId,
            reference: booking.reference,
          },
        }
      );
      const result = await res.json();
      return Response.json(
        { ...result, transaction: booking, warnings: check.warnings },
        { status: 201 }
      );
    });
  }
);
