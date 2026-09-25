/**
 * Ausgehende Rechnungs-Post (Rechnung, Mahnung): Mahnschreiben und
 * Postausgangsbuch-Eintrag. Jede Mahnung steht im Postausgangsbuch mit
 * Aktenbezug und Rechnungsnummer — Nachweis des Mahnzugangs.
 */

import { ENGINE_URL } from "@/lib/engine";
import { createOutboundEntry } from "@/lib/outbound-register";
import { formatEur } from "@/lib/utils";

import { logger } from "@/lib/logger";
const log = logger("invoice-outbound");

const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );

export interface ReminderMailInput {
  label: string;
  client: string;
  invoiceNumber: string;
  invoiceTotal: number;
  paidSoFar: number;
  feeAdded: number;
  feeTotal: number;
  openAmount: number;
  signature: string;
}

/** Mahnschreiben (HTML), Beträge über formatEur (de-AT, z. B. „€ 1.234,50“). */
export function reminderMailHtml(m: ReminderMailInput): string {
  const eur = (n: number) => esc(formatEur(n, "de"));
  return `<p>Sehr geehrte${m.client ? ` ${esc(m.client)}` : ""},</p>
<p>wir mussten feststellen, dass die Rechnung <strong>${esc(m.invoiceNumber)}</strong> über <strong>${eur(m.invoiceTotal)}</strong> noch nicht (vollständig) beglichen wurde.</p>
<p><strong>${esc(m.label)}</strong></p>
${m.paidSoFar > 0 ? `<p>Bereits bezahlt: <strong>${eur(m.paidSoFar)}</strong></p>` : ""}
${m.feeAdded > 0 ? `<p>Mahnspesen dieser Mahnung: <strong>${eur(m.feeAdded)}</strong></p>` : ""}
${m.feeTotal > 0 ? `<p>Mahnspesen gesamt: <strong>${eur(m.feeTotal)}</strong></p>` : ""}
<p>Offener Gesamtbetrag: <strong>${eur(m.openAmount)}</strong></p>
<p>Bitte überweisen Sie den Betrag umgehend unter Angabe der Rechnungsnummer.</p>
<p>Mit freundlichen Grüßen<br/>${esc(m.signature)}</p>`;
}

/**
 * Postausgangsbuch-Eintrag für eine versendete Rechnungs-/Mahn-Mail. Gibt die
 * Eintrags-ID zurück, oder null, wenn der Eintrag nicht geschrieben werden
 * konnte (geloggt — der Versand ist dann schon erfolgt).
 */
export async function recordInvoiceOutbound(
  headers: Record<string, string>,
  input: {
    recipient: string;
    recipientName: string;
    caseSlug?: string;
    subject: string;
    sentBy: string;
    trackingId?: string;
    providerId?: string;
    notes?: string;
  }
): Promise<string | null> {
  const entry = createOutboundEntry({
    channel: "email",
    recipient_name: input.recipientName,
    recipient_address: input.recipient,
    case_slug: input.caseSlug,
    subject: input.subject,
    sent_by: input.sentBy,
    tracking_id: input.trackingId,
    provider_id: input.providerId,
    notes: input.notes,
  });
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/outbound-register/${entry.id}`,
        title: `Ausgang: ${input.subject} → ${input.recipient}`,
        type: "outbound_entry",
        frontmatter: entry,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      log.error("outbound-register write failed", { status: res.status });
      return null;
    }
    return entry.id;
  } catch (err) {
    log.error("outbound-register write failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
