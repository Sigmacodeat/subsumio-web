import { describe, it, expect } from "bun:test";
import {
  GGG_TP1,
  GGG_TP2,
  GGG_TP3,
  RATG_STUFEN,
  TARIF_STAND,
  baueKostenverzeichnis,
  berechneLeistung,
  einheitssatzProzent,
  gerichtsgebuehr,
  kostenersatz,
  kostenverzeichnisMarkdown,
  ratgAnsatz,
  schaetzeVerfahrenskosten,
} from "../src/core/legal/kosten-at.ts";

// ── Table sanity ────────────────────────────────────────────

describe("tariff tables", () => {
  it("GGG tables are strictly increasing in both columns", () => {
    for (const tabelle of [GGG_TP1, GGG_TP2, GGG_TP3]) {
      for (let i = 1; i < tabelle.length; i++) {
        expect(tabelle[i]!.bis).toBeGreaterThan(tabelle[i - 1]!.bis);
        if (tabelle[i]!.prozent == null) {
          expect(tabelle[i]!.gebuehr).toBeGreaterThan(tabelle[i - 1]!.gebuehr);
        }
      }
      expect(tabelle[tabelle.length - 1]!.bis).toBe(Infinity);
      expect(tabelle[tabelle.length - 1]!.prozent).toBeGreaterThan(0);
    }
  });

  it("higher instance is more expensive above Bagatellbereich (same Streitwert)", () => {
    for (const sw of [5_000, 30_000, 100_000, 500_000]) {
      const g1 = gerichtsgebuehr(sw, 1).betrag;
      const g2 = gerichtsgebuehr(sw, 2).betrag;
      const g3 = gerichtsgebuehr(sw, 3).betrag;
      expect(g2).toBeGreaterThan(g1);
      expect(g3).toBeGreaterThan(g2);
    }
  });

  it("RATG ladder is strictly increasing", () => {
    for (let i = 1; i < RATG_STUFEN.length; i++) {
      expect(RATG_STUFEN[i]!.tp3a).toBeGreaterThan(RATG_STUFEN[i - 1]!.tp3a);
      expect(RATG_STUFEN[i]!.tp2).toBeGreaterThan(RATG_STUFEN[i - 1]!.tp2);
      expect(RATG_STUFEN[i]!.tp1).toBeGreaterThan(RATG_STUFEN[i - 1]!.tp1);
    }
  });
});

// ── Gerichtsgebühr ──────────────────────────────────────────

describe("gerichtsgebuehr", () => {
  it("anchor values TP1", () => {
    expect(gerichtsgebuehr(10_000, 1).betrag).toBe(792); // Stufe bis 35.000
    expect(gerichtsgebuehr(50_000, 1).betrag).toBe(1_556); // Stufe bis 70.000
  });

  it("percentage tier above 350k", () => {
    const g = gerichtsgebuehr(1_000_000, 1);
    expect(g.betrag).toBe(4_203 + 12_000); // 1,2% von 1 Mio + Grundbetrag
  });

  it("ASG first instance is free", () => {
    expect(gerichtsgebuehr(50_000, 1, { arbeitsrecht: true }).betrag).toBe(0);
    expect(gerichtsgebuehr(50_000, 2, { arbeitsrecht: true }).betrag).toBeGreaterThan(0);
  });

  it("echoes tarif_stand", () => {
    expect(gerichtsgebuehr(1_000, 1).tarif_stand).toBe(TARIF_STAND);
  });

  it("rejects negative streitwert", () => {
    expect(() => gerichtsgebuehr(-1, 1)).toThrow();
  });
});

// ── RATG ────────────────────────────────────────────────────

describe("ratgAnsatz", () => {
  it("looks up the correct band", () => {
    expect(ratgAnsatz(700, "TP3A")).toBe(47.9);
    expect(ratgAnsatz(20_000, "TP3A")).toBe(717.8);
    expect(ratgAnsatz(72_670, "TP3A")).toBe(1_387.7);
  });

  it("extends linearly above the last band", () => {
    const oneStep = ratgAnsatz(72_671, "TP3A");
    expect(oneStep).toBeCloseTo(1_387.7 + 191.2, 1);
    const twoSteps = ratgAnsatz(72_670 + 2 * 21_800, "TP3A");
    expect(twoSteps).toBeCloseTo(1_387.7 + 2 * 191.2, 1);
  });
});

describe("einheitssatz", () => {
  it("60% up to 10.170, 50% above", () => {
    expect(einheitssatzProzent(10_170)).toBe(60);
    expect(einheitssatzProzent(10_171)).toBe(50);
  });

  it("doubled in Rechtsmittelverfahren (§ 23 Abs 9 RATG)", () => {
    expect(einheitssatzProzent(5_000, true)).toBe(120);
    expect(einheitssatzProzent(50_000, true)).toBe(100);
  });
});

describe("berechneLeistung", () => {
  it("Klage: Ansatz + 50% ES + ERV einleitend + 20% USt", () => {
    const r = berechneLeistung({
      bemessungsgrundlage: 20_000,
      tarifpost: "TP3A",
      erv: "einleitend",
    });
    expect(r.ansatz).toBe(717.8);
    expect(r.einheitssatz).toBeCloseTo(358.9, 2);
    expect(r.ervZuschlag).toBe(4.1);
    expect(r.nettoSumme).toBeCloseTo(717.8 + 358.9 + 4.1, 2);
    expect(r.ust).toBeCloseTo(r.nettoSumme * 0.2, 2);
    expect(r.bruttoSumme).toBeCloseTo(r.nettoSumme * 1.2, 2);
  });

  it("Verhandlung 3 Stunden: Ansatz + 2 × 50%", () => {
    const r = berechneLeistung({
      bemessungsgrundlage: 20_000,
      tarifpost: "TP3A",
      verhandlungsstunden: 3,
      erv: "keiner",
      einheitssatz: false,
    });
    expect(r.ansatz).toBeCloseTo(717.8 * 2, 2); // 1 + 2×0,5 = 2× Ansatz
  });

  it("Streitgenossenzuschlag: +20% bei 3 Personen, gedeckelt bei +50%", () => {
    const drei = berechneLeistung({
      bemessungsgrundlage: 20_000,
      tarifpost: "TP3A",
      personen: 3,
      erv: "keiner",
    });
    expect(drei.streitgenossenzuschlag).toBeCloseTo((drei.ansatz + drei.einheitssatz) * 0.2, 2);
    const zehn = berechneLeistung({
      bemessungsgrundlage: 20_000,
      tarifpost: "TP3A",
      personen: 10,
      erv: "keiner",
    });
    expect(zehn.streitgenossenzuschlag).toBeCloseTo((zehn.ansatz + zehn.einheitssatz) * 0.5, 2);
  });

  it("aufschluesselung lists every component", () => {
    const r = berechneLeistung({
      bemessungsgrundlage: 20_000,
      tarifpost: "TP3A",
      erv: "einleitend",
      personen: 2,
    });
    const text = r.aufschluesselung.join("\n");
    expect(text).toContain("§ 23 RATG");
    expect(text).toContain("§ 15 RATG");
    expect(text).toContain("§ 23a RATG");
    expect(text).toContain("USt");
  });
});

// ── Verfahrenskosten + Risiko ───────────────────────────────

describe("schaetzeVerfahrenskosten", () => {
  it("one instance: symmetric lawyer costs + court fee", () => {
    const r = schaetzeVerfahrenskosten({ streitwert: 30_000 });
    expect(r.proInstanz).toHaveLength(1);
    const i1 = r.proInstanz[0]!;
    expect(i1.gerichtsgebuehr).toBe(792);
    expect(i1.eigenanwalt).toBe(i1.gegneranwalt);
    expect(r.kostenrisikoGesamt).toBeCloseTo(i1.summe, 2);
  });

  it("three instances accumulate", () => {
    const r1 = schaetzeVerfahrenskosten({ streitwert: 30_000, instanzen: 1 });
    const r3 = schaetzeVerfahrenskosten({ streitwert: 30_000, instanzen: 3 });
    expect(r3.proInstanz).toHaveLength(3);
    // Rechtsmittelinstanzen sind günstiger als die 1. Instanz (weniger
    // Leistungen), aber jede Instanz erhöht das Gesamtrisiko deutlich.
    expect(r3.kostenrisikoGesamt).toBeGreaterThan(r1.kostenrisikoGesamt * 1.5);
  });

  it("arbeitsrecht: no court fee in first instance", () => {
    const r = schaetzeVerfahrenskosten({ streitwert: 30_000, arbeitsrecht: true });
    expect(r.proInstanz[0]!.gerichtsgebuehr).toBe(0);
  });

  it("carries tarif_stand + prüfen hint", () => {
    const r = schaetzeVerfahrenskosten({ streitwert: 10_000 });
    expect(r.tarif_stand).toBe(TARIF_STAND);
    expect(r.hinweise[0]).toContain("prüfen");
  });
});

// ── § 43 ZPO ────────────────────────────────────────────────

describe("kostenersatz", () => {
  it("full win → full recovery (§ 41 ZPO)", () => {
    const r = kostenersatz(1, 10_000, 9_000, 1_500);
    expect(r.anwaltskostenersatz).toBe(10_000);
    expect(r.gerichtsgebuehrenersatz).toBe(1_500);
  });

  it("marginal loss < 10% → full recovery (§ 43 Abs 2 ZPO)", () => {
    const r = kostenersatz(0.92, 10_000, 9_000, 1_500);
    expect(r.ersatzquote).toBe(1);
    expect(r.regel).toContain("§ 43 Abs 2");
  });

  it("70% win → 40% of own costs (Quotenkompensation)", () => {
    const r = kostenersatz(0.7, 10_000, 9_000, 1_500);
    expect(r.ersatzquote).toBeCloseTo(0.4, 5);
    expect(r.anwaltskostenersatz).toBeCloseTo(4_000, 2);
    expect(r.gerichtsgebuehrenersatz).toBeCloseTo(1_050, 2);
  });

  it("50/50 → zero", () => {
    const r = kostenersatz(0.5, 10_000, 9_000, 1_500);
    expect(r.anwaltskostenersatz).toBe(0);
  });

  it("30% win → pays 40% of opponent costs", () => {
    const r = kostenersatz(0.3, 10_000, 9_000, 1_500);
    expect(r.anwaltskostenersatz).toBeCloseTo(-3_600, 2);
  });

  it("total loss → pays opponent in full", () => {
    const r = kostenersatz(0, 10_000, 9_000, 1_500);
    expect(r.anwaltskostenersatz).toBe(-9_000);
  });

  it("rejects out-of-range quote", () => {
    expect(() => kostenersatz(1.5, 1, 1, 1)).toThrow();
  });
});

// ── Kostenverzeichnis ───────────────────────────────────────

describe("Kostenverzeichnis", () => {
  it("sums positions + Barauslagen", () => {
    const kv = baueKostenverzeichnis(
      20_000,
      [
        { datum: "2026-01-10", leistung: "Klage", tarifpost: "TP3A", erv: "einleitend" },
        { datum: "2026-03-05", leistung: "Vorbereitender Schriftsatz", tarifpost: "TP3A", erv: "folgend" },
        { datum: "2026-04-20", leistung: "Verhandlung", tarifpost: "TP3A", verhandlungsstunden: 2 },
      ],
      { barauslagen: 792 }
    );
    expect(kv.positionen).toHaveLength(3);
    expect(kv.bruttoGesamt).toBeCloseTo(kv.nettoGesamt + kv.ustGesamt + 792, 2);
  });

  it("renders markdown with Tarifstand footer", () => {
    const kv = baueKostenverzeichnis(20_000, [
      { datum: "2026-01-10", leistung: "Klage", tarifpost: "TP3A", erv: "einleitend" },
    ]);
    const md = kostenverzeichnisMarkdown(kv);
    expect(md).toContain("| Datum | Leistung |");
    expect(md).toContain("Klage");
    expect(md).toContain(`Tarifstand ${TARIF_STAND}`);
  });
});
