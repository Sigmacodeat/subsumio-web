
import { z } from "zod";
import { api } from "@/lib/api";
import {
  agentActionFrontmatter,
  requiresApproval,
  type ActionType,
  type ApprovalStatus,
} from "@/lib/approval";
import { executeApprovedAction } from "@/lib/approval-execution";
import { createHandler, apiError } from "@/lib/api-handler";
import { sendWhatsAppText } from "@/lib/whatsapp/send";

export const dynamic = "force-dynamic";

const approvalsQuerySchema = z.object({
  status: z.string().default("pending"),
  limit: z.string().optional(),
});

const approvalsPostSchema = z.object({
  action_type: z.enum([
    "document_finalize",
    "deadline_create",
    "booking_create",
    "message_send",
    "case_create",
    "case_close",
    "invoice_create",
    "client_message_send",
    "document_request_send",
    "deadline_confirm",
  ]),
  summary: z.string().min(1, "summary_required").max(500),
  target_slug: z.string().optional(),
  source_event_slug: z.string().optional(),
  workflow_run_slug: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});

const approvalsPatchSchema = z.object({
  id: z.string().min(1, "id_required"),
  decision: z.enum(["approved", "rejected"]),
  reject_reason: z.string().max(500).optional(),
  execute: z.boolean().optional(),
  force: z.boolean().optional(),
});

export const GET = createHandler(
  {
    action: "agent.read",
    rateTier: "standard",
    query: approvalsQuerySchema,
  },
  async (_ctx, _body, query, _req) => {
    const limit = Math.min(parseInt(query.limit || "50", 10), 200);
    try {
      const pages = await api.brain.listPages({ type: "agent_action", limit });
      const items = pages
        .filter((p) => {
          const fm = p.frontmatter as Record<string, unknown>;
          if (query.status !== "all" && fm.status !== query.status) return false;
          return true;
        })
        .map((p) => {
          const fm = p.frontmatter as Record<string, unknown>;
          return {
            id: p.slug,
            action_type: fm.action_type,
            status: fm.status,
            proposed_by: fm.proposed_by,
            target_slug: fm.target_slug ?? null,
            summary: fm.summary,
            proposed_at: fm.proposed_at,
            decided_at: fm.decided_at ?? null,
            decided_by: fm.decided_by ?? null,
            reject_reason: fm.reject_reason ?? null,
          };
        });
      return Response.json({ items, total: items.length });
    } catch (err) {
      console.error("[approvals] list failed:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Freigaben konnten nicht geladen werden", 500);
    }
  },
);

export const POST = createHandler(
  {
    action: "agent.write",
    rateTier: "standard",
    body: approvalsPostSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "agent_action",
      details: { action_type: body.action_type, proposed_by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, _req) => {
    const now = new Date();
    const slug = `agent-action/${now.toISOString().slice(0, 10)}/${body.action_type}-${Date.now()}`;

    await api.brain.createPage({
      slug,
      title: `Freigabe: ${body.summary.slice(0, 60)}`,
      type: "agent_action",
      content: body.summary,
      frontmatter: agentActionFrontmatter({
        action_type: body.action_type as ActionType,
        proposed_by: ctx.user.email,
        summary: body.summary,
        target_slug: body.target_slug,
        source_event_slug: body.source_event_slug,
        workflow_run_slug: body.workflow_run_slug,
        payload: body.payload,
        at: now,
      }),
    });

    return Response.json({ id: slug, requires_approval: requiresApproval(body.action_type as ActionType) }, { status: 201 });
  },
);

export const PATCH = createHandler(
  {
    action: "agent.control",
    rateTier: "standard",
    body: approvalsPatchSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "agent_action",
      entityId: body.id,
      details: { decision: body.decision, decided_by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, _req) => {
    const now = new Date().toISOString();
    await api.brain.updatePage({
      slug: body.id,
      frontmatter: {
        status: body.decision as ApprovalStatus,
        decided_at: now,
        decided_by: ctx.user.email,
        ...(body.decision === "rejected" && body.reject_reason
          ? { reject_reason: body.reject_reason }
          : {}),
      },
    });

    if (body.decision === "approved" && body.execute === true) {
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
        return Response.json({ ok: true, id: body.id, decision: body.decision, decided_at: now, execution: result });
      } catch (err) {
        console.error("[approvals] execute after decision failed:", err instanceof Error ? err.message : String(err));
        return apiError(
          "approval_execution_failed",
          err instanceof Error ? err.message : "Freigabe wurde gespeichert, Ausfuehrung ist fehlgeschlagen",
          400
        );
      }
    }

    return Response.json({ ok: true, id: body.id, decision: body.decision, decided_at: now });
  },
);
