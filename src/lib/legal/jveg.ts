import {
  JVEG_AUSLAGENPAUSCHALE_MAX,
  JVEG_AUSLAGENPAUSCHALE_SATZ,
  JVEG_FAHRKOSTEN_KFZ_PRO_KM,
  JVEG_HAUSHALTSFUEHRUNG_PRO_STUNDE,
  JVEG_HONORARGRUPPEN,
  JVEG_MAX_STUNDEN_PRO_TAG,
  JVEG_SOURCE,
  JVEG_VERDIENSTAUSFALL_MAX_PRO_STUNDE,
  JVEG_ZEITVERSAEUMNIS_PRO_STUNDE,
} from "./jveg-tariff-data";

export class JvegInputError extends Error {}

const round2 = (n: number) => Math.round(n * 100) / 100;

function validStunden(stunden: number): number {
  if (!Number.isFinite(stunden) || stunden <= 0) {
    throw new JvegInputError("Stundenzahl muss eine positive Zahl sein.");
  }
  // Letzte begonnene Stunde wird voll gerechnet (§ 19 Abs. 2 JVEG).
  const ganze = Math.ceil(stunden);
  if (ganze > JVEG_MAX_STUNDEN_PRO_TAG) {
    throw new JvegInputError(
      `Maximal ${JVEG_MAX_STUNDEN_PRO_TAG} Stunden pro Tag werden entschädigt (§ 19 Abs. 2 JVEG).`
    );
  }
  return ganze;
}

export interface JvegZeugeResult {
  stunden: number;
  zeitversaeumnis: number;
  verdienstausfall: number;
  haushaltsfuehrung: number;
  fahrtkosten: number;
  gesamt: number;
  hinweise: string[];
  source: typeof JVEG_SOURCE;
}

/**
 * Zeugenentschädigung nach §§ 19–23 JVEG. Es wird immer nur EINE der drei
 * Entschädigungsarten gewährt (§ 20: „soweit weder … noch …"):
 * Verdienstausfall > Haushaltsführung > Zeitversäumnis.
 */
export function calculateJvegZeuge(opts: {
  stunden: number;
  /** Tatsächlicher Bruttoverdienst je Stunde (für § 22), max 25 €/h. */
  bruttoverdienstProStunde?: number;
  /** Nachteile bei der Haushaltsführung (§ 21). */
  haushaltsfuehrung?: boolean;
  /** Gefahrene Kilometer mit Kraftwagen (§ 5 Abs. 2 JVEG). */
  fahrtKm?: number;
}): JvegZeugeResult {
  const stunden = validStunden(opts.stunden);
  const km = opts.fahrtKm ?? 0;
  if (!Number.isFinite(km) || km < 0) {
    throw new JvegInputError("Kilometerzahl darf nicht negativ sein.");
  }

  let verdienstausfall = 0;
  let haushaltsfuehrung = 0;
  let zeitversaeumnis = 0;
  const hinweise: string[] = [];

  if (opts.bruttoverdienstProStunde && opts.bruttoverdienstProStunde > 0) {
    const satz = Math.min(opts.bruttoverdienstProStunde, JVEG_VERDIENSTAUSFALL_MAX_PRO_STUNDE);
    verdienstausfall = round2(satz * stunden);
    hinweise.push(
      `Verdienstausfall ${satz} €/h${opts.bruttoverdienstProStunde > JVEG_VERDIENSTAUSFALL_MAX_PRO_STUNDE ? ` (gedeckelt auf ${JVEG_VERDIENSTAUSFALL_MAX_PRO_STUNDE} €/h)` : ""} (§ 22 JVEG)`
    );
  } else if (opts.haushaltsfuehrung) {
    haushaltsfuehrung = round2(JVEG_HAUSHALTSFUEHRUNG_PRO_STUNDE * stunden);
    hinweise.push(`Haushaltsführung ${JVEG_HAUSHALTSFUEHRUNG_PRO_STUNDE} €/h (§ 21 JVEG)`);
  } else {
    zeitversaeumnis = round2(JVEG_ZEITVERSAEUMNIS_PRO_STUNDE * stunden);
    hinweise.push(`Zeitversäumnis ${JVEG_ZEITVERSAEUMNIS_PRO_STUNDE} €/h (§ 20 JVEG)`);
  }

  const fahrtkosten = round2(km * JVEG_FAHRKOSTEN_KFZ_PRO_KM);
  if (km > 0) {
    hinweise.push(`Fahrtkosten Kfz ${JVEG_FAHRKOSTEN_KFZ_PRO_KM} €/km (§ 5 Abs. 2 JVEG)`);
  }
  if (stunden > Math.floor(stunden)) {
    hinweise.push("Letzte begonnene Stunde wird voll gerechnet (§ 19 Abs. 2 JVEG)");
  }

  return {
    stunden,
    zeitversaeumnis,
    verdienstausfall,
    haushaltsfuehrung,
    fahrtkosten,
    gesamt: round2(zeitversaeumnis + verdienstausfall + haushaltsfuehrung + fahrtkosten),
    hinweise,
    source: JVEG_SOURCE,
  };
}

export interface JvegSachverstaendigerResult {
  honorargruppe: string;
  stundensatz: number;
  stunden: number;
  honorar: number;
  auslagenpauschale: number;
  gesamtNetto: number;
  hinweise: string[];
  source: typeof JVEG_SOURCE;
}

/**
 * Sachverständigenvergütung nach § 9 JVEG (Stundensatz nach Anlage 1,
 * Honorargruppen M1–M13) plus optionale Auslagenpauschale (§ 12 JVEG).
 * Die Honorargruppe ordnet die ersatzpflichtige Stelle zu — das Ergebnis
 * ist eine Schätzung für die anwaltliche Prüfung.
 */
export function calculateJvegSachverstaendiger(opts: {
  honorargruppe: string;
  stunden: number;
  /** § 12 JVEG: Auslagenpauschale statt Einzelersatz. */
  auslagenpauschale?: boolean;
}): JvegSachverstaendigerResult {
  const gruppe = JVEG_HONORARGRUPPEN.find((g) => g.gruppe === opts.honorargruppe);
  if (!gruppe) {
    throw new JvegInputError(`Unbekannte Honorargruppe "${opts.honorargruppe}".`);
  }
  if (!Number.isFinite(opts.stunden) || opts.stunden <= 0) {
    throw new JvegInputError("Stundenzahl muss eine positive Zahl sein.");
  }
  const honorar = round2(gruppe.satz * opts.stunden);
  const pauschale = opts.auslagenpauschale
    ? Math.min(JVEG_AUSLAGENPAUSCHALE_MAX, round2(honorar * JVEG_AUSLAGENPAUSCHALE_SATZ))
    : 0;
  const hinweise = [`Honorargruppe ${gruppe.gruppe} — ${gruppe.satz} €/h (§ 9 JVEG, Anlage 1)`];
  if (pauschale > 0) {
    hinweise.push(
      `Auslagenpauschale ${pauschale} € (10 % des Honorars, max ${JVEG_AUSLAGENPAUSCHALE_MAX} € — § 12 JVEG)`
    );
  }
  return {
    honorargruppe: gruppe.gruppe,
    stundensatz: gruppe.satz,
    stunden: opts.stunden,
    honorar,
    auslagenpauschale: pauschale,
    gesamtNetto: round2(honorar + pauschale),
    hinweise,
    source: JVEG_SOURCE,
  };
}
