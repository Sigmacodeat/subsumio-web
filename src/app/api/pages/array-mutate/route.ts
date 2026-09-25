import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { can } from "@/lib/permissions";
import {
  GUARD_READ_FAILED,
  SECOND_CHECK_FIELDS,
  checkProtectedArrayWrite,
  guardSecondCheckWrite,
  readCurrentPage,
  rejectionResponse,
} from "@/lib/page-write-guards";
import { checkInvoiceArrayWrite, guardBillingArrayMutation } from "@/lib/billing-write-guards";
import { planDeadlineArrayMutation } from "@/lib/deadline-write-policy";
import { logDeadlineEvents } from "@/lib/deadline-audit";

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
    // Protected records and archived matters are not changed here.
    const rejected = await checkProtectedArrayWrite(
      ENGINE_URL,
      ctx.headers,
      body.slug,
      body.field,
      {
        email: ctx.user.email,
        canWriteSettings: can(ctx.user, "settings.write"),
      }
    );
    if (rejected) return rejectionResponse(rejected);

    if (body.field === "deadlines") return mutateDeadlines(ctx, body);

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

type MutateBody = z.infer<typeof mutateSchema>;

async function engineMutate(
  headers: Record<string, string>,
  payload: Record<string, unknown>
): Promise<Response> {
  return fetch(`${ENGINE_URL}/api/pages/array-mutate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
}

/**
 * A matter's Fristen go through the same rules as every other deadline write:
 * no second-check fields from the client, Notfristen protected, identity and
 * audit trail stamped server-side. Each matched entry is then written with its
 * own atomic engine mutation (addressed by id), and the matter's version is
 * advanced so an open matter view notices the change instead of overwriting it.
 */
async function mutateDeadlines(
  ctx: {
    headers: Record<string, string>;
    brainId?: string;
    user: { id?: string; email?: string; name?: string; role?: string };
  },
  body: MutateBody
): Promise<Response> {
  for (const key of SECOND_CHECK_FIELDS) {
    if ((body.set && key in body.set) || body.unset?.includes(key)) {
      return Response.json(
        {
          error: "notfrist_second_check_required",
          message: "Die Zweitprüfung wird nur über die Vier-Augen-Kontrolle gesetzt.",
        },
        { status: 403 }
      );
    }
  }
  const read = await readCurrentPage(ENGINE_URL, ctx.headers, body.slug);
  if (read.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
  if (read.kind === "missing") return apiError("not_found", "Seite nicht gefunden", 404);
  const fm = (read.page.frontmatter ?? {}) as Record<string, unknown>;

  const plan = planDeadlineArrayMutation(fm.deadlines, body, ctx.user, body.slug);
  if ("reject" in plan) return rejectionResponse(plan.reject);

  // A Notfrist still needs the server-stamped second check before it is done.
  const stored = Array.isArray(fm.deadlines) ? (fm.deadlines as unknown[]) : [];
  const simulated = stored.map((d) => {
    const el = d as Record<string, unknown>;
    const hit = plan.perEntry.find((p) => p.id === el?.id);
    return hit?.set ? { ...el, ...hit.set } : el;
  });
  const guarded = guardSecondCheckWrite({ deadlines: simulated }, fm);
  if ("reject" in guarded) return rejectionResponse(guarded.reject);

  try {
    const updated: string[] = [];
    let items: unknown[] = Array.isArray(fm.deadlines) ? (fm.deadlines as unknown[]) : [];
    for (const entry of plan.perEntry) {
      if (!entry.set && !entry.unset && !entry.remove) continue;
      const res = await engineMutate(ctx.headers, {
        slug: body.slug,
        field: "deadlines",
        match_key: "id",
        match: [entry.id],
        ...(entry.remove ? { remove: true } : {}),
        ...(entry.set ? { set: entry.set } : {}),
        ...(entry.unset ? { unset: entry.unset } : {}),
      });
      const data = (await res.json().catch(() => null)) as {
        updated_ids?: string[];
        items?: unknown[];
      } | null;
      if (!res.ok) return Response.json(data ?? { error: "mutate_failed" }, { status: res.status });
      updated.push(...(data?.updated_ids ?? [entry.id]));
      if (Array.isArray(data?.items)) items = data.items;
    }
    if (updated.length > 0) {
      const storedVersion = Number(fm.version);
      await enginePatchPage(
        ctx.headers,
        {
          slug: body.slug,
          frontmatter: { version: (Number.isFinite(storedVersion) ? storedVersion : 0) + 1 },
        },
        { timeoutMs: 15_000 }
      );
      await logDeadlineEvents(ctx, plan.events);
    }
    const matched = plan.perEntry.map((p) => p.id);
    const wanted = body.match.map((v) => String(v));
    return Response.json({
      slug: body.slug,
      field: "deadlines",
      matched_ids: matched,
      updated_ids: updated,
      skipped_ids: matched.filter((id) => !updated.includes(id)),
      not_found_ids:
        body.match_key === undefined || body.match_key === "id"
          ? wanted.filter((id) => !matched.includes(id))
          : matched.length === 0
            ? wanted
            : [],
      items,
      length: items.length,
    });
  } catch (err) {
    log.error(
      "[pages/array-mutate] deadlines failed:",
      err instanceof Error ? err.message : String(err)
    );
    return apiError("mutate_failed", "Eintrag konnte nicht aktualisiert werden", 502);
  }
}
