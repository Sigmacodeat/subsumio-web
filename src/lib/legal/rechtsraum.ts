/**
 * rechtsraum.ts — Helper to extract Rechtsraum (jurisdiction) parameters
 * from KanzleiSettings for holiday-aware deadline calculation.
 *
 * Used by QuickCreate, deadlines page, and any UI that calls computeDueDate.
 */

import type { KanzleiSettings } from "@/lib/kanzlei-settings";
import type { Bundesland, Canton } from "@/lib/legal-deadlines";

const DE_STATES = new Set([
  "BW",
  "BY",
  "BE",
  "BB",
  "HB",
  "HH",
  "HE",
  "MV",
  "NI",
  "NW",
  "RP",
  "SL",
  "SN",
  "ST",
  "SH",
  "TH",
]);

const CH_CANTONS = new Set([
  "ZH",
  "BE",
  "LU",
  "UR",
  "SZ",
  "OW",
  "NW",
  "GL",
  "ZG",
  "FR",
  "SO",
  "BS",
  "BL",
  "SH",
  "AR",
  "AI",
  "SG",
  "GR",
  "AG",
  "TG",
  "TI",
  "VD",
  "VS",
  "NE",
  "GE",
  "JU",
]);

export interface RechtsraumParams {
  state?: Bundesland | Canton;
  country?: "DE" | "AT" | "CH";
}

/**
 * Extract Rechtsraum parameters from KanzleiSettings.
 * Returns empty object if no Rechtsraum is configured (backward compatible).
 */
export function getRechtsraumParams(settings?: KanzleiSettings | null): RechtsraumParams {
  if (!settings) return {};
  const country = settings.rechtsraumCountry;
  const state = settings.rechtsraumState;
  if (!country || !state) return {};
  // Validate state against country
  if (country === "DE" && !DE_STATES.has(state)) return {};
  if (country === "AT" && state !== "AT") return {};
  if (country === "CH" && !CH_CANTONS.has(state)) return {};
  return { state: state as Bundesland | Canton, country };
}
