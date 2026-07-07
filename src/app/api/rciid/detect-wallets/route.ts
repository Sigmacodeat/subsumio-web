import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import {
  detectWallets,
  classifyBlockchain,
  isKnownFraudWallet,
} from "@/lib/crypto-wallet-detector";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const detectSchema = z
  .object({
    text: z.string().max(500_000).optional(),
    caseSlug: z.string().max(300).optional(),
  })
  .refine((v) => v.text || v.caseSlug, {
    message: "Either text or caseSlug must be provided",
  });

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: detectSchema,
    audit: (ctx, body) => ({
      action: "rciid.wallet_detected" as const,
      entityType: "case",
      entityId: body.caseSlug || "text-scan",
      details: {
        scannedBy: ctx.user.email,
        source: body.caseSlug ? "case" : "text",
      },
    }),
  },
  async (_ctx, body) => {
    if (body.text) {
      const wallets = detectWallets(body.text);
      return apiSuccess({
        ok: true,
        wallets: wallets.map((w) => ({
          address: w.address,
          blockchain: w.blockchain,
          confidence: w.confidence,
          context: w.context,
          isKnownFraud: isKnownFraudWallet(w.address),
        })),
        count: wallets.length,
      });
    }

    // Case-scan mode: would need to load case documents and scan them.
    // For now, return empty — the dashboard can call with text from documents.
    return apiSuccess({
      ok: true,
      wallets: [],
      count: 0,
      message:
        "Case-scan mode requires document text input. Use the text parameter with document content.",
    });
  }
);

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async () => {
    return apiSuccess({
      ok: true,
      supportedBlockchains: ["BTC", "ETH", "USDT", "SOL", "LTC", "XRP", "TRX"],
    });
  }
);
