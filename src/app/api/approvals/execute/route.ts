import { z } from "zod";
import { api } from "@/lib/api";
import { createHandler, apiError } from "@/lib/api-handler";
import { executeApprovedAction } from "@/lib/approval-execution";
import { sendWhatsAppText } from "@/lib/whatsapp/send";

export const dynamic = "force-dynamic";

const executeSchema = z.object({
  id: z.string().min(1, "id_required"),
  force: z.boolean().optional(),
});

export const POST = createHandler(
  {
    action: "agent.control",
    rateTier: "standard",
    body: executeSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "agent_action",
      entityId: body.id,
      details: { execution_requested_by: ctx.user.email, force: body.force === true },
    }),
  },
  async (ctx, body) => {
    try {
      const result = await executeApprovedAction({
        brainId: ctx.brainId,
        getPage: api.brain.getPage,
        createPage: api.brain.createPage,
        updatePage: api.brain.updatePage,
        sendWhatsAppText,
      }, {
        actionSlug: body.id,
        executedBy: ctx.user.email,
        force: body.force === true,
      });

      return Response.json({ ok: true, result });
    } catch (err) {
      console.error("[approvals/execute] failed:", err instanceof Error ? err.message : String(err));
      return apiError(
        "approval_execution_failed",
        err instanceof Error ? err.message : "Freigabe konnte nicht ausgefuehrt werden",
        400
      );
    }
  },
);
