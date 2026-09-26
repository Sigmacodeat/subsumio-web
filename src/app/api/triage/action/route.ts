import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";

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
    // The triage card carries the date as written ("15.3.2026" or ISO); the
    // Fristenbuch reads ISO `due_date` only.
    const deadlineDate = body.deadline_date ? normalizeDeadlineDate(body.deadline_date) : null;
    if (body.action === "create_deadline" && body.deadline_date && !deadlineDate) {
      return apiError("invalid_deadline_date", "Fristdatum nicht lesbar (TT.MM.JJJJ)", 400);
    }
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

    if (body.action === "create_deadline" && deadlineDate) {
      triageUpdate.triage_deadline_created = deadlineDate;
      triageUpdate.triage_deadline_label = body.deadline_label ?? "Frist aus Triage";
    }

    // The engine has no PATCH route for pages — merge writes are POST + merge.
    const res = await enginePatchPage(
      headers,
      {
        slug: body.slug,
        frontmatter: triageUpdate,
      },
      { timeoutMs: 10_000 }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return apiError("update_failed", text || `engine returned ${res.status}`, 502);
    }

    let deadlineCreated = false;
    if (body.action === "create_deadline" && deadlineDate) {
      try {
        const deadlineSlug = `legal/deadline/triage-${Date.now()}`;
        const label = body.deadline_label ?? "Frist aus Triage";
        // Only a confirmed matter assignment binds the deadline to a matter;
        // the triage guess is kept as a hint for the reviewer.
        const caseSlug = [body.case_slug, fm.case_slug, fm.assigned_case_slug].find(
          (v): v is string => typeof v === "string" && v.trim().length > 0
        );
        const suggestedCase =
          typeof fm.triage_suggested_case === "string" ? fm.triage_suggested_case : undefined;
        const deadlineRes = await fetch(`${ENGINE_URL}/api/pages`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            slug: deadlineSlug,
            title: label,
            type: "legal_deadline",
            content: "Frist aus der Posteingangs-Triage — anwaltlich zu prüfen.",
            frontmatter: {
              type: "legal_deadline",
              title: label,
              description: label,
              due_date: deadlineDate,
              ...(caseSlug ? { case_slug: caseSlug } : {}),
              ...(!caseSlug && suggestedCase ? { suggested_case_slug: suggestedCase } : {}),
              source: "triage",
              source_slug: body.slug,
              status: "pending",
              // A triage date is a machine suggestion: it stays "ungeprüft"
              // in the Fristenbuch until a lawyer confirms it.
              review_status: "unreviewed",
              created_by: ctx.user.email,
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

/** "15.3.2026" / "15.03.2026" / "2026-03-15" → "2026-03-15"; anything else → null. */
function normalizeDeadlineDate(value: string): string | null {
  const v = value.trim();
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  const iso = de
    ? `${de[3]}-${de[2]!.padStart(2, "0")}-${de[1]!.padStart(2, "0")}`
    : /^\d{4}-\d{2}-\d{2}$/.test(v)
      ? v
      : null;
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}
