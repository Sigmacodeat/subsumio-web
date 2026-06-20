import { describe, expect, it, vi } from "vitest";
import { executeApprovedAction, type ApprovalExecutionDeps } from "./approval-execution";
import type { BrainPage } from "./types";

function actionPage(frontmatter: Record<string, unknown>): BrainPage {
  return {
    slug: "agent-action/1",
    title: "Freigabe",
    content: "summary",
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    type: "agent_action",
    frontmatter: {
      type: "agent_action",
      status: "approved",
      proposed_by: "ai",
      summary: "summary",
      proposed_at: "2026-06-20T00:00:00.000Z",
      ...frontmatter,
    },
  };
}

function depsFor(page: BrainPage): ApprovalExecutionDeps & {
  created: unknown[];
  updated: unknown[];
} {
  const created: unknown[] = [];
  const updated: unknown[] = [];
  return {
    created,
    updated,
    now: () => new Date("2026-06-20T10:00:00.000Z"),
    getPage: vi.fn(async () => page),
    createPage: vi.fn(async (p) => {
      created.push(p);
      return { slug: p.slug };
    }),
    updatePage: vi.fn(async (p) => {
      updated.push(p);
      return { slug: p.slug, success: true };
    }),
  };
}

describe("executeApprovedAction", () => {
  it("creates a legal case from an approved case_create action", async () => {
    const deps = depsFor(actionPage({
      action_type: "case_create",
      payload: { title: "Muster ./. Beispiel", client_name: "Max" },
    }));

    const result = await executeApprovedAction(deps, {
      actionSlug: "agent-action/1",
      executedBy: "lawyer@test",
    });

    expect(result.status).toBe("executed");
    expect(result.effects[0].kind).toBe("case_created");
    expect(deps.created[0]).toMatchObject({
      type: "legal_case",
      title: "Muster ./. Beispiel",
    });
    expect(deps.updated.at(-1)).toMatchObject({
      slug: "agent-action/1",
      frontmatter: {
        execution_status: "executed",
        executed_by: "lawyer@test",
      },
    });
  });

  it("skips an already executed action unless force is set", async () => {
    const deps = depsFor(actionPage({
      action_type: "case_create",
      execution_status: "executed",
      payload: { title: "Schon erledigt" },
    }));

    const result = await executeApprovedAction(deps, {
      actionSlug: "agent-action/1",
      executedBy: "lawyer@test",
    });

    expect(result.status).toBe("skipped");
    expect(result.effects[0].kind).toBe("already_executed");
    expect(deps.createPage).not.toHaveBeenCalled();
  });

  it("sends an approved client WhatsApp message when a sender is attached", async () => {
    const sendWhatsAppText = vi.fn(async () => ({ ok: true }));
    const deps = {
      ...depsFor(actionPage({
        action_type: "client_message_send",
        payload: { channel: "whatsapp", to: "+491701234567", message: "Hallo" },
      })),
      sendWhatsAppText,
    };

    const result = await executeApprovedAction(deps, {
      actionSlug: "agent-action/1",
      executedBy: "lawyer@test",
    });

    expect(sendWhatsAppText).toHaveBeenCalledWith("+491701234567", "Hallo");
    expect(result.effects).toContainEqual({ kind: "whatsapp_sent", message: "Sent to 4567" });
  });

  it("marks document requests as sent and creates one when target is missing", async () => {
    const deps = depsFor(actionPage({
      action_type: "document_request_send",
      source_event_slug: "legal/conversations/whatsapp/wamid",
      payload: {
        case_slug: "legal/cases/2026-001",
        items: ["Vollmacht", "Bescheid"],
        message: "Bitte senden",
      },
    }));

    const result = await executeApprovedAction(deps, {
      actionSlug: "agent-action/1",
      executedBy: "lawyer@test",
    });

    expect(result.effects.map((e) => e.kind)).toEqual([
      "document_request_created",
      "document_request_sent",
    ]);
    expect(deps.created[0]).toMatchObject({ type: "document_request" });
    expect(deps.updated.some((u) => {
      const update = u as { frontmatter?: Record<string, unknown> };
      return update.frontmatter?.status === "sent";
    })).toBe(true);
  });

  it("fails unapproved actions and does not execute them", async () => {
    const deps = depsFor(actionPage({
      action_type: "case_create",
      status: "pending",
      payload: { title: "Nicht freigegeben" },
    }));

    await expect(executeApprovedAction(deps, {
      actionSlug: "agent-action/1",
      executedBy: "lawyer@test",
    })).rejects.toThrow("action_not_approved");
    expect(deps.createPage).not.toHaveBeenCalled();
  });
});
