import {
  GKG_GEBUEHRENSAETZE,
  GKG_GRUNDBETRAG,
  GKG_MINDESTGEBUEHR,
  GKG_SOURCE,
  GKG_STUFEN,
  type GkgGebuehrensatzKey,
} from "./gkg-tariff-data";

export class GkgInputError extends Error {}

export interface GkgResult {
  streitwert: number;
  /** Einfache Gebühr (1,0) nach § 34 GKG, in EUR. */
  einfacheGebuehr: number;
  /** Gebührensatz (KV-Ziffer, z. B. 3,0 für die 1. Instanz). */
  satz: number;
  kv: string;
  satzLabel: string;
  /** Gerichtsgebühr = einfache Gebühr × Satz, in EUR. */
  gebuehr: number;
  source: typeof GKG_SOURCE;
}

/**
 * Einfache Gebühr (1,0) nach § 34 Abs. 1 GKG — Stufenformel:
 * 40 € bis 500 €, danach Erhöhung je angefangenem Stufenbetrag.
 * Deckt sich mit der Gebührentabelle der Anlage 2 (bis 500.000 €).
 */
export function gkgEinfacheGebuehr(streitwert: number): number {
  if (!Number.isFinite(streitwert) || streitwert <= 0) {
    throw new GkgInputError("Streitwert muss eine positive Zahl sein.");
  }
  if (streitwert <= 500) return GKG_GRUNDBETRAG;
  let gebuehr = GKG_GRUNDBETRAG;
  let grenze = 500;
  for (const stufe of GKG_STUFEN) {
    while (grenze < streitwert && grenze < stufe.bis) {
      gebuehr += stufe.betrag;
      grenze += stufe.je;
    }
    if (grenze >= streitwert) break;
  }
  return Math.round(gebuehr * 100) / 100;
}

/**
 * Gerichtsgebühr nach GKG: einfache Gebühr × Gebührensatz des KV.
 * Ergebnis ist eine Schätzung für die anwaltliche Prüfung — die
 * Gerichtskasse legt die Gebühr im Einzelfall fest (§ 11 GKG).
 */
export function calculateGkg(opts: {
  streitwert: number;
  satzKey: GkgGebuehrensatzKey;
}): GkgResult {
  const { streitwert, satzKey } = opts;
  const satzDef = GKG_GEBUEHRENSAETZE[satzKey];
  if (!satzDef) throw new GkgInputError(`Unbekannter Gebührensatz "${satzKey}".`);
  const einfach = gkgEinfacheGebuehr(streitwert);
  const gebuehr = Math.max(GKG_MINDESTGEBUEHR, Math.round(einfach * satzDef.satz * 100) / 100);
  return {
    streitwert,
    einfacheGebuehr: einfach,
    satz: satzDef.satz,
    kv: satzDef.kv,
    satzLabel: satzDef.label,
    gebuehr,
    source: GKG_SOURCE,
  };
}
