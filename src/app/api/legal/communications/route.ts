import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { listEnginePages } from "@/lib/engine-pages";
import { listPortalMessages } from "@/lib/portal-messages";
import { listMailMessages } from "@/lib/email/mailbox";
import { mailboxScopeFor } from "@/lib/email/mailbox-scope";
import { caseAccessForUser } from "@/lib/email/case-link";
import type { InboundEntry } from "@/lib/inbound-register";
import type { OutboundEntry } from "@/lib/outbound-register";

export const dynamic = "force-dynamic";

const querySchema = z.object({ case_slug: z.string().min(1).max(300) });

export interface CommunicationItem {
  id: string;
  at: string;
  direction: "inbound" | "outbound";
  channel: string;
  title: string;
  party?: string;
  status?: string;
  source: "posteingang" | "postausgang" | "portal" | "email" | "whatsapp";
}

/**
 * Kommunikationsverlauf einer Akte (WP-3.14): Posteingang, Postausgang,
 * Portal-Nachrichten und E-Mails als eine chronologische Liste.
 */
export const GET = createHandler(
  { action: "brain.read", rateTier: "standard", query: querySchema },
  async (ctx, _body, query, req) => {
    if (!query?.case_slug) return apiError("validation_failed", "case_slug fehlt", 400);

    // Gleiche Ethical-Wall-Prüfung wie die E-Mail-Route.
    const access = await caseAccessForUser(ctx.headers, query.case_slug, ctx.user.id);
    if (access === "not_found") return apiError("case_not_found", "Akte nicht gefunden", 404);
    if (access === "blocked") {
      return apiError("forbidden", "Kein Zugriff auf diese Akte (Ethical Wall)", 403);
    }

    const items: CommunicationItem[] = [];
    const cs = query.case_slug;

    const [inbound, outbound, portal, mails, whatsapp] = await Promise.allSettled([
      listEnginePages(ctx.headers, "inbound_entry", 2000),
      listEnginePages(ctx.headers, "outbound_entry", 2000),
      listPortalMessages(ctx.headers, cs),
      listMailMessages(mailboxScopeFor(ctx, req), { caseSlug: cs, limit: 500 }),
      listEnginePages(ctx.headers, "conversation_event", 2000),
    ]);

    if (inbound.status === "fulfilled") {
      for (const p of inbound.value) {
        const e = p.frontmatter as unknown as InboundEntry;
        if (e?.case_slug !== cs) continue;
        items.push({
          id: `in-${e.id}`,
          at: e.received_at,
          direction: "inbound",
          channel: e.channel,
          title: e.subject,
          party: e.sender_name,
          source: "posteingang",
        });
      }
    }
    if (outbound.status === "fulfilled") {
      for (const p of outbound.value) {
        const e = p.frontmatter as unknown as OutboundEntry;
        if (e?.case_slug !== cs) continue;
        items.push({
          id: `out-${e.id}`,
          at: e.date ?? e.created_at,
          direction: "outbound",
          channel: e.channel,
          title: e.subject,
          party: e.recipient_name,
          status: e.delivery_status,
          source: "postausgang",
        });
      }
    }
    if (portal.status === "fulfilled") {
      for (const m of portal.value) {
        items.push({
          id: `pm-${m.id}`,
          at: m.createdAt,
          direction: m.sender === "client" ? "inbound" : "outbound",
          channel: "portal",
          title: m.text.slice(0, 200),
          party: m.sender === "client" ? "Mandant" : "Kanzlei",
          source: "portal",
        });
      }
    }
    if (mails.status === "fulfilled") {
      for (const m of mails.value) {
        items.push({
          id: `mail-${m.id}`,
          at: m.createdAt,
          direction: m.direction === "outbound" ? "outbound" : "inbound",
          channel: "email",
          title: m.subject,
          party: m.direction === "outbound" ? m.toEmails.join(", ") : (m.fromName ?? m.fromEmail),
          status: m.trackingStatus ?? m.status,
          source: "email",
        });
      }
    }

    if (whatsapp.status === "fulfilled") {
      for (const p of whatsapp.value) {
        const e = p.frontmatter as {
          case_slug?: string;
          channel?: string;
          direction?: string;
          created_at?: string;
          normalized_text?: string;
          actor_name?: string;
          provider_message_id?: string;
          status?: string;
        };
        if (e?.case_slug !== cs || e.channel !== "whatsapp") continue;
        items.push({
          id: `wa-${e.provider_message_id ?? p.slug}`,
          at: e.created_at ?? "",
          direction: e.direction === "outbound" ? "outbound" : "inbound",
          channel: "whatsapp",
          title: String(e.normalized_text ?? p.title).slice(0, 200),
          party: e.actor_name,
          status: e.status,
          source: "whatsapp",
        });
      }
    }

    items.sort((a, b) => b.at.localeCompare(a.at));
    return apiSuccess({ items, total: items.length });
  }
);
