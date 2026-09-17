import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import { withKeyedLock } from "@/lib/keyed-lock";
import { computeBalance, type TrustTransaction } from "@/lib/trust-accounting";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Saldo laut Kontoauszug der Bank. */
  bankBalance: z.number().finite(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/)
    .default(() => new Date().toISOString().slice(0, 10)),
  notes: z.string().max(2000).optional(),
});

/**
 * Records a reconciliation against the bank statement. The book balance is
 * computed here from the stored bookings, never taken from the browser, and the
 * signed-in user is recorded as the person who reconciled.
 */
export const POST = createHandler(
  { action: "brain.write", rateTier: "standard", body: bodySchema },
  async (ctx, body, _query, req) => {
    const { slug } = await (req as unknown as { params: Promise<{ slug: string }> }).params;
    const decoded = decodeURIComponent(slug);
    return withKeyedLock(`trust:${ctx.brainId}:${decoded}`, async () => {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(decoded)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return apiError("not_found", "Treuhandkonto nicht gefunden", 404);
      const existing = await res.json();
      const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
      const transactions = (fm.transactions as TrustTransaction[]) ?? [];
      const bookBalance = computeBalance((fm.opening_balance as number) ?? 0, transactions);
      const difference = Math.round((body.bankBalance - bookBalance) * 100) / 100;
      const reconciliation = {
        id: `rec-${Date.now()}`,
        date: body.date,
        bankBalance: body.bankBalance,
        bookBalance,
        difference,
        status: difference === 0 ? ("balanced" as const) : ("discrepancy" as const),
        reconciledBy: ctx.user.email,
        notes: body.notes?.trim() || undefined,
        recordedAt: new Date().toISOString(),
      };
      const reconciliations = [...((fm.reconciliations as unknown[]) ?? []), reconciliation];
      const patched = await enginePatchPage(
        ctx.headers,
        {
          slug: decoded,
          frontmatter: { ...fm, reconciliations, updated_at: reconciliation.recordedAt },
          content: existing.content ?? "",
        },
        { timeoutMs: 15_000 }
      );
      if (!patched.ok)
        return apiError("engine_error", "Abgleich konnte nicht gespeichert werden", 502);
      void logAudit("trust.reconciliation", "trust_account", {
        entityId: decoded,
        brainId: ctx.brainId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        details: { bankBalance: body.bankBalance, bookBalance, difference },
      });
      return Response.json({ reconciliation }, { status: 201 });
    });
  }
);
