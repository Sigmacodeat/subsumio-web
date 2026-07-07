import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { getCaseReport, downloadReportPdf, isConfigured } from "@/lib/rciid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const reportSchema = z.object({
  rciidCaseId: z.string().min(1).max(200),
  format: z.enum(["json", "pdf"]).default("json"),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: reportSchema,
    audit: (ctx, body) => ({
      action: "rciid.report_downloaded" as const,
      entityType: "case",
      entityId: body.rciidCaseId,
      details: {
        format: body.format,
        downloadedBy: ctx.user.email,
      },
    }),
  },
  async (_ctx, body) => {
    if (!isConfigured()) {
      return apiError("rciid_not_configured", "RCIID Integration ist nicht konfiguriert.", 503);
    }

    try {
      if (body.format === "pdf") {
        const pdfBuffer = await downloadReportPdf(body.rciidCaseId);
        return new Response(new Uint8Array(pdfBuffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="rciid-report-${body.rciidCaseId}.pdf"`,
          },
        });
      }

      const report = await getCaseReport(body.rciidCaseId);
      return apiSuccess({
        ok: true,
        caseId: report.case_id,
        status: report.status,
        reportUrl: report.report_url,
        summary: report.summary,
        findings: report.findings,
        jsonData: report.json_data,
        generatedAt: report.generated_at,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return apiError("rciid_report_failed", `RCIID Bericht-Download fehlgeschlagen: ${msg}`, 502);
    }
  }
);
