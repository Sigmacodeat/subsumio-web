import { NextRequest } from "next/server";
import { z } from "zod";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { apiSuccess } from "@/lib/api-response";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { findCallerMatches, normalisePhone, parseCtiPayload, resolveCtiBrainId } from "@/lib/cti";
import { logger } from "@/lib/logger";

const log = logger("api/cti/webhook");

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/cti/webhook — Telefonie-Webhook (Placetel, sipgate, 3CX).
 *
 * Auth: `Authorization: Bearer ${CTI_WEBHOOK_SECRET}` oder ?secret=.
 * Ohne konfiguriertes Secret antwortet die Route 503 — sie ist dann
 * schlicht nicht aktiv statt ungeschützt offen.
 *
 * Ablauf: eingehender Ruf → Anruferkennung über Kontakt-Telefonnummern →
 * Telefonnotiz (legal_phone_note) in der Akte + SSE-Event für das
 * Dashboard-Banner („Anruf von … — Akte öffnen").
 */

const bodySchema = z.record(z.string(), z.unknown());

const EVENT_LABEL: Record<string, string> = {
  ringing: "Eingehender Anruf",
  answered: "Anruf angenommen",
  ended: "Anruf beendet",
  missed: "Verpasster Anruf",
};

export const POST = createPublicHandler(
  {
    body: bodySchema,
    rateLimitKey: () => "cti-webhook",
    rateLimitMax: 240,
    rateLimitWindowMs: 60_000,
  },
  async (req: NextRequest, body) => {
    const secret = process.env.CTI_WEBHOOK_SECRET;
    if (!secret) {
      return apiError("cti_not_configured", "CTI ist nicht konfiguriert (CTI_WEBHOOK_SECRET)", 503);
    }
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ")
      ? auth.slice(7)
      : (new URL(req.url).searchParams.get("secret") ?? "");
    if (token !== secret) {
      return apiError("unauthorized", "Ungültiger CTI-Token", 401);
    }

    const brainId = resolveCtiBrainId();
    if (!brainId) {
      return apiError("cti_no_brain", "Keine Brain für CTI konfiguriert (CTI_BRAIN_ID)", 503);
    }

    const event = parseCtiPayload(body);
    if (!event) {
      return apiError("invalid_payload", "Unbekanntes CTI-Payload-Format", 400);
    }

    const headers = engineHeadersForBrain(brainId);

    // Kontakte + Akten laden für die Anruferkennung.
    const [contactsRes, casesRes] = await Promise.all([
      fetch(`${ENGINE_URL}/api/pages?type=contact&limit=1000`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      }),
      fetch(`${ENGINE_URL}/api/pages?type=legal_case&limit=1000`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      }),
    ]);
    const unwrap = async (res: Response) => {
      if (!res.ok) return [];
      const d = (await res.json().catch(() => [])) as unknown;
      return Array.isArray(d) ? d : ((d as { pages?: unknown[] }).pages ?? []);
    };
    const contacts = (await unwrap(contactsRes)) as Array<{
      slug: string;
      title: string;
      frontmatter?: Record<string, unknown>;
    }>;
    const cases = (await unwrap(casesRes)) as Array<{
      slug: string;
      title: string;
      frontmatter?: Record<string, unknown>;
    }>;

    const matches = findCallerMatches(event.caller, contacts, cases);
    const primary = matches[0];
    const caseSlug = primary?.caseSlugs[0]?.slug;

    if (event.event === "ended") {
      // Dauer in die bestehende Notiz schreiben (per call_id finden).
      const listRes = await fetch(`${ENGINE_URL}/api/pages?type=legal_phone_note&limit=200`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      const notes = (await unwrap(listRes)) as Array<{
        slug: string;
        frontmatter?: Record<string, unknown>;
      }>;
      const note = notes.find((n) => n.frontmatter?.call_id === event.callId);
      if (note) {
        await enginePatchPage(
          headers,
          {
            slug: note.slug,
            frontmatter: {
              call_ended_at: event.at,
              duration_s: event.durationS,
              call_status: "ended",
            },
          },
          { timeoutMs: 10_000 }
        ).catch(() => {});
      }
      return apiSuccess({ ok: true, matched: matches.length > 0 });
    }

    // ringing / answered / missed → Notiz + Dashboard-Banner.
    const noteSlug = `legal/phone-notes/cti-${event.callId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || Date.now().toString(36)}`;
    const label = EVENT_LABEL[event.event] ?? "Anruf";
    const title = `${label}: ${primary?.contactName ?? normalisePhone(event.caller)}`;
    const createRes = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: noteSlug,
        title,
        type: "legal_phone_note",
        content: `## ${label}\n\n**Nummer:** ${event.caller}\n**Richtung:** ${event.direction === "inbound" ? "eingehend" : "ausgehend"}\n**Zeit:** ${event.at}`,
        frontmatter: {
          type: "legal_phone_note",
          caller: primary?.contactName ?? event.caller,
          caller_number: normalisePhone(event.caller),
          subject: label,
          notes: "",
          call_id: event.callId,
          call_status: event.event,
          direction: event.direction,
          source: "cti",
          ...(caseSlug ? { case_slug: caseSlug } : {}),
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!createRes.ok) {
      log.warn("cti note write failed", { status: createRes.status });
    }

    broadcastSseEvent(brainId, "cti.incoming_call", {
      callId: event.callId,
      event: event.event,
      caller: event.caller,
      contactName: primary?.contactName,
      contactSlug: primary?.contactSlug,
      caseSlug,
      caseTitle: primary?.caseSlugs[0]?.title,
      allCaseSlugs: primary?.caseSlugs ?? [],
      noteSlug,
      at: event.at,
    });

    return apiSuccess({
      ok: true,
      matched: matches.length > 0,
      contact: primary?.contactName ?? null,
      case_slug: caseSlug ?? null,
    });
  }
);
