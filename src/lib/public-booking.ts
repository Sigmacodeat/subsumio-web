import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { KANZLEI_SETTINGS_SLUG } from "@/lib/kanzlei-settings";
import { generateSlots, type BookingSlot } from "@/lib/online-booking";
import { FIRM_TIMEZONE, zonedDateString, zonedWallTimeToUtc } from "@/lib/datetime";

/**
 * Öffentliche Terminbuchung (WP-3.15) — Server-Seite.
 *
 * Dasselbe Ein-Instanz-pro-Kanzlei-Modell wie die öffentliche Erstanfrage
 * (api/intake/public): die Ziel-Brain kommt aus der Umgebung, die Kanzlei
 * aktiviert die Buchung in den Kanzlei-Settings (bookingEnabled). Belegte
 * Zeiten werden aus `booking`- und `appointment`-Seiten gelesen — WhatsApp-
 * Flows schreiben Termine bereits als `appointment` (siehe
 * api/whatsapp/flow-endpoint), die Web-Buchung als `booking`.
 */

export interface BookingConfig {
  enabled: boolean;
  start: string;
  end: string;
  slotMinutes: number;
  kanzleiEmail?: string;
  kanzleiName?: string;
}

export function resolvePublicBookingBrainId(): string | null {
  return (
    process.env.SUBSUMIO_PUBLIC_BOOKING_BRAIN_ID ||
    process.env.SUBSUMIO_PUBLIC_INTAKE_BRAIN_ID ||
    process.env.WHATSAPP_DEFAULT_BRAIN_ID ||
    null
  );
}

const DEFAULTS = { start: "09:00", end: "17:00", slotMinutes: 30 };

export async function loadBookingConfig(brainId: string): Promise<BookingConfig> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(KANZLEI_SETTINGS_SLUG)}`, {
    headers: engineHeadersForBrain(brainId),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { enabled: false, ...DEFAULTS };
  const fm = (await res.json().catch(() => ({}))) as {
    frontmatter?: Record<string, unknown>;
  };
  const f = fm.frontmatter ?? {};
  return {
    enabled: f.bookingEnabled === true,
    start: typeof f.bookingStart === "string" ? f.bookingStart : DEFAULTS.start,
    end: typeof f.bookingEnd === "string" ? f.bookingEnd : DEFAULTS.end,
    slotMinutes:
      typeof f.bookingSlotMinutes === "number" && f.bookingSlotMinutes >= 15
        ? Math.min(f.bookingSlotMinutes, 240)
        : DEFAULTS.slotMinutes,
    kanzleiEmail: typeof f.kanzleiEmail === "string" ? f.kanzleiEmail : undefined,
    kanzleiName: typeof f.kanzleiName === "string" ? f.kanzleiName : undefined,
  };
}

interface EnginePage {
  slug: string;
  frontmatter?: Record<string, unknown>;
}

async function listTypedPages(
  headers: Record<string, string>,
  type: string
): Promise<EnginePage[]> {
  // Cursor-paginated and strict: a failed read throws instead of looking
  // like "no bookings" — otherwise every slot would be offered as free.
  // Tombstoned slots stay out of the availability set.
  return (await listEnginePages(headers, type, 10_000, {
    strict: true,
    timeoutMs: 15_000,
  })) as unknown as EnginePage[];
}

/** Belegte Zeitfenster eines Tages aus booking- und appointment-Seiten. */
export async function bookedRangesForDate(
  headers: Record<string, string>,
  dateIso: string,
  timeZone: string = FIRM_TIMEZONE
): Promise<Array<{ start: string; end: string }>> {
  const [bookings, appointments] = await Promise.all([
    listTypedPages(headers, "booking"),
    listTypedPages(headers, "appointment"),
  ]);

  const ranges: Array<{ start: string; end: string }> = [];
  for (const p of bookings) {
    const fm = p.frontmatter ?? {};
    if (
      typeof fm.slot_start === "string" &&
      typeof fm.slot_end === "string" &&
      // `slot_start` is a UTC instant; the day boundary is the firm's, not
      // UTC's — a 00:30 Vienna booking used to land on the UTC previous day
      // and was missed by the startsWith(dateIso) match.
      zonedDateString(new Date(fm.slot_start), timeZone) === dateIso &&
      fm.status !== "cancelled"
    ) {
      ranges.push({ start: fm.slot_start, end: fm.slot_end });
    }
  }
  for (const p of appointments) {
    const fm = p.frontmatter ?? {};
    if (typeof fm.date !== "string" || fm.date !== dateIso) continue;
    if (fm.status === "cancelled") continue;
    const time = typeof fm.time === "string" ? fm.time : null;
    if (!time || !/^\d{2}:\d{2}$/.test(time)) continue;
    // `fm.date`/`fm.time` are firm-local wall time — resolve them in the
    // firm zone, not the server's.
    const start = zonedWallTimeToUtc(fm.date, time, timeZone);
    if (Number.isNaN(start.getTime())) continue;
    const duration =
      typeof fm.duration_minutes === "number" && fm.duration_minutes > 0 ? fm.duration_minutes : 30;
    ranges.push({
      start: start.toISOString(),
      end: new Date(start.getTime() + duration * 60_000).toISOString(),
    });
  }
  return ranges;
}

/**
 * Freie Slots eines Tages — Quelle der Wahrheit für GET und POST.
 * Wirft, wenn die Belegung nicht gelesen werden kann (nie "alles frei").
 */
export async function availableSlots(
  brainId: string,
  dateIso: string
): Promise<{ config: BookingConfig; slots: BookingSlot[] }> {
  const config = await loadBookingConfig(brainId);
  if (!config.enabled) return { config, slots: [] };
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { config, slots: [] };
  const booked = await bookedRangesForDate(engineHeadersForBrain(brainId), dateIso);
  const slots = generateSlots(
    date,
    { start: config.start, end: config.end },
    config.slotMinutes,
    booked,
    { dateIso, timeZone: FIRM_TIMEZONE }
  );
  return { config, slots };
}
