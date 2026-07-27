import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import {
  scanCaseForWallets,
  shouldSuggestForensics,
  formatScanSummary,
} from "@/lib/crypto-auto-detect";
import { isKnownFraudWallet } from "@/lib/crypto-wallet-detector";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const scanSchema = z.object({
  caseSlug: z.string().min(1).max(300),
});

/**
 * POST: Scan all documents of a case for crypto wallet addresses.
 * Returns found wallets, suggestions, and scan statistics.
 */
export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "heavy",
    body: scanSchema,
    audit: (ctx, body) => ({
      action: "rciid.case_scanned" as const,
      entityType: "case",
      entityId: body.caseSlug,
      details: {
        scannedBy: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    try {
      const headers: Record<string, string> = {};
      if (ctx.user?.email) {
        headers["x-subsumio-user"] = ctx.user.email;
      }

      const result = await scanCaseForWallets(body.caseSlug, headers);
      const suggest = shouldSuggestForensics(result);
      const summary = formatScanSummary(result);

      return apiSuccess({
        ok: true,
        wallets: result.wallets.map((w) => ({
          address: w.address,
          blockchain: w.blockchain,
          confidence: w.confidence,
          context: w.context,
          checksumValid: w.checksumValid ?? false,
          checksumError: w.checksumError,
          isKnownFraud: isKnownFraudWallet(w.address),
        })),
        documentsScanned: result.documentsScanned,
        totalAddressesFound: result.totalAddressesFound,
        validAddressesFound: result.validAddressesFound,
        suggestions: result.suggestions,
        shouldSuggestForensics: suggest,
        summary,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return apiError("rciid_scan_failed", `Fall-Scan fehlgeschlagen: ${msg}`, 502);
    }
  }
);
