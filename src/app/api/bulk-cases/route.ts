import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import {
  BULK_IMPORT_MAX_ROWS,
  caseFrontmatterFromRow,
  parseCsvCaseRows,
  type BulkImportResult,
  type BulkRowResult,
} from "@/lib/bulk-cases";
import {
  createCaseSafely,
  engineCaseCreateDeps,
  loadCaseNumberIndex,
  normalizeCaseNumber,
} from "@/lib/safe-case-create";

import { logger } from "@/lib/logger";
const log = logger("api/bulk-cases");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const importSchema = z.object({
  csv_text: z.string().min(1).max(1_000_000),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: importSchema,
    audit: (ctx, body) => ({
      action: "case.create" as const,
      entityType: "bulk_import",
      entityId: "bulk",
      details: { csvLength: body.csv_text.length },
    }),
  },
  async (ctx, body) => {
    const parsed = parseCsvCaseRows(body.csv_text);
    const total = parsed.rows.length + parsed.invalid.length;
    if (total > BULK_IMPORT_MAX_ROWS) {
      return apiError(
        "too_many_rows",
        `Höchstens ${BULK_IMPORT_MAX_ROWS} Zeilen pro Import — bitte die CSV aufteilen.`,
        400
      );
    }

    // Existing matters by Aktenzeichen. Without a complete list nothing is
    // written: a failed read must not look like "no matter exists yet".
    let existing: Map<string, string>;
    try {
      existing = await loadCaseNumberIndex(ctx.headers);
    } catch (err) {
      log.error("[bulk-cases] case list failed:", err instanceof Error ? err.message : String(err));
      return apiError(
        "guard_unavailable",
        "Der Aktenbestand konnte nicht geprüft werden. Es wurde nichts angelegt — bitte erneut versuchen.",
        503
      );
    }

    const results: BulkRowResult[] = parsed.invalid.map((r) => ({
      line: r.line,
      case_number: r.case_number ?? "",
      status: "error" as const,
      error: r.error,
    }));

    const deps = engineCaseCreateDeps(ctx.headers);
    const seenInCsv = new Map<string, number>();

    for (const { line, row } of parsed.rows) {
      const base = { line, case_number: row.case_number, client_name: row.client_name };
      const key = normalizeCaseNumber(row.case_number);

      const earlierLine = seenInCsv.get(key);
      if (earlierLine !== undefined) {
        results.push({
          ...base,
          status: "exists",
          error: `Aktenzeichen steht bereits in Zeile ${earlierLine} dieser CSV`,
        });
        continue;
      }
      seenInCsv.set(key, line);

      const existingSlug = existing.get(key);
      if (existingSlug) {
        results.push({
          ...base,
          status: "exists",
          slug: existingSlug,
          error: "Akte mit diesem Aktenzeichen besteht bereits — unverändert gelassen",
        });
        continue;
      }

      const outcome = await createCaseSafely(deps, {
        title: `${row.case_number} — ${row.client_name}`,
        frontmatter: caseFrontmatterFromRow(row),
        slugHint: row.case_number,
      });
      switch (outcome.status) {
        case "created":
          existing.set(key, outcome.slug);
          results.push({ ...base, status: "created", slug: outcome.slug });
          break;
        case "exists":
          results.push({ ...base, status: "exists", slug: outcome.slug });
          break;
        case "conflict":
          results.push({
            ...base,
            status: "conflict",
            error: "Kollisionsprüfung hat Treffer gefunden — Akte wurde nicht angelegt",
            conflicts: [...new Set(outcome.matches.map((m) => m.name))],
          });
          break;
        case "error":
          results.push({ ...base, status: "error", error: outcome.message });
          break;
      }
    }

    results.sort((a, b) => a.line - b.line);
    const count = (status: BulkRowResult["status"]) =>
      results.filter((r) => r.status === status).length;
    const summary: BulkImportResult = {
      total,
      created: count("created"),
      exists: count("exists"),
      conflicts: count("conflict"),
      errors: count("error"),
      results,
    };
    return apiSuccess(summary);
  }
);
