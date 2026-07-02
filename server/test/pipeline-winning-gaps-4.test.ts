import { describe, it, expect } from "bun:test";

// Tests for the 2 new pipeline layers: insurance-coverage-analyzer, tax-impact-analyzer

// ── Insurance Coverage extraction ───────────────────────────

function extractInsuranceCoverage(json: unknown): {
  versicherungen_count: number;
  deckungssumme: number;
  schaden_gedeckt: boolean | string;
  direktklage_moeglich: boolean;
  regress_vorhanden: boolean;
  versicherung_bekannt: boolean;
  score: number;
  empfehlung: string;
} {
  if (!json || typeof json !== "object")
    return { versicherungen_count: 0, deckungssumme: 0, schaden_gedeckt: false, direktklage_moeglich: false, regress_vorhanden: false, versicherung_bekannt: false, score: 0, empfehlung: "" };
  const obj = json as Record<string, unknown>;
  const vers = Array.isArray(obj.versicherungen) ? obj.versicherungen : [];
  const first = vers[0] as Record<string, unknown> | undefined;
  const direkt = obj.direktklage_moeglich as Record<string, unknown> | undefined;
  const regress = obj.regressrisiko as Record<string, unknown> | undefined;
  const status = obj.versicherungsstatus as Record<string, unknown> | undefined;
  return {
    versicherungen_count: vers.length,
    deckungssumme: typeof first?.deckungssumme === "number" ? first.deckungssumme : 0,
    schaden_gedeckt: (first?.schaden_gedeckt as boolean | string | undefined) ?? false,
    direktklage_moeglich: Boolean(direkt?.moeglich),
    regress_vorhanden: Boolean(regress?.vorhanden),
    versicherung_bekannt: Boolean(status?.bekannt),
    score: typeof obj.overall_versicherungsscore === "number" ? obj.overall_versicherungsscore : 0,
    empfehlung: String(obj.empfehlung ?? ""),
  };
}

describe("insurance-coverage-analyzer extraction", () => {
  it("extracts Kfz insurance with full coverage and direct action", () => {
    const json = {
      versicherungen: [
        {
          typ: "Kfz-Haftpflicht",
          versicherer: "Allianz",
          deckungssumme: 5000000,
          schaden_gedeckt: true,
          deckungsausschluesse: [],
          detail: "Kfz-Haftpflicht bei Allianz, Deckung €5M",
          quelle: "ON 12: Versicherungsschein",
        },
      ],
      direktklage_moeglich: { moeglich: true, gegen: "Allianz", paragraph: "§ 67 KFG", voraussetzungen: "Kfz im Verkehr" },
      regressrisiko: { vorhanden: false, grund: "Keine grobe Fahrlässigkeit", risiko_fuer_mandanten: "gering" },
      versicherungsstatus: { bekannt: true, detail: "ON 12", recherche_empfehlung: null },
      overall_versicherungsscore: 90,
      empfehlung: "Versicherung deckt Schaden — Direktklage empfohlen",
    };
    const result = extractInsuranceCoverage(json);
    expect(result.versicherungen_count).toBe(1);
    expect(result.deckungssumme).toBe(5000000);
    expect(result.schaden_gedeckt).toBe(true);
    expect(result.direktklage_moeglich).toBe(true);
    expect(result.regress_vorhanden).toBe(false);
    expect(result.versicherung_bekannt).toBe(true);
    expect(result.score).toBe(90);
  });

  it("handles unknown insurance (unsicher)", () => {
    const json = {
      versicherungen: [
        { typ: "Berufshaftpflicht", versicherer: "unbekannt", deckungssumme: 0, schaden_gedeckt: "unsicher", deckungsausschluesse: [], detail: "", quelle: "" },
      ],
      direktklage_moeglich: { moeglich: false },
      regressrisiko: { vorhanden: false },
      versicherungsstatus: { bekannt: false, detail: "Kein Versicherungsschein gefunden", recherche_empfehlung: "Versicherungsschein anfordern" },
      overall_versicherungsscore: 20,
      empfehlung: "Versicherung unbekannt — Recherche erforderlich",
    };
    const result = extractInsuranceCoverage(json);
    expect(result.schaden_gedeckt).toBe("unsicher");
    expect(result.versicherung_bekannt).toBe(false);
    expect(result.direktklage_moeglich).toBe(false);
    expect(result.score).toBe(20);
  });

  it("handles insurance with exclusions (not covered)", () => {
    const json = {
      versicherungen: [
        { typ: "Kfz-Haftpflicht", versicherer: "Wiener Städtische", deckungssumme: 1000000, schaden_gedeckt: false, deckungsausschluesse: ["Alkohol", "Fahrerflucht"], detail: "Ausschluss: Alkohol", quelle: "ON 8" },
      ],
      direktklage_moeglich: { moeglich: false, grund: "Deckungsausschluss" },
      regressrisiko: { vorhanden: true, grund: "Alkoholbedingte Fahrt", risiko_fuer_mandanten: "hoch" },
      versicherungsstatus: { bekannt: true, detail: "ON 8" },
      overall_versicherungsscore: 15,
      empfehlung: "Keine Deckung — Ausschluss Alkohol",
    };
    const result = extractInsuranceCoverage(json);
    expect(result.schaden_gedeckt).toBe(false);
    expect(result.regress_vorhanden).toBe(true);
    expect(result.score).toBe(15);
  });

  it("returns defaults for null input", () => {
    const result = extractInsuranceCoverage(null);
    expect(result.versicherungen_count).toBe(0);
    expect(result.score).toBe(0);
  });
});

// ── Tax Impact extraction ───────────────────────────────────

function extractTaxImpact(json: unknown): {
  kategorien_count: number;
  schmerzensgeld_steuerfrei: boolean;
  verdienstentgang_steuerpflichtig: boolean;
  netto_ev_urteil: number;
  netto_ev_vergleich: number;
  steuervorteil_vergleich: number;
  prozesskosten_abzugsfaehig: boolean;
  score: number;
  empfehlung: string;
} {
  if (!json || typeof json !== "object")
    return { kategorien_count: 0, schmerzensgeld_steuerfrei: false, verdienstentgang_steuerpflichtig: false, netto_ev_urteil: 0, netto_ev_vergleich: 0, steuervorteil_vergleich: 0, prozesskosten_abzugsfaehig: false, score: 0, empfehlung: "" };
  const obj = json as Record<string, unknown>;
  const aufschl = Array.isArray(obj.schadensersatz_aufschluesselung) ? obj.schadensersatz_aufschluesselung : [];
  const schmerzensgeld = aufschl.find((a) => (a as Record<string, unknown>).kategorie === "Schmerzensgeld") as Record<string, unknown> | undefined;
  const verdienst = aufschl.find((a) => (a as Record<string, unknown>).kategorie === "Verdienstentgang") as Record<string, unknown> | undefined;
  const prozesskosten = obj.prozesskosten_abzug as Record<string, unknown> | undefined;
  const nettoU = obj.netto_ev_urteil as Record<string, unknown> | undefined;
  const nettoV = obj.netto_ev_vergleich as Record<string, unknown> | undefined;
  const vergleich = obj.vergleich_vs_urteil as Record<string, unknown> | undefined;
  return {
    kategorien_count: aufschl.length,
    schmerzensgeld_steuerfrei: schmerzensgeld ? !schmerzensgeld.steuerpflichtig : false,
    verdienstentgang_steuerpflichtig: verdienst ? Boolean(verdienst.steuerpflichtig) : false,
    netto_ev_urteil: typeof nettoU?.netto_ev === "number" ? nettoU.netto_ev : 0,
    netto_ev_vergleich: typeof nettoV?.netto_ev === "number" ? nettoV.netto_ev : 0,
    steuervorteil_vergleich: typeof vergleich?.steuervorteil_vergleich === "number" ? vergleich.steuervorteil_vergleich : 0,
    prozesskosten_abzugsfaehig: Boolean(prozesskosten?.abzugsfaehig),
    score: typeof obj.overall_steuer_score === "number" ? obj.overall_steuer_score : 0,
    empfehlung: String(obj.empfehlung ?? ""),
  };
}

describe("tax-impact-analyzer extraction", () => {
  it("extracts full tax analysis with Schmerzensgeld tax-free and Verdienstentgang taxed", () => {
    const json = {
      schadensersatz_aufschluesselung: [
        { kategorie: "Schmerzensgeld", betrag: 20000, steuerpflichtig: false, steuersatz: 0, steuer: 0, netto: 20000 },
        { kategorie: "Verdienstentgang", betrag: 25000, steuerpflichtig: true, steuersatz: 42, steuer: 10500, netto: 14500 },
        { kategorie: "Sachschaden", betrag: 5000, steuerpflichtig: false, steuersatz: 0, steuer: 0, netto: 5000 },
      ],
      prozesskosten_abzug: { betrag: 9500, abzugsfaehig: true, paragraph: "§ 33 EStG", steuerersparnis: 3990 },
      netto_ev_urteil: { brutto_ev: 16075, steuern_auf_schadensersatz: 10500, steuerersparnis_prozesskosten: 3990, netto_ev: 9565 },
      netto_ev_vergleich: { vergleichsbetrag: 30000, aufteilung: { schmerzensgeld: 15000, sachschaden: 10000, verdienstentgang: 5000 }, steuern: 2100, steuerersparnis_prozesskosten: 3990, netto_ev: 31890 },
      vergleich_vs_urteil: { steuervorteil_vergleich: 22325, empfehlung: "Vergleich steuerlich deutlich günstiger" },
      gestaltungsempfehlung: { aufteilung: "Schmerzensgeld €15.000, Sachschaden €10.000, Verdienstentgang €5.000", begruendung: "Maximierung steuerfreier Anteile" },
      overall_steuer_score: 85,
      empfehlung: "Vergleich steuerlich optimiert — Netto-Vorteil €22.325",
    };
    const result = extractTaxImpact(json);
    expect(result.kategorien_count).toBe(3);
    expect(result.schmerzensgeld_steuerfrei).toBe(true);
    expect(result.verdienstentgang_steuerpflichtig).toBe(true);
    expect(result.netto_ev_urteil).toBe(9565);
    expect(result.netto_ev_vergleich).toBe(31890);
    expect(result.steuervorteil_vergleich).toBe(22325);
    expect(result.prozesskosten_abzugsfaehig).toBe(true);
    expect(result.score).toBe(85);
  });

  it("Schmerzensgeld is always tax-free in AT/DE/CH", () => {
    const json = {
      schadensersatz_aufschluesselung: [
        { kategorie: "Schmerzensgeld", betrag: 50000, steuerpflichtig: false, steuersatz: 0, steuer: 0, netto: 50000 },
      ],
      netto_ev_urteil: { netto_ev: 50000 },
      netto_ev_vergleich: { netto_ev: 50000 },
      overall_steuer_score: 100,
      empfehlung: "Schmerzensgeld steuerfrei",
    };
    const result = extractTaxImpact(json);
    expect(result.schmerzensgeld_steuerfrei).toBe(true);
  });

  it("handles pure financial damages (all taxed)", () => {
    const json = {
      schadensersatz_aufschluesselung: [
        { kategorie: "Verdienstentgang", betrag: 40000, steuerpflichtig: true, steuersatz: 45, steuer: 18000, netto: 22000 },
      ],
      prozesskosten_abzug: { betrag: 12000, abzugsfaehig: true, steuerersparnis: 5400 },
      netto_ev_urteil: { brutto_ev: 30000, steuern_auf_schadensersatz: 18000, steuerersparnis_prozesskosten: 5400, netto_ev: 17400 },
      netto_ev_vergleich: { vergleichsbetrag: 35000, steuern: 15750, steuerersparnis_prozesskosten: 5400, netto_ev: 24650 },
      vergleich_vs_urteil: { steuervorteil_vergleich: 7250, empfehlung: "Vergleich günstiger" },
      overall_steuer_score: 70,
      empfehlung: "Vergleich steuerlich vorteilhaft",
    };
    const result = extractTaxImpact(json);
    expect(result.verdienstentgang_steuerpflichtig).toBe(true);
    expect(result.schmerzensgeld_steuerfrei).toBe(false); // no Schmerzensgeld in this case
    expect(result.netto_ev_urteil).toBe(17400);
    expect(result.netto_ev_vergleich).toBe(24650);
  });

  it("returns defaults for null input", () => {
    const result = extractTaxImpact(null);
    expect(result.kategorien_count).toBe(0);
    expect(result.netto_ev_urteil).toBe(0);
    expect(result.score).toBe(0);
  });
});

// ── Net EV calculation logic ────────────────────────────────

describe("net EV calculation logic", () => {
  function calculateNetEV(brutto: number, steuern: number, steuerersparnis: number): number {
    return brutto - steuern + steuerersparnis;
  }

  it("net EV = brutto - steuern + steuerersparnis", () => {
    expect(calculateNetEV(16075, 10500, 3990)).toBe(9565);
  });

  it("net EV with no taxes (all Schmerzensgeld)", () => {
    expect(calculateNetEV(50000, 0, 0)).toBe(50000);
  });

  it("net EV with high taxes", () => {
    expect(calculateNetEV(40000, 18000, 5400)).toBe(27400);
  });

  it("vergleich netto > urteil netto when steuervorteil positive", () => {
    const nettoUrteil = calculateNetEV(16075, 10500, 3990);
    const nettoVergleich = calculateNetEV(30000, 2100, 3990);
    expect(nettoVergleich).toBeGreaterThan(nettoUrteil);
    expect(nettoVergleich - nettoUrteil).toBe(22325);
  });

  it("prozesskosten steuerersparnis = betrag * steuersatz", () => {
    const prozesskosten = 9500;
    const steuersatz = 0.42;
    const steuerersparnis = prozesskosten * steuersatz;
    expect(steuerersparnis).toBe(3990);
  });
});
