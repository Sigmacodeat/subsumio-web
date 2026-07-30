import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { submitCaseWithContext, isConfigured, type RciidCaseContextSubmission } from "@/lib/rciid";
import { isAddressValid } from "@/lib/crypto-checksum";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const walletSchema = z.object({
  address: z.string().min(20).max(120),
  blockchain: z.enum(["BTC", "ETH", "USDT", "SOL", "LTC", "XRP", "TRX", "UNKNOWN"]),
  label: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

const timelineEntrySchema = z.object({
  date: z.string().max(50),
  event: z.string().max(1000),
});

const targetAddressSchema = z.object({
  address: z.string().min(20).max(120),
  label: z.string().max(200).optional(),
  amount_btc: z.number().positive().optional(),
});

const victimDepositSchema = z.object({
  address: z.string().min(20).max(120),
  amount_btc: z.number().positive(),
  date: z.string().max(50),
  txid: z.string().max(100).optional(),
});

const knownRecipientSchema = z.object({
  address: z.string().min(20).max(120),
  label: z.string().max(200),
  source: z.string().max(500).optional(),
});

const exchangeLinkSchema = z.object({
  address: z.string().min(20).max(120),
  exchange: z.string().max(200),
  account_hint: z.string().max(500).optional(),
});

const evidenceRefSchema = z.object({
  type: z.string().max(100),
  description: z.string().max(2000),
  extracted_addresses: z.array(z.string().max(120)).optional(),
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

  // Structured case context (rich JSON payload)
  caseContext: z
    .object({
      summary: z.string().max(10000),
      timeline: z.array(timelineEntrySchema).max(100),
    })
    .optional(),
  targetAddresses: z.array(targetAddressSchema).max(50).optional(),
  victimDeposits: z.array(victimDepositSchema).max(100).optional(),
  knownRecipients: z.array(knownRecipientSchema).max(50).optional(),
  exchangeLinks: z.array(exchangeLinkSchema).max(50).optional(),
  evidenceRefs: z.array(evidenceRefSchema).max(100).optional(),
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
        hasCaseContext: Boolean(body.caseContext),
        targetAddressCount: body.targetAddresses?.length ?? 0,
        victimDepositCount: body.victimDeposits?.length ?? 0,
        knownRecipientCount: body.knownRecipients?.length ?? 0,
        exchangeLinkCount: body.exchangeLinks?.length ?? 0,
        evidenceRefCount: body.evidenceRefs?.length ?? 0,
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

    // Validate checksums for all wallet addresses
    const invalidAddresses: string[] = [];
    for (const w of body.wallets) {
      if (!(await isAddressValid(w.address, w.blockchain))) {
        invalidAddresses.push(w.address);
      }
    }
    if (invalidAddresses.length > 0 && invalidAddresses.length === body.wallets.length) {
      return apiError(
        "rciid_invalid_addresses",
        `Alle Wallet-Adressen haben ungültige Prüfsummen. Bitte Adressen überprüfen.`,
        422
      );
    }

    const submission: RciidCaseContextSubmission = {
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
        invalid_address_count: invalidAddresses.length,
      },

      // Structured case context
      case_context: body.caseContext
        ? {
            summary: body.caseContext.summary,
            timeline: body.caseContext.timeline,
          }
        : undefined,
      target_addresses: body.targetAddresses,
      victim_deposits: body.victimDeposits,
      known_recipients: body.knownRecipients,
      exchange_links: body.exchangeLinks,
      evidence_refs: body.evidenceRefs,
    };

    try {
      const rciidCase = await submitCaseWithContext(submission);
      return apiSuccess({
        ok: true,
        caseId: rciidCase.case_id,
        status: rciidCase.status,
        pricing: rciidCase.pricing,
        estimatedCompletionDays: rciidCase.estimated_completion_days,
        webhookRegistered: rciidCase.webhook_registered,
        invalidAddressCount: invalidAddresses.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return apiError("rciid_submit_failed", `RCIID Übermittlung fehlgeschlagen: ${msg}`, 502);
    }
  }
);
