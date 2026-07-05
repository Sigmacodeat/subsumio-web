import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  parseCsvCases,
  caseSlugFromRow,
  caseFrontmatterFromRow,
  type BulkImportResult,
} from "@/lib/bulk-cases";

export const dynamic = "force-dynamic";

const bulkImportSchema = z.object({
  csv: z.string().min(10).max(100_000),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: bulkImportSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "bulk_import",
      entityId: "bulk",
      details: { csvLength: body.csv.length },
    }),
  },
  async (ctx, body) => {
    const rows = parseCsvCases(body.csv);
    if (rows.length === 0) {
      return apiError("parse_error", "Keine gültigen CSV-Zeilen gefunden", 400);
    }

    const result: BulkImportResult = {
      total: rows.length,
      created: 0,
      skipped: 0,
      errors: 0,
      case_slugs: [],
      errors_detail: [],
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      try {
        const slug = caseSlugFromRow(row);

        const existingRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
          headers: ctx.headers,
          signal: AbortSignal.timeout(5_000),
        });
        if (existingRes.ok) {
          result.skipped++;
          continue;
        }

        const fm = caseFrontmatterFromRow(row);
        const createRes = await fetch(`${ENGINE_URL}/api/pages`, {
          method: "POST",
          headers: { ...ctx.headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            title: `${row.case_number} — ${row.client_name}`,
            type: "legal_case",
            content: row.matter,
            frontmatter: fm,
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (createRes.ok) {
          result.created++;
          result.case_slugs.push(slug);
        } else {
          result.errors++;
          result.errors_detail.push({ row: i + 2, error: `HTTP ${createRes.status}` });
        }
      } catch (e) {
        result.errors++;
        result.errors_detail.push({
          row: i + 2,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return apiSuccess(result);
  }
);
