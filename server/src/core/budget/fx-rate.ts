/**
 * EUR→USD Wechselkurs-Config für Budget-Tracking.
 *
 * Der legal-pipeline BudgetTracker arbeitet in USD. Die Web-App reserviert
 * Credits in EUR. Diese Config definiert den Konvertierungsfaktor.
 *
 * Aktualisierbar via Env-Var SUBSUMIO_EUR_USD_RATE (z.B. für Wechselkurs-
 * schwankungen). Default ist ein konservativer Wert der leicht über dem
 * aktuellen Kurs liegt, um under-budgeting zu vermeiden.
 *
 * @module core/budget/fx-rate
 */

/** Konservativer Default: 1 EUR ≈ 1.08 USD (Stand 2026-08).
 *  Konservativ = leicht über dem Marktkurs, damit das Budget nicht
 *  zu knapp wird und legitimate pipeline runs nicht fälschlich
 *  BudgetExhausted werfen. */
const DEFAULT_EUR_USD_RATE = 1.08;

/** Liefert den aktuellen EUR→USD Wechselkurs.
 *  Quelle: env SUBSUMIO_EUR_USD_RATE (override), sonst Default.
 *  Muss > 0 sein — ein fallback auf Default bei invalidem env value. */
export function getEurUsdRate(): number {
  const envVal = process.env.SUBSUMIO_EUR_USD_RATE;
  if (envVal) {
    const parsed = parseFloat(envVal);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    console.warn(
      `[fx-rate] Invalid SUBSUMIO_EUR_USD_RATE="${envVal}", falling back to default ${DEFAULT_EUR_USD_RATE}`
    );
  }
  return DEFAULT_EUR_USD_RATE;
}

/** Konvertiert EUR → USD für Budget-Tracking-Zwecke. */
export function eurToUsd(eur: number): number {
  return eur * getEurUsdRate();
}
