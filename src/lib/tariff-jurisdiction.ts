/**
 * Which tariff forms the invoice dialog offers: RVG/GKG/JVEG for German
 * firms, RATG/AHK/GGG/NTG otherwise. The account stores the jurisdiction in
 * upper case ("DE" | "AT" | "CH"); older values may be lower case.
 */
export function tariffJurisdictionOf(jurisdiction: unknown): "de" | "at" {
  return String(jurisdiction ?? "")
    .trim()
    .toUpperCase() === "DE"
    ? "de"
    : "at";
}
