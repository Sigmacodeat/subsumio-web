import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import type { PostUploadTask } from "@/lib/post-upload-outbox";
import {
  createInboundEntry,
  filterInboundByDateRange,
  exportInboundRegister,
  suggestCaseForInbound,
  type InboundCaseCandidate,
  type InboundEntry,
  type InboundChannel,
} from "@/lib/inbound-register";

/** Safety stop for the Aktenzeichen lookup over every matter. */
const CASE_LOOKUP_MAX = 100_000;
/** Matters considered for the automatic assignment suggestion. */
const SUGGESTION_SCAN_MAX = 2_000;

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
      action: "inbound_register.create" as const,
      entityType: "inbound_entry",
      details: { channel: body.channel, subject: body.subject, caseSlug: body.case_slug },
    }),
  },
  async (ctx, body) => {
    let caseSlug = body.case_slug?.trim() || undefined;
    let suggested: { reason: string } | undefined;
    if (caseSlug) {
      // The form field is an Aktenzeichen (or a matter picked elsewhere): it
      // must resolve to an existing matter — never stored as a free-text link.
      let resolved: string | null = null;
      try {
        const wanted = caseSlug.toLowerCase();
        const matches = (p: { slug: string; frontmatter?: Record<string, unknown> }) => {
          if (p.slug === caseSlug) return true;
          const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
          return [fm.aktenzeichen, fm.case_number].some(
            (v) => typeof v === "string" && v.trim().toLowerCase() === wanted
          );
        };
        // 1) Targeted: the engine selects matters whose Aktenzeichen equals
        //    the input exactly (or the matter at that slug).
        const exact = [
          ...(await listEnginePages(ctx.headers, "legal_case", 100, {
            strict: true,
            frontmatter: { aktenzeichen: caseSlug, case_number: caseSlug },
          })),
          ...(await listEnginePages(ctx.headers, "legal_case", 100, {
            strict: true,
            slugPrefix: caseSlug,
          })),
        ];
        let hit = exact.find((p) => p.slug === caseSlug) ?? exact.find(matches);
        // 2) Otherwise every matter (spelling differences in upper/lower
        //    case), complete or an error — never a newest-N window.
        if (!hit) {
          const casePages = await listEnginePages(ctx.headers, "legal_case", CASE_LOOKUP_MAX, {
            strict: true,
            failOnTruncate: true,
          });
          hit = casePages.find((p) => p.slug === caseSlug) ?? casePages.find(matches);
        }
        resolved = hit?.slug ?? null;
      } catch {
        return apiError("engine_error", "Akten konnten nicht geladen werden", 502);
      }
      if (!resolved) {
        return apiError("case_not_found", "Zu diesem Aktenzeichen wurde keine Akte gefunden.", 422);
      }
      caseSlug = resolved;
    } else {
      // Automatische Aktenzuordnung: deterministisch gegen offene Akten
      // (Aktenzeichen > Parteinamen > Titel-Tokens). Nur ein Vorschlag —
      // die Zuordnung bleibt in der UI als solche markiert.
      try {
        // A suggestion only (marked as such in the UI): the most recently
        // edited matters are the likely targets of new mail.
        const casePages = await listEnginePages(ctx.headers, "legal_case", SUGGESTION_SCAN_MAX);
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

    // Stamps that exhausted every drain retry are invisible without this —
    // the register stays complete-looking while an entry is actually lost.
    // Surfaced as a warning card with a retry affordance in the UI.
    let failedStamps: Array<{
      task_slug: string;
      subject: string;
      channel?: string;
      last_error?: string;
      attempts?: number;
    }> = [];
    let pendingStamps: Array<{
      task_slug: string;
      subject: string;
      channel?: string;
      attempts?: number;
    }> = [];
    try {
      // The drain flips the page type to post_upload_task_exhausted when it
      // gives up — pending tasks stay post_upload_task.
      const [exhaustedPages, pendingPages] = await Promise.all([
        listEnginePages(ctx.headers, "post_upload_task_exhausted", 5000),
        listEnginePages(ctx.headers, "post_upload_task", 5000),
      ]);
      failedStamps = exhaustedPages
        .map((p) => ({ slug: p.slug, ...(p.frontmatter as Partial<PostUploadTask>) }))
        .filter((t) => t.task_type === "inbound_stamp" && t.status === "exhausted")
        .map((t) => ({
          task_slug: t.slug,
          subject: String(t.inbound?.input.subject ?? t.doc_slug),
          channel: t.inbound?.input.channel,
          last_error: t.last_error,
          attempts: t.attempts,
        }));
      // A stamp still retrying after ≥2 attempts is delayed, not lost — shown
      // as informational so the register does not look incomplete by surprise.
      pendingStamps = pendingPages
        .map((p) => ({ slug: p.slug, ...(p.frontmatter as Partial<PostUploadTask>) }))
        .filter(
          (t) => t.task_type === "inbound_stamp" && t.status === "pending" && (t.attempts ?? 0) >= 2
        )
        .map((t) => ({
          task_slug: t.slug,
          subject: String(t.inbound?.input.subject ?? t.doc_slug),
          channel: t.inbound?.input.channel,
          attempts: t.attempts,
        }));
    } catch {
      // Best-effort — a failed task listing must not break the register.
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
    return apiSuccess({ items, failed_stamps: failedStamps, pending_stamps: pendingStamps });
  }
);
