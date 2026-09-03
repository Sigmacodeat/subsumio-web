import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  generateSlots,
  checkBookingConflict,
  createBookingFrontmatter,
} from "@/lib/online-booking";

export const dynamic = "force-dynamic";

const getSlotsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration: z.coerce.number().int().min(15).max(120).optional(),
  kanzlei_slug: z.string().max(200).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: getSlotsSchema,
  },
  async (ctx, _body, query) => {
    if (!query?.date) return apiError("missing_date", "Datum erforderlich", 400);

    const date = new Date(query.date + "T00:00:00");
    const duration = query.duration ?? 30;

    const bookingParams = new URLSearchParams({ type: "booking", limit: "100" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${bookingParams}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    const existingBookings: Array<{ start: string; end: string }> = [];
    if (res.ok) {
      const data = await res.json();
      const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
        frontmatter: Record<string, unknown>;
      }>;
      for (const p of pages) {
        const fm = p.frontmatter;
        if (fm.slot_start && fm.slot_end) {
          existingBookings.push({ start: String(fm.slot_start), end: String(fm.slot_end) });
        }
      }
    }

    const slots = generateSlots(date, { start: "09:00", end: "17:00" }, duration, existingBookings);
    return apiSuccess({ slots });
  }
);

const createBookingSchema = z.object({
  kanzlei_slug: z.string().min(1).max(200),
  slot_id: z.string().min(1).max(200),
  client_name: z.string().min(1).max(300),
  client_email: z.string().email(),
  client_phone: z.string().max(50).optional(),
  matter: z.string().min(1).max(1000),
  opponent_name: z.string().max(300).optional(),
  legal_area: z.string().max(100).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createBookingSchema,
    audit: (_ctx, body) => ({
      action: "booking.create" as const,
      entityType: "booking",
      details: {
        kanzlei_slug: body.kanzlei_slug,
        slot_id: body.slot_id,
        legal_area: body.legal_area,
      },
    }),
  },
  async (ctx, body) => {
    const dateStr = body.slot_id.match(/^slot-(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!dateStr) return apiError("invalid_slot", "Ungültige Slot-ID", 400);

    const date = new Date(dateStr + "T00:00:00");
    const bookingParams = new URLSearchParams({ type: "booking", limit: "100" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${bookingParams}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    const existingBookings: Array<{ start: string; end: string }> = [];
    if (res.ok) {
      const data = await res.json();
      const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
        frontmatter: Record<string, unknown>;
      }>;
      for (const p of pages) {
        const fm = p.frontmatter;
        if (fm.slot_start && fm.slot_end) {
          existingBookings.push({ start: String(fm.slot_start), end: String(fm.slot_end) });
        }
      }
    }

    const slots = generateSlots(date, { start: "09:00", end: "17:00" }, 30, existingBookings);
    const slot = slots.find((s) => s.id === body.slot_id);
    if (!slot) return apiError("slot_not_found", "Slot nicht gefunden", 404);

    const conflict = checkBookingConflict(body, slots);
    if (conflict.hasConflict) {
      return apiError("conflict", conflict.reason ?? "Konflikt", 409);
    }

    const bookingId = `booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fm = createBookingFrontmatter(body, slot);

    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/bookings/${bookingId}`,
        title: `Termin: ${body.client_name} — ${slot.start.slice(0, 16)}`,
        type: "booking",
        frontmatter: fm,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return apiSuccess({
      confirmed: true,
      booking_id: bookingId,
      slot_start: slot.start,
      slot_end: slot.end,
    });
  }
);
