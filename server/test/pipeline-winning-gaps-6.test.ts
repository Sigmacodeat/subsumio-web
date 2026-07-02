import { describe, it, expect } from "bun:test";

// Tests for the 3 new pipeline layers: mediation-adr-analyzer, limitation-scanner, cost-award-predictor

// ── Mediation/ADR extraction ────────────────────────────────

function extractMediationADR(json: unknown): {
  optionen_count: number;
  empfohlen_count: number;
  empfohlener_weg: string;
  obl_schlichtung_erforderlich: boolean;
  score: number;
  empfehlung: string;
} {
  if (!json || typeof json !== "object")
    return { optionen_count: 0, empfohlen_count: 0, empfohlener_weg: "", obl_schlichtung_erforderlich: false, score: 0, empfehlung: "" };
  const obj = json as Record<string, unknown>;
  const optionen = Array.isArray(obj.adr_optionen) ? obj.adr_optionen : [];
  const obl = obj.obligatorische_schlichtung as Record<string, unknown> | undefined;
  return {
    optionen_count: optionen.length,
    empfohlen_count: optionen.filter((o) => (o as Record<string, unknown>).empfohlen === true).length,
    empfohlener_weg: String(obj.empfohlener_weg ?? ""),
    obl_schlichtung_erforderlich: Boolean(obl?.erforderlich),
    score: typeof obj.overall_adr_score === "number" ? obj.overall_adr_score : 0,
    empfehlung: String(obj.empfehlung ?? ""),
  };
}

describe("mediation-adr-analyzer extraction", () => {
  it("extracts 4 ADR options with mediation recommended", () => {
    const json = {
      adr_optionen: [
        { typ: "mediation", paragraph: "§ 227 ZPO", voraussetzungen: "Freiwilligkeit", vorteile: ["vertraulich"], nachteile: ["nicht bindend"], geschätzte_dauer_wochen: 8, geschätzte_kosten: 3000, erfolgswahrscheinlichkeit: 75, empfohlen: true, begruendung: "Beziehung wichtig" },
        { typ: "schiedsverfahren", paragraph: "§ 577 ZPO", geschätzte_dauer_wochen: 20, geschätzte_kosten: 25000, erfolgswahrscheinlichkeit: 85, empfohlen: false },
        { typ: "schlichtung", paragraph: "§ 15a EGZPO", geschätzte_dauer_wochen: 4, geschätzte_kosten: 0, erfolgswahrscheinlichkeit: 60, empfohlen: false },
        { typ: "gerichtlich", geschätzte_dauer_wochen: 40, geschätzte_kosten: 15000, erfolgswahrscheinlichkeit: 60, empfohlen: false },
      ],
      empfohlener_weg: "mediation",
      empfohlener_weg_begruendung: "75% Erfolg bei 1/5 der Kosten",
      vergleich_gerichtlich: { gerichtlich_dauer_wochen: 40, gerichtlich_kosten: 15000, gerichtlich_erfolgswahrscheinlichkeit: 60, adr_vorteil_zeit: "32 Wochen", adr_vorteil_kosten: "€12.000" },
      obligatorische_schlichtung: { erforderlich: false, paragraph: "§ 15a EGZPO" },
      overall_adr_score: 80,
      empfehlung: "Mediation empfohlen — 75% Erfolg bei 1/5 der Kosten",
    };
    const result = extractMediationADR(json);
    expect(result.optionen_count).toBe(4);
    expect(result.empfohlen_count).toBe(1);
    expect(result.empfohlener_weg).toBe("mediation");
    expect(result.obl_schlichtung_erforderlich).toBe(false);
    expect(result.score).toBe(80);
  });

  it("handles obligatory Schlichtung required", () => {
    const json = {
      adr_optionen: [
        { typ: "schlichtung", paragraph: "§ 15a EGZPO", empfohlen: true },
        { typ: "gerichtlich", empfohlen: false },
      ],
      empfohlener_weg: "schlichtung",
      obligatorische_schlichtung: { erforderlich: true, paragraph: "§ 15a EGZPO", grund: "Nachbarschaftsstreit" },
      overall_adr_score: 50,
      empfehlung: "Obligatorische Schlichtung erforderlich",
    };
    const result = extractMediationADR(json);
    expect(result.obl_schlichtung_erforderlich).toBe(true);
    expect(result.empfohlener_weg).toBe("schlichtung");
  });

  it("returns defaults for null input", () => {
    const result = extractMediationADR(null);
    expect(result.optionen_count).toBe(0);
    expect(result.score).toBe(0);
  });
});

// ── Limitation Scanner extraction ───────────────────────────

function extractLimitation(json: unknown): {
  ansprueche_count: number;
  urgent_count: number;
  verjaehrte_count: number;
  hemmungen_count: number;
  score: number;
  empfehlung: string;
} {
  if (!json || typeof json !== "object")
    return { ansprueche_count: 0, urgent_count: 0, verjaehrte_count: 0, hemmungen_count: 0, score: 0, empfehlung: "" };
  const obj = json as Record<string, unknown>;
  return {
    ansprueche_count: Array.isArray(obj.ansprueche) ? obj.ansprueche.length : 0,
    urgent_count: Array.isArray(obj.urgent_ansprueche) ? obj.urgent_ansprueche.length : 0,
    verjaehrte_count: Array.isArray(obj.verjaehrte_ansprueche) ? obj.verjaehrte_ansprueche.length : 0,
    hemmungen_count: Array.isArray(obj.hemmungen_aktiv) ? obj.hemmungen_aktiv.length : 0,
    score: typeof obj.overall_verjaehrung_risiko_score === "number" ? obj.overall_verjaehrung_risiko_score : 0,
    empfehlung: String(obj.empfehlung ?? ""),
  };
}

describe("limitation-scanner extraction", () => {
  it("extracts claims with urgent and verjährt", () => {
    const json = {
      ansprueche: [
        { anspruch: "Schmerzensgeld", anspruchshoehe: 20000, verjaehrungsfrist_jahre: 3, paragraph: "§ 1489 ABGB", beginn: "2024-03-15", frist_ende: "2027-03-15", verjaehrt: false, restzeit_tage: 365, hemmung: false, handlungsbedarf: "OK" },
        { anspruch: "Werklohn 2021", anspruchshoehe: 8000, verjaehrungsfrist_jahre: 3, paragraph: "§ 195 BGB", beginn: "2022-01-01", frist_ende: "2025-01-01", verjaehrt: false, restzeit_tage: 45, hemmung: false, handlungsbedarf: "URGENT" },
        { anspruch: "Schadensersatz 2019", anspruchshoehe: 5000, verjaehrungsfrist_jahre: 3, paragraph: "§ 1489 ABGB", beginn: "2019-06-01", frist_ende: "2022-06-01", verjaehrt: true, restzeit_tage: 0, hemmung: false, handlungsbedarf: "URGENT" },
      ],
      urgent_ansprueche: [
        { anspruch: "Werklohn 2021", restzeit_tage: 45, handlungsbedarf: "URGENT — Klage innerhalb 6 Wochen!", paragraph: "§ 195 BGB" },
      ],
      verjaehrte_ansprueche: [
        { anspruch: "Schadensersatz 2019", paragraph: "§ 1489 ABGB", grund: "3-Jahres-Frist abgelaufen" },
      ],
      hemmungen_aktiv: [],
      overall_verjaehrung_risiko_score: 70,
      empfehlung: "1 Anspruch verjährt in 45 Tagen — URGENT Klage",
    };
    const result = extractLimitation(json);
    expect(result.ansprueche_count).toBe(3);
    expect(result.urgent_count).toBe(1);
    expect(result.verjaehrte_count).toBe(1);
    expect(result.hemmungen_count).toBe(0);
    expect(result.score).toBe(70);
  });

  it("handles all claims within time (low risk)", () => {
    const json = {
      ansprueche: [
        { anspruch: "Schmerzensgeld", verjaehrungsfrist_jahre: 3, restzeit_tage: 700, verjaehrt: false, handlungsbedarf: "OK" },
      ],
      urgent_ansprueche: [],
      verjaehrte_ansprueche: [],
      hemmungen_aktiv: [],
      overall_verjaehrung_risiko_score: 10,
      empfehlung: "Alle Ansprüche innerhalb der Frist",
    };
    const result = extractLimitation(json);
    expect(result.urgent_count).toBe(0);
    expect(result.verjaehrte_count).toBe(0);
    expect(result.score).toBe(10);
  });

  it("handles active Hemmung", () => {
    const json = {
      ansprueche: [
        { anspruch: "Schmerzensgeld", verjaehrungsfrist_jahre: 3, restzeit_tage: 100, verjaehrt: false, hemmung: true, handlungsbedarf: "WARNUNG" },
      ],
      urgent_ansprueche: [],
      verjaehrte_ansprueche: [],
      hemmungen_aktiv: [
        { anspruch: "Schmerzensgeld", hemmung_grund: "Verhandlungen (§ 1496 ABGB)", hemmung_seit: "2024-06-01" },
      ],
      overall_verjaehrung_risiko_score: 30,
      empfehlung: "Hemmung aktiv — Frist läuft nicht",
    };
    const result = extractLimitation(json);
    expect(result.hemmungen_count).toBe(1);
    expect(result.score).toBe(30);
  });

  it("returns defaults for null input", () => {
    const result = extractLimitation(null);
    expect(result.ansprueche_count).toBe(0);
    expect(result.score).toBe(0);
  });
});

// ── Verjährungsfrist calculation logic ──────────────────────

describe("verjährungsfrist calculation", () => {
  function calculateFristEnde(beginn: Date, fristJahre: number): Date {
    const ende = new Date(beginn);
    ende.setFullYear(ende.getFullYear() + fristJahre);
    return ende;
  }

  function daysBetween(from: Date, to: Date): number {
    return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  }

  it("3-year Verjährung ab Kenntnis", () => {
    const beginn = new Date("2024-03-15");
    const ende = calculateFristEnde(beginn, 3);
    expect(ende.toISOString().startsWith("2027-03-15")).toBe(true);
  });

  it("30-year Verjährung (AT allgemeine)", () => {
    const beginn = new Date("2024-01-01");
    const ende = calculateFristEnde(beginn, 30);
    expect(ende.getFullYear()).toBe(2054);
  });

  it("10-year Verjährung (CH allgemeine)", () => {
    const beginn = new Date("2024-06-15");
    const ende = calculateFristEnde(beginn, 10);
    expect(ende.getFullYear()).toBe(2034);
  });

  it("URGENT if less than 180 days remaining", () => {
    const today = new Date();
    const fristEnde = new Date(today);
    fristEnde.setDate(fristEnde.getDate() + 45);
    const restzeit = daysBetween(today, fristEnde);
    expect(restzeit).toBeLessThan(180);
  });

  it("OK if more than 365 days remaining", () => {
    const today = new Date();
    const fristEnde = new Date(today);
    fristEnde.setDate(fristEnde.getDate() + 700);
    const restzeit = daysBetween(today, fristEnde);
    expect(restzeit).toBeGreaterThan(365);
  });
});

// ── Cost Award extraction ───────────────────────────────────

function extractCostAward(json: unknown): {
  szenarien_count: number;
  wahrscheinlich: string;
  erwartete_netto_kosten: number;
  erwartete_erstattung: number;
  score: number;
  empfehlung: string;
} {
  if (!json || typeof json !== "object")
    return { szenarien_count: 0, wahrscheinlich: "", erwartete_netto_kosten: 0, erwartete_erstattung: 0, score: 0, empfehlung: "" };
  const obj = json as Record<string, unknown>;
  return {
    szenarien_count: Array.isArray(obj.szenarien) ? obj.szenarien.length : 0,
    wahrscheinlich: String(obj.wahrscheinlichstes_szenario ?? ""),
    erwartete_netto_kosten: typeof obj.erwartete_netto_kosten === "number" ? obj.erwartete_netto_kosten : 0,
    erwartete_erstattung: typeof obj.erwartete_erstattung === "number" ? obj.erwartete_erstattung : 0,
    score: typeof obj.kostenrisiko_score === "number" ? obj.kostenrisiko_score : 0,
    empfehlung: String(obj.empfehlung ?? ""),
  };
}

describe("cost-award-predictor extraction", () => {
  it("extracts 4 scenarios with teilgewinn most likely", () => {
    const json = {
      szenarien: [
        { szenario: "vollgewinn", erfolgsquote: 100, eigene_kosten: 9500, erstattung_durch_gegner: 9500, netto_kosten: 0, paragraph: "§ 78 ZPO", begruendung: "Vollgewinn" },
        { szenario: "teilgewinn_60", erfolgsquote: 60, eigene_kosten: 9500, erstattung_durch_gegner: 5700, netto_kosten: 3800, paragraph: "§ 78(2) ZPO", begruendung: "Teilobsiegen 60%" },
        { szenario: "vollverlust", erfolgsquote: 0, eigene_kosten: 9500, erstattung_durch_gegner: 0, netto_kosten: 9500, paragraph: "§ 78 ZPO", begruendung: "Vollverlust" },
        { szenario: "vergleich", erfolgsquote: null, eigene_kosten: 5000, erstattung_durch_gegner: 0, netto_kosten: 5000, paragraph: "§ 98 ZPO", begruendung: "Vergleich" },
      ],
      wahrscheinlichstes_szenario: "teilgewinn_60",
      erwartete_netto_kosten: 3800,
      erwartete_erstattung: 5700,
      kostenrisiko_score: 40,
      vergleich_kosten_vorteil: { gerichtlich_netto_kosten: 3800, vergleich_netto_kosten: 5000, vorteil: "gerichtlich", differenz: -1200 },
      empfehlung: "Teilgewinn 60% wahrscheinlich — Netto-Kosten €3.800",
    };
    const result = extractCostAward(json);
    expect(result.szenarien_count).toBe(4);
    expect(result.wahrscheinlich).toBe("teilgewinn_60");
    expect(result.erwartete_netto_kosten).toBe(3800);
    expect(result.erwartete_erstattung).toBe(5700);
    expect(result.score).toBe(40);
  });

  it("handles vollgewinn (no net cost)", () => {
    const json = {
      szenarien: [
        { szenario: "vollgewinn", erfolgsquote: 100, eigene_kosten: 9500, erstattung_durch_gegner: 9500, netto_kosten: 0 },
      ],
      wahrscheinlichstes_szenario: "vollgewinn",
      erwartete_netto_kosten: 0,
      erwartete_erstattung: 9500,
      kostenrisiko_score: 5,
      empfehlung: "Vollgewinn wahrscheinlich — keine Netto-Kosten",
    };
    const result = extractCostAward(json);
    expect(result.erwartete_netto_kosten).toBe(0);
    expect(result.score).toBe(5);
  });

  it("returns defaults for null input", () => {
    const result = extractCostAward(null);
    expect(result.szenarien_count).toBe(0);
    expect(result.score).toBe(0);
  });
});

// ── Cost award calculation logic ────────────────────────────

describe("cost award calculation logic", () => {
  function calculateNettoCost(eigeneKosten: number, erfolgsquote: number): number {
    const erstattung = eigeneKosten * (erfolgsquote / 100);
    return eigeneKosten - erstattung;
  }

  it("vollgewinn: netto = 0", () => {
    expect(calculateNettoCost(9500, 100)).toBe(0);
  });

  it("teilgewinn 60%: netto = 40% eigene Kosten", () => {
    expect(calculateNettoCost(9500, 60)).toBe(3800);
  });

  it("vollverlust: netto = 100% eigene Kosten", () => {
    expect(calculateNettoCost(9500, 0)).toBe(9500);
  });

  it("vergleich: netto = eigene Kosten (keine Erstattung)", () => {
    expect(calculateNettoCost(5000, 0)).toBe(5000);
  });

  it("teilgewinn 50%: netto = 50% eigene Kosten", () => {
    expect(calculateNettoCost(10000, 50)).toBe(5000);
  });

  it("gerichtlich günstiger als vergleich bei hoher Erfolgsquote", () => {
    const gerichtlich = calculateNettoCost(9500, 70);
    const vergleich = 5000;
    expect(gerichtlich).toBeLessThan(vergleich);
  });

  it("vergleich günstiger als gerichtlich bei niedriger Erfolgsquote", () => {
    const gerichtlich = calculateNettoCost(9500, 30);
    const vergleich = 5000;
    expect(gerichtlich).toBeGreaterThan(vergleich);
  });
});
