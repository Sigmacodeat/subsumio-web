import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { GUARD_READ_FAILED, readCurrentPage, rejectionResponse } from "@/lib/page-write-guards";
import { checkInvoiceArrayWrite, guardBillingArrayMutation } from "@/lib/billing-write-guards";

import { logger } from "@/lib/logger";
const log = logger("api/pages/array-mutate");

const scalarMap = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]));

/**
 * Proxy onto the engine's atomic page_array_mutate op — patches or drops
 * frontmatter array elements matched by `match_key` ∈ `match` in one UPDATE,
 * with an optional `unless: {eq, ne}` in-statement skip guard.
 *
 * Billing rules are enforced here, not left to the caller (the dedicated
 * billing routes talk to the engine directly and never come through here):
 * an issued invoice only accepts payment bookkeeping, and billed time
 * entries / expenses are always skipped — the server adds the billed guard
 * itself and refuses writes to the billing state.
 */
const mutateSchema = z.object({
  slug: z.string().min(1).max(300),
  field: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "field must be a top-level frontmatter key"),
  match: z
    .array(z.union([z.string(), z.number(), z.boolean()]))
    .min(1)
    .max(1000),
  match_key: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .optional(),
  set: z.record(z.unknown()).optional(),
  unset: z.array(z.string()).optional(),
  remove: z.boolean().optional(),
  unless: z.object({ eq: scalarMap.optional(), ne: scalarMap.optional() }).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: mutateSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "page_array",
      entityId: body.slug,
      details: { field: body.field, matched: body.match.length, remove: body.remove === true },
    }),
  },
  async (ctx, body) => {
    // Fail closed: without the stored page neither guard can be judged.
    const currentRead = await readCurrentPage(ENGINE_URL, ctx.headers, body.slug);
    if (currentRead.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
    const current = currentRead.kind === "found" ? currentRead.page : null;

    const invoiceRejection = checkInvoiceArrayWrite(current, body.field);
    if (invoiceRejection) return rejectionResponse(invoiceRejection);

    const { slug, field, ...mutation } = body;
    const guarded = guardBillingArrayMutation(field, mutation, current?.frontmatter ?? null);
    if ("reject" in guarded) return rejectionResponse(guarded.reject);

    if (!guarded.forward) {
      // Every matched element is skipped by the caller's own guard.
      const stored = current?.frontmatter?.[field];
      const items = Array.isArray(stored) ? (stored as unknown[]) : [];
      return Response.json({
        slug,
        field,
        matched_ids: guarded.preSkipped,
        updated_ids: [],
        skipped_ids: guarded.preSkipped,
        not_found_ids: [],
        items,
        length: items.length,
      });
    }

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/array-mutate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({ slug, field, ...guarded.forward }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) return Response.json(data ?? { error: "mutate_failed" }, { status: res.status });
      if (data && guarded.preSkipped.length > 0) {
        const list = (k: string) => (Array.isArray(data[k]) ? (data[k] as string[]) : []);
        data.matched_ids = [...list("matched_ids"), ...guarded.preSkipped];
        data.skipped_ids = [...list("skipped_ids"), ...guarded.preSkipped];
      }
      return Response.json(data);
    } catch (err) {
      log.error("[pages/array-mutate] failed:", err instanceof Error ? err.message : String(err));
      return apiError("mutate_failed", "Eintrag konnte nicht aktualisiert werden", 502);
    }
  }
);
