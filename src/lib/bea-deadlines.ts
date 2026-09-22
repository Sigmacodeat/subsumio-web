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

import { detectDeadlines } from "@/lib/ai-deadline-detect";
import { berechneFristArtDE, zustellungBea, type Bundesland } from "@/lib/legal/frist-engine-de";
import type { SuggestedDeadline } from "@/lib/matter-detail-types";

/**
 * `suggestedTemplate` der Erkennungsregeln → `FRISTEN_REGISTRY_DE`-Key.
 * Die Regexes feuert auf generische/AT-Begriffe ("Klageerwiderung",
 * "Berufung"); für den DE-Kanal beA wird auf die DE-Fristart gemappt.
 * AT-spezifische Templates (rekurs→Beschwerde als bestmögliches
 * Äquivalent; VwGH/VfGH/AVG bewusst ohne Mapping — kein DE-Pendant).
 */
const DE_TEMPLATE_MAP: Record<string, string> = {
  klagebeantwortung: "klageerwiderung_de",
  berufung: "berufung_de",
  revision: "revision_de",
  wiedereinsetzung: "wiedereinsetzung_de",
  einspruch_zahlungsbefehl: "widerspruch_mahnbescheid_de",
  beschwerde_stpo: "sofortige_beschwerde_stpo_de",
  rekurs: "sofortige_beschwerde_de",
};

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

  for (const dd of detected) {
    let due: string | undefined;
    let deterministic = false;

    const deKey = dd.suggestedTemplate ? DE_TEMPLATE_MAP[dd.suggestedTemplate] : undefined;
    if (deKey && zustellung) {
      try {
        due = berechneFristArtDE(deKey, zustellung, input.bundesland).fristende;
        deterministic = true;
      } catch {
        // Fristart nicht berechenbar → Fallback-Pfade unten.
      }
    }

    // Relative Frist ohne Registry-Mapping ("binnen zwei Wochen"):
    // auf den eEB-Zustelltag verankern, wenn vorhanden.
    if (!due && zustellung && !dd.date && dd.daysFromNow) {
      const end = new Date(`${zustellung}T00:00:00Z`);
      if (!Number.isNaN(end.getTime())) {
        end.setUTCDate(end.getUTCDate() + dd.daysFromNow);
        due = end.toISOString().slice(0, 10);
      }
    }

    // Letzter Fallback: das im Text erkannte absolute Datum.
    if (!due) due = dd.date;
    if (!due || !/^\d{4}-\d{2}-\d{2}/.test(due)) continue;

    out.push({
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
