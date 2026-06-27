import { z } from "zod";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError } from "@/lib/api-handler";
import { executeApprovedAction } from "@/lib/approval-execution";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
      const brain = createServerBrainClient(ctx.headers);
      const result = await executeApprovedAction(
        {
          brainId: ctx.brainId,
          getPage: brain.getPage,
          createPage: brain.createPage,
          updatePage: brain.updatePage,
          sendProactiveWhatsApp: sendProactiveMessage,
        },
        {
          actionSlug: body.id,
          executedBy: ctx.user.email,
          force: body.force === true,
        }
      );

      return Response.json({ ok: true, result });
    } catch (err) {
      console.error(
        "[approvals/execute] failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError(
        "approval_execution_failed",
        err instanceof Error ? err.message : "Freigabe konnte nicht ausgefuehrt werden",
        400
      );
    }
  }
);
