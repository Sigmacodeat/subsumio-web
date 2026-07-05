import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  generateSlots,
  checkBookingConflict,
  createBookingFrontmatter,
} from "@/lib/online-booking";

export const dynamic = "force-dynamic";

const slotsQuerySchema = z.object({
  date: z.string().min(1),
  start_hour: z.string().default("09:00"),
  end_hour: z.string().default("17:00"),
  duration: z.coerce.number().min(15).max(120).default(30),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: slotsQuerySchema,
  },
  async (ctx, _body, query) => {
    if (!query?.date) return apiError("validation_error", "date required", 400);

    const date = new Date(query.date);
    const params = new URLSearchParams({ type: "booking", limit: "200" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });

    let existingBookings: Array<{ start: string; end: string }> = [];
    if (res.ok) {
      const data = await res.json();
      const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
        frontmatter: Record<string, unknown>;
      }>;
      existingBookings = pages
        .map((p) => ({
          start: (p.frontmatter.slot_start as string) ?? "",
          end: (p.frontmatter.slot_end as string) ?? "",
        }))
        .filter((b) => b.start && b.end);
    }

    const slots = generateSlots(
      date,
      { start: query.start_hour, end: query.end_hour },
      query.duration,
      existingBookings
    );

    return apiSuccess({ slots });
  }
);

const bookSchema = z.object({
  kanzlei_slug: z.string().min(1).max(300),
  slot_id: z.string().min(1).max(200),
  client_name: z.string().min(1).max(300),
  client_email: z.string().email(),
  client_phone: z.string().max(50).optional(),
  matter: z.string().min(1).max(2000),
  opponent_name: z.string().max(300).optional(),
  legal_area: z.string().max(100).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: bookSchema,
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "booking",
      entityId: body.slot_id,
      details: { client: body.client_name, matter: body.matter },
    }),
  },
  async (ctx, body) => {
    const date = new Date();
    const slotsRes = await fetch(`${ENGINE_URL}/api/pages?type=booking&limit=200`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });

    let existingBookings: Array<{ start: string; end: string }> = [];
    if (slotsRes.ok) {
      const data = await slotsRes.json();
      const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
        frontmatter: Record<string, unknown>;
      }>;
      existingBookings = pages
        .map((p) => ({
          start: (p.frontmatter.slot_start as string) ?? "",
          end: (p.frontmatter.slot_end as string) ?? "",
        }))
        .filter((b) => b.start && b.end);
    }

    const slots = generateSlots(date, { start: "00:00", end: "23:59" }, 30, existingBookings);
    const conflict = checkBookingConflict(body, slots);
    if (conflict.hasConflict) {
      return apiError("booking_conflict", conflict.reason ?? "conflict", 409);
    }

    const slot = slots.find((s) => s.id === body.slot_id);
    if (!slot) return apiError("not_found", "slot not found", 404);

    const frontmatter = createBookingFrontmatter(body, slot);
    const bookingSlug = `legal/bookings/${slot.id}`;
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: bookingSlug,
        title: `Termin: ${body.client_name} — ${slot.start}`,
        type: "booking",
        frontmatter,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return apiSuccess({ confirmed: true, booking_id: slot.id });
  }
);
