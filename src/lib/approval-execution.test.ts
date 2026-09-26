import { describe, expect, it, vi } from "vitest";
import { executeApprovedAction, type ApprovalExecutionDeps } from "./approval-execution";
import type { PageArrayMutation } from "./server-brain";
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
    createCase: vi.fn(async () => ({
      status: "created" as const,
      slug: "legal/cases/muster-beispiel-abcd1234",
    })),
    createPage: vi.fn(async (p) => {
      created.push(p);
      return { slug: p.slug };
    }),
    updatePage: vi.fn(async (p) => {
      updated.push(p);
      return { slug: p.slug, success: true };
    }),
    // Minimal mirror of page_array_mutate for tests: set/unset/remove by id.
    mutatePageArray: vi.fn(async (slug: string, field: string, mutation: PageArrayMutation) => {
      const cur =
        page.slug === slug && Array.isArray(page.frontmatter?.[field])
          ? (page.frontmatter[field] as Record<string, unknown>[])
          : [];
      const wanted = new Set(mutation.match.map(String));
      const matched = cur
        .map((e) => String(e[mutation.match_key ?? "id"]))
        .filter((id) => wanted.has(id));
      return {
        slug,
        field,
        matched_ids: matched,
        updated_ids: matched,
        skipped_ids: [],
        not_found_ids: mutation.match.map((m) => String(m)).filter((id) => !matched.includes(id)),
        items: cur,
        length: cur.length,
      };
    }),
  };
}

describe("executeApprovedAction", () => {
  it("creates a legal case from an approved case_create action", async () => {
    const deps = depsFor(
      actionPage({
        action_type: "case_create",
        payload: { title: "Muster ./. Beispiel", client_name: "Max" },
      })
    );

    const result = await executeApprovedAction(deps, {
      actionSlug: "agent-action/1",
      executedBy: "lawyer@test",
    });

    expect(result.status).toBe("executed");
    expect(result.effects[0].kind).toBe("case_created");
    // Goes through the safe create path, never a plain createPage.
    expect(deps.createPage).not.toHaveBeenCalled();
    expect(deps.createCase).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Muster ./. Beispiel",
        frontmatter: expect.objectContaining({ type: "legal_case", client_name: "Max" }),
      })
    );
    expect(result.effects[0].slug).toBe("legal/cases/muster-beispiel-abcd1234");
    expect(deps.updated.at(-1)).toMatchObject({
      slug: "agent-action/1",
      frontmatter: {
        execution_status: "executed",
        executed_by: "lawyer@test",
      },
    });
  });

  it("skips an already executed action unless force is set", async () => {
    const deps = depsFor(
      actionPage({
        action_type: "case_create",
        execution_status: "executed",
        payload: { title: "Schon erledigt" },
      })
    );

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
      ...depsFor(
        actionPage({
          action_type: "client_message_send",
          payload: { channel: "whatsapp", to: "+491701234567", message: "Hallo" },
        })
      ),
      sendWhatsAppText,
    };

    const result = await executeApprovedAction(deps, {
      actionSlug: "agent-action/1",
      executedBy: "lawyer@test",
    });

    expect(sendWhatsAppText).toHaveBeenCalledWith("+491701234567", "Hallo");
    expect(result.effects).toContainEqual({ kind: "whatsapp_sent", message: "Sent to 4567" });
  });

  it("fails a guarded WhatsApp approval when proactive compliance blocks it", async () => {
    const sendProactiveWhatsApp = vi.fn(async () => ({
      sent: false,
      decision: {
        decision: "block" as const,
        mustUseTemplate: true,
        reason: "template_required" as const,
      },
    }));
    const deps = {
      ...depsFor(
        actionPage({
          action_type: "client_message_send",
          payload: { channel: "whatsapp", to: "+491701234567", message: "Hallo" },
        })
      ),
      brainId: "brain-1",
      sendProactiveWhatsApp,
    };

    await expect(
      executeApprovedAction(deps, {
        actionSlug: "agent-action/1",
        executedBy: "lawyer@test",
      })
    ).rejects.toThrow("whatsapp_blocked:template_required");

    expect(sendProactiveWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({
        brainId: "brain-1",
        scope: "client_reminder",
        freeform: "Hallo",
      })
    );
    expect(deps.updated.at(-1)).toMatchObject({
      slug: "agent-action/1",
      frontmatter: {
        execution_status: "failed",
        execution_error: "whatsapp_blocked:template_required",
      },
    });
  });

  it("marks document requests as sent and creates one when target is missing", async () => {
    const deps = depsFor(
      actionPage({
        action_type: "document_request_send",
        source_event_slug: "legal/conversations/whatsapp/wamid",
        payload: {
          case_slug: "legal/cases/2026-001",
          items: ["Vollmacht", "Bescheid"],
          message: "Bitte senden",
        },
      })
    );

    const result = await executeApprovedAction(deps, {
      actionSlug: "agent-action/1",
      executedBy: "lawyer@test",
    });

    expect(result.effects.map((e) => e.kind)).toEqual([
      "document_request_created",
      "document_request_sent",
    ]);
    expect(deps.created[0]).toMatchObject({ type: "document_request" });
    expect(
      deps.updated.some((u) => {
        const update = u as { frontmatter?: Record<string, unknown> };
        return update.frontmatter?.status === "sent";
      })
    ).toBe(true);
  });

  it("does not mark a document request as sent when guarded WhatsApp send is blocked", async () => {
    const deps = {
      ...depsFor(
        actionPage({
          action_type: "document_request_send",
          source_event_slug: "legal/conversations/whatsapp/wamid",
          payload: {
            case_slug: "legal/cases/2026-001",
            items: ["Vollmacht"],
            to: "+491701234567",
            message: "Bitte senden",
          },
        })
      ),
      brainId: "brain-1",
      sendProactiveWhatsApp: vi.fn(async () => ({
        sent: false,
        decision: {
          decision: "block" as const,
          mustUseTemplate: false,
          reason: "no_consent" as const,
        },
      })),
    };

    await expect(
      executeApprovedAction(deps, {
        actionSlug: "agent-action/1",
        executedBy: "lawyer@test",
      })
    ).rejects.toThrow("whatsapp_blocked:no_consent");

    expect(deps.created[0]).toMatchObject({ type: "document_request" });
    expect(
      deps.updated.some((u) => {
        const update = u as { frontmatter?: Record<string, unknown> };
        return update.frontmatter?.status === "sent";
      })
    ).toBe(false);
  });

  it("fails unapproved actions and does not execute them", async () => {
    const deps = depsFor(
      actionPage({
        action_type: "case_create",
        status: "pending",
        payload: { title: "Nicht freigegeben" },
      })
    );

    await expect(
      executeApprovedAction(deps, {
        actionSlug: "agent-action/1",
        executedBy: "lawyer@test",
      })
    ).rejects.toThrow("action_not_approved");
    expect(deps.createPage).not.toHaveBeenCalled();
  });
  it("does not overwrite an existing matter named in case_slug (OPS-14)", async () => {
    const deps = {
      ...depsFor(
        actionPage({
          action_type: "case_create",
          payload: { title: "Neu", case_slug: "legal/cases/bestehend" },
        })
      ),
      createCase: vi.fn(async () => ({
        status: "exists" as const,
        slug: "legal/cases/bestehend",
      })),
    };
    await expect(
      executeApprovedAction(deps, { actionSlug: "agent-action/1", executedBy: "lawyer@test" })
    ).rejects.toThrow("case_slug_exists");
    expect(deps.createCase).toHaveBeenCalledWith(
      expect.objectContaining({ requestedSlug: "legal/cases/bestehend" })
    );
    expect(deps.createPage).not.toHaveBeenCalled();
    expect(deps.updated.at(-1)).toMatchObject({
      frontmatter: { execution_status: "failed" },
    });
  });

  it("fails with conflict_detected when the conflict check has a hit (OPS-14)", async () => {
    const deps = {
      ...depsFor(
        actionPage({ action_type: "case_create", payload: { title: "Neu", client_name: "X" } })
      ),
      createCase: vi.fn(async () => ({
        status: "conflict" as const,
        matches: [{ name: "X", slug: "contacts/x", type: "legal_contact" }],
      })),
    };
    await expect(
      executeApprovedAction(deps, { actionSlug: "agent-action/1", executedBy: "lawyer@test" })
    ).rejects.toThrow("conflict_detected");
    expect(deps.createPage).not.toHaveBeenCalled();
  });

  it("refuses case_create when no safe create path is attached", async () => {
    const deps = {
      ...depsFor(actionPage({ action_type: "case_create", payload: { title: "Neu" } })),
      createCase: undefined,
    };
    await expect(
      executeApprovedAction(deps, { actionSlug: "agent-action/1", executedBy: "lawyer@test" })
    ).rejects.toThrow("case_create_unavailable");
    expect(deps.createPage).not.toHaveBeenCalled();
  });
});

describe("executeApprovedAction — deadline_create never lands on another record", () => {
  it("ignores a proposed slug outside legal/deadlines/ and creates only if absent", async () => {
    const deps = depsFor(
      actionPage({
        action_type: "deadline_create",
        payload: {
          title: "Berufung",
          due_date: "2026-07-01",
          deadline_slug: "legal/cases/fremde-akte",
        },
      })
    );
    const result = await executeApprovedAction(deps, {
      actionSlug: "agent-action/1",
      executedBy: "lawyer@test",
    });
    expect(result.status).toBe("executed");
    const page = deps.created[0] as { slug: string; if_absent?: boolean };
    expect(page.slug).toMatch(/^legal\/deadlines\/berufung-\d+$/);
    expect(page.if_absent).toBe(true);
  });

  it("keeps a well-formed proposed deadline slug", async () => {
    const deps = depsFor(
      actionPage({
        action_type: "deadline_create",
        payload: {
          title: "Berufung",
          due_date: "2026-07-01",
          deadline_slug: "legal/deadlines/berufung-x",
        },
      })
    );
    await executeApprovedAction(deps, { actionSlug: "agent-action/1", executedBy: "lawyer@test" });
    expect((deps.created[0] as { slug: string }).slug).toBe("legal/deadlines/berufung-x");
  });
});
