import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { setLeadStatus } from "@/lib/concierge/store";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "contacted", "won", "lost"]),
});

/** PATCH /api/admin/leads — operator marks a website contact request as handled. */
export const PATCH = createHandler(
  {
    action: "platform.operator",
    body: patchSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "lead",
      entityId: body.id,
      details: { status: body.status, operator: ctx.user.email },
    }),
  },
  async (_ctx, body) => {
    const ok = await setLeadStatus(body.id, body.status);
    if (!ok) return apiError("not_found", "Anfrage nicht gefunden", 404);
    return apiSuccess({ id: body.id, status: body.status });
  }
);
