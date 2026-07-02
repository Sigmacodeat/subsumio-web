import { describe, it, expect } from "bun:test";

// Tests for the 3 new pipeline layers: admissibility-checker, settlement-analyzer, fact-gap-detector

// ── Admissibility Check extraction ──────────────────────────

interface AdmissibilityCheck {
  rechtsbehelf: string;
  zulaessig: boolean;
  pruefungen: Array<{
    kriterium: string;
    status: string;
    detail: string;
    warnung: string | null;
  }>;
  blockierende_fehler: string[];
  warnungen: string[];
}

function extractAdmissibilityCheck(json: unknown): {
  checks: AdmissibilityCheck[];
  score: number;
  blockers: string[];
  empfehlung: string;
} {
  if (!json || typeof json !== "object") return { checks: [], score: 0, blockers: [], empfehlung: "" };
  const obj = json as Record<string, unknown>;
  const checks = Array.isArray(obj.admissibility_checks)
    ? (obj.admissibility_checks as Array<Record<string, unknown>>).map((c) => ({
        rechtsbehelf: String(c.rechtsbehelf ?? ""),
        zulaessig: Boolean(c.zulaessig),
        pruefungen: Array.isArray(c.pruefungen)
          ? (c.pruefungen as Array<Record<string, unknown>>).map((p) => ({
              kriterium: String(p.kriterium ?? ""),
              status: String(p.status ?? ""),
              detail: String(p.detail ?? ""),
              warnung: p.warnung ? String(p.warnung) : null,
            }))
          : [],
        blockierende_fehler: Array.isArray(c.blockierende_fehler)
          ? (c.blockierende_fehler as string[])
          : [],
        warnungen: Array.isArray(c.warnungen) ? (c.warnungen as string[]) : [],
      }))
    : [];
  const score = typeof obj.overall_zulaessigkeit_score === "number" ? obj.overall_zulaessigkeit_score : 0;
  const blockers = Array.isArray(obj.critical_blockers) ? (obj.critical_blockers as string[]) : [];
  const empfehlung = String(obj.empfehlung ?? "");
  return { checks, score, blockers, empfehlung };
}

describe("admissibility-checker extraction", () => {
  it("extracts zulässig check with all criteria erfuellt", () => {
    const json = {
      admissibility_checks: [
        {
          rechtsbehelf: "Klage LG Wien",
          zulaessig: true,
          pruefungen: [
            { kriterium: "Zuständigkeit", status: "erfuellt", detail: "LG ZRS Wien zuständig (§ 50 JN)", warnung: null },
            { kriterium: "Verjährung", status: "erfuellt", detail: "Anspruch nicht verjährt (§ 1489 ABGB)", warnung: null },
            { kriterium: "Parteifähigkeit", status: "erfuellt", detail: "Kläger parteifähig (§ 1 JN)", warnung: null },
          ],
          blockierende_fehler: [],
          warnungen: [],
        },
      ],
      overall_zulaessigkeit_score: 95,
      critical_blockers: [],
      empfehlung: "Alle Rechtsbehelfe zulässig",
    };
    const result = extractAdmissibilityCheck(json);
    expect(result.checks.length).toBe(1);
    expect(result.checks[0]!.zulaessig).toBe(true);
    expect(result.checks[0]!.pruefungen.length).toBe(3);
    expect(result.checks[0]!.pruefungen[0]!.status).toBe("erfuellt");
    expect(result.score).toBe(95);
    expect(result.blockers).toEqual([]);
  });

  it("extracts unzulässig check with blocking errors", () => {
    const json = {
      admissibility_checks: [
        {
          rechtsbehelf: "Klage LG Berlin",
          zulaessig: false,
          pruefungen: [
            { kriterium: "Zuständigkeit", status: "erfuellt", detail: "LG Berlin zuständig", warnung: null },
            { kriterium: "Verjährung", status: "nicht_erfuellt", detail: "Anspruch verjährt (§ 195 BGB)", warnung: "Verjährung bereits eingetreten" },
          ],
          blockierende_fehler: ["Anspruch verjährt — Klage unzulässig"],
          warnungen: [],
        },
      ],
      overall_zulaessigkeit_score: 20,
      critical_blockers: ["Anspruch verjährt — Klage unzulässig"],
      empfehlung: "1 Rechtsbehelf unzulässig — siehe Details",
    };
    const result = extractAdmissibilityCheck(json);
    expect(result.checks[0]!.zulaessig).toBe(false);
    expect(result.checks[0]!.blockierende_fehler.length).toBe(1);
    expect(result.checks[0]!.pruefungen[1]!.status).toBe("nicht_erfuellt");
    expect(result.blockers.length).toBe(1);
    expect(result.score).toBe(20);
  });

  it("handles unsicher status", () => {
    const json = {
      admissibility_checks: [
        {
          rechtsbehelf: "Beschwerde VwGH",
          zulaessig: true,
          pruefungen: [
            { kriterium: "Rechtswegerschöpfung", status: "unsicher", detail: "Vorverfahren möglicherweise nicht ausgeschöpft", warnung: "Prüfung erforderlich" },
          ],
          blockierende_fehler: [],
          warnungen: ["Vorverfahren möglicherweise nicht ausgeschöpft"],
        },
      ],
      overall_zulaessigkeit_score: 60,
      critical_blockers: [],
      empfehlung: "Bedingt zulässig — siehe Warnungen",
    };
    const result = extractAdmissibilityCheck(json);
    expect(result.checks[0]!.pruefungen[0]!.status).toBe("unsicher");
    expect(result.checks[0]!.warnungen.length).toBe(1);
  });

  it("returns empty for null input", () => {
    const result = extractAdmissibilityCheck(null);
    expect(result.checks).toEqual([]);
    expect(result.score).toBe(0);
  });
});

// ── Settlement Analysis extraction ──────────────────────────

function extractSettlementAnalysis(json: unknown): {
  batna_mandant_ev: number;
  batna_gegner_ev: number;
  zopa_untergrenze: number;
  zopa_obergrenze: number;
  zopa_ueberlappung: boolean;
  optimaler_betrag: number;
  walk_away: number;
  empfehlung: string;
} {
  if (!json || typeof json !== "object")
    return { batna_mandant_ev: 0, batna_gegner_ev: 0, zopa_untergrenze: 0, zopa_obergrenze: 0, zopa_ueberlappung: false, optimaler_betrag: 0, walk_away: 0, empfehlung: "" };
  const obj = json as Record<string, unknown>;
  const batnaM = obj.batna_mandant as Record<string, unknown> | undefined;
  const batnaG = obj.batna_gegner as Record<string, unknown> | undefined;
  const zopa = obj.zopa as Record<string, unknown> | undefined;
  const optimal = obj.optimaler_vergleich as Record<string, unknown> | undefined;
  const walkAway = obj.walk_away_punkt as Record<string, unknown> | undefined;
  return {
    batna_mandant_ev: typeof batnaM?.ev === "number" ? batnaM.ev : 0,
    batna_gegner_ev: typeof batnaG?.ev === "number" ? batnaG.ev : 0,
    zopa_untergrenze: typeof zopa?.untergrenze === "number" ? zopa.untergrenze : 0,
    zopa_obergrenze: typeof zopa?.obergrenze === "number" ? zopa.obergrenze : 0,
    zopa_ueberlappung: Boolean(zopa?.ueberlappung),
    optimaler_betrag: typeof optimal?.betrag === "number" ? optimal.betrag : 0,
    walk_away: typeof walkAway?.betrag === "number" ? walkAway.betrag : 0,
    empfehlung: String(obj.vergleich_empfehlung ?? ""),
  };
}

describe("settlement-analyzer extraction", () => {
  it("extracts BATNA, ZOPA, and optimal settlement", () => {
    const json = {
      batna_mandant: { ev: 16075, beschreibung: "EV bei Prozess" },
      batna_gegner: { ev: -16075, beschreibung: "EV für Gegner" },
      zopa: { untergrenze: 16075, obergrenze: 45000, breite: 28925, ueberlappung: true },
      optimaler_vergleich: { betrag: 30000, begruendung: "Mittelpunkt ZOPA", mandant_vorteil: 13925 },
      walk_away_punkt: { betrag: 16075, beschreibung: "Unterhalb = Prozess besser" },
      verhandlungsstrategie: { erste_forderung: 40000, ziel_betrag: 30000, walk_away: 16075 },
      vergleich_empfehlung: "EMPFOHLEN",
      zusammenfassung: "Vergleich bei €30.000 empfohlen",
    };
    const result = extractSettlementAnalysis(json);
    expect(result.batna_mandant_ev).toBe(16075);
    expect(result.batna_gegner_ev).toBe(-16075);
    expect(result.zopa_untergrenze).toBe(16075);
    expect(result.zopa_obergrenze).toBe(45000);
    expect(result.zopa_ueberlappung).toBe(true);
    expect(result.optimaler_betrag).toBe(30000);
    expect(result.walk_away).toBe(16075);
    expect(result.empfehlung).toBe("EMPFOHLEN");
  });

  it("handles no ZOPA overlap (NICHT EMPFOHLEN)", () => {
    const json = {
      batna_mandant: { ev: 5000 },
      batna_gegner: { ev: -5000 },
      zopa: { untergrenze: 5000, obergrenze: 3000, breite: -2000, ueberlappung: false },
      optimaler_vergleich: { betrag: 0 },
      walk_away_punkt: { betrag: 5000 },
      vergleich_empfehlung: "NICHT EMPFOHLEN",
    };
    const result = extractSettlementAnalysis(json);
    expect(result.zopa_ueberlappung).toBe(false);
    expect(result.empfehlung).toBe("NICHT EMPFOHLEN");
  });

  it("returns defaults for null input", () => {
    const result = extractSettlementAnalysis(null);
    expect(result.batna_mandant_ev).toBe(0);
    expect(result.empfehlung).toBe("");
  });

  it("walk_away equals batna_mandant_ev", () => {
    const json = {
      batna_mandant: { ev: 12000 },
      walk_away_punkt: { betrag: 12000 },
      vergleich_empfehlung: "BEDINGT EMPFOHLEN",
    };
    const result = extractSettlementAnalysis(json);
    expect(result.walk_away).toBe(result.batna_mandant_ev);
  });
});

// ── Fact Gap Detection extraction ───────────────────────────

interface FactGap {
  anspruch: string;
  tatbestandsmerkmal: string;
  status: string;
  vorhandene_fakten: string[];
  fehlende_fakten: string[];
  klaerungsfrage: string;
  prioritaet: string;
  beweismittel: string;
}

function extractFactGaps(json: unknown): {
  gaps: FactGap[];
  fragen: Array<{ frage: string; hintergrund: string; prioritaet: string }>;
  score: number;
  kritische: string[];
  empfehlung: string;
} {
  if (!json || typeof json !== "object") return { gaps: [], fragen: [], score: 0, kritische: [], empfehlung: "" };
  const obj = json as Record<string, unknown>;
  const gaps = Array.isArray(obj.fact_gaps)
    ? (obj.fact_gaps as Array<Record<string, unknown>>).map((g) => ({
        anspruch: String(g.anspruch ?? ""),
        tatbestandsmerkmal: String(g.tatbestandsmerkmal ?? ""),
        status: String(g.status ?? ""),
        vorhandene_fakten: Array.isArray(g.vorhandene_fakten) ? (g.vorhandene_fakten as string[]) : [],
        fehlende_fakten: Array.isArray(g.fehlende_fakten) ? (g.fehlende_fakten as string[]) : [],
        klaerungsfrage: String(g.klaerungsfrage ?? ""),
        prioritaet: String(g.prioritaet ?? ""),
        beweismittel: String(g.beweismittel ?? ""),
      }))
    : [];
  const fragen = Array.isArray(obj.mandanten_fragen)
    ? (obj.mandanten_fragen as Array<Record<string, unknown>>).map((f) => ({
        frage: String(f.frage ?? ""),
        hintergrund: String(f.hintergrund ?? ""),
        prioritaet: String(f.prioritaet ?? ""),
      }))
    : [];
  const score = typeof obj.overall_vollstaendigkeit_score === "number" ? obj.overall_vollstaendigkeit_score : 0;
  const kritische = Array.isArray(obj.kritische_luecken) ? (obj.kritische_luecken as string[]) : [];
  const empfehlung = String(obj.empfehlung ?? "");
  return { gaps, fragen, score, kritische, empfehlung };
}

describe("fact-gap-detector extraction", () => {
  it("extracts fact gaps with luecke status", () => {
    const json = {
      fact_gaps: [
        {
          anspruch: "Amtshaftung § 1 AHG",
          tatbestandsmerkmal: "hoheitliches Handeln",
          status: "luecke",
          vorhandene_fakten: [],
          fehlende_fakten: ["Art der Amtshandlung"],
          klaerungsfrage: "War der Beamte hoheitlich tätig?",
          prioritaet: "hoch",
          beweismittel: "Dienstbeschreibung",
        },
        {
          anspruch: "Amtshaftung § 1 AHG",
          tatbestandsmerkmal: "Verschulden",
          status: "belegt",
          vorhandene_fakten: ["ON 12: Beamter handelte fahrlässig"],
          fehlende_fakten: [],
          klaerungsfrage: "",
          prioritaet: "niedrig",
          beweismittel: "",
        },
      ],
      mandanten_fragen: [
        { frage: "War der Beamte hoheitlich tätig?", hintergrund: "§ 1 AHG erfordert hoheitliches Handeln", prioritaet: "hoch" },
      ],
      overall_vollstaendigkeit_score: 55,
      kritische_luecken: ["hoheitliches Handeln nicht belegt — Klage gefährdet"],
      empfehlung: "1 kritische Lücke — Mandantenbefragung erforderlich",
    };
    const result = extractFactGaps(json);
    expect(result.gaps.length).toBe(2);
    expect(result.gaps[0]!.status).toBe("luecke");
    expect(result.gaps[0]!.fehlende_fakten.length).toBe(1);
    expect(result.gaps[1]!.status).toBe("belegt");
    expect(result.gaps[1]!.vorhandene_fakten.length).toBe(1);
    expect(result.fragen.length).toBe(1);
    expect(result.fragen[0]!.prioritaet).toBe("hoch");
    expect(result.score).toBe(55);
    expect(result.kritische.length).toBe(1);
  });

  it("handles teilweise_belegt status", () => {
    const json = {
      fact_gaps: [
        {
          anspruch: "Schadenersatz § 1311 ABGB",
          tatbestandsmerkmal: "Kausalität",
          status: "teilweise_belegt",
          vorhandene_fakten: ["ON 5: Unfallhergang dokumentiert"],
          fehlende_fakten: ["Kausalitätskette zum Schaden lückenhaft"],
          klaerungsfrage: "Können Sie den Zusammenhang zwischen Unfall und Schaden belegen?",
          prioritaet: "mittel",
          beweismittel: "Gutachten",
        },
      ],
      mandanten_fragen: [],
      overall_vollstaendigkeit_score: 70,
      kritische_luecken: [],
      empfehlung: "Sachverhalt teilweise vollständig",
    };
    const result = extractFactGaps(json);
    expect(result.gaps[0]!.status).toBe("teilweise_belegt");
    expect(result.gaps[0]!.vorhandene_fakten.length).toBe(1);
    expect(result.gaps[0]!.fehlende_fakten.length).toBe(1);
  });

  it("handles unsicher status", () => {
    const json = {
      fact_gaps: [
        {
          anspruch: "Unbekannter Anspruch",
          tatbestandsmerkmal: "Unbekanntes Merkmal",
          status: "unsicher",
          vorhandene_fakten: [],
          fehlende_fakten: [],
          klaerungsfrage: "",
          prioritaet: "niedrig",
          beweismittel: "",
        },
      ],
      mandanten_fragen: [],
      overall_vollstaendigkeit_score: 90,
      kritische_luecken: [],
      empfehlung: "Sachverhalt vollständig",
    };
    const result = extractFactGaps(json);
    expect(result.gaps[0]!.status).toBe("unsicher");
  });

  it("returns empty for null input", () => {
    const result = extractFactGaps(null);
    expect(result.gaps).toEqual([]);
    expect(result.fragen).toEqual([]);
    expect(result.score).toBe(0);
  });

  it("identifies critical gaps by high priority", () => {
    const json = {
      fact_gaps: [
        { anspruch: "A", tatbestandsmerkmal: "X", status: "luecke", prioritaet: "hoch", vorhandene_fakten: [], fehlende_fakten: ["X"], klaerungsfrage: "Q?", beweismittel: "" },
        { anspruch: "B", tatbestandsmerkmal: "Y", status: "luecke", prioritaet: "niedrig", vorhandene_fakten: [], fehlende_fakten: ["Y"], klaerungsfrage: "Q2?", beweismittel: "" },
      ],
      mandanten_fragen: [],
      overall_vollstaendigkeit_score: 40,
      kritische_luecken: ["X nicht belegt — Klage gefährdet"],
      empfehlung: "1 kritische Lücke",
    };
    const result = extractFactGaps(json);
    const highPriority = result.gaps.filter((g) => g.prioritaet === "hoch");
    const lowPriority = result.gaps.filter((g) => g.prioritaet === "niedrig");
    expect(highPriority.length).toBe(1);
    expect(lowPriority.length).toBe(1);
    expect(result.kritische.length).toBe(1);
  });
});

// ── BATNA/ZOPA calculation logic ────────────────────────────

describe("BATNA/ZOPA calculation logic", () => {
  function calculateBATNA(ev: number): number {
    return ev;
  }

  function calculateZOPA(mandantBATNA: number, gegnerBATNA: number): {
    untergrenze: number;
    obergrenze: number;
    ueberlappung: boolean;
  } {
    const untergrenze = mandantBATNA;
    const obergrenze = -gegnerBATNA;
    return {
      untergrenze,
      obergrenze,
      ueberlappung: untergrenze <= obergrenze,
    };
  }

  it("ZOPA exists when mandant BATNA < -gegner BATNA", () => {
    const zopa = calculateZOPA(16075, -16075);
    expect(zopa.untergrenze).toBe(16075);
    expect(zopa.obergrenze).toBe(16075);
    expect(zopa.ueberlappung).toBe(true);
  });

  it("ZOPA wide when EV positive and damage high", () => {
    const zopa = calculateZOPA(16075, -45000);
    expect(zopa.obergrenze).toBe(45000);
    expect(zopa.ueberlappung).toBe(true);
    expect(zopa.obergrenze - zopa.untergrenze).toBe(28925);
  });

  it("No ZOPA when mandant BATNA exceeds gegner ceiling", () => {
    const zopa = calculateZOPA(50000, -30000);
    expect(zopa.untergrenze).toBe(50000);
    expect(zopa.obergrenze).toBe(30000);
    expect(zopa.ueberlappung).toBe(false);
  });

  it("Optimal settlement is within ZOPA", () => {
    const zopa = calculateZOPA(16075, -45000);
    const optimal = (zopa.untergrenze + zopa.obergrenze) / 2;
    expect(optimal).toBeGreaterThanOrEqual(zopa.untergrenze);
    expect(optimal).toBeLessThanOrEqual(zopa.obergrenze);
    expect(optimal).toBe(30537.5);
  });

  it("Walk-away equals mandant BATNA", () => {
    const batna = calculateBATNA(16075);
    expect(batna).toBe(16075);
  });
});
