import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { readCurrentPage } from "@/lib/page-write-guards";
import type { PostUploadTask } from "@/lib/post-upload-outbox";
import {
  createInboundEntry,
  filterInboundByDateRange,
  exportInboundRegister,
  inboundAssignmentUpdate,
  isInboundEntryPage,
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

type CaseResolution = { kind: "found"; slug: string } | { kind: "missing" } | { kind: "error" };

/**
 * An Aktenzeichen (or a matter slug) → the matter it names. Exact engine
 * lookups first, then every matter (spelling differences in upper/lower
 * case) — complete or an error, never a newest-N window.
 */
async function resolveInboundCase(
  headers: Record<string, string>,
  input: string
): Promise<CaseResolution> {
  try {
    const wanted = input.toLowerCase();
    const matches = (p: { slug: string; frontmatter?: Record<string, unknown> }) => {
      if (p.slug === input) return true;
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      return [fm.aktenzeichen, fm.case_number].some(
        (v) => typeof v === "string" && v.trim().toLowerCase() === wanted
      );
    };
    const exact = [
      ...(await listEnginePages(headers, "legal_case", 100, {
        strict: true,
        frontmatter: { aktenzeichen: input, case_number: input },
      })),
      ...(await listEnginePages(headers, "legal_case", 100, {
        strict: true,
        slugPrefix: input,
      })),
    ];
    let hit = exact.find((p) => p.slug === input) ?? exact.find(matches);
    if (!hit) {
      const casePages = await listEnginePages(headers, "legal_case", CASE_LOOKUP_MAX, {
        strict: true,
        failOnTruncate: true,
      });
      hit = casePages.find((p) => p.slug === input) ?? casePages.find(matches);
    }
    return hit ? { kind: "found", slug: hit.slug } : { kind: "missing" };
  } catch {
    return { kind: "error" };
  }
}

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
      const resolved = await resolveInboundCase(ctx.headers, caseSlug);
      if (resolved.kind === "error") {
        return apiError("engine_error", "Akten konnten nicht geladen werden", 502);
      }
      if (resolved.kind === "missing") {
        return apiError("case_not_found", "Zu diesem Aktenzeichen wurde keine Akte gefunden.", 422);
      }
      caseSlug = resolved.slug;
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

const assignSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9._-]+$/, "invalid_id"),
  /** confirm = accept the suggested matter; assign = link (another) matter. */
  action: z.enum(["confirm", "assign"]),
  case_slug: z.string().trim().min(1).max(300).optional(),
});

/**
 * Confirm or correct the matter of a register entry. The receipt stamp
 * (date, channel, sender, subject) never changes; only the assignment moves,
 * and every move is kept in `assignment_history` (who, when, from → to).
 */
export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: assignSchema,
    audit: (_ctx, body) => ({
      action: "inbound_register.assign" as const,
      entityType: "inbound_entry",
      entityId: body.id,
      details: { action: body.action, caseSlug: body.case_slug },
    }),
  },
  async (ctx, body) => {
    const slug = `legal/inbound-register/${body.id}`;
    const read = await readCurrentPage(ENGINE_URL, ctx.headers, slug);
    if (read.kind === "error") {
      return apiError("engine_error", "Posteingang konnte nicht gelesen werden", 502);
    }
    if (read.kind === "missing" || !isInboundEntryPage(read.page)) {
      return apiError("not_found", "Eintrag nicht gefunden", 404);
    }
    const entry = (read.page.frontmatter ?? {}) as unknown as InboundEntry;

    let target: string;
    if (body.action === "confirm") {
      if (!entry.case_slug) {
        return apiError("no_case", "Der Eintrag ist keiner Akte zugeordnet.", 422);
      }
      target = entry.case_slug;
    } else {
      if (!body.case_slug) {
        return apiError("case_required", "Bitte ein Aktenzeichen angeben.", 422);
      }
      const resolved = await resolveInboundCase(ctx.headers, body.case_slug);
      if (resolved.kind === "error") {
        return apiError("engine_error", "Akten konnten nicht geladen werden", 502);
      }
      if (resolved.kind === "missing") {
        return apiError("case_not_found", "Zu diesem Aktenzeichen wurde keine Akte gefunden.", 422);
      }
      target = resolved.slug;
    }

    const assignment = inboundAssignmentUpdate(entry, {
      caseSlug: target,
      by: ctx.user.name || ctx.user.email,
      byId: ctx.user.id,
      at: new Date().toISOString(),
    });
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: read.page.title ?? `Posteingang: ${entry.subject}`,
        type: "inbound_entry",
        merge: true,
        frontmatter: assignment,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return apiError("engine_write_failed", "Zuordnung konnte nicht gespeichert werden", 502);
    }
    return apiSuccess({ entry: { ...entry, ...assignment } });
  }
);
