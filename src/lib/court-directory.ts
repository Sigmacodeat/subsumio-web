/**
 * Gerichts- und Zuständigkeitsdatenbank
 * =====================================
 * German/Austrian court directory with jurisdiction assistant.
 * Provides SAFE-IDs for beA, addresses, and jurisdiction rules.
 */

export interface CourtEntry {
  id: string;
  name: string;
  type:
    | "lg"
    | "ag"
    | "olg"
    | "bg"
    | "sg"
    | "fg"
    | "vg"
    | "finanzgericht"
    | "arbeitsgericht"
    | "sozialgericht";
  state: string;
  city: string;
  address?: string;
  zip?: string;
  safe_id?: string;
  bea_address?: string;
}

export const GERMAN_COURTS: CourtEntry[] = [
  {
    id: "bg-1",
    name: "Bundesgerichtshof",
    type: "bg",
    state: "BW",
    city: "Karlsruhe",
    zip: "76133",
    safe_id: "BGH-KA",
    bea_address: "bea@bgh.bund.de",
  },
  {
    id: "bverfg-1",
    name: "Bundesverfassungsgericht",
    type: "bg",
    state: "BW",
    city: "Karlsruhe",
    zip: "76131",
    safe_id: "BVerfG",
  },
  {
    id: "bfh-1",
    name: "Bundesfinanzhof",
    type: "finanzgericht",
    state: "BY",
    city: "München",
    zip: "80333",
    safe_id: "BFH-M",
  },
  {
    id: "bag-1",
    name: "Bundesarbeitsgericht",
    type: "arbeitsgericht",
    state: "SN",
    city: "Erfurt",
    zip: "99084",
    safe_id: "BAG-EF",
  },
  {
    id: "bsg-1",
    name: "Bundessozialgericht",
    type: "sozialgericht",
    state: "NW",
    city: "Kassel",
    zip: "34117",
    safe_id: "BSG-KS",
  },
  // Berlin
  {
    id: "lg-b-1",
    name: "Landgericht Berlin",
    type: "lg",
    state: "BE",
    city: "Berlin",
    zip: "10117",
    address: "Littenstraße 12-17",
    safe_id: "LG-B",
  },
  {
    id: "ag-b-mitte",
    name: "Amtsgericht Berlin-Mitte",
    type: "ag",
    state: "BE",
    city: "Berlin",
    zip: "10117",
    address: "Littenstraße 12-17",
    safe_id: "AG-B-Mitte",
  },
  {
    id: "ag-b-charlottenburg",
    name: "Amtsgericht Charlottenburg",
    type: "ag",
    state: "BE",
    city: "Berlin",
    zip: "10623",
    address: "Tegeler Weg 17-21",
    safe_id: "AG-B-Charlottenburg",
  },
  // München
  {
    id: "lg-m-1",
    name: "Landgericht München I",
    type: "lg",
    state: "BY",
    city: "München",
    zip: "80333",
    address: "Pacellistraße 5",
    safe_id: "LG-M-I",
  },
  {
    id: "lg-m-2",
    name: "Landgericht München II",
    type: "lg",
    state: "BY",
    city: "München",
    zip: "81541",
    address: "Lindwurmstraße 88",
    safe_id: "LG-M-II",
  },
  {
    id: "ag-m-1",
    name: "Amtsgericht München",
    type: "ag",
    state: "BY",
    city: "München",
    zip: "80333",
    address: "Pacellistraße 5",
    safe_id: "AG-M",
  },
  // Hamburg
  {
    id: "lg-hh-1",
    name: "Landgericht Hamburg",
    type: "lg",
    state: "HH",
    city: "Hamburg",
    zip: "20354",
    address: "Sievekingplatz 1",
    safe_id: "LG-HH",
  },
  {
    id: "ag-hh-1",
    name: "Amtsgericht Hamburg",
    type: "ag",
    state: "HH",
    city: "Hamburg",
    zip: "20354",
    address: "Sievekingplatz 1",
    safe_id: "AG-HH",
  },
  // Köln
  {
    id: "lg-k-1",
    name: "Landgericht Köln",
    type: "lg",
    state: "NW",
    city: "Köln",
    zip: "50667",
    address: "Reichenspergerplatz 1",
    safe_id: "LG-K",
  },
  {
    id: "ag-k-1",
    name: "Amtsgericht Köln",
    type: "ag",
    state: "NW",
    city: "Köln",
    zip: "50667",
    address: "Reichenspergerplatz 1",
    safe_id: "AG-K",
  },
  // Frankfurt
  {
    id: "lg-f-1",
    name: "Landgericht Frankfurt am Main",
    type: "lg",
    state: "HE",
    city: "Frankfurt am Main",
    zip: "60313",
    address: "Gerichtsstraße 2",
    safe_id: "LG-F",
  },
  {
    id: "ag-f-1",
    name: "Amtsgericht Frankfurt am Main",
    type: "ag",
    state: "HE",
    city: "Frankfurt am Main",
    zip: "60313",
    address: "Gerichtsstraße 2",
    safe_id: "AG-F",
  },
  // Stuttgart
  {
    id: "lg-s-1",
    name: "Landgericht Stuttgart",
    type: "lg",
    state: "BW",
    city: "Stuttgart",
    zip: "70173",
    address: "Schillerstraße 10",
    safe_id: "LG-S",
  },
  {
    id: "ag-s-1",
    name: "Amtsgericht Stuttgart",
    type: "ag",
    state: "BW",
    city: "Stuttgart",
    zip: "70173",
    address: "Schillerstraße 10",
    safe_id: "AG-S",
  },
  // Düsseldorf
  {
    id: "lg-d-1",
    name: "Landgericht Düsseldorf",
    type: "lg",
    state: "NW",
    city: "Düsseldorf",
    zip: "40213",
    address: "Kasernenstraße 36",
    safe_id: "LG-D",
  },
  {
    id: "ag-d-1",
    name: "Amtsgericht Düsseldorf",
    type: "ag",
    state: "NW",
    city: "Düsseldorf",
    zip: "40213",
    address: "Kasernenstraße 36",
    safe_id: "AG-D",
  },
  // OLG
  {
    id: "olg-b-1",
    name: "Oberlandesgericht Berlin",
    type: "olg",
    state: "BE",
    city: "Berlin",
    zip: "10117",
    safe_id: "OLG-B",
  },
  {
    id: "olg-m-1",
    name: "Oberlandesgericht München",
    type: "olg",
    state: "BY",
    city: "München",
    zip: "80333",
    safe_id: "OLG-M",
  },
  {
    id: "olg-hh-1",
    name: "Oberlandesgericht Hamburg",
    type: "olg",
    state: "HH",
    city: "Hamburg",
    zip: "20354",
    safe_id: "OLG-HH",
  },
  {
    id: "olg-k-1",
    name: "Oberlandesgericht Köln",
    type: "olg",
    state: "NW",
    city: "Köln",
    zip: "50667",
    safe_id: "OLG-K",
  },
  {
    id: "olg-f-1",
    name: "Oberlandesgericht Frankfurt",
    type: "olg",
    state: "HE",
    city: "Frankfurt am Main",
    zip: "60313",
    safe_id: "OLG-F",
  },
  {
    id: "olg-s-1",
    name: "Oberlandesgericht Stuttgart",
    type: "olg",
    state: "BW",
    city: "Stuttgart",
    zip: "70173",
    safe_id: "OLG-S",
  },
  {
    id: "olg-d-1",
    name: "Oberlandesgericht Düsseldorf",
    type: "olg",
    state: "NW",
    city: "Düsseldorf",
    zip: "40213",
    safe_id: "OLG-D",
  },
];

export const AUSTRIAN_COURTS: CourtEntry[] = [
  {
    id: "ogh-1",
    name: "Oberster Gerichtshof",
    type: "bg",
    state: "W",
    city: "Wien",
    zip: "1010",
    address: "Schwarzenbergstraße 1",
    safe_id: "OGH-W",
  },
  {
    id: "olg-w-1",
    name: "Oberlandesgericht Wien",
    type: "olg",
    state: "W",
    city: "Wien",
    zip: "1010",
    safe_id: "OLG-W",
  },
  {
    id: "bg-w-1",
    name: "Bezirksgericht Wien",
    type: "ag",
    state: "W",
    city: "Wien",
    zip: "1010",
    safe_id: "BG-W",
  },
  {
    id: "lg-w-1",
    name: "Landesgericht Wien",
    type: "lg",
    state: "W",
    city: "Wien",
    zip: "1080",
    safe_id: "LG-W",
  },
  {
    id: "olg-l-1",
    name: "Oberlandesgericht Linz",
    type: "olg",
    state: "O",
    city: "Linz",
    zip: "4020",
    safe_id: "OLG-L",
  },
  {
    id: "olg-g-1",
    name: "Oberlandesgericht Graz",
    type: "olg",
    state: "ST",
    city: "Graz",
    zip: "8010",
    safe_id: "OLG-G",
  },
];

export function searchCourts(query: {
  city?: string;
  state?: string;
  type?: CourtEntry["type"];
  name?: string;
}): CourtEntry[] {
  const all = [...GERMAN_COURTS, ...AUSTRIAN_COURTS];
  return all.filter((c) => {
    if (query.city && !c.city.toLowerCase().includes(query.city.toLowerCase())) return false;
    if (query.state && c.state !== query.state) return false;
    if (query.type && c.type !== query.type) return false;
    if (query.name && !c.name.toLowerCase().includes(query.name.toLowerCase())) return false;
    return true;
  });
}

export function findCourtBySafeId(safeId: string): CourtEntry | undefined {
  const all = [...GERMAN_COURTS, ...AUSTRIAN_COURTS];
  return all.find((c) => c.safe_id === safeId);
}

export interface JurisdictionResult {
  court: CourtEntry;
  reasoning: string;
  confidence: "high" | "medium" | "low";
}

export function determineJurisdiction(input: {
  plaintiffZip?: string;
  defendantZip?: string;
  disputeValue?: number;
  matter?: string;
}): JurisdictionResult | null {
  const all = [...GERMAN_COURTS, ...AUSTRIAN_COURTS];

  // Determine court type based on dispute value
  const isLandgericht = input.disputeValue !== undefined && input.disputeValue > 5000;

  // Try to find court by ZIP prefix
  const zip = input.defendantZip ?? input.plaintiffZip;
  if (zip) {
    const zipPrefix = zip.slice(0, 2);
    const cityMatch = all.find((c) => {
      if (c.zip?.startsWith(zipPrefix) && c.type === (isLandgericht ? "lg" : "ag")) return true;
      return false;
    });
    if (cityMatch) {
      return {
        court: cityMatch,
        reasoning: `Zuständig nach §12 ZPO (Wohnsitz des Beklagten, PLZ ${zip}), Streitwert ${input.disputeValue ?? "unbekannt"} → ${isLandgericht ? "Landgericht" : "Amtsgericht"}`,
        confidence: "high",
      };
    }
  }

  // Fallback: try city name
  if (input.defendantZip) {
    const fallback = all.find((c) => c.type === (isLandgericht ? "lg" : "ag"));
    if (fallback) {
      return {
        court: fallback,
        reasoning: "Allgemeiner Gerichtsstand — manuelle Verifizierung empfohlen",
        confidence: "low",
      };
    }
  }

  return null;
}
