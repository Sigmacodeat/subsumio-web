/**
 * Online-Terminbuchung (Online Appointment Booking)
 * ==================================================
 * Public booking page per law firm.
 * Slot management (calendar sync as free/busy source).
 * Conflict check before confirmation.
 * First consultation fee via payment link (W4.1).
 * Automatic intake item creation (W2.1).
 */

export interface BookingSlot {
  id: string;
  start: string;
  end: string;
  duration_minutes: number;
  status: "available" | "booked" | "blocked";
  booked_by?: string;
  booked_email?: string;
  case_slug?: string;
}

export interface BookingRequest {
  kanzlei_slug: string;
  slot_id: string;
  client_name: string;
  client_email: string;
  client_phone?: string;
  matter: string;
  opponent_name?: string;
  legal_area?: string;
}

export interface BookingResult {
  confirmed: boolean;
  reason?: string;
  booking_id?: string;
  case_slug?: string;
  payment_link_id?: string;
  intake_slug?: string;
}

export function generateSlots(
  date: Date,
  workingHours: { start: string; end: string },
  slotDurationMinutes: number,
  existingBookings: Array<{ start: string; end: string }>
): BookingSlot[] {
  const slots: BookingSlot[] = [];
  const [startH, startM] = workingHours.start.split(":").map(Number);
  const [endH, endM] = workingHours.end.split(":").map(Number);

  const dayStart = new Date(date);
  dayStart.setHours(startH!, startM, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(endH!, endM, 0, 0);

  const now = new Date();
  const bufferMs = 2 * 60 * 60 * 1000;
  const earliestStart = new Date(now.getTime() + bufferMs);

  let current = new Date(dayStart);
  while (current < dayEnd) {
    const slotEnd = new Date(current.getTime() + slotDurationMinutes * 60_000);
    if (slotEnd > dayEnd) break;

    if (current < earliestStart) {
      current = slotEnd;
      continue;
    }

    const isBooked = existingBookings.some((booking) => {
      const bStart = new Date(booking.start);
      const bEnd = new Date(booking.end);
      return current < bEnd && slotEnd > bStart;
    });

    slots.push({
      id: `slot-${current.toISOString()}-${Math.random().toString(36).slice(2, 6)}`,
      start: current.toISOString(),
      end: slotEnd.toISOString(),
      duration_minutes: slotDurationMinutes,
      status: isBooked ? "booked" : "available",
    });

    current = slotEnd;
  }

  return slots;
}

export function checkBookingConflict(
  request: BookingRequest,
  slots: BookingSlot[]
): { hasConflict: boolean; reason?: string } {
  const slot = slots.find((s) => s.id === request.slot_id);
  if (!slot) return { hasConflict: true, reason: "slot_not_found" };
  if (slot.status === "booked") return { hasConflict: true, reason: "slot_already_booked" };
  if (slot.status === "blocked") return { hasConflict: true, reason: "slot_blocked" };
  return { hasConflict: false };
}

export function createBookingFrontmatter(request: BookingRequest, slot: BookingSlot) {
  return {
    type: "booking",
    status: "confirmed",
    kanzlei_slug: request.kanzlei_slug,
    slot_start: slot.start,
    slot_end: slot.end,
    client_name: request.client_name,
    client_email: request.client_email,
    client_phone: request.client_phone,
    matter: request.matter,
    opponent_name: request.opponent_name,
    legal_area: request.legal_area,
    created_at: new Date().toISOString(),
  };
}
