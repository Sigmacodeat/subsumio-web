import { z } from "zod";
import { calculateStBVV, STBVV_ACTIVITIES, type StBVVActivity } from "@/lib/stbvv";
import { createHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

const validActivities = STBVV_ACTIVITIES.map((a) => a.value) as [StBVVActivity, ...StBVVActivity[]];

const stbvvPostSchema = z
  .object({
    gegenstandswert: z
      .union([z.number(), z.string()])
      .transform((v) => (typeof v === "string" ? parseFloat(v) : v)),
    activity: z.enum(validActivities).default("steuererklaerung"),
    faktor: z.number().min(0.1).max(10).optional(),
  })
  .refine((data) => Number.isFinite(data.gegenstandswert) && data.gegenstandswert > 0, {
    message: "gegenstandswert_required",
  })
  .refine((data) => data.gegenstandswert <= 100_000_000, {
    message: "gegenstandswert_too_large",
  });

const stbvvQuerySchema = z.object({
  gegenstandswert: z.string().refine((v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 && n <= 100_000_000;
  }, "gegenstandswert_required"),
  activity: z.enum(validActivities).default("steuererklaerung"),
});

export const POST = createHandler(
  {
    action: "tax.stbvv",
    rateTier: "standard",
    body: stbvvPostSchema,
    audit: (_ctx, body) => ({
      action: "tax.stbvv" as const,
      entityType: "stbvv_calculation",
      details: { gegenstandswert: body.gegenstandswert, activity: body.activity },
    }),
  },
  async (_ctx, body, _query, _req) => {
    return Response.json(calculateStBVV(body.gegenstandswert, body.activity, body.faktor));
  }
);

export const GET = createHandler(
  {
    action: "tax.stbvv",
    rateTier: "standard",
    query: stbvvQuerySchema,
    cacheMaxAge: 300,
  },
  async (_ctx, _body, query, _req) => {
    const gegenstandswert = parseFloat(query.gegenstandswert);
    return Response.json(calculateStBVV(gegenstandswert, query.activity));
  }
);
