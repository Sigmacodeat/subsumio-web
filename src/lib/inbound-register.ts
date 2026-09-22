/**
 * Posteingangsbuch (Inbound Mail Register)
 * =========================================
 * Chronologisches Register aller eingehenden Dokumente/Kommunikation
 * (Upload, E-Mail, WhatsApp, ERV, Scan) mit Eingangsstempel und laufender
 * Nummer. Pendant zum bereits vorhandenen Postausgangsbuch
 * (outbound-register.ts) — für den Posteingang gab es bislang kein
 * eigenes Register, nur die rohen Dokument-/E-Mail-Seiten selbst, ohne
 * Eingangsdatum-Stempel oder Kanal-Übersicht an einer Stelle.
 */

export type InboundChannel = "upload" | "email" | "whatsapp" | "erv" | "scan" | "portal";

export const INBOUND_CHANNEL_LABEL: Record<InboundChannel, string> = {
  upload: "Hochgeladen",
  email: "E-Mail",
  whatsapp: "WhatsApp",
  erv: "ERV",
  scan: "Scan",
  portal: "Mandantenportal",
};

export interface InboundEntry {
  id: string;
  /** Eingangsdatum — der GoBD-relevante Zeitpunkt, nicht das Dokumentdatum selbst. */
  received_at: string;
  channel: InboundChannel;
  direction: "inbound";
  sender_name?: string;
  sender_address?: string;
  case_slug?: string;
  subject: string;
  document_slug?: string;
  received_by?: string;
  notes?: string;
  created_at: string;
}

export function createInboundEntry(input: {
  channel: InboundChannel;
  subject: string;
  senderName?: string;
  senderAddress?: string;
  caseSlug?: string;
  documentSlug?: string;
  receivedBy?: string;
  notes?: string;
}): InboundEntry {
  const now = new Date().toISOString();
  return {
    id: `in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    received_at: now,
    channel: input.channel,
    direction: "inbound",
    sender_name: input.senderName,
    sender_address: input.senderAddress,
    case_slug: input.caseSlug,
    subject: input.subject,
    document_slug: input.documentSlug,
    received_by: input.receivedBy,
    notes: input.notes,
    created_at: now,
  };
}

export function filterInboundByDateRange(
  entries: InboundEntry[],
  from: string,
  to: string
): InboundEntry[] {
  const fromTime = new Date(from).getTime();
  const toTime = new Date(to).getTime();
  return entries.filter(
    (e) =>
      new Date(e.received_at).getTime() >= fromTime && new Date(e.received_at).getTime() <= toTime
  );
}

export function exportInboundRegister(entries: InboundEntry[]): string {
  const header = "Eingangsdatum;Kanal;Absender;Adresse;Akte;Betreff\n";
  const rows = entries.map((e) =>
    [
      e.received_at.slice(0, 19),
      INBOUND_CHANNEL_LABEL[e.channel],
      e.sender_name ?? "",
      e.sender_address ?? "",
      e.case_slug ?? "",
      e.subject,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(";")
  );
  return header + rows.join("\n") + (rows.length > 0 ? "\n" : "");
}
