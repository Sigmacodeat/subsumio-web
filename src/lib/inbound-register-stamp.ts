/**
 * Posteingangsbuch-Stempel (server-only).
 *
 * Jeder Eingangskanal — Upload, Mandantenportal, E-Mail-Import, beA — muss
 * einen `inbound_entry`-Eintrag schreiben, damit das Eingangsbuch die
 * revisionssichere Gesamtübersicht bleibt. Getrennt von inbound-register.ts,
 * weil das Shared-Modul auch in Client-Bundles landet.
 *
 * Aufrufer entscheiden über die Fehlerbehandlung: der Upload-Pfad fängt den
 * Fehler best-effort ab (ein fehlgeschlagener Stempel darf den Upload nicht
 * verlieren), die manuelle Registrierung lässt ihn durchschlagen.
 */

import { ENGINE_URL } from "@/lib/engine";
import { createInboundEntry, type InboundChannel, type InboundEntry } from "@/lib/inbound-register";

export interface StampInboundInput {
  channel: InboundChannel;
  subject: string;
  senderName?: string;
  senderAddress?: string;
  caseSlug?: string;
  documentSlug?: string;
  receivedBy?: string;
  notes?: string;
}

export async function stampInboundEntry(
  headers: Record<string, string>,
  input: StampInboundInput
): Promise<InboundEntry> {
  const entry = createInboundEntry(input);
  const titleSubject = (entry.subject || "Dokumenteneingang").slice(0, 160);
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: `legal/inbound-register/${entry.id}`,
      title: `Posteingang: ${titleSubject}`,
      type: "inbound_entry",
      frontmatter: entry,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`inbound_stamp_failed_${res.status}`);
  }
  return entry;
}
