import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { can } from "@/lib/permissions";
import {
  GUARD_READ_FAILED,
  checkProtectedArrayWrite,
  readCurrentPage,
  rejectionResponse,
} from "@/lib/page-write-guards";
import {
  NOT_WHEN_INVOICED,
  checkInvoiceArrayWrite,
  planImportRollbackRemoval,
} from "@/lib/billing-write-guards";

import { logger } from "@/lib/logger";
const log = logger("api/kanzlei-import/rollback-time-entries");

const FIELD = "time_entries";

/**
 * Taking back a Kanzlei data import: removes the matter time entries that
 * import appended — including entries that arrived already marked billed
 * (work billed in the previous system), which the generic array routes keep
 * under the billed lock.
 *
 * Narrow on purpose: only entries whose `source` is the import and whose
 * `import_project_id` is the given import are removed, and only while no
 * invoice of this system holds them (no invoice number). That last condition
 * is also evaluated inside the engine's single UPDATE, so an invoice created
 * in between wins. The general billed lock is unchanged.
 */
const bodySchema = z.object({
  case_slug: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((s) => !s.includes("..") && !s.includes("//"), "invalid_slug"),
  import_project_id: z.string().trim().min(1).max(200),
  ids: z.array(z.string().min(1).max(200)).min(1).max(1000),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "page_array",
      entityId: body.case_slug,
      details: {
        field: FIELD,
        import_rollback: true,
        import_project_id: body.import_project_id,
        requested: body.ids.length,
      },
    }),
  },
  async (ctx, body) => {
    // Archived matters and protected records are not changed here either.
    const rejected = await checkProtectedArrayWrite(
      ENGINE_URL,
      ctx.headers,
      body.case_slug,
      FIELD,
      {
        email: ctx.user.email,
        canWriteSettings: can(ctx.user, "settings.write"),
      }
    );
    if (rejected) return rejectionResponse(rejected);

    // Fail closed: without the stored entries nothing can be judged.
    const read = await readCurrentPage(ENGINE_URL, ctx.headers, body.case_slug);
    if (read.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
    if (read.kind === "missing") return apiError("not_found", "Akte nicht gefunden", 404);
    const invoiceRejection = checkInvoiceArrayWrite(read.page, FIELD);
    if (invoiceRejection) return rejectionResponse(invoiceRejection);

    const plan = planImportRollbackRemoval(
      read.page.frontmatter?.[FIELD],
      body.ids,
      body.import_project_id
    );
    const keptIds = plan.kept.map((k) => k.id);
    if (plan.removable.length === 0) {
      return apiSuccess({
        removed_ids: [],
        kept_ids: keptIds,
        kept: plan.kept,
        not_found_ids: plan.notFound,
      });
    }

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/array-mutate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          slug: body.case_slug,
          field: FIELD,
          match_key: "id",
          match: plan.removable,
          remove: true,
          unless: NOT_WHEN_INVOICED,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await res.json().catch(() => null)) as {
        updated_ids?: string[];
        skipped_ids?: string[];
        not_found_ids?: string[];
      } | null;
      if (!res.ok) {
        return apiError("rollback_failed", "Zeiteinträge konnten nicht entfernt werden", 502);
      }
      const invoicedMeanwhile = data?.skipped_ids ?? [];
      return apiSuccess({
        removed_ids: data?.updated_ids ?? [],
        kept_ids: [...keptIds, ...invoicedMeanwhile],
        kept: [
          ...plan.kept,
          ...invoicedMeanwhile.map((id) => ({ id, reason: "invoiced" as const })),
        ],
        not_found_ids: [...plan.notFound, ...(data?.not_found_ids ?? [])],
      });
    } catch (err) {
      log.error(
        "[rollback-time-entries] failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("rollback_failed", "Zeiteinträge konnten nicht entfernt werden", 502);
    }
  }
);
