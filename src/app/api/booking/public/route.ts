/**
 * Öffentliche Terminbuchung (WP-3.15) — anonym, ohne Anmeldung.
 *
 * GET  ?date=YYYY-MM-DD → freie Slots (Start/Ende) des Tages.
 * POST {date, start, name, email?, phone?, matter, legalArea?, consent}
 *      → Slot wird serverseitig NEU geprüft (kein Vertrauen in die
 *      Client-Auswahl — zwei Anfragende können denselben Slot sehen) und
 *      als `booking`-Seite persistiert; die Kanzlei wird per Mail
 *      benachrichtigt. Dem Anfragenden geht KEINE Mail (Mail-Bombing-
 *      Vektor — dieselbe Regel wie api/intake/public).
 *
 * Aktivierung: Kanzlei-Settings `bookingEnabled: true` — ohne Opt-in
 * antwortet die Route 404, damit keine unbeabsichtigte öffentliche
 * Buchungsfläche entsteht.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { apiSuccess } from "@/lib/api-response";
import { clientIp } from "@/lib/auth/rate-limit";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { availableSlots, resolvePublicBookingBrainId } from "@/lib/public-booking";
import { loadPublicFirm } from "@/lib/public-firm";
import { checkBookingConflict, createBookingFrontmatter } from "@/lib/online-booking";
import { sendMail } from "@/lib/mail";
import { logger } from "@/lib/logger";

const log = logger("api/booking/public");

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Upper bound of re-bookings of one cancelled slot (generation slugs). */
const MAX_REBOOKINGS = 20;

function availabilityUnavailable(err: unknown): Response {
  log.error("booking availability unreadable", {
    error: err instanceof Error ? err.message : String(err),
  });
  return apiError(
    "engine_unreachable",
    "Die Terminbuchung ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.",
    503
  );
}

/**
 * True when the booking page at `slug` no longer holds its slot (cancelled,
 * tombstoned or gone). Any read failure counts as "still held" — fail closed.
 */
async function isReleasedBooking(brainId: string, slug: string): Promise<boolean> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return true;
    if (!res.ok) return false;
    const page = (await res.json().catch(() => null)) as {
      frontmatter?: { status?: unknown };
    } | null;
    const status = page?.frontmatter?.status;
    return status === "cancelled" || status === "tombstoned";
  } catch {
    return false;
  }
}

const querySchema = z.object({ date: z.string().regex(DATE_RE, "invalid_date") });

const bodySchema = z
  .object({
    date: z.string().regex(DATE_RE, "invalid_date"),
    /** ISO-Startzeit des Slots — wird serverseitig gegen frische Slots geprüft. */
    start: z.string().min(10).max(40),
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200).optional().or(z.literal("")),
    phone: z
      .string()
      .trim()
      .max(40)
      .regex(/^[+\d\s()/-]*$/, "invalid_phone")
      .optional()
      .or(z.literal("")),
    matter: z.string().trim().min(1).max(300),
    legalArea: z.string().trim().max(80).optional(),
    consent: z.literal(true),
    website: z.string().max(0).optional(),
  })
  // Ohne Kontaktweg kann die Kanzlei den Termin weder bestätigen noch absagen.
  .refine((b) => Boolean(b.email) || Boolean(b.phone), {
    message: "contact_required",
    path: ["email"],
  });

export const GET = createPublicHandler(
  {
    query: querySchema,
    rateLimitKey: (req: NextRequest) => `booking-public:get:${clientIp(req.headers)}`,
    rateLimitMax: 60,
    rateLimitWindowMs: 60 * 60_000,
  },
  async (_req, _body, query) => {
    const brainId = resolvePublicBookingBrainId();
    if (!brainId) return apiError("not_configured", "Terminbuchung nicht verfügbar", 404);
    let result: Awaited<ReturnType<typeof availableSlots>>;
    try {
      result = await availableSlots(brainId, query!.date);
    } catch (err) {
      return availabilityUnavailable(err);
    }
    const { config, slots } = result;
    if (!config.enabled) return apiError("not_enabled", "Terminbuchung nicht verfügbar", 404);
    // Nur freie Slots ausgeben — belegte Zeiten bleiben intern.
    return apiSuccess({
      slots: slots
        .filter((s) => s.status === "available")
        .map((s) => ({ start: s.start, end: s.end })),
    });
  }
);

export const POST = createPublicHandler(
  {
    body: bodySchema,
    rateLimitKey: (req: NextRequest) => `booking-public:post:${clientIp(req.headers)}`,
    rateLimitMax: 10,
    rateLimitWindowMs: 60 * 60_000,
  },
  async (_req, body) => {
    if (body.website) return apiError("invalid", "invalid", 400);

    const brainId = resolvePublicBookingBrainId();
    if (!brainId) {
      log.error("SUBSUMIO_PUBLIC_BOOKING_BRAIN_ID not configured");
      return apiError("not_configured", "Terminbuchung derzeit nicht verfügbar.", 503);
    }
    // Die Kanzlei muss als Verantwortliche benennbar sein (Art. 13 DSGVO) —
    // dieselbe Bedingung, unter der /termin das Formular anzeigt.
    if (!(await loadPublicFirm(brainId))) {
      return apiError("not_configured", "Terminbuchung derzeit nicht verfügbar.", 503);
    }

    let result: Awaited<ReturnType<typeof availableSlots>>;
    try {
      result = await availableSlots(brainId, body!.date);
    } catch (err) {
      return availabilityUnavailable(err);
    }
    const { config, slots } = result;
    if (!config.enabled) return apiError("not_enabled", "Terminbuchung nicht verfügbar", 404);

    // Slot anhand der Startzeit finden (Client schickt keine Slot-ID, weil
    // die zufällig pro Generierung ist) und frisch auf Konflikt prüfen.
    const slot = slots.find((s) => s.start === body!.start);
    const conflict = checkBookingConflict(
      {
        kanzlei_slug: "public",
        slot_id: slot?.id ?? "",
        client_name: body!.name,
        client_email: body!.email || "",
        client_phone: body!.phone || undefined,
        matter: body!.matter,
        legal_area: body!.legalArea || undefined,
      },
      slots
    );
    if (!slot || conflict.hasConflict) {
      return apiError(
        conflict.reason ?? "slot_not_found",
        "Dieser Termin ist nicht mehr verfügbar. Bitte wählen Sie einen anderen.",
        409
      );
    }

    const bookingId = crypto.randomUUID();
    // Deterministic page slug per (date, slot start), written create-only
    // (`if_absent`): the engine refuses a taken slug in the same INSERT, so
    // of two parallel POSTs for the same slot exactly one lands.
    const slotKey = `${body!.date.replace(/\D/g, "")}-${slot.start.replace(/\D/g, "").slice(0, 12)}`;
    const frontmatter = createBookingFrontmatter(
      {
        kanzlei_slug: "public",
        slot_id: slot.id,
        client_name: body!.name,
        client_email: body!.email || "",
        client_phone: body!.phone || undefined,
        matter: body!.matter,
        legal_area: body!.legalArea || undefined,
      },
      slot
    );

    // A cancelled or deleted booking keeps its slug. Re-booking that slot
    // moves on to the next deterministic generation slug (`…-r1`, `…-r2`):
    // parallel requests still compute the same slug, so the create-only
    // write keeps them mutually exclusive.
    const baseSlug = `legal/bookings/${slotKey}`;
    let written = false;
    for (let generation = 0; generation <= MAX_REBOOKINGS; generation++) {
      const slug = generation === 0 ? baseSlug : `${baseSlug}-r${generation}`;
      const createRes = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...engineHeadersForBrain(brainId), "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          title: `Termin: ${body!.date} — ${body!.name}`,
          type: "booking",
          content: `## Online-Terminbuchung\n\n**Slot:** ${slot.start} – ${slot.end}\n**Name:** ${body!.name}\n**Anliegen:** ${body!.matter}`,
          frontmatter: { ...frontmatter, booking_id: bookingId, source: "web" },
          if_absent: true,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (createRes.ok) {
        written = true;
        break;
      }
      if (createRes.status !== 409) {
        log.error("booking page write failed", { status: createRes.status });
        return apiError(
          "engine_unreachable",
          "Die Buchung konnte nicht gespeichert werden. Bitte versuchen Sie es später erneut.",
          503
        );
      }
      // Slug taken: only a released (cancelled/deleted) booking frees the
      // slot; a live booking — or one we cannot read — means "taken".
      if (!(await isReleasedBooking(brainId, slug))) break;
    }
    if (!written) {
      return apiError(
        "slot_already_booked",
        "Dieser Termin ist nicht mehr verfügbar. Bitte wählen Sie einen anderen.",
        409
      );
    }

    // Best-effort: Kanzlei benachrichtigen. Niemals den Anfragenden.
    void (async () => {
      try {
        if (!config.kanzleiEmail) return;
        await sendMail({
          to: config.kanzleiEmail,
          subject: `Neue Online-Terminbuchung: ${body!.name}`,
          text: [
            `Neue Terminbuchung über die Website.`,
            ``,
            `Datum: ${body!.date}`,
            `Slot: ${slot.start} – ${slot.end}`,
            `Name: ${body!.name}`,
            body!.email ? `E-Mail: ${body!.email}` : "",
            body!.phone ? `Telefon: ${body!.phone}` : "",
            body!.legalArea ? `Rechtsgebiet: ${body!.legalArea}` : "",
            `Anliegen: ${body!.matter}`,
          ]
            .filter(Boolean)
            .join("\n"),
          replyTo: body!.email || undefined,
        });
      } catch (err) {
        log.warn("booking notification mail failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      // WP-4.17: booking-Pages werden vom Automations-Cron ausgewertet
      // (Trigger "booking_created") — kein Instant-Dispatch nötig.
    })();

    return apiSuccess({ confirmed: true, booking_id: bookingId, start: slot.start, end: slot.end });
  }
);
