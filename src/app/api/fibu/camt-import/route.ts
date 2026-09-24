import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { parseCamt053, CamtParseError } from "@/lib/camt053";
import { importAndMatchTransactions } from "@/lib/fibu-import.server";

const schema = z.object({
  xml: z
    .string()
    .min(20)
    .max(20 * 1024 * 1024),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: schema,
    audit: (_ctx, body) => ({
      action: "fibu.camt_import" as const,
      entityType: "bank_transaction",
      details: { bytes: body.xml.length },
    }),
  },
  async (ctx, body) => {
    let statement;
    try {
      statement = parseCamt053(body.xml);
    } catch (err) {
      if (err instanceof CamtParseError) {
        return apiError("camt_parse_error", err.message, 400);
      }
      throw err;
    }
    let result;
    try {
      result = await importAndMatchTransactions(ctx.headers, statement.transactions);
    } catch {
      return apiError("engine_error", "Engine request failed", 502);
    }
    return apiSuccess({
      iban: statement.iban,
      currency: statement.currency,
      ...result,
    });
  }
);
