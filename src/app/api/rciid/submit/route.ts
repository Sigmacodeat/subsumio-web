import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { submitCase, isConfigured, type RciidCaseSubmission } from "@/lib/rciid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const walletSchema = z.object({
  address: z.string().min(20).max(120),
  blockchain: z.enum(["BTC", "ETH", "USDT", "SOL", "LTC", "XRP", "TRX", "UNKNOWN"]),
  label: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

const submitSchema = z.object({
  caseSlug: z.string().min(1).max(300),
  caseTitle: z.string().max(300).optional(),
  clientReference: z.string().max(200).optional(),
  lawyerReference: z.string().max(200).optional(),
  jurisdiction: z.enum(["DE", "AT", "CH", "EU"]).default("AT"),
  caseType: z.string().max(100).default("crypto_fraud"),
  wallets: z.array(walletSchema).min(1).max(50),
  description: z.string().max(5000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("high"),
  webhookUrl: z.string().url().optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: submitSchema,
    audit: (ctx, body) => ({
      action: "rciid.case_submitted" as const,
      entityType: "case",
      entityId: body.caseSlug,
      details: {
        walletCount: body.wallets.length,
        blockchains: body.wallets.map((w) => w.blockchain),
        priority: body.priority,
        jurisdiction: body.jurisdiction,
        submittedBy: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    if (!isConfigured()) {
      return apiError(
        "rciid_not_configured",
        "RCIID Integration ist nicht konfiguriert. Bitte RCIID_API_KEY setzen.",
        503
      );
    }

    const submission: RciidCaseSubmission = {
      external_case_id: body.caseSlug,
      client_reference: body.clientReference,
      lawyer_reference: body.lawyerReference || ctx.user.name,
      jurisdiction: body.jurisdiction,
      case_type: body.caseType,
      wallets: body.wallets.map((w) => ({
        address: w.address,
        blockchain: w.blockchain,
        label: w.label,
        notes: w.notes,
      })),
      description: body.description,
      priority: body.priority,
      webhook_url: body.webhookUrl,
      metadata: {
        case_title: body.caseTitle,
        submitted_by: ctx.user.email,
        source: "subsumio-dashboard",
      },
    };

    try {
      const rciidCase = await submitCase(submission);
      return apiSuccess({
        ok: true,
        caseId: rciidCase.case_id,
        status: rciidCase.status,
        pricing: rciidCase.pricing,
        estimatedCompletionDays: rciidCase.estimated_completion_days,
        webhookRegistered: rciidCase.webhook_registered,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return apiError("rciid_submit_failed", `RCIID Übermittlung fehlgeschlagen: ${msg}`, 502);
    }
  }
);
