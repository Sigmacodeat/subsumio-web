import { createHash } from "node:crypto";
import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL, engineWriteOrThrow } from "@/lib/engine";
import {
  resolveRksvAdapter,
  RksvNotConfiguredError,
  type RksvConfig,
  type RksvReceiptInput,
  type RksvSignedReceipt,
} from "@/lib/legal/rksv-adapter";
import { logger } from "@/lib/logger";

const log = logger("api/legal/rksv");

export const dynamic = "force-dynamic";

function rksvConfig(): RksvConfig {
  return {
    endpoint: process.env.RKSV_ENDPOINT,
    apiKey: process.env.RKSV_API_KEY,
    cashRegisterId: process.env.RKSV_CASH_REGISTER_ID,
  };
}

interface StoredReceipt extends RksvSignedReceipt {
  signed_at: string;
}

/** Verkettungswert: SHA-256 des letzten maschinenlesbaren Codes (RKSV § 17). */
function chainValue(receipt: RksvSignedReceipt): string {
  return createHash("sha256").update(receipt.qrPayload, "utf8").digest("base64");
}

async function lastReceiptHash(
  headers: Record<string, string>,
  cashRegisterId: string
): Promise<string> {
  // Startwert für den ersten Beleg der Kasse (RKSV): Kassen-ID gehasht.
  const startValue = createHash("sha256").update(cashRegisterId, "utf8").digest("base64");
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=rksv_receipt&limit=500`, {
      headers: { "Content-Type": "application/json", ...headers },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return startValue;
    const data = await res.json();
    const pages: { frontmatter?: { receipt?: StoredReceipt } }[] = data.pages ?? data ?? [];
    const mine = pages
      .map((p) => p.frontmatter?.receipt)
      .filter((r): r is StoredReceipt => !!r && r.cashRegisterId === cashRegisterId)
      .sort((a, b) => a.signed_at.localeCompare(b.signed_at));
    const last = mine[mine.length - 1];
    return last ? chainValue(last) : startValue;
  } catch {
    return startValue;
  }
}

const receiptSchema = z.object({
  receiptNumber: z.string().min(1).max(100),
  cashRegisterId: z.string().min(1).max(200).optional(),
  amounts: z.object({
    normal: z.number().int().optional(),
    ermaessigt1: z.number().int().optional(),
    ermaessigt2: z.number().int().optional(),
    null_satz: z.number().int().optional(),
    besonders: z.number().int().optional(),
  }),
  timestamp: z.string().optional(),
  case_slug: z.string().max(300).optional(),
});

const getSchema = z.object({
  op: z.enum(["status", "dep"]).default("status"),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const GET = createHandler(
  { action: "brain.read", rateTier: "standard", query: getSchema },
  async (ctx, _body, query) => {
    const adapter = resolveRksvAdapter(rksvConfig());
    try {
      if (query.op === "dep") {
        if (!query.from || !query.to) {
          return apiError("bad_request", "from/to erforderlich für DEP-Export", 400);
        }
        const dep = await adapter.exportDep(query.from, query.to);
        return apiSuccess(dep);
      }
      return apiSuccess(await adapter.status());
    } catch (err) {
      if (err instanceof RksvNotConfiguredError) {
        return apiError("rksv_not_configured", err.message, 503);
      }
      log.error("[rksv] GET failed:", err instanceof Error ? err.message : String(err));
      return apiError("rksv_failed", "RKSV-Dienst nicht erreichbar", 502);
    }
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: receiptSchema,
    audit: (_ctx, body) => ({
      action: "invoice.rksv_sign" as const,
      entityType: "rksv_receipt",
      entityId: body.receiptNumber,
      details: { case: body.case_slug },
    }),
  },
  async (ctx, body) => {
    const config = rksvConfig();
    const adapter = resolveRksvAdapter(config);
    const cashRegisterId = body.cashRegisterId ?? config.cashRegisterId;
    if (!cashRegisterId) {
      return apiError(
        "rksv_not_configured",
        "Kassen-ID fehlt (RKSV_CASH_REGISTER_ID oder Feld cashRegisterId).",
        503
      );
    }

    const input: RksvReceiptInput = {
      receiptNumber: body.receiptNumber,
      cashRegisterId,
      amounts: body.amounts,
      timestamp: body.timestamp ?? new Date().toISOString(),
      previousReceiptHash: await lastReceiptHash(ctx.headers, cashRegisterId),
    };

    let signed: RksvSignedReceipt;
    try {
      signed = await adapter.sign(input);
    } catch (err) {
      if (err instanceof RksvNotConfiguredError) {
        return apiError("rksv_not_configured", err.message, 503);
      }
      log.error("[rksv] sign failed:", err instanceof Error ? err.message : String(err));
      return apiError("rksv_sign_failed", "Signatur fehlgeschlagen", 502);
    }

    const stored: StoredReceipt = { ...signed, signed_at: new Date().toISOString() };
    const slug = `legal/rksv/${cashRegisterId}-${body.receiptNumber}`.replace(
      /[^a-zA-Z0-9/_-]/g,
      "-"
    );
    try {
      await engineWriteOrThrow(
        ctx.headers,
        {
          slug,
          title: `RKSV-Beleg ${body.receiptNumber}`,
          type: "rksv_receipt",
          frontmatter: {
            receipt: stored,
            case_slug: body.case_slug,
            chain_value: chainValue(signed),
          },
        },
        { timeoutMs: 10_000 }
      );
    } catch (err) {
      // Signatur ist erfolgt — Persistenz-Fehler nur protokollieren, Beleg
      // trotzdem zurückgeben (DEP-Chain bleibt über chain_value nachvollziehbar).
      log.error("[rksv] persist failed:", err instanceof Error ? err.message : String(err));
    }

    return apiSuccess({ receipt: stored, slug });
  }
);
