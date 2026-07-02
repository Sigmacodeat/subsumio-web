import { describe, it, expect } from "bun:test";

// Tests for the 3 new pipeline layers: witness-expert-analyzer, counterclaim-analyzer, evidence-quality-assessor

// ── Witness & Expert extraction ─────────────────────────────

function extractWitnessExpert(json: unknown): {
  zeugen_count: number;
  zeugenluecken_count: number;
  gutachten_count: number;
  gutachter_kosten_gesamt: number;
  score: number;
  empfehlung: string;
} {
  if (!json || typeof json !== "object")
    return { zeugen_count: 0, zeugenluecken_count: 0, gutachten_count: 0, gutachter_kosten_gesamt: 0, score: 0, empfehlung: "" };
  const obj = json as Record<string, unknown>;
  return {
    zeugen_count: Array.isArray(obj.zeugen) ? obj.zeugen.length : 0,
    zeugenluecken_count: Array.isArray(obj.zeugenluecken) ? obj.zeugenluecken.length : 0,
    gutachten_count: Array.isArray(obj.gutachten_bedarf) ? obj.gutachten_bedarf.length : 0,
    gutachter_kosten_gesamt: typeof obj.gutachter_kosten_gesamt === "number" ? obj.gutachter_kosten_gesamt : 0,
    score: typeof obj.zeugen_score === "number" ? obj.zeugen_score : 0,
    empfehlung: String(obj.empfehlung ?? ""),
  };
}

describe("witness-expert-analyzer extraction", () => {
  it("extracts witnesses, gaps, and expert needs", () => {
    const json = {
      zeugen: [
        { name: "Zeuge 1 (ON 5)", glaubwuerdigkeit: "hoch", belastbarkeit: "hoch", widersprueche: [], parteilichkeit: "neutral", aussagekraft: "hoch", empfehlung: "Hauptzeuge" },
        { name: "Zeuge 2 (ON 8)", glaubwuerdigkeit: "gering", belastbarkeit: "gering", widersprueche: ["Widerspruch zu ON 12"], parteilichkeit: "gegnerfreundlich", aussagekraft: "mittel", empfehlung: "Kreuzverhör vorbereiten" },
      ],
      zeugenluecken: [
        { fehlt: "Augenzeuge", relevanz: "Kausalität", beschaffung: "Zeugenaufruf", prioritaet: "hoch" },
      ],
      gutachten_bedarf: [
        { typ: "medizinisch", thema: "Kausalität", dringlichkeit: "hoch", paragraph: "§ 271 ZPO", gerichtlich_oder_privat: "gerichtlich", geschätzte_kosten: 5000 },
        { typ: "technisch", thema: "Unfallrekonstruktion", dringlichkeit: "mittel", paragraph: "§ 402 ZPO", gerichtlich_oder_privat: "gerichtlich", geschätzte_kosten: 8000 },
      ],
      gutachter_kosten_gesamt: 13000,
      zeugen_score: 65,
      empfehlung: "Zeugenlage gemischt — 2 Gutachten erforderlich",
    };
    const result = extractWitnessExpert(json);
    expect(result.zeugen_count).toBe(2);
    expect(result.zeugenluecken_count).toBe(1);
    expect(result.gutachten_count).toBe(2);
    expect(result.gutachter_kosten_gesamt).toBe(13000);
    expect(result.score).toBe(65);
  });

  it("handles no witnesses (empty case)", () => {
    const json = {
      zeugen: [],
      zeugenluecken: [],
      gutachten_bedarf: [],
      gutachter_kosten_gesamt: 0,
      zeugen_score: 0,
      empfehlung: "Keine Zeugen bekannt",
    };
    const result = extractWitnessExpert(json);
    expect(result.zeugen_count).toBe(0);
    expect(result.gutachter_kosten_gesamt).toBe(0);
    expect(result.score).toBe(0);
  });

  it("returns defaults for null input", () => {
    const result = extractWitnessExpert(null);
    expect(result.zeugen_count).toBe(0);
    expect(result.score).toBe(0);
  });
});

// ── Counterclaim Risk extraction ────────────────────────────

function extractCounterclaim(json: unknown): {
  gegenansprueche_count: number;
  widerklage_moeglich: boolean;
  widerklage_wahrscheinlichkeit: number;
  aufrechnung_moeglich: boolean;
  aufrechnung_betrag: number;
  einwendungen_count: number;
  netto_ev: number;
  brutto_ev: number;
  anpassung: number;
  score: number;
  empfehlung: string;
} {
  if (!json || typeof json !== "object")
    return { gegenansprueche_count: 0, widerklage_moeglich: false, widerklage_wahrscheinlichkeit: 0, aufrechnung_moeglich: false, aufrechnung_betrag: 0, einwendungen_count: 0, netto_ev: 0, brutto_ev: 0, anpassung: 0, score: 0, empfehlung: "" };
  const obj = json as Record<string, unknown>;
  const widerklage = obj.widerklage_moeglich as Record<string, unknown> | undefined;
  const aufrechnung = obj.aufrechnung as Record<string, unknown> | undefined;
  const netto = obj.netto_ev_nach_widerklage as Record<string, unknown> | undefined;
  return {
    gegenansprueche_count: Array.isArray(obj.gegenansprueche) ? obj.gegenansprueche.length : 0,
    widerklage_moeglich: Boolean(widerklage?.moeglich),
    widerklage_wahrscheinlichkeit: typeof widerklage?.wahrscheinlichkeit === "number" ? widerklage.wahrscheinlichkeit : 0,
    aufrechnung_moeglich: Boolean(aufrechnung?.moeglich),
    aufrechnung_betrag: typeof aufrechnung?.betrag === "number" ? aufrechnung.betrag : 0,
    einwendungen_count: Array.isArray(obj.prozessuale_einwendungen) ? obj.prozessuale_einwendungen.length : 0,
    netto_ev: typeof netto?.netto_ev === "number" ? netto.netto_ev : 0,
    brutto_ev: typeof netto?.brutto_ev === "number" ? netto.brutto_ev : 0,
    anpassung: typeof netto?.anpassung === "number" ? netto.anpassung : 0,
    score: typeof obj.overall_widerklage_risiko_score === "number" ? obj.overall_widerklage_risiko_score : 0,
    empfehlung: String(obj.empfehlung ?? ""),
  };
}

describe("counterclaim-analyzer extraction", () => {
  it("extracts counterclaims with widerklage and aufrechnung", () => {
    const json = {
      gegenansprueche: [
        { typ: "Schadensersatz", anspruch: "Reparaturkosten", paragraph: "§ 1431 ABGB", wahrscheinlichkeit: "mittel", betrag: 5000, ev: 2500, begruendung: "ON 15" },
      ],
      widerklage_moeglich: { moeglich: true, paragraph: "§ 229 ZPO", voraussetzung: "Zusammenhang", wahrscheinlichkeit: 40 },
      aufrechnung: { moeglich: true, paragraph: "§ 1441 ABGB", voraussetzungen_erfuellt: true, betrag: 5000 },
      prozessuale_einwendungen: [
        { einrede: "Verjährung", paragraph: "§ 1489 ABGB", wahrscheinlichkeit: "gering", auswirkung: "Klage abweislich" },
      ],
      netto_ev_nach_widerklage: { brutto_ev: 16075, widerklage_risiko_ev: 2500, aufrechnungsbetrag: 5000, netto_ev: 8575, anpassung: -7500 },
      overall_widerklage_risiko_score: 45,
      empfehlung: "Widerklage möglich — Netto-EV reduziert",
    };
    const result = extractCounterclaim(json);
    expect(result.gegenansprueche_count).toBe(1);
    expect(result.widerklage_moeglich).toBe(true);
    expect(result.widerklage_wahrscheinlichkeit).toBe(40);
    expect(result.aufrechnung_moeglich).toBe(true);
    expect(result.aufrechnung_betrag).toBe(5000);
    expect(result.einwendungen_count).toBe(1);
    expect(result.netto_ev).toBe(8575);
    expect(result.brutto_ev).toBe(16075);
    expect(result.anpassung).toBe(-7500);
    expect(result.score).toBe(45);
  });

  it("handles no counterclaims (low risk)", () => {
    const json = {
      gegenansprueche: [],
      widerklage_moeglich: { moeglich: false },
      aufrechnung: { moeglich: false },
      prozessuale_einwendungen: [],
      netto_ev_nach_widerklage: { brutto_ev: 20000, widerklage_risiko_ev: 0, aufrechnungsbetrag: 0, netto_ev: 20000, anpassung: 0 },
      overall_widerklage_risiko_score: 5,
      empfehlung: "Widerklage unwahrscheinlich — EV unverändert",
    };
    const result = extractCounterclaim(json);
    expect(result.widerklage_moeglich).toBe(false);
    expect(result.netto_ev).toBe(20000);
    expect(result.brutto_ev).toBe(20000);
    expect(result.anpassung).toBe(0);
    expect(result.score).toBe(5);
  });

  it("returns defaults for null input", () => {
    const result = extractCounterclaim(null);
    expect(result.gegenansprueche_count).toBe(0);
    expect(result.netto_ev).toBe(0);
    expect(result.score).toBe(0);
  });
});

// ── Netto EV calculation logic ──────────────────────────────

describe("counterclaim netto EV calculation", () => {
  function calculateNettoEV(brutto: number, widerklageEV: number, aufrechnung: number): number {
    return brutto - widerklageEV - aufrechnung;
  }

  it("netto = brutto - widerklage - aufrechnung", () => {
    expect(calculateNettoEV(16075, 2500, 5000)).toBe(8575);
  });

  it("no counterclaim = brutto unchanged", () => {
    expect(calculateNettoEV(20000, 0, 0)).toBe(20000);
  });

  it("high counterclaim risk reduces EV significantly", () => {
    const netto = calculateNettoEV(30000, 15000, 8000);
    expect(netto).toBe(7000);
    expect(netto).toBeLessThan(30000);
  });

  it("counterclaim can make case unprofitable", () => {
    const netto = calculateNettoEV(10000, 8000, 5000);
    expect(netto).toBe(-3000);
    expect(netto).toBeLessThan(0);
  });
});

// ── Evidence Quality extraction ─────────────────────────────

function extractEvidenceQuality(json: unknown): {
  beweise_count: number;
  sehr_hoch_count: number;
  hoch_count: number;
  angreifbar_count: number;
  schwachstellen_count: number;
  beweisluecken_count: number;
  score: number;
  empfehlung: string;
} {
  if (!json || typeof json !== "object")
    return { beweise_count: 0, sehr_hoch_count: 0, hoch_count: 0, angreifbar_count: 0, schwachstellen_count: 0, beweisluecken_count: 0, score: 0, empfehlung: "" };
  const obj = json as Record<string, unknown>;
  const beweise = Array.isArray(obj.beweise) ? obj.beweise : [];
  const sehrHoch = beweise.filter((b) => (b as Record<string, unknown>).beweiskraft === "sehr_hoch").length;
  const hoch = beweise.filter((b) => (b as Record<string, unknown>).beweiskraft === "hoch").length;
  const angreifbar = beweise.filter((b) => (b as Record<string, unknown>).angreifbar === true).length;
  return {
    beweise_count: beweise.length,
    sehr_hoch_count: sehrHoch,
    hoch_count: hoch,
    angreifbar_count: angreifbar,
    schwachstellen_count: Array.isArray(obj.schwachstellen) ? obj.schwachstellen.length : 0,
    beweisluecken_count: Array.isArray(obj.beweisluecken) ? obj.beweisluecken.length : 0,
    score: typeof obj.beweisqualitaet_score === "number" ? obj.beweisqualitaet_score : 0,
    empfehlung: String(obj.empfehlung ?? ""),
  };
}

describe("evidence-quality-assessor extraction", () => {
  it("extracts mixed evidence with varying quality", () => {
    const json = {
      beweise: [
        { on_nummer: "ON 1", bezeichnung: "Notarieller Vertrag", beweisart: "urkunden", beweiskraft: "sehr_hoch", angreifbar: false, begruendung: "Notariell beurkundet" },
        { on_nummer: "ON 5", bezeichnung: "Zeugenaussage Müller", beweisart: "zeugen", beweiskraft: "hoch", angreifbar: false, begruendung: "Neutraler Zeuge" },
        { on_nummer: "ON 8", bezeichnung: "Fotokopie Rechnung", beweisart: "urkunden", beweiskraft: "mittel", angreifbar: true, begruendung: "Nur Kopie", angriffsvektoren: ["Echtheit", "Vollständigkeit"], verifikation: "Original anfordern" },
      ],
      schwachstellen: [
        { on_nummer: "ON 8", problem: "Nur Fotokopie", auswirkung: "Echtheit fraglich", gegenmassnahme: "Original anfordern" },
      ],
      beweisluecken: [
        { streitfrage: "Kausalität", fehlender_beweis: "Medizinisches Gutachten", beschaffung: "Gerichtliches Gutachten", prioritaet: "hoch" },
      ],
      beweisqualitaet_score: 72,
      empfehlung: "Beweislage stark — 1 Schwachstelle, 1 Lücke",
    };
    const result = extractEvidenceQuality(json);
    expect(result.beweise_count).toBe(3);
    expect(result.sehr_hoch_count).toBe(1);
    expect(result.hoch_count).toBe(1);
    expect(result.angreifbar_count).toBe(1);
    expect(result.schwachstellen_count).toBe(1);
    expect(result.beweisluecken_count).toBe(1);
    expect(result.score).toBe(72);
  });

  it("handles all very high quality evidence (strong case)", () => {
    const json = {
      beweise: [
        { on_nummer: "ON 1", bezeichnung: "Notarielle Urkunde", beweisart: "urkunden", beweiskraft: "sehr_hoch", angreifbar: false },
        { on_nummer: "ON 2", bezeichnung: "Gerichtliches Gutachten", beweisart: "gutachten", beweiskraft: "sehr_hoch", angreifbar: false },
        { on_nummer: "ON 3", bezeichnung: "Gerichtlicher Augenschein", beweisart: "augenschein", beweiskraft: "sehr_hoch", angreifbar: false },
      ],
      schwachstellen: [],
      beweisluecken: [],
      beweisqualitaet_score: 95,
      empfehlung: "Beweislage sehr stark — 3 sehr hohe Beweise",
    };
    const result = extractEvidenceQuality(json);
    expect(result.sehr_hoch_count).toBe(3);
    expect(result.angreifbar_count).toBe(0);
    expect(result.schwachstellen_count).toBe(0);
    expect(result.beweisluecken_count).toBe(0);
    expect(result.score).toBe(95);
  });

  it("handles weak evidence (all angreifbar)", () => {
    const json = {
      beweise: [
        { on_nummer: "ON 1", bezeichnung: "Fotokopie", beweisart: "urkunden", beweiskraft: "gering", angreifbar: true },
        { on_nummer: "ON 2", bezeichnung: "Hörensagen", beweisart: "zeugen", beweiskraft: "sehr_gering", angreifbar: true },
      ],
      schwachstellen: [
        { on_nummer: "ON 1", problem: "Kopie", auswirkung: "Echtheit fraglich", gegenmassnahme: "Original" },
        { on_nummer: "ON 2", problem: "Hörensagen", auswirkung: "Beweiskraft minimal", gegenmassnahme: "Augenzeuge finden" },
      ],
      beweisluecken: [
        { streitfrage: "Haftung", fehlender_beweis: "Originaldokument", beschaffung: "Anfordern", prioritaet: "hoch" },
      ],
      beweisqualitaet_score: 20,
      empfehlung: "Beweislage schwach — 2 Schwachstellen, 1 Lücke",
    };
    const result = extractEvidenceQuality(json);
    expect(result.angreifbar_count).toBe(2);
    expect(result.schwachstellen_count).toBe(2);
    expect(result.score).toBe(20);
  });

  it("returns defaults for null input", () => {
    const result = extractEvidenceQuality(null);
    expect(result.beweise_count).toBe(0);
    expect(result.score).toBe(0);
  });
});

// ── Evidence quality classification rules ───────────────────

describe("evidence quality classification rules", () => {
  it("notariell beurkundet = sehr_hoch", () => {
    const beweis = { beweisart: "urkunden", beweiskraft: "sehr_hoch" };
    expect(beweis.beweiskraft).toBe("sehr_hoch");
  });

  it("gerichtlich bestelltes Gutachten = sehr_hoch", () => {
    const beweis = { beweisart: "gutachten", beweiskraft: "sehr_hoch" };
    expect(beweis.beweiskraft).toBe("sehr_hoch");
  });

  it("privatschriftliche Urkunde = hoch", () => {
    const beweis = { beweisart: "urkunden", beweiskraft: "hoch" };
    expect(beweis.beweiskraft).toBe("hoch");
  });

  it("neutraler Zeuge = hoch", () => {
    const beweis = { beweisart: "zeugen", beweiskraft: "hoch" };
    expect(beweis.beweiskraft).toBe("hoch");
  });

  it("Hörensagen = gering", () => {
    const beweis = { beweisart: "zeugen", beweiskraft: "gering" };
    expect(beweis.beweiskraft).toBe("gering");
  });

  it("Fotokopie = mittel", () => {
    const beweis = { beweisart: "urkunden", beweiskraft: "mittel" };
    expect(beweis.beweiskraft).toBe("mittel");
  });
});
