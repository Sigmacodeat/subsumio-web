/**
 * bea-deadlines.ts — eEB→Fristbeginn-Verdrahtung (WP-6.33).
 *
 * Eine beA-Eingangsnachricht trägt im Umschlag das Bereitstellungsdatum
 * (`received_date`). Das ist der rechtliche Fristauslöser: § 174 ZPO
 * i.V.m. § 4 ERVG — elektronisch bereitgestellte Dokumente gelten am Tag
 * nach dem Bereitstellen als zugestellt (Sonnabend-Fiktion in
 * `zustellungBea`).
 *
 * Die generische Fristenerkennung (`detectDeadlines`) liefert die
 * Fristart; die Berechnung läuft bewusst über die DE-Engine
 * (`berechneFristArtDE`, §§ 187–193 BGB, keine vhfZ) — beA ist ein
 * reiner DE-Kanal, die AT-Registry würde falsche Rechtsgrundlagen
 * erzeugen. AT-only-Templates (VwGH/VfGH/AVG) haben kein DE-Mapping und
 * fallen auf das erkannte absolute Datum zurück — oder werden
 * verworfen, wenn keins existiert.
 *
 * Ergebnis sind `suggested_deadlines` auf der Akte — Vorschläge, die ein
 * Anwalt bestätigt, bevor sie ins Fristenbuch kommen (gleiches Muster
 * wie mail-filing).
 */

import { detectDeadlines, enrichDetectedDeadline } from "@/lib/ai-deadline-detect";
import { zustellungBea, type Bundesland } from "@/lib/legal/frist-engine-de";
import type { SuggestedDeadline } from "@/lib/matter-detail-types";

// Die AT→DE-Zuordnung der Fristarten (DE_TEMPLATE_MAP) und die Berechnung
// liegen in ai-deadline-detect.ts (enrichDetectedDeadline, rechtsraum "DE").

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * eEB-Zustellfiktion: beA-Bereitstellungs-/Empfangsdatum → rechtlicher
 * Zustelltag (§ 174 ZPO i.V.m. § 4 ERVG). Akzeptiert ISO-Datetime
 * (wird auf das Datum geschnitten); ungültige Eingaben → null.
 */
export function eebZustellungsdatum(
  receivedDate: string | undefined | null,
  land?: Bundesland
): string | null {
  const iso = (receivedDate ?? "").trim().slice(0, 10);
  if (!ISO_DATE.test(iso)) return null;
  try {
    return zustellungBea(iso, land);
  } catch {
    return null;
  }
}

/**
 * Erkennt Fristen in einer beA-Nachricht und verankert sie auf dem
 * eEB-Zustelltag. Nur Vorschläge mit konkretem Datum kommen zurück.
 */
export function beaDeadlineSuggestions(input: {
  /** Betreff + Nachrichtentext (der beA-Page-Content reicht). */
  text: string;
  /** beA `received_date` (Bereitstellung) — Fristauslöser. */
  receivedDate?: string;
  /** Bundesland der Akte für § 193 BGB Feiertage; undefined = bundesweit. */
  bundesland?: Bundesland;
  /** Herkunfts-Label für den Vorschlag, z. B. "beA: <Betreff>". */
  sourceLabel: string;
}): SuggestedDeadline[] {
  const detected = detectDeadlines(input.text).slice(0, 5);
  if (detected.length === 0) return [];

  const zustellung = eebZustellungsdatum(input.receivedDate, input.bundesland);
  const out: SuggestedDeadline[] = [];

  for (const raw of detected) {
    // Fristart + frei formulierte Fristen laufen über die DE-Engine (§§ 187 ff.
    // BGB, Endtag-Verschiebung), verankert auf dem eEB-Zustelltag. Ohne
    // eEB-Tag bleibt nur ein im Text genanntes absolutes Datum.
    const dd = zustellung
      ? enrichDetectedDeadline(
          { ...raw, zustellungsdatum: zustellung, zustellungsart: "standard" },
          input.text,
          { rechtsraum: "DE", bundesland: input.bundesland }
        )
      : raw;
    const deterministic = Boolean(dd.berechnung);
    const due = dd.date;
    if (!due || !/^\d{4}-\d{2}-\d{2}/.test(due)) continue;

    out.push({
      // DE-Berechnung trägt die DE-Bezeichnung und -Rechtsgrundlage, nie
      // den AT-Paragrafen der Erkennungsregel.
      title: dd.description || dd.type,
      due_date: due.slice(0, 10),
      urgency: deterministic || dd.confidence === "high" ? "high" : "medium",
      source: input.sourceLabel,
      source_quote: dd.sourceSnippet.slice(0, 300),
      confirmed: false,
    });
  }

  return out;
}
