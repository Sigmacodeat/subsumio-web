import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { caseFrontmatter, type TimeEntry } from "@/lib/legal-types";
import { createTimeEntry, appendTimeEntries } from "@/lib/time-tracking";
import { createServerBrainClient } from "@/lib/server-brain";
import { portalMessageSlugPrefix } from "@/lib/portal-messages";
import { notifyPortalClients } from "@/lib/portal-push";
import { mailPortalClients } from "@/lib/portal-notify";

const replySchema = z.object({
  case_slug: z.string().min(1).max(300),
  message: z.string().trim().min(1, "message_required").max(5_000, "message_too_long"),
  /** WP-3.16: Antwort als abrechenbare Leistung verbuchen (Minuten). */
  bill_minutes: z.number().int().min(1).max(600).optional(),
  bill_note: z.string().trim().max(300).optional(),
});

/**
 * time_entries auf der Akten-Seite anhängen — atomar via
 * /api/pages/array-append (ein UPDATE, kein Read-Modify-Write, kein Retry).
 */
async function appendTimeEntry(
  headers: Record<string, string>,
  caseSlug: string,
  entry: TimeEntry
): Promise<boolean> {
  try {
    await appendTimeEntries(createServerBrainClient(headers), caseSlug, [entry]);
    return true;
  } catch {
    return false;
  }
}

/**
 * The firm's reply to a client in the portal. It is stored next to the
 * client's messages, so the portal's message tab shows the conversation.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: replySchema,
    audit: (_ctx, body) => ({
      action: "portal.reply" as const,
      entityType: "portal_message",
      entityId: body.case_slug,
      details: { length: body.message.length },
    }),
  },
  async (ctx, body) => {
    const caseRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.case_slug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!caseRes.ok) return apiError("case_not_found", "Akte nicht gefunden", 404);
    const fm = caseFrontmatter(await caseRes.json());
    if (fm.status === "archived" || !fm.portal_enabled) {
      return apiError(
        "portal_disabled",
        "Das Mandantenportal ist für diese Akte nicht freigegeben.",
        409
      );
    }

    const now = new Date().toISOString();
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        slug: `${portalMessageSlugPrefix(body.case_slug)}${Date.now()}`,
        title: "Antwort der Kanzlei",
        type: "portal_message",
        content: body.message,
        frontmatter: {
          type: "portal_message",
          case_slug: body.case_slug,
          sender: "lawyer",
          author: ctx.user?.name ?? ctx.user?.email ?? "Kanzlei",
          message: body.message,
          read: true,
          created_at: now,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return apiError("save_failed", "Antwort konnte nicht gespeichert werden", 502);
    // Devices that turned on notifications in the portal hear about it —
    // without the reply's content (lib/portal-push.ts).
    // WP-3.16: Kontaktzeit optional als Leistung auf die Akte buchen.
    let billed = false;
    if (body.bill_minutes) {
      billed = await appendTimeEntry(ctx.headers, body.case_slug, {
        ...createTimeEntry({
          description:
            body.bill_note ??
            `Portal-Nachricht an Mandant (${body.message.slice(0, 80)}${body.message.length > 80 ? "…" : ""})`,
          minutes: body.bill_minutes,
          date: now.slice(0, 10),
          lawyer: ctx.user?.name ?? ctx.user?.email ?? undefined,
          activity_type: "email",
        }),
        note: "portal_message",
      });
    }

    const notified = await notifyPortalClients(ctx.brainId, body.case_slug, {
      title: "Neue Nachricht Ihrer Kanzlei",
      body: "Ihre Kanzlei hat Ihnen im Mandantenportal geantwortet.",
    }).catch(() => 0);
    const mailed = await mailPortalClients(ctx.headers, body.case_slug).catch(() => 0);
    return Response.json({ ok: true, created_at: now, notified, mailed, billed });
  }
);
