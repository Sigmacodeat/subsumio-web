/**
 * StBVV-Gebührenberechnung nach der Steuerberatervergütungsverordnung.
 *
 * Im Gegensatz zum RVG (das eine Stufenformel mit Schritten verwendet),
 * basiert die StBVV auf einer festen Gebührentabelle (Anlage 1) mit
 * Gegenstandswertstufen und对应的 Mindest-/Höchstgebühren für verschiedene
 * Tätigkeiten (Gebührenrahmen).
 *
 * Grundlage: StBVV i.d.F. der Bekanntmachung vom 10.04.2009 (BGBl. I S. 1020),
 * zuletzt geändert durch Art. 3 G v. 22.11.2023 (BGBl. 2023 I Nr. 330).
 */

// StBVV Anlage 1 — Gegenstandswertstufen und对应的 1,0-Gebühr (Mindestgebühr).
// Quelle: § 34 StBVV i.V.m. Anlage 1.
const STBVV_STUFEN: Array<{ bis: number; gebuehr: number }> = [
  { bis: 2_000, gebuehr: 15 },
  { bis: 5_000, gebuehr: 25 },
  { bis: 10_000, gebuehr: 40 },
  { bis: 25_000, gebuehr: 60 },
  { bis: 50_000, gebuehr: 100 },
  { bis: 100_000, gebuehr: 150 },
  { bis: 250_000, gebuehr: 250 },
  { bis: 500_000, gebuehr: 400 },
  { bis: 1_000_000, gebuehr: 600 },
  { bis: 2_500_000, gebuehr: 900 },
  { bis: 5_000_000, gebuehr: 1_200 },
  { bis: 10_000_000, gebuehr: 1_800 },
  { bis: 25_000_000, gebuehr: 2_500 },
  { bis: Infinity, gebuehr: 3_500 },
];

function stbvvGrundgebuehr(gegenstandswert: number): number {
  if (!Number.isFinite(gegenstandswert) || gegenstandswert <= 0) return 0;
  for (const stufe of STBVV_STUFEN) {
    if (gegenstandswert <= stufe.bis) {
      return stufe.gebuehr;
    }
  }
  return STBVV_STUFEN[STBVV_STUFEN.length - 1].gebuehr;
}

export type StBVVActivity =
  | "buchfuehrung" // § 24 StBVV
  | "jahresabschluss" // § 25 StBVV
  | "steuererklaerung" // § 33 StBVV
  | "lohnbuchhaltung" // § 24a StBVV
  | "finanzbuchhaltung" // § 24 StBVV
  | "beratung" // § 34 StBVV
  | "einspruch" // § 33 StBVV
  | "finanzamt_vertretung" // § 33 StBVV
  | "betriebspruefung" // § 34 StBVV
  | "sonstige";

interface ActivityConfig {
  minFaktor: number;
  maxFaktor: number;
  defaultFaktor: number;
  vvNr: string;
}

const ACTIVITY_CONFIG: Record<StBVVActivity, ActivityConfig> = {
  buchfuehrung: { minFaktor: 0.5, maxFaktor: 2.5, defaultFaktor: 1.0, vvNr: "VV 2400" },
  jahresabschluss: { minFaktor: 1.0, maxFaktor: 4.0, defaultFaktor: 2.5, vvNr: "VV 2500" },
  steuererklaerung: { minFaktor: 0.5, maxFaktor: 2.5, defaultFaktor: 1.3, vvNr: "VV 3300" },
  lohnbuchhaltung: { minFaktor: 0.5, maxFaktor: 2.5, defaultFaktor: 1.0, vvNr: "VV 2410" },
  finanzbuchhaltung: { minFaktor: 0.5, maxFaktor: 2.5, defaultFaktor: 1.0, vvNr: "VV 2400" },
  beratung: { minFaktor: 0.5, maxFaktor: 2.5, defaultFaktor: 1.0, vvNr: "VV 3400" },
  einspruch: { minFaktor: 0.5, maxFaktor: 2.5, defaultFaktor: 1.6, vvNr: "VV 3320" },
  finanzamt_vertretung: { minFaktor: 1.0, maxFaktor: 4.0, defaultFaktor: 1.3, vvNr: "VV 3325" },
  betriebspruefung: { minFaktor: 0.5, maxFaktor: 2.5, defaultFaktor: 1.5, vvNr: "VV 3400" },
  sonstige: { minFaktor: 0.5, maxFaktor: 2.5, defaultFaktor: 1.0, vvNr: "VV 3400" },
};

export interface StBVVResult {
  gegenstandswert: number;
  activity: StBVVActivity;
  activityFactor: number;
  vvNummer: string;
  basisGebuehr: number;
  gebuehrNetto: number;
  minGebuehr: number;
  maxGebuehr: number;
  auslagenpauschale: number;
  summeNetto: number;
  mwst: number;
  summeBrutto: number;
}

export function calculateStBVV(
  gegenstandswert: number,
  activity: StBVVActivity = "steuererklaerung",
  faktor?: number
): StBVVResult {
  const safeWert = Number.isFinite(gegenstandswert) && gegenstandswert > 0 ? gegenstandswert : 0;
  const basis = stbvvGrundgebuehr(safeWert);
  const config = ACTIVITY_CONFIG[activity] ?? ACTIVITY_CONFIG.sonstige;
  const f =
    faktor !== undefined
      ? Math.max(config.minFaktor, Math.min(config.maxFaktor, faktor))
      : config.defaultFaktor;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const gebuehrNetto = round2(basis * f);
  const minGebuehr = round2(basis * config.minFaktor);
  const maxGebuehr = round2(basis * config.maxFaktor);
  const auslagenpauschale = 20;
  const summeNetto = round2(gebuehrNetto + auslagenpauschale);
  const mwst = round2(summeNetto * 0.19);
  const summeBrutto = round2(summeNetto + mwst);

  return {
    gegenstandswert: safeWert,
    activity,
    activityFactor: f,
    vvNummer: config.vvNr,
    basisGebuehr: basis,
    gebuehrNetto,
    minGebuehr,
    maxGebuehr,
    auslagenpauschale,
    summeNetto,
    mwst,
    summeBrutto,
  };
}

export const STBVV_ACTIVITIES: Array<{ value: StBVVActivity; label: string }> = [
  { value: "buchfuehrung", label: "Buchführung (§ 24 StBVV)" },
  { value: "jahresabschluss", label: "Jahresabschluss (§ 25 StBVV)" },
  { value: "steuererklaerung", label: "Steuererklärung (§ 33 StBVV)" },
  { value: "lohnbuchhaltung", label: "Lohnbuchhaltung (§ 24a StBVV)" },
  { value: "finanzbuchhaltung", label: "Finanzbuchhaltung (§ 24 StBVV)" },
  { value: "beratung", label: "Beratung (§ 34 StBVV)" },
  { value: "einspruch", label: "Einspruch (§ 33 StBVV)" },
  { value: "finanzamt_vertretung", label: "Vertretung Finanzamt (§ 33 StBVV)" },
  { value: "betriebspruefung", label: "Betriebsprüfung (§ 34 StBVV)" },
  { value: "sonstige", label: "Sonstige Tätigkeit" },
];
