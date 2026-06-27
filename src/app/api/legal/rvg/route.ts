import { z } from "zod";
import { calculateRvg } from "@/lib/rvg";
import { createHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

const rvgPostSchema = z
  .object({
    streitwert: z
      .union([z.number(), z.string()])
      .transform((v) => (typeof v === "string" ? parseFloat(v) : v)),
  })
  .refine((data) => Number.isFinite(data.streitwert) && data.streitwert > 0, {
    message: "streitwert_required",
  })
  .refine((data) => data.streitwert <= 100_000_000, {
    message: "streitwert_too_large",
  });

const rvgQuerySchema = z.object({
  streitwert: z.string().refine((v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 && n <= 100_000_000;
  }, "streitwert_required"),
});

export const POST = createHandler(
  {
    action: "legal.rvg",
    rateTier: "standard",
    body: rvgPostSchema,
    audit: (_ctx, body) => ({
      action: "legal.rvg" as const,
      entityType: "rvg_calculation",
      details: { streitwert: body.streitwert },
    }),
  },
  async (_ctx, body, _query, _req) => {
    return Response.json(calculateRvg(body.streitwert));
  }
);

export const GET = createHandler(
  {
    action: "legal.rvg",
    rateTier: "standard",
    query: rvgQuerySchema,
    cacheMaxAge: 300,
  },
  async (_ctx, _body, query, _req) => {
    const streitwert = parseFloat(query.streitwert);
    return Response.json(calculateRvg(streitwert));
  }
);
