import { NextRequest } from "next/server";
import { z } from "zod";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { apiSuccess } from "@/lib/api-response";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { findCallerMatches, normalisePhone, parseCtiPayload, resolveCtiBrainId } from "@/lib/cti";
import { listEnginePages } from "@/lib/engine-pages";
import { timingSafeCompare } from "@/lib/crypto-utils";
import { clientIp, hit } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";

const log = logger("api/cti/webhook");

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/cti/webhook — Telefonie-Webhook (Placetel, sipgate, 3CX).
 *
 * Auth: nur `Authorization: Bearer ${CTI_WEBHOOK_SECRET}`, zeitkonstant
 * verglichen. Ein `?secret=` in der URL wird NICHT angenommen — URLs landen in
 * Proxy-/Access-Logs und Browser-Verläufen. Ohne konfiguriertes Secret
 * antwortet die Route 503 — sie ist dann schlicht nicht aktiv statt
 * ungeschützt offen.
 *
 * Ablauf: eingehender Ruf → Anruferkennung über Kontakt-Telefonnummern →
 * Telefonnotiz (legal_phone_note) in der Akte + SSE-Event für das
 * Dashboard-Banner („Anruf von … — Akte öffnen").
 */

const bodySchema = z.record(z.string(), z.unknown());

/** Upper bound for the paged lists (contacts, matters, phone notes). */
const LIST_MAX = 20_000;

/** The note of a call is keyed by its call id — ended events find it directly. */
function noteSlugFor(callId: string): string | null {
  const id = callId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return id ? `legal/phone-notes/cti-${id}` : null;
}

const EVENT_LABEL: Record<string, string> = {
  ringing: "Eingehender Anruf",
  answered: "Anruf angenommen",
  ended: "Anruf beendet",
  missed: "Verpasster Anruf",
};

export const POST = createPublicHandler(
  {
    body: bodySchema,
    // Per sender IP: unauthenticated requests cannot use up the budget of
    // the telephony provider. The shared budget is counted only after the
    // token check (below).
    rateLimitKey: (req) => `cti-webhook:ip:${clientIp(req.headers)}`,
    rateLimitMax: 240,
    rateLimitWindowMs: 60_000,
  },
  async (req: NextRequest, body) => {
    const secret = process.env.CTI_WEBHOOK_SECRET;
    if (!secret) {
      return apiError("cti_not_configured", "CTI ist nicht konfiguriert (CTI_WEBHOOK_SECRET)", 503);
    }
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token || !timingSafeCompare(token, secret)) {
      return apiError("unauthorized", "Ungültiger CTI-Token", 401);
    }
    const authed = await hit("cti-webhook:authed", 240, 60_000);
    if (!authed.ok) {
      return apiError("rate_limited", "Zu viele Telefonie-Ereignisse", 429);
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

    // Kontakte + Akten laden für die Anruferkennung. Kontakte liegen als
    // `legal_contact` (Kontakte-Seite, Akten-Parteien) — nicht `contact`.
    // Die Engine liefert höchstens 100 Seiten pro Abruf; listEnginePages
    // blättert, sonst bliebe jeder Anrufer ab Kontakt 101 unerkannt.
    const [contacts, cases] = await Promise.all([
      listEnginePages(headers, "legal_contact", LIST_MAX, { timeoutMs: 10_000 }),
      listEnginePages(headers, "legal_case", LIST_MAX, { timeoutMs: 10_000 }),
    ]);

    const matches = findCallerMatches(event.caller, contacts, cases);
    const primary = matches[0];
    const caseSlug = primary?.caseSlugs[0]?.slug;

    if (event.event === "ended") {
      // Dauer in die bestehende Notiz schreiben (per call_id finden).
      // Die Notiz trägt die call_id im Slug (siehe unten) — direkt lesen statt
      // alle Telefonnotizen der Kanzlei zu listen. Ohne vorherige Notiz wird
      // nichts angelegt (ein Merge auf einen fehlenden Slug würde eine leere
      // Seite erzeugen).
      const noteSlug = noteSlugFor(event.callId);
      const noteRes = noteSlug
        ? await fetch(
            `${ENGINE_URL}/api/pages/${noteSlug.split("/").map(encodeURIComponent).join("/")}`,
            {
              headers,
              signal: AbortSignal.timeout(10_000),
            }
          ).catch(() => null)
        : null;
      const note = noteSlug && noteRes?.ok ? { slug: noteSlug } : null;
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
    const noteSlug =
      noteSlugFor(event.callId) ?? `legal/phone-notes/cti-${Date.now().toString(36)}`;
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
