import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { getWorkProduct } from "@/lib/work-product-store";
import { generateDocx } from "@/lib/docx-export";
import { parseMarkdownTables, tablesToXlsxBuffer } from "@/lib/xlsx-export";

export const maxDuration = 60;

const querySchema = z.object({
  format: z.enum(["docx", "xlsx"]).default("docx"),
});

/**
 * WP-7.44 — Office-Deliverable-Export: ein gespeichertes Work Product wird
 * als bearbeitbare Office-Datei ausgeliefert. `docx` für Text-Produkte
 * (memo, schriftsatz, …), `xlsx` für tabellarische Inhalte (Markdown-
 * Tabellen → ein Worksheet je Tabelle).
 */
export const GET = createHandler(
  {
    action: "legal.memo",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query, req) => {
    const id = new URL(req.url).pathname.split("/").slice(-2)[0]!;
    const wp = await getWorkProduct(id, ctx.brainId);
    if (!wp) return apiError("not_found", "Work product not found", 404);
    const content = wp.content ?? "";
    if (!content.trim()) {
      return apiError("empty_content", "Das Work Product hat keinen Inhalt", 400);
    }
    const safeName = encodeURIComponent(wp.title.replace(/[^\wäöüÄÖÜß -]/g, "").slice(0, 80));

    if (query.format === "xlsx") {
      const tables = parseMarkdownTables(content);
      if (tables.length === 0) {
        return apiError(
          "no_tables",
          "Der Inhalt enthält keine Markdown-Tabelle — für XLSX-Export ist mindestens eine nötig.",
          400
        );
      }
      const buf = await tablesToXlsxBuffer(tables, wp.title);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${safeName}.xlsx"`,
        },
      });
    }

    const docx = await generateDocx(content, { title: wp.title });
    const buf = docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.byteLength);
    return new Response(new Uint8Array(buf as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeName}.docx"`,
      },
    });
  }
);
