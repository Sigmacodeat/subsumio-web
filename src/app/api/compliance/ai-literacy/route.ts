/**
 * KI-Kompetenz-Nachweise (Art. 4 KI-VO) — siehe src/lib/ai-literacy.ts.
 *
 * GET: Admin sieht alle Nachweise der Kanzlei und wer noch keinen hat
 *      (`?format=csv` exportiert die Liste); alle anderen nur ihre eigenen.
 * POST (nur Admin): Nachweis für eine Person der Kanzlei erfassen.
 */
import { z } from "zod";
import { createHandler, apiError, apiSuccess, type HandlerContext } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import {
  addAiLiteracyRecord,
  aiLiteracyCsv,
  listAiLiteracyRecords,
  membersWithoutRecord,
  type LiteracyMember,
} from "@/lib/ai-literacy";

export const dynamic = "force-dynamic";

const querySchema = z.object({ format: z.enum(["json", "csv"]).default("json") });

const postSchema = z.object({
  user_id: z.string().min(1).max(200),
  trained_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date_format")
    .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "date_invalid"),
  topic: z.string().trim().min(3).max(500),
  confirmed_by: z.string().trim().min(2).max(200),
});

/** The firm's people (the caller alone without a firm). */
async function firmMembers(ctx: HandlerContext): Promise<LiteracyMember[]> {
  const users = ctx.user.orgId
    ? await getStore().listByOrg(ctx.user.orgId)
    : [await getStore().getById(ctx.user.id)].filter((u) => u !== null);
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    deactivatedAt: u.deactivatedAt ?? null,
  }));
}

export const GET = createHandler(
  { action: "settings.read", rateTier: "standard", query: querySchema },
  async (ctx, _body, query) => {
    const records = await listAiLiteracyRecords(ctx.brainId);
    const isAdmin = ctx.user.role === "admin";
    if (!isAdmin) {
      if (query.format === "csv") return apiError("forbidden", "Nur für Administrator:innen", 403);
      return apiSuccess({ records: records.filter((r) => r.user_id === ctx.user.id) });
    }
    const members = await firmMembers(ctx);
    if (query.format === "csv") {
      return new Response(aiLiteracyCsv(records, members), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="ki-kompetenz-nachweise.csv"',
          "Cache-Control": "private, no-store",
        },
      });
    }
    const missing = membersWithoutRecord(members, records).map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
    }));
    return apiSuccess({
      records,
      members: members
        .filter((m) => !m.deactivatedAt)
        .map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role })),
      missing,
    });
  }
);

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    body: postSchema,
    audit: (_ctx, body) => ({
      action: "compliance.ai_training_record" as const,
      entityType: "ai_literacy",
      entityId: body.user_id,
      details: { trained_on: body.trained_on, confirmed_by: body.confirmed_by },
    }),
  },
  async (ctx, body) => {
    const members = await firmMembers(ctx);
    if (!members.some((m) => m.id === body.user_id)) {
      return apiError("not_a_member", "Die Person gehört nicht zur Kanzlei.", 404);
    }
    const record = await addAiLiteracyRecord({
      brainId: ctx.brainId,
      userId: body.user_id,
      trainedOn: body.trained_on,
      topic: body.topic,
      confirmedBy: body.confirmed_by,
      recordedBy: ctx.user.email,
    });
    return apiSuccess(record, undefined, 201);
  }
);
