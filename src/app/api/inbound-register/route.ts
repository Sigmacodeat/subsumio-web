import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import {
  createInboundEntry,
  filterInboundByDateRange,
  exportInboundRegister,
  suggestCaseForInbound,
  type InboundCaseCandidate,
  type InboundEntry,
  type InboundChannel,
} from "@/lib/inbound-register";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  channel: z.enum(["upload", "email", "whatsapp", "erv", "scan", "portal"]),
  subject: z.string().min(1).max(500),
  sender_name: z.string().max(300).optional(),
  sender_address: z.string().max(500).optional(),
  case_slug: z.string().max(300).optional(),
  document_slug: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "inbound_entry",
      details: { channel: body.channel, subject: body.subject, caseSlug: body.case_slug },
    }),
  },
  async (ctx, body) => {
    let caseSlug = body.case_slug;
    let suggested: { reason: string } | undefined;
    if (!caseSlug) {
      // Automatische Aktenzuordnung: deterministisch gegen offene Akten
      // (Aktenzeichen > Parteinamen > Titel-Tokens). Nur ein Vorschlag —
      // die Zuordnung bleibt in der UI als solche markiert.
      try {
        const casePages = await listEnginePages(ctx.headers, "legal_case", 500);
        const candidates: InboundCaseCandidate[] = casePages.map((p) => {
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          return {
            slug: p.slug,
            aktenzeichen:
              (fm.aktenzeichen as string | undefined) ?? (fm.case_number as string | undefined),
            title: typeof p.title === "string" ? p.title : undefined,
            parties: [fm.client_name, fm.opponent_name].filter(
              (v): v is string => typeof v === "string" && v.length > 0
            ),
          };
        });
        const hit = suggestCaseForInbound(
          {
            subject: body.subject,
            senderName: body.sender_name,
            senderAddress: body.sender_address,
          },
          candidates
        );
        if (hit) {
          caseSlug = hit.slug;
          suggested = { reason: hit.reason };
        }
      } catch {
        // Zuordnung ist best-effort — der Eintrag wird auch ohne Akte gespeichert.
      }
    }
    const entry = createInboundEntry({
      channel: body.channel as InboundChannel,
      subject: body.subject,
      senderName: body.sender_name,
      senderAddress: body.sender_address,
      caseSlug,
      documentSlug: body.document_slug,
      receivedBy: ctx.user.name || ctx.user.email,
    });
    if (suggested) {
      entry.case_suggested = true;
      entry.case_suggest_reason = suggested.reason;
    }
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/inbound-register/${entry.id}`,
        title: `Posteingang: ${body.subject}`,
        type: "inbound_entry",
        frontmatter: entry,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return apiError("engine_write_failed", "Posteingang konnte nicht gespeichert werden", 502);
    }
    return apiSuccess({ entry });
  }
);

const querySchema = z.object({
  case_slug: z.string().max(300).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  format: z.enum(["json", "csv"]).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    // listEnginePages pages past the engine's 200-item cap — a plain fetch
    // with limit=500 (the pattern outbound-register/route.ts used before
    // Welle A) silently truncates at 200 regardless of the requested limit.
    let items: InboundEntry[];
    try {
      const pages = await listEnginePages(ctx.headers, "inbound_entry", 5000);
      items = pages.map((p) => p.frontmatter as unknown as InboundEntry);
    } catch {
      return apiError("engine_error", "Engine request failed", 502);
    }
    if (query?.case_slug) {
      items = items.filter((e) => e.case_slug === query.case_slug);
    }
    if (query?.from && query?.to) {
      items = filterInboundByDateRange(items, query.from, query.to);
    }
    items = items.sort((a, b) => b.received_at.localeCompare(a.received_at));
    if (query?.format === "csv") {
      const csv = exportInboundRegister(items);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=posteingangsbuch.csv",
        },
      });
    }
    return apiSuccess({ items });
  }
);
