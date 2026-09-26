import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { getWorkProduct } from "@/lib/work-product-store";
import { hashContent, isPublishable, type WorkProduct } from "@/lib/work-product";
import { generateDocx } from "@/lib/docx-export";
import { parseMarkdownTables, tablesToXlsxBuffer } from "@/lib/xlsx-export";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import type { HandlerContext } from "@/lib/api-handler";

export const maxDuration = 60;

const querySchema = z.object({
  format: z.enum(["docx", "xlsx"]).default("docx"),
});

const overrideSchema = z.object({
  format: z.enum(["docx", "xlsx"]).default("docx"),
  /** Anwaltliche Übersteuerung: Export vor der Freigabe, mit Begründung. */
  override_reason: z.string().trim().min(10, "override_reason_too_short").max(2_000),
});

/**
 * WP-7.44 — Office-Deliverable-Export: ein gespeichertes Work Product wird
 * als bearbeitbare Office-Datei ausgeliefert. `docx` für Text-Produkte
 * (memo, schriftsatz, …), `xlsx` für tabellarische Inhalte (Markdown-
 * Tabellen → ein Worksheet je Tabelle).
 *
 * Work Products sind KI-Arbeitsergebnisse: exportiert wird nur, was die
 * Freigabe (Status approved/published — dafür verlangt der Übergang Receipt
 * und Claim-Evidence für genau diesen Inhalt) durchlaufen hat. Davor nur per
 * POST mit anwaltlicher Übersteuerung (Anwalt/Admin, Begründung, protokolliert).
 */
export const GET = createHandler(
  {
    action: "legal.memo",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query, req) => {
    const loaded = await loadExportable(ctx, req);
    if (loaded instanceof Response) return loaded;
    if (!isReleased(loaded)) {
      void logAudit("ai.output_blocked", "work_product", {
        brainId: ctx.brainId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        entityId: loaded.id,
        details: { action: "export_docx", status: loaded.status, title: loaded.title },
      });
      return apiError(
        "release_required",
        "Dieses Arbeitsergebnis ist noch nicht anwaltlich freigegeben. Bitte zuerst prüfen und freigeben lassen.",
        403,
        { status: loaded.status }
      );
    }
    return renderExport(loaded, query.format);
  }
);

export const POST = createHandler(
  {
    action: "legal.memo",
    rateTier: "standard",
    body: overrideSchema,
    audit: (_ctx, body) => ({
      action: "verification.override_granted" as const,
      entityType: "work_product",
      details: { action: "export_docx", format: body.format, reason: body.override_reason },
    }),
  },
  async (ctx, body, _query, req) => {
    if (!can(ctx.user, "workflow.approve")) {
      return apiError(
        "forbidden",
        "Nur Anwält:innen oder Administrator:innen dürfen vor der Freigabe exportieren.",
        403
      );
    }
    const loaded = await loadExportable(ctx, req);
    if (loaded instanceof Response) return loaded;
    return renderExport(loaded, body.format);
  }
);

function isReleased(wp: WorkProduct): boolean {
  // The approval covers the content hash it was given for; content edits reset
  // the status to draft, and a stale hash is refused all the same.
  return isPublishable(wp) && !!wp.content && wp.content_hash === hashContent(wp.content ?? "");
}

async function loadExportable(ctx: HandlerContext, req: Request): Promise<WorkProduct | Response> {
  const id = new URL(req.url).pathname.split("/").slice(-2)[0]!;
  const wp = await getWorkProduct(id, ctx.brainId);
  if (!wp) return apiError("not_found", "Work product not found", 404);
  if (!(wp.content ?? "").trim()) {
    return apiError("empty_content", "Das Work Product hat keinen Inhalt", 400);
  }
  return wp;
}

async function renderExport(wp: WorkProduct, format: "docx" | "xlsx"): Promise<Response> {
  const content = wp.content ?? "";
  const safeName = encodeURIComponent(wp.title.replace(/[^\wäöüÄÖÜß -]/g, "").slice(0, 80));

  if (format === "xlsx") {
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

  // Art. 50 KI-VO: a work product is AI output — always marked.
  const docx = await generateDocx(content, { title: wp.title, aiGenerated: true });
  const buf = docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.byteLength);
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}.docx"`,
    },
  });
}
