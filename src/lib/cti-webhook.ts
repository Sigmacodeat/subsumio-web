/**
 * Telefonie-Webhook (Placetel, sipgate, 3CX) — gemeinsamer Kern der Routen
 * `/api/cti/webhook` (Bearer-Token) und `/api/cti/webhook/<token>` (Token im
 * Pfad, für Anbieter ohne frei setzbaren Header wie sipgate.io).
 *
 * Nimmt JSON und form-kodierte Bodies an. Ablauf: eingehender Ruf →
 * Anruferkennung über Kontakt-Telefonnummern → Telefonnotiz
 * (legal_phone_note) in der Akte + SSE-Event für das Dashboard-Banner.
 * Folgeereignisse (angenommen/verpasst/beendet) ändern nur Statusfelder —
 * eine zwischenzeitlich erfasste Gesprächsnotiz bleibt erhalten.
 */
import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api-handler";
import { apiSuccess } from "@/lib/api-response";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { findCallerMatches, normalisePhone, parseCtiPayload, resolveCtiBrainId } from "@/lib/cti";
import { listEnginePages } from "@/lib/engine-pages";
import { timingSafeCompare } from "@/lib/crypto-utils";
import { hit } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";

const log = logger("api/cti/webhook");

/** Upper bound for the paged lists (contacts, matters, phone notes). */
const LIST_MAX = 20_000;

/** The note of a call is keyed by its call id — later events find it directly. */
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

/** Body as JSON or as form fields (sipgate.io, Placetel send form-encoded). */
export async function readCtiBody(req: Request): Promise<Record<string, unknown> | null> {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  const text = await req.text().catch(() => "");
  if (!text) return null;
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Path tokens accepted by `/api/cti/webhook/<token>` (comma-separated for rotation). */
export function ctiPathTokens(): string[] {
  return (process.env.CTI_WEBHOOK_PATH_TOKENS ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length >= 32);
}

export type CtiAuth = { kind: "bearer" } | { kind: "path"; token: string };

/** Checks the caller: Bearer token or a configured path token (timing-safe). */
export function ctiAuthError(req: NextRequest, auth: CtiAuth): Response | null {
  if (auth.kind === "path") {
    const tokens = ctiPathTokens();
    if (tokens.length === 0) {
      return apiError("cti_not_configured", "CTI-Pfad-Token ist nicht konfiguriert", 503);
    }
    const ok = tokens.some((t) => auth.token && timingSafeCompare(auth.token, t));
    return ok ? null : apiError("unauthorized", "Ungültiger CTI-Token", 401);
  }
  const secret = process.env.CTI_WEBHOOK_SECRET;
  if (!secret) {
    return apiError("cti_not_configured", "CTI ist nicht konfiguriert (CTI_WEBHOOK_SECRET)", 503);
  }
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !timingSafeCompare(token, secret)) {
    return apiError("unauthorized", "Ungültiger CTI-Token", 401);
  }
  return null;
}

export async function handleCtiWebhook(req: NextRequest, auth: CtiAuth): Promise<Response> {
  const authError = ctiAuthError(req, auth);
  if (authError) return authError;
  const authed = await hit("cti-webhook:authed", 240, 60_000);
  if (!authed.ok) {
    return apiError("rate_limited", "Zu viele Telefonie-Ereignisse", 429);
  }

  const brainId = resolveCtiBrainId();
  if (!brainId) {
    return apiError("cti_no_brain", "Keine Brain für CTI konfiguriert (CTI_BRAIN_ID)", 503);
  }

  const body = await readCtiBody(req);
  const event = body ? parseCtiPayload(body) : null;
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
  const noteSlug = noteSlugFor(event.callId) ?? `legal/phone-notes/cti-${Date.now().toString(36)}`;
  const label = EVENT_LABEL[event.event] ?? "Anruf";
  const title = `${label}: ${primary?.contactName ?? normalisePhone(event.caller)}`;
  // Create-only: the first event of a call creates the note; later events
  // (answered/missed) only update its status fields, so notes typed in the
  // meantime are kept.
  const createRes = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      if_absent: true,
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
  if (createRes.status === 409) {
    const upstream = (await createRes.json().catch(() => null)) as { error?: unknown } | null;
    if (upstream?.error === "page_exists") {
      const patch = await enginePatchPage(
        headers,
        {
          slug: noteSlug,
          frontmatter: {
            call_status: event.event,
            ...(event.event === "answered" ? { call_answered_at: event.at } : {}),
            ...(event.event === "missed" ? { call_missed_at: event.at } : {}),
          },
        },
        { timeoutMs: 10_000 }
      ).catch(() => null);
      if (!patch?.ok) log.warn("cti note status update failed", { status: patch?.status });
    } else {
      log.warn("cti note write failed", { status: createRes.status });
    }
  } else if (!createRes.ok) {
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
