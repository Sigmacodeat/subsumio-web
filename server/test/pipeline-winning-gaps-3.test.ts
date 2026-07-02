import { describe, it, expect } from "bun:test";

// Tests for the 3 new pipeline layers: enforcement-analyzer, appeal-risk-analyzer, procedural-strategist

// ── Enforcement Analysis extraction ──────────────────────────

function extractEnforcementAnalysis(json: unknown): {
  vermoegenshoehe: number;
  insolvenz_risiko: string;
  pfaendbar_count: number;
  arrest_vorhanden: boolean;
  vollstreckungskosten: number;
  gesamt_risiko: string;
  score: number;
  empfehlung: string;
} {
  if (!json || typeof json !== "object")
    return { vermoegenshoehe: 0, insolvenz_risiko: "", pfaendbar_count: 0, arrest_vorhanden: false, vollstreckungskosten: 0, gesamt_risiko: "", score: 0, empfehlung: "" };
  const obj = json as Record<string, unknown>;
  const vermoegen = obj.vermoegenslage as Record<string, unknown> | undefined;
  const insolvenz = obj.insolvenzrisiko as Record<string, unknown> | undefined;
  const pfaendbarkeit = Array.isArray(obj.pfaendbarkeit) ? obj.pfaendbarkeit : [];
  const arrest = obj.arrestgruende as Record<string, unknown> | undefined;
  const kosten = obj.vollstreckungskosten as Record<string, unknown> | undefined;
  const risiko = obj.vollstreckungsrisiko as Record<string, unknown> | undefined;
  return {
    vermoegenshoehe: typeof vermoegen?.geschaetzte_vermoegenshoehe === "number" ? vermoegen.geschaetzte_vermoegenshoehe : 0,
    insolvenz_risiko: typeof insolvenz?.risiko === "string" ? insolvenz.risiko : "",
    pfaendbar_count: pfaendbarkeit.length,
    arrest_vorhanden: Boolean(arrest?.vorhanden),
    vollstreckungskosten: typeof kosten?.geschaetzte_kosten === "number" ? kosten.geschaetzte_kosten : 0,
    gesamt_risiko: typeof risiko?.gesamt_risiko === "string" ? risiko.gesamt_risiko : "",
    score: typeof obj.overall_vollstreckbarkeit_score === "number" ? obj.overall_vollstreckbarkeit_score : 0,
    empfehlung: String(obj.empfehlung ?? ""),
  };
}

describe("enforcement-analyzer extraction", () => {
  it("extracts full enforcement analysis with assets and arrest", () => {
    const json = {
      vermoegenslage: {
        bekannte_vermoegenswerte: ["Liegenschaft Wien 1010", "Bankkonto Bank Austria"],
        geschaetzte_vermoegenshoehe: 250000,
        quelle: "ON 12, ON 15",
        unsicherheit: "gering",
      },
      insolvenzrisiko: { risiko: "gering", indikatoren: [], einschaetzung: "Gegner solvent" },
      pfaendbarkeit: [
        { vermoegenswert: "Liegenschaft Wien 1010", pfandbar: true, art: "Liegenschaftsexekution (§ 50 EO)", erwarteter_erloes: 200000, risiken: ["Dauert 6-12 Monate"] },
        { vermoegenswert: "Bankkonto", pfandbar: true, art: "Forderungspfändung (§ 291 EO)", erwarteter_erloes: 15000, risiken: [] },
      ],
      arrestgruende: { vorhanden: true, gruende: ["Gegner plant Vermögensverschiebung (ON 18)"], empfehlung: "Arrestantrag stellen (§ 379 EO)" },
      vollstreckungskosten: { geschaetzte_kosten: 5000, aufschluesselung: ["Gerichtsvollzieher: €1.000", "Rechtsanwalt: €3.000"] },
      vollstreckungsrisiko: { gesamt_risiko: "mittel", risiken: ["Vermögensverschiebung vor Urteil"], gegenmassnahmen: ["Arrestantrag"] },
      overall_vollstreckbarkeit_score: 75,
      empfehlung: "Vollstreckung wahrscheinlich — Arrest empfohlen",
    };
    const result = extractEnforcementAnalysis(json);
    expect(result.vermoegenshoehe).toBe(250000);
    expect(result.insolvenz_risiko).toBe("gering");
    expect(result.pfaendbar_count).toBe(2);
    expect(result.arrest_vorhanden).toBe(true);
    expect(result.vollstreckungskosten).toBe(5000);
    expect(result.gesamt_risiko).toBe("mittel");
    expect(result.score).toBe(75);
  });

  it("handles insolvent opponent (high risk)", () => {
    const json = {
      vermoegenslage: { bekannte_vermoegenswerte: [], geschaetzte_vermoegenshoehe: 0, unsicherheit: "hoch" },
      insolvenzrisiko: { risiko: "hoch", indikatoren: ["Insolvenzverfahren anhängig"], einschaetzung: "§ 17 InsO" },
      pfaendbarkeit: [],
      arrestgruende: { vorhanden: false, gruende: [] },
      vollstreckungskosten: { geschaetzte_kosten: 0 },
      vollstreckungsrisiko: { gesamt_risiko: "hoch", risiken: ["Insolvenz"], gegenmassnahmen: [] },
      overall_vollstreckbarkeit_score: 10,
      empfehlung: "Vollstreckung unwahrscheinlich",
    };
    const result = extractEnforcementAnalysis(json);
    expect(result.insolvenz_risiko).toBe("hoch");
    expect(result.pfaendbar_count).toBe(0);
    expect(result.arrest_vorhanden).toBe(false);
    expect(result.gesamt_risiko).toBe("hoch");
    expect(result.score).toBe(10);
  });

  it("returns defaults for null input", () => {
    const result = extractEnforcementAnalysis(null);
    expect(result.vermoegenshoehe).toBe(0);
    expect(result.score).toBe(0);
  });
});

// ── Appeal Risk extraction ──────────────────────────────────

function extractAppealRisk(json: unknown): {
  berufungsgruende_count: number;
  berufung_wahrscheinlichkeit: number;
  revisions_wahrscheinlichkeit: number;
  eugh_moeglich: boolean;
  egmr_moeglich: boolean;
  kosten_gegner: number;
  score: number;
  empfehlung: string;
} {
  if (!json || typeof json !== "object")
    return { berufungsgruende_count: 0, berufung_wahrscheinlichkeit: 0, revisions_wahrscheinlichkeit: 0, eugh_moeglich: false, egmr_moeglich: false, kosten_gegner: 0, score: 0, empfehlung: "" };
  const obj = json as Record<string, unknown>;
  const gruende = Array.isArray(obj.berufungsgruende) ? obj.berufungsgruende : [];
  const aussicht = obj.berufungsaussicht_gegner as Record<string, unknown> | undefined;
  const revision = obj.revisionsrisiko as Record<string, unknown> | undefined;
  const europa = obj.europa_recht as Record<string, unknown> | undefined;
  const emrk = obj.emrk_beschwerde as Record<string, unknown> | undefined;
  const kosten = obj.kostenrisiko_berufung as Record<string, unknown> | undefined;
  return {
    berufungsgruende_count: gruende.length,
    berufung_wahrscheinlichkeit: typeof aussicht?.gesamt_wahrscheinlichkeit === "number" ? aussicht.gesamt_wahrscheinlichkeit : 0,
    revisions_wahrscheinlichkeit: typeof revision?.wahrscheinlichkeit === "number" ? revision.wahrscheinlichkeit : 0,
    eugh_moeglich: Boolean(europa?.eugh_vorabentscheidung_moeglich),
    egmr_moeglich: Boolean(emrk?.moeglich),
    kosten_gegner: typeof kosten?.geschaetzte_kosten_gegner === "number" ? kosten.geschaetzte_kosten_gegner : 0,
    score: typeof obj.overall_berufungsrisiko_score === "number" ? obj.overall_berufungsrisiko_score : 0,
    empfehlung: String(obj.empfehlung ?? ""),
  };
}

describe("appeal-risk-analyzer extraction", () => {
  it("extracts appeal grounds and success probability", () => {
    const json = {
      berufungsgruende: [
        { grund: "Rechtsfehler: Subsumtion § 1 AHG", typ: "rechtsfehler", wahrscheinlichkeit: "mittel", erfolgsaussicht: 40, detail: "Hoheitliches Handeln nicht geprüft" },
        { grund: "Verfahrensfehler: Gehör verletzt", typ: "verfahrensfehler", wahrscheinlichkeit: "gering", erfolgsaussicht: 15, detail: "Beweisantrag abgelehnt" },
      ],
      berufungsaussicht_gegner: { gesamt_wahrscheinlichkeit: 30, hauptargument: "Subsumtionsfehler", instanz: "OLG Wien" },
      revisionsrisiko: { wahrscheinlichkeit: 10, instanz: "OGH", voraussetzung: "Erhebliche Rechtsfrage", begruendung: "Nicht gegeben" },
      europa_recht: { eugh_vorabentscheidung_moeglich: false, grund: "Keine unionsrechtliche Frage" },
      emrk_beschwerde: { moeglich: false, grund: "Keine MR-Verletzung" },
      kostenrisiko_berufung: { geschaetzte_kosten_gegner: 15000, aufschluesselung: ["Anwalt: €8.000", "Gericht: €4.000"] },
      overall_berufungsrisiko_score: 30,
      empfehlung: "Berufungsrisiko mittel — Settlement empfohlen",
    };
    const result = extractAppealRisk(json);
    expect(result.berufungsgruende_count).toBe(2);
    expect(result.berufung_wahrscheinlichkeit).toBe(30);
    expect(result.revisions_wahrscheinlichkeit).toBe(10);
    expect(result.eugh_moeglich).toBe(false);
    expect(result.egmr_moeglich).toBe(false);
    expect(result.kosten_gegner).toBe(15000);
    expect(result.score).toBe(30);
  });

  it("handles high appeal risk with EGMR possibility", () => {
    const json = {
      berufungsgruende: [
        { grund: "Schwerer Verfahrensfehler", typ: "verfahrensfehler", wahrscheinlichkeit: "hoch", erfolgsaussicht: 70 },
      ],
      berufungsaussicht_gegner: { gesamt_wahrscheinlichkeit: 65, hauptargument: "Gehör verletzt", instanz: "OLG" },
      revisionsrisiko: { wahrscheinlichkeit: 25, instanz: "OGH" },
      europa_recht: { eugh_vorabentscheidung_moeglich: true, grund: "DSGVO Frage" },
      emrk_beschwerde: { moeglich: true, grund: "Art 6 EMRK verletzt" },
      kostenrisiko_berufung: { geschaetzte_kosten_gegner: 20000 },
      overall_berufungsrisiko_score: 70,
      empfehlung: "Berufungsrisiko hoch",
    };
    const result = extractAppealRisk(json);
    expect(result.berufung_wahrscheinlichkeit).toBe(65);
    expect(result.eugh_moeglich).toBe(true);
    expect(result.egmr_moeglich).toBe(true);
    expect(result.score).toBe(70);
  });

  it("returns defaults for null input", () => {
    const result = extractAppealRisk(null);
    expect(result.berufungsgruende_count).toBe(0);
    expect(result.score).toBe(0);
  });
});

// ── Procedural Strategy extraction ──────────────────────────

function extractProceduralStrategy(json: unknown): {
  schritte_count: number;
  einstweilige_verfuegung: boolean;
  beweissicherung: boolean;
  prozesskostensicherheit: boolean;
  teilklage: boolean;
  mediation: boolean;
  gesamtkosten: number;
  score: number;
  empfehlung: string;
} {
  if (!json || typeof json !== "object")
    return { schritte_count: 0, einstweilige_verfuegung: false, beweissicherung: false, prozesskostensicherheit: false, teilklage: false, mediation: false, gesamtkosten: 0, score: 0, empfehlung: "" };
  const obj = json as Record<string, unknown>;
  const schritte = Array.isArray(obj.empfohlene_schritte) ? obj.empfohlene_schritte : [];
  const verfuegung = obj.einstweilige_verfuegung as Record<string, unknown> | undefined;
  const beweis = obj.beweissicherung as Record<string, unknown> | undefined;
  const sicherheit = obj.prozesskostensicherheit as Record<string, unknown> | undefined;
  const teilklage = obj.teilklage_empfohlen as Record<string, unknown> | undefined;
  const mediation = obj.mediation as Record<string, unknown> | undefined;
  return {
    schritte_count: schritte.length,
    einstweilige_verfuegung: Boolean(verfuegung?.empfohlen),
    beweissicherung: Boolean(beweis?.empfohlen),
    prozesskostensicherheit: Boolean(sicherheit?.erforderlich),
    teilklage: Boolean(teilklage?.empfohlen),
    mediation: Boolean(mediation?.empfohlen),
    gesamtkosten: typeof obj.geschaetzte_gesamtkosten === "number" ? obj.geschaetzte_gesamtkosten : 0,
    score: typeof obj.overall_strategie_score === "number" ? obj.overall_strategie_score : 0,
    empfehlung: String(obj.empfehlung ?? ""),
  };
}

describe("procedural-strategist extraction", () => {
  it("extracts multi-step strategy with arrest and evidence preservation", () => {
    const json = {
      empfohlene_schritte: [
        { schritt: 1, aktion: "Arrestantrag (§ 379 EO)", dringlichkeit: "hoch", dauer: "1-2 Wochen", kosten: 2000, erfolgsaussicht: 80, begruendung: "Vermögensverschiebung droht" },
        { schritt: 2, aktion: "Beweissicherungsverfahren (§ 234 ZPO)", dringlichkeit: "mittel", dauer: "2-4 Wochen", kosten: 3000, erfolgsaussicht: 90, begruendung: "Zeugenalter hoch" },
        { schritt: 3, aktion: "Klage LG Wien", dringlichkeit: "mittel", dauer: "12-18 Monate", kosten: 15000, erfolgsaussicht: 65, begruendung: "Hauptanspruch" },
      ],
      einstweilige_verfuegung: { empfohlen: true, grund: "Vermögensverschiebungsrisiko", voraussetzungen_erfuellt: true, paragraph: "§ 381 EO" },
      beweissicherung: { empfohlen: true, grund: "Zeugenalter", paragraph: "§ 234 ZPO" },
      prozesskostensicherheit: { erforderlich: false, grund: "Inländischer Wohnsitz" },
      teilklage_empfohlen: { empfohlen: true, teilbetrag: 10000, begruendung: "Schneller Titel" },
      mediation: { empfohlen: false, grund: "Keine Bereitschaft" },
      gesamt_strategie: "Arrest → Beweissicherung → Klage",
      geschaetzte_gesamtdauer: "14-20 Monate",
      geschaetzte_gesamtkosten: 20000,
      overall_strategie_score: 85,
      empfehlung: "Strategie empfohlen",
    };
    const result = extractProceduralStrategy(json);
    expect(result.schritte_count).toBe(3);
    expect(result.einstweilige_verfuegung).toBe(true);
    expect(result.beweissicherung).toBe(true);
    expect(result.prozesskostensicherheit).toBe(false);
    expect(result.teilklage).toBe(true);
    expect(result.mediation).toBe(false);
    expect(result.gesamtkosten).toBe(20000);
    expect(result.score).toBe(85);
  });

  it("handles simple strategy (just file lawsuit)", () => {
    const json = {
      empfohlene_schritte: [
        { schritt: 1, aktion: "Klage LG Berlin", dringlichkeit: "mittel", dauer: "12 Monate", kosten: 12000, erfolgsaussicht: 70, begruendung: "Standardverfahren" },
      ],
      einstweilige_verfuegung: { empfohlen: false },
      beweissicherung: { empfohlen: false },
      prozesskostensicherheit: { erforderlich: false },
      teilklage_empfohlen: { empfohlen: false },
      mediation: { empfohlen: true, grund: "Kostenersparnis" },
      gesamt_strategie: "Mediation → Klage",
      geschaetzte_gesamtkosten: 12000,
      overall_strategie_score: 60,
      empfehlung: "Strategie empfohlen",
    };
    const result = extractProceduralStrategy(json);
    expect(result.schritte_count).toBe(1);
    expect(result.einstweilige_verfuegung).toBe(false);
    expect(result.beweissicherung).toBe(false);
    expect(result.mediation).toBe(true);
  });

  it("handles foreign plaintiff requiring security", () => {
    const json = {
      empfohlene_schritte: [
        { schritt: 1, aktion: "Sicherheitsleistung", dringlichkeit: "hoch", dauer: "2 Wochen", kosten: 5000, erfolgsaussicht: 100, begruendung: "Ausländischer Kläger" },
        { schritt: 2, aktion: "Klage", dringlichkeit: "mittel", dauer: "12 Monate", kosten: 15000, erfolgsaussicht: 60, begruendung: "Hauptanspruch" },
      ],
      prozesskostensicherheit: { erforderlich: true, grund: "§ 110 ZPO — ausländischer Kläger" },
      einstweilige_verfuegung: { empfohlen: false },
      beweissicherung: { empfohlen: false },
      teilklage_empfohlen: { empfohlen: false },
      mediation: { empfohlen: false },
      geschaetzte_gesamtkosten: 20000,
      overall_strategie_score: 50,
      empfehlung: "Strategie empfohlen — Sicherheit zuerst",
    };
    const result = extractProceduralStrategy(json);
    expect(result.prozesskostensicherheit).toBe(true);
    expect(result.schritte_count).toBe(2);
  });

  it("returns defaults for null input", () => {
    const result = extractProceduralStrategy(null);
    expect(result.schritte_count).toBe(0);
    expect(result.score).toBe(0);
  });
});

// ── Strategy ordering logic ─────────────────────────────────

describe("procedural strategy ordering logic", () => {
  it("arrest should come before klage", () => {
    const schritte = [
      { schritt: 1, aktion: "Arrestantrag" },
      { schritt: 2, aktion: "Beweissicherung" },
      { schritt: 3, aktion: "Klage" },
    ];
    const arrestIdx = schritte.findIndex((s) => s.aktion.includes("Arrest"));
    const klageIdx = schritte.findIndex((s) => s.aktion.includes("Klage"));
    expect(arrestIdx).toBeLessThan(klageIdx);
  });

  it("beweissicherung should come before klage", () => {
    const schritte = [
      { schritt: 1, aktion: "Beweissicherung" },
      { schritt: 2, aktion: "Klage" },
    ];
    const beweisIdx = schritte.findIndex((s) => s.aktion.includes("Beweis"));
    const klageIdx = schritte.findIndex((s) => s.aktion.includes("Klage"));
    expect(beweisIdx).toBeLessThan(klageIdx);
  });

  it("sicherheit should come before klage when required", () => {
    const schritte = [
      { schritt: 1, aktion: "Sicherheitsleistung" },
      { schritt: 2, aktion: "Klage" },
    ];
    const sicherIdx = schritte.findIndex((s) => s.aktion.includes("Sicherheit"));
    const klageIdx = schritte.findIndex((s) => s.aktion.includes("Klage"));
    expect(sicherIdx).toBeLessThan(klageIdx);
  });
});
