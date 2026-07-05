/**
 * Postausgangsbuch (Outbound Mail Register)
 * ==========================================
 * Chronological, audit-proof register of all outbound communications
 * (email/beA/post/fax) with delivery confirmation links.
 * Pendant to the Fristenbuch, fed by existing audit events.
 */

export type OutboundChannel = "email" | "bea" | "post" | "fax" | "whatsapp" | "portal";

export type DeliveryStatus = "sent" | "delivered" | "failed" | "bounced" | "pending";

export interface OutboundEntry {
  id: string;
  date: string;
  channel: OutboundChannel;
  direction: "outbound";
  recipient_name: string;
  recipient_address: string;
  case_slug?: string;
  subject: string;
  pages?: number;
  delivery_status: DeliveryStatus;
  delivery_confirmation_slug?: string;
  tracking_id?: string;
  sent_by: string;
  notes?: string;
  created_at: string;
}

export function createOutboundEntry(input: {
  channel: OutboundChannel;
  recipient_name: string;
  recipient_address: string;
  case_slug?: string;
  subject: string;
  pages?: number;
  sent_by: string;
  tracking_id?: string;
  notes?: string;
}): OutboundEntry {
  const now = new Date().toISOString();
  return {
    id: `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: now,
    channel: input.channel,
    direction: "outbound",
    recipient_name: input.recipient_name,
    recipient_address: input.recipient_address,
    case_slug: input.case_slug,
    subject: input.subject,
    pages: input.pages,
    delivery_status: "sent",
    sent_by: input.sent_by,
    tracking_id: input.tracking_id,
    notes: input.notes,
    created_at: now,
  };
}

export function updateDeliveryStatus(
  entry: OutboundEntry,
  status: DeliveryStatus,
  confirmationSlug?: string
): OutboundEntry {
  return {
    ...entry,
    delivery_status: status,
    delivery_confirmation_slug: confirmationSlug ?? entry.delivery_confirmation_slug,
  };
}

export const CHANNEL_LABELS: Record<OutboundChannel, { de: string; en: string }> = {
  email: { de: "E-Mail", en: "Email" },
  bea: { de: "beA", en: "beA" },
  post: { de: "Post", en: "Mail" },
  fax: { de: "Fax", en: "Fax" },
  whatsapp: { de: "WhatsApp", en: "WhatsApp" },
  portal: { de: "Portal", en: "Portal" },
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, { de: string; en: string }> = {
  sent: { de: "Versendet", en: "Sent" },
  delivered: { de: "Zugestellt", en: "Delivered" },
  failed: { de: "Fehlgeschlagen", en: "Failed" },
  bounced: { de: "Zurückgewiesen", en: "Bounced" },
  pending: { de: "Ausstehend", en: "Pending" },
};

export function filterOutboundByDateRange(
  entries: OutboundEntry[],
  from: string,
  to: string
): OutboundEntry[] {
  const fromTime = new Date(from).getTime();
  const toTime = new Date(to).getTime();
  return entries.filter(
    (e) => new Date(e.date).getTime() >= fromTime && new Date(e.date).getTime() <= toTime
  );
}

export function exportOutboundRegister(entries: OutboundEntry[]): string {
  const header = "Datum;Kanal;Empfänger;Adresse;Akte;Betreff;Status;Versandt von\n";
  const rows = entries.map((e) =>
    [
      e.date.slice(0, 19),
      CHANNEL_LABELS[e.channel].de,
      e.recipient_name,
      e.recipient_address,
      e.case_slug ?? "",
      e.subject,
      DELIVERY_STATUS_LABELS[e.delivery_status].de,
      e.sent_by,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(";")
  );
  return header + rows.join("\n");
}
