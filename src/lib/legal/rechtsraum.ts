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
 * Rechtsraum for a deadline inside one matter: a matter explicitly assigned to
 * Austria, Germany or Switzerland (`jurisdiction` "at"/"de"/"ch") uses that
 * country's rules; otherwise the firm's Rechtsraum applies. The firm's
 * Bundesland/Kanton is only used when it belongs to that same country — an
 * Austrian firm's German matter must not get a guessed German Land.
 */
export function resolveMatterRechtsraum(
  matterJurisdiction: string | undefined | null,
  firm: { state?: string; country?: string }
): { country?: "DE" | "AT" | "CH"; state?: string; source: "matter" | "firm" } {
  const j = typeof matterJurisdiction === "string" ? matterJurisdiction.trim().toUpperCase() : "";
  if (j === "AT" || j === "DE" || j === "CH") {
    const firmCountry = firm.country ?? "AT";
    if (j === "AT") return { country: "AT", state: "AT", source: "matter" };
    return {
      country: j,
      state: firmCountry === j ? firm.state : undefined,
      source: "matter",
    };
  }
  const country =
    firm.country === "DE" || firm.country === "CH" || firm.country === "AT"
      ? firm.country
      : undefined;
  return { country, state: firm.state, source: "firm" };
}

/**
 * Extract Rechtsraum parameters from KanzleiSettings.
 * Returns empty object if no Rechtsraum is configured (backward compatible).
 */
export function getRechtsraumParams(settings?: KanzleiSettings | null): RechtsraumParams {
  if (!settings) return {};
  const country = settings.rechtsraumCountry;
  const state = settings.rechtsraumState;
  if (!country) return {};
  // Österreich hat keine Bundesland-Auswahl (Feiertage gelten bundesweit); die
  // Einstellungsseite speichert für AT keinen State. Ohne diesen Fall lief die
  // Fristenrechnung für AT-Kanzleien ohne jeden Feiertag (2026-09-25).
  if (country === "AT" && !state) return { state: "AT", country };
  if (!state) return {};
  // Validate state against country
  if (country === "DE" && !DE_STATES.has(state)) return {};
  if (country === "AT" && state !== "AT") return {};
  if (country === "CH" && !CH_CANTONS.has(state)) return {};
  return { state: state as Bundesland | Canton, country };
}
