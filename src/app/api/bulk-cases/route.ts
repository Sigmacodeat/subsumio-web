import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { parseCsvCases, caseSlugFromRow, caseFrontmatterFromRow } from "@/lib/bulk-cases";

export const dynamic = "force-dynamic";

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
    const rows = parseCsvCases(body.csv_text);
    const results: Array<{
      slug: string;
      case_number: string;
      client_name: string;
      status: "created" | "error";
      error?: string;
    }> = [];

    for (const row of rows) {
      const slug = caseSlugFromRow(row);
      try {
        await fetch(`${ENGINE_URL}/api/pages`, {
          method: "POST",
          headers: { ...ctx.headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            title: `${row.case_number} — ${row.client_name}`,
            type: "legal_case",
            frontmatter: caseFrontmatterFromRow(row),
          }),
          signal: AbortSignal.timeout(10_000),
        });
        results.push({
          slug,
          case_number: row.case_number,
          client_name: row.client_name,
          status: "created",
        });
      } catch {
        results.push({
          slug,
          case_number: row.case_number,
          client_name: row.client_name,
          status: "error",
          error: "Engine write failed",
        });
      }
    }

    return apiSuccess({
      total: rows.length,
      created: results.filter((r) => r.status === "created").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    });
  }
);
