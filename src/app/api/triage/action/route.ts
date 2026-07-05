import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

const triageActionSchema = z.object({
  slug: z.string().min(1).max(300),
  action: z.enum(["accept", "reject", "assign", "create_deadline", "dismiss"]),
  case_slug: z.string().max(300).optional(),
  deadline_date: z.string().max(20).optional(),
  deadline_label: z.string().max(200).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: triageActionSchema,
    audit: (_ctx, body) => ({
      action: "triage.action" as const,
      entityType: "triage_card",
      entityId: body.slug,
      details: {
        action: body.action,
        case_slug: body.case_slug,
        deadline_date: body.deadline_date,
      },
    }),
  },
  async (ctx, body) => {
    const headers = {
      "Content-Type": "application/json",
      ...ctx.headers,
    };

    let existing: Record<string, unknown> | null = null;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.slug)}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        existing = await res.json();
      }
    } catch {
      // ignore
    }

    if (!existing) {
      return apiError("not_found", "Message not found", 404);
    }

    const fm = (existing.frontmatter ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();

    const triageUpdate: Record<string, unknown> = {
      ...fm,
      triage_status: body.action === "dismiss" ? "dismissed" : "triaged",
      triage_action_taken: body.action,
      triage_action_at: now,
      triage_action_by: ctx.user.email,
      updated_at: now,
    };

    if (body.action === "assign" && body.case_slug) {
      triageUpdate.assigned_case_slug = body.case_slug;
    }

    if (body.action === "create_deadline" && body.deadline_date) {
      triageUpdate.triage_deadline_created = body.deadline_date;
      triageUpdate.triage_deadline_label = body.deadline_label ?? "Frist aus Triage";
    }

    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.slug)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        slug: body.slug,
        title: existing.title,
        type: existing.type,
        content: existing.content ?? "",
        frontmatter: triageUpdate,
        merge: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError("update_failed", text || `engine returned ${res.status}`, 502);
    }

    let deadlineCreated = false;
    if (body.action === "create_deadline" && body.deadline_date) {
      try {
        const deadlineSlug = `legal/deadline/triage-${Date.now()}`;
        const deadlineRes = await fetch(`${ENGINE_URL}/api/pages`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            slug: deadlineSlug,
            title: body.deadline_label ?? "Frist aus Triage",
            type: "legal_deadline",
            content: "",
            frontmatter: {
              type: "legal_deadline",
              date: body.deadline_date,
              source: "triage",
              source_slug: body.slug,
              status: "open",
              created_at: now,
              updated_at: now,
            },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        deadlineCreated = deadlineRes.ok;
      } catch {
        // best-effort — the triage update itself succeeded
      }
    }

    return apiSuccess({
      slug: body.slug,
      action: body.action,
      deadline_created: deadlineCreated,
    });
  }
);
