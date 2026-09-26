import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { createServerBrainClient } from "@/lib/server-brain";
import { getEnginePage, writeEnginePage } from "@/lib/engine-page-io";
import { createIdempotencyStore } from "@/lib/idempotency";
import { appendTimeEntries, createTimeEntry } from "@/lib/time-tracking";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import type { TimeEntry } from "@/lib/legal-types";
import type { TimeSuggestion } from "@/lib/passive-time";

import { logger } from "@/lib/logger";
const log = logger("api/time-suggestions/accept");

export const dynamic = "force-dynamic";

/** One booking per suggestion, across requests, tabs and app instances. */
const acceptClaims = createIdempotencyStore("subsumio_time_suggestion_accepts", [], {
  primaryKeyColumn: "claim_key",
  ttlMs: 400 * 24 * 60 * 60 * 1000,
});

const MINUTES_MAX = 24 * 60;

const acceptSchema = z.object({
  case_slug: z.string().trim().min(1, "case_slug_required").max(300),
  minutes: z.number().int().positive("minutes_required_positive").max(MINUTES_MAX, "minutes_max"),
  description: z.string().trim().min(1, "description_required").max(500),
  billable: z.boolean().default(true),
});

const ID_RE = /^[a-zA-Z0-9_-]{1,200}$/;

/** The entry id is derived from the suggestion: the idempotency key. */
function timeEntryIdForSuggestion(suggestionId: string): string {
  return `time-sugg-${suggestionId}`;
}

/**
 * POST /api/time-suggestions/{id}/accept — books the time entry and marks the
 * suggestion in one server-side flow. A suggestion is booked at most once:
 * an accepted suggestion, a concurrent second request (atomic claim) and an
 * entry already present under the derived id all answer 409.
 */
export const POST = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    body: acceptSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "time_entry",
      entityId: body.case_slug,
      details: { minutes: body.minutes, billable: body.billable, source: "time_suggestion" },
    }),
  },
  async (ctx, body, _query, req) => {
    const id = decodeURIComponent(
      new URL(req.url).pathname.split("/").slice(-2, -1)[0] ?? ""
    ).trim();
    if (!ID_RE.test(id)) return apiError("invalid_id", "Ungültige Vorschlags-ID", 400);
    const slug = `legal/time-suggestions/${id}`;

    const page = await getEnginePage(ctx.headers, slug).catch(() => undefined);
    if (page === undefined) {
      return apiError("engine_error", "Vorschlag konnte nicht geladen werden", 502);
    }
    const suggestion = page?.frontmatter as unknown as TimeSuggestion | undefined;
    // Suggestions are personal: someone else's reads as missing.
    if (
      !suggestion ||
      String(suggestion.user_email ?? "").toLowerCase() !== ctx.user.email.toLowerCase()
    ) {
      return apiError("suggestion_not_found", "Zeitvorschlag nicht gefunden", 404);
    }
    if (suggestion.status !== "suggested") {
      return apiError(
        "suggestion_closed",
        suggestion.status === "rejected"
          ? "Dieser Vorschlag wurde abgelehnt."
          : "Dieser Vorschlag wurde bereits übernommen.",
        409
      );
    }

    const brain = createServerBrainClient(ctx.headers);
    const casePage = await brain.getPage(body.case_slug).catch(() => null);
    if (!casePage) return apiError("case_not_found", "Akte nicht gefunden", 404);

    const entryId = timeEntryIdForSuggestion(id);
    const modified =
      body.case_slug !== (suggestion.case_slug ?? "") ||
      body.minutes !== suggestion.duration_minutes ||
      body.description !== suggestion.description ||
      !body.billable;
    const markAccepted = () =>
      writeEnginePage(
        ctx.headers,
        {
          slug,
          type: "time_suggestion",
          frontmatter: {
            status: modified ? "modified" : "accepted",
            case_slug: body.case_slug,
            duration_minutes: body.minutes,
            description: body.description,
            time_entry_id: entryId,
            ...(modified
              ? {
                  original: {
                    case_slug: suggestion.case_slug ?? null,
                    duration_minutes: suggestion.duration_minutes,
                    description: suggestion.description,
                  },
                }
              : {}),
          },
        },
        { merge: true }
      );

    // Already booked (e.g. an earlier run failed only at marking): repair
    // the mark, never book again.
    const existing = Array.isArray(casePage.frontmatter?.time_entries)
      ? (casePage.frontmatter.time_entries as TimeEntry[])
      : [];
    if (existing.some((e) => e.id === entryId)) {
      await markAccepted().catch(() => undefined);
      return apiError("suggestion_closed", "Dieser Vorschlag wurde bereits übernommen.", 409);
    }

    const claimKey = `${ctx.brainId}:${id}`;
    if (!(await acceptClaims.claim(claimKey))) {
      return apiError("suggestion_closed", "Dieser Vorschlag wird bereits übernommen.", 409);
    }

    const entry: TimeEntry = {
      ...createTimeEntry({
        description: body.description,
        minutes: body.minutes,
        date: suggestion.date,
        billable: body.billable,
        lawyer: ctx.user?.name || ctx.user?.email,
      }),
      id: entryId,
    };
    try {
      await appendTimeEntries(brain, body.case_slug, [entry]);
    } catch (err) {
      // Nothing booked: free the claim so the user can retry.
      await acceptClaims.release(claimKey);
      log.error("[accept] booking failed:", err instanceof Error ? err.message : String(err));
      return apiError("engine_write_failed", "Zeiteintrag konnte nicht gebucht werden", 502);
    }

    let marked = true;
    try {
      await markAccepted();
    } catch (err) {
      // The booking stands and the claim keeps it single; the next accept
      // attempt repairs the mark via the derived entry id.
      marked = false;
      log.error("[accept] mark failed:", err instanceof Error ? err.message : String(err));
    }

    broadcastSseEvent(ctx.brainId, "time.entry.created", {
      case_slug: body.case_slug,
      entry_id: entry.id,
    });
    return apiSuccess(
      {
        entry,
        case_slug: body.case_slug,
        status: modified ? "modified" : "accepted",
        marked,
      },
      undefined,
      201
    );
  }
);
