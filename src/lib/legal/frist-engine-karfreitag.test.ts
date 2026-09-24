// @vitest-environment node

import { describe, expect, test } from "vitest";

import { berechneFrist } from "./frist-engine";

/**
 * § 1 FrHemmG: Fällt das Ende einer verfahrensrechtlichen Frist auf den
 * Karfreitag, ist der nächste Werktag der letzte Tag der Frist — in allen
 * Verfahrensregimen, nicht nur im AVG. Der 24.12. bleibt AVG-spezifisch
 * (§ 33 Abs 2 AVG); materiellrechtliche Fristen verschieben nie.
 */
describe("Karfreitag als Fristende (§ 1 FrHemmG)", () => {
  // 2 Wochen ab Fr 20.03.2026 → Karfreitag 03.04. → Sa/So → Ostermontag 06.04. → Di 07.04.
  test.each(["zpo", "stpo", "avg", "verwaltungsrecht"] as const)(
    "%s: Karfreitag → nächster Werktag",
    (regime) => {
      const r = berechneFrist({ ausloeser: "2026-03-20", dauer: { wochen: 2 }, regime });
      expect(r.fristendeRoh).toBe("2026-04-03");
      expect(r.fristende).toBe("2026-04-07");
    }
  );

  test("zpo: Hinweis nennt § 1 FrHemmG", () => {
    const r = berechneFrist({ ausloeser: "2026-03-20", dauer: { wochen: 2 }, regime: "zpo" });
    expect(r.hinweise.some((h) => h.includes("§ 1 FrHemmG"))).toBe(true);
  });

  test("stpo 2027: Karfreitag 26.03. → Di 30.03.", () => {
    const r = berechneFrist({ ausloeser: "2027-03-12", dauer: { wochen: 2 }, regime: "stpo" });
    expect(r.fristende).toBe("2027-03-30");
  });

  test("zpo: 24.12. bleibt Fristende (nur AVG verschiebt)", () => {
    const zpo = berechneFrist({ ausloeser: "2026-12-10", dauer: { wochen: 2 }, regime: "zpo" });
    expect(zpo.fristende).toBe("2026-12-24");
    const avg = berechneFrist({ ausloeser: "2026-12-10", dauer: { wochen: 2 }, regime: "avg" });
    expect(avg.fristende).toBe("2026-12-28");
  });

  test("materiell: Karfreitag bleibt (§§ 902 f. ABGB)", () => {
    const r = berechneFrist({ ausloeser: "2025-04-03", dauer: { jahre: 1 }, regime: "materiell" });
    expect(r.fristende).toBe("2026-04-03");
  });
});
