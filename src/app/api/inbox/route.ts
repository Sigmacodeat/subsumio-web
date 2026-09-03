import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { triageBatch, type TriageInput } from "@/lib/triage";

export const dynamic = "force-dynamic";

const inboxQuerySchema = z.object({
  channel: z.enum(["all", "bea", "whatsapp", "email", "portal"]).default("all"),
  unread_only: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).default(200),
  triage: z.string().optional(),
});

interface InboxMessage {
  slug: string;
  title: string;
  channel: "bea" | "whatsapp" | "email" | "portal";
  body: string;
  sender: string;
  caseSlug?: string;
  createdAt: string;
  read: boolean;
  triageUrgency?: string;
  triageActionType?: string;
  triageLegalArea?: string;
  triageDeadline?: string;
  triageConfidence?: string;
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: inboxQuerySchema,
  },
  async (ctx, _body, query) => {
    const { channel, limit, triage } = query;
    const unreadOnly = query.unread_only === "true";
    const includeTriage = triage === "true";

    const headers = {
      "Content-Type": "application/json",
      ...ctx.headers,
    };

    const types = ["bea_message", "portal_message", "chat_inbox", "activity_event"];
    const pagesByType: Record<string, Array<Record<string, unknown>>> = {};

    await Promise.all(
      types.map(async (type) => {
        try {
          const res = await fetch(`${ENGINE_URL}/api/pages?type=${type}&limit=${limit}`, {
            headers,
            signal: AbortSignal.timeout(15_000),
          });
          if (res.ok) {
            const data = await res.json();
            pagesByType[type] = Array.isArray(data) ? data : (data.pages ?? []);
          } else {
            pagesByType[type] = [];
          }
        } catch {
          pagesByType[type] = [];
        }
      })
    );

    const messages: InboxMessage[] = [];

    for (const page of pagesByType.bea_message ?? []) {
      const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
      messages.push({
        slug: String(page.slug ?? ""),
        title: String(page.title ?? ""),
        channel: "bea",
        body: String(page.content ?? fm.body ?? fm.summary ?? ""),
        sender: String(fm.sender ?? fm.from ?? "—"),
        caseSlug: fm.case_slug as string | undefined,
        createdAt: String(fm.created_at ?? fm.date ?? ""),
        read: Boolean(fm.read ?? false),
      });
    }

    for (const page of pagesByType.portal_message ?? []) {
      const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
      messages.push({
        slug: String(page.slug ?? ""),
        title: String(page.title ?? ""),
        channel: "portal",
        body: String(page.content ?? fm.message ?? ""),
        sender: String(fm.sender ?? fm.author ?? "Mandant"),
        caseSlug: fm.case_slug as string | undefined,
        createdAt: String(fm.created_at ?? ""),
        read: Boolean(fm.read ?? false),
      });
    }

    for (const page of pagesByType.chat_inbox ?? []) {
      const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
      messages.push({
        slug: String(page.slug ?? ""),
        title: String(page.title ?? "WhatsApp-Nachricht"),
        channel: "whatsapp",
        body: String(page.content ?? fm.body ?? fm.text ?? ""),
        sender: String(fm.from_name ?? fm.from_phone_hash ?? "WhatsApp-Mandant"),
        caseSlug: typeof fm.case_slug === "string" ? fm.case_slug : undefined,
        createdAt: String(fm.received_at ?? fm.created_at ?? page.created_at ?? ""),
        read: Boolean(fm.read ?? false),
      });
    }

    for (const page of pagesByType.activity_event ?? []) {
      const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
      const type = String(fm.type ?? "");
      if (type === "email_received" || type === "email_sent") {
        messages.push({
          slug: String(page.slug ?? ""),
          title: String(page.title ?? ""),
          channel: "email",
          body: String(fm.description ?? page.content ?? ""),
          sender: String(fm.actor ?? fm.from ?? "—"),
          caseSlug: fm.case_slug as string | undefined,
          createdAt: String(fm.timestamp ?? fm.created_at ?? ""),
          read: true,
        });
      } else if (
        type === "call" ||
        (typeof fm.description === "string" && fm.description.toLowerCase().includes("whatsapp"))
      ) {
        messages.push({
          slug: String(page.slug ?? ""),
          title: String(page.title ?? ""),
          channel: "whatsapp",
          body: String(fm.description ?? page.content ?? ""),
          sender: String(fm.actor ?? "—"),
          caseSlug: fm.case_slug as string | undefined,
          createdAt: String(fm.timestamp ?? fm.created_at ?? ""),
          read: true,
        });
      }
    }

    messages.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      if (Number.isNaN(tb) && !Number.isNaN(ta)) return -1;
      if (Number.isNaN(ta) && !Number.isNaN(tb)) return 1;
      return tb - ta;
    });

    let filtered = messages;
    if (channel !== "all") {
      filtered = filtered.filter((m) => m.channel === channel);
    }
    if (unreadOnly) {
      filtered = filtered.filter((m) => !m.read);
    }

    let triageSummary: Record<string, number> | undefined;
    if (includeTriage && filtered.length > 0) {
      const triageInputs: TriageInput[] = filtered.map((m) => ({
        source: m.channel as TriageInput["source"],
        subject: m.title,
        body: m.body,
        sender: m.sender,
        date: m.createdAt,
        rawSlug: m.slug,
      }));
      const cards = triageBatch(triageInputs);
      const cardMap = new Map(cards.map((c) => [c.rawSlug, c]));
      for (const msg of filtered) {
        const card = cardMap.get(msg.slug);
        if (card) {
          msg.triageUrgency = card.urgency;
          msg.triageActionType = card.actionType;
          msg.triageLegalArea = card.legalArea;
          msg.triageDeadline = card.deadline;
          msg.triageConfidence = card.confidence;
        }
      }
      triageSummary = {
        critical: cards.filter((c) => c.urgency === "critical").length,
        high: cards.filter((c) => c.urgency === "high").length,
        medium: cards.filter((c) => c.urgency === "medium").length,
        low: cards.filter((c) => c.urgency === "low").length,
      };
    }

    const counts: Record<string, number> = { all: messages.length };
    for (const m of messages) {
      counts[m.channel] = (counts[m.channel] || 0) + 1;
      if (!m.read) counts.unread = (counts.unread || 0) + 1;
    }

    return apiSuccess({
      messages: filtered,
      counts,
      triage: triageSummary,
    });
  }
);
