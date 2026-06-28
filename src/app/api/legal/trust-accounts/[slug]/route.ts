import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { computeBalance, type TrustTransaction } from "@/lib/trust-accounting";

export const dynamic = "force-dynamic";

const VALID_TX_TYPES = [
  "deposit",
  "withdrawal",
  "transfer",
  "fee",
  "interest",
  "adjustment",
] as const;

const transactionSchema = z.object({
  id: z.string(),
  type: z.enum(VALID_TX_TYPES),
  amount: z.number(),
  currency: z.string().default("EUR"),
  date: z.string(),
  description: z.string(),
  matterSlug: z.string().optional(),
  matterTitle: z.string().optional(),
  reference: z.string().optional(),
  createdBy: z.string().optional(),
  createdAt: z.string(),
});

const updateSchema = z.object({
  status: z.enum(["active", "frozen", "closed", "overdrawn"]).optional(),
  transactions: z.array(transactionSchema).optional(),
  reconciliations: z
    .array(
      z.object({
        id: z.string(),
        date: z.string(),
        bankBalance: z.number(),
        bookBalance: z.number(),
        difference: z.number(),
        status: z.enum(["balanced", "discrepancy", "pending"]),
        reconciledBy: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .optional(),
});

const addTransactionSchema = z.object({
  type: z.enum(VALID_TX_TYPES),
  amount: z.number(),
  currency: z.string().default("EUR"),
  date: z.string().default(() => new Date().toISOString()),
  description: z.string().min(1),
  matterSlug: z.string().optional(),
  matterTitle: z.string().optional(),
  reference: z.string().optional(),
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
    audit: (ctx) => ({
      action: "case.update" as const,
      entityType: "trust_account",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);

    const existing = await getAccount(decoded, ctx.headers);
    if (!existing) return apiError("not_found", "Trust account not found", 404);

    const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    const transactions = body.transactions ?? (fm.transactions as TrustTransaction[]) ?? [];
    const openingBalance = (fm.opening_balance as number) ?? 0;

    const updatedFm: Record<string, unknown> = {
      ...fm,
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.transactions !== undefined ? { transactions } : {}),
      ...(body.reconciliations !== undefined ? { reconciliations: body.reconciliations } : {}),
      current_balance: computeBalance(openingBalance, transactions),
      updated_at: now,
    };

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(decoded)}`, {
      method: "PATCH",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ frontmatter: updatedFm, content: existing.content ?? "" }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError("engine_error", `Update failed: ${text.slice(0, 200)}`, 502);
    }
    const result = await res.json();
    return Response.json(result);
  }
);

export const DELETE = createHandler(
  {
    action: "brain.delete",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "case.delete" as const,
      entityType: "trust_account",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, _body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(decoded)}`, {
      method: "DELETE",
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok && res.status !== 404) {
      return apiError("engine_error", "Delete failed", 502);
    }
    return Response.json({ success: true });
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: addTransactionSchema,
    audit: (ctx) => ({
      action: "case.update" as const,
      entityType: "trust_account",
      details: { by: ctx.user.email, type: "add_transaction" },
    }),
  },
  async (ctx, body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);

    const existing = await getAccount(decoded, ctx.headers);
    if (!existing) return apiError("not_found", "Trust account not found", 404);

    const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
    const transactions = (fm.transactions as TrustTransaction[]) ?? [];
    const now = new Date().toISOString();

    const newTx: TrustTransaction = {
      id: `tx_${Date.now()}`,
      type: body.type,
      amount: body.amount,
      currency: body.currency,
      date: body.date,
      description: body.description,
      matterSlug: body.matterSlug,
      matterTitle: body.matterTitle,
      reference: body.reference,
      createdBy: ctx.user.email,
      createdAt: now,
    };

    const allTxs = [...transactions, newTx];
    const openingBalance = (fm.opening_balance as number) ?? 0;

    const updatedFm: Record<string, unknown> = {
      ...fm,
      transactions: allTxs,
      current_balance: computeBalance(openingBalance, allTxs),
      updated_at: now,
    };

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(decoded)}`, {
      method: "PATCH",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ frontmatter: updatedFm, content: existing.content ?? "" }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError("engine_error", `Transaction failed: ${text.slice(0, 200)}`, 502);
    }
    const result = await res.json();
    return Response.json({ ...result, transaction: newTx }, { status: 201 });
  }
);
