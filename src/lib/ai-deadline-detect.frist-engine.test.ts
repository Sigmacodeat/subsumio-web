import { describe, test, expect } from "vitest";
import {
  detectDeadlines,
  enrichAllDeadlines,
  enrichDetectedDeadline,
  extractZustellungsdatum,
  type DetectedDeadline,
} from "@/lib/ai-deadline-detect";

describe("frist-engine integration in ai-deadline-detect", () => {
  describe("extractZustellungsdatum", () => {
    test("extracts DD.MM.YYYY format", () => {
      expect(extractZustellungsdatum("Das Urteil wurde zugestellt am 15.03.2024.")).toBe(
        "2024-03-15"
      );
    });

    test("extracts ISO format", () => {
      expect(extractZustellungsdatum("Zustellung am 2024-03-15 erfolgt.")).toBe("2024-03-15");
    });

    test("extracts DD. Month YYYY format", () => {
      expect(extractZustellungsdatum("zugestellt am 15. März 2024")).toBe("2024-03-15");
    });

    test("extracts reversed format", () => {
      expect(extractZustellungsdatum("am 20.07.2024 zugestellt")).toBe("2024-07-20");
    });

    test("returns null when no Zustellungsdatum present", () => {
      expect(extractZustellungsdatum("Die Frist beträgt vier Wochen.")).toBeNull();
    });
  });

  describe("enrichDetectedDeadline — Berufung", () => {
    const text =
      "Das Urteil des Landesgerichts Linz wurde zugestellt am 15.07.2024. Berufungsfrist vier Wochen.";

    test("detects Berufung and enriches with frist-engine", () => {
      const detected = detectDeadlines(text);
      const berufung = detected.find((d) => d.suggestedTemplate === "berufung");
      expect(berufung).toBeDefined();

      const enriched = enrichDetectedDeadline(berufung!, text);
      expect(enriched.fristResult).toBeDefined();
      expect(enriched.zustellungsdatum).toBe("2024-07-15");
      expect(enriched.fristResult!.art.key).toBe("berufung");
      expect(enriched.fristResult!.art.gehemmtInVhfz).toBe(true);
      expect(enriched.confidence).toBe("high");
    });

    test("Berufungsfrist during Sommer-vhfZ gets extended (§ 222 ZPO)", () => {
      // 15.07.2024 is within vhfZ (15.07.–17.08.)
      const detected = detectDeadlines(text);
      const berufung = detected.find((d) => d.suggestedTemplate === "berufung")!;
      const enriched = enrichDetectedDeadline(berufung, text);

      // Normal: 4 weeks from 2024-07-15 = 2024-08-12
      // But vhfZ Hemmung extends by rest of vhfZ (15.07 to 17.08 = 33 days)
      // So: 2024-08-12 + 33 days = 2024-09-14
      // 2024-09-14 is Saturday → shifted to 2024-09-16 (Monday) per § 126 Abs 2 ZPO
      expect(enriched.fristResult!.fristende).toBe("2024-09-16");
      expect(enriched.fristResult!.hinweise.some((h) => h.includes("verhandlungsfreie"))).toBe(
        true
      );
    });

    test("Berufungsfrist outside vhfZ is 4 weeks", () => {
      const text2 = "Urteil zugestellt am 15.03.2024. Berufungsfrist.";
      const detected = detectDeadlines(text2);
      const berufung = detected.find((d) => d.suggestedTemplate === "berufung")!;
      const enriched = enrichDetectedDeadline(berufung, text2);

      // 4 weeks from 2024-03-15 = 2024-04-12 (Friday, no shift needed)
      expect(enriched.fristResult!.fristende).toBe("2024-04-12");
      expect(enriched.fristResult!.hinweise.some((h) => h.includes("verhandlungsfreie Zeit"))).toBe(
        false
      );
    });
  });

  describe("enrichDetectedDeadline — Klagebeantwortung", () => {
    test("Klagebeantwortung gets 4-week frist", () => {
      const text = "Klagebeantwortungsfrist: zugestellt am 10.01.2024.";
      const detected = detectDeadlines(text);
      const klage = detected.find((d) => d.suggestedTemplate === "klagebeantwortung");
      expect(klage).toBeDefined();

      const enriched = enrichDetectedDeadline(klage!, text);
      expect(enriched.fristResult).toBeDefined();
      expect(enriched.fristResult!.art.key).toBe("klagebeantwortung");
      // 4 weeks from 2024-01-10 = 2024-02-07
      expect(enriched.fristResult!.fristende).toBe("2024-02-07");
    });
  });

  describe("enrichDetectedDeadline — Verjährung", () => {
    test("3-year Verjährung uses dd.date as ausloeser", () => {
      const dd: DetectedDeadline = {
        type: "legal_deadline",
        description: "Verjährungsfrist",
        date: "2024-01-15",
        confidence: "medium",
        sourceSnippet: "Verjährung 3 Jahre ab Kenntnis",
        matchedRule: "abgb_verjaehrung_kurz",
        suggestedTemplate: "verjaehrung_kurz",
      };

      const enriched = enrichDetectedDeadline(dd, "Verjährung 3 Jahre ab Kenntnis 2024-01-15");
      expect(enriched.fristResult).toBeDefined();
      expect(enriched.fristResult!.art.key).toBe("verjaehrung_kurz");
      expect(enriched.fristResult!.art.regime).toBe("materiell");
      // 3 years from 2024-01-15 = 2027-01-15
      expect(enriched.fristResult!.fristende).toBe("2027-01-15");
      // No End-Tag-Verschiebung for materiellrechtliche Fristen
      expect(
        enriched.fristResult!.hinweise.some((h) => h.includes("Materiellrechtliche Frist"))
      ).toBe(true);
    });
  });

  describe("enrichDetectedDeadline — Beschwerde StPO", () => {
    test("StPO Beschwerde gets 14-day frist", () => {
      const text = "Sofortige Beschwerde frist 14 Tage. Zugestellt am 05.06.2024.";
      const detected = detectDeadlines(text);
      const beschwerde = detected.find((d) => d.suggestedTemplate === "beschwerde_stpo");
      expect(beschwerde).toBeDefined();

      const enriched = enrichDetectedDeadline(beschwerde!, text);
      expect(enriched.fristResult).toBeDefined();
      expect(enriched.fristResult!.art.key).toBe("beschwerde_stpo");
      expect(enriched.fristResult!.art.regime).toBe("stpo");
      // 14 days from 2024-06-05 = 2024-06-19
      expect(enriched.fristResult!.fristende).toBe("2024-06-19");
    });
  });

  describe("enrichDetectedDeadline — Bescheidbeschwerde VwGVG", () => {
    test("Bescheidbeschwerde gets 4-week frist with AVG regime", () => {
      const text = "Bescheidbeschwerde an das Verwaltungsgericht frist. Zugestellt am 01.04.2024.";
      const detected = detectDeadlines(text);
      const beschwerde = detected.find((d) => d.suggestedTemplate === "beschwerde_vwgvg");
      expect(beschwerde).toBeDefined();

      const enriched = enrichDetectedDeadline(beschwerde!, text);
      expect(enriched.fristResult).toBeDefined();
      expect(enriched.fristResult!.art.key).toBe("beschwerde_vwgvg");
      expect(enriched.fristResult!.art.regime).toBe("avg");
      // 4 weeks from 2024-04-01 = 2024-04-29
      expect(enriched.fristResult!.fristende).toBe("2024-04-29");
    });
  });

  describe("enrichAllDeadlines — batch processing", () => {
    test("enriches all detected deadlines in a text", () => {
      const text = `
        Urteil zugestellt am 15.03.2024. Berufungsfrist vier Wochen.
        Weiters wird auf die Verjährungsfrist 3 Jahre ab Kenntnis hingewiesen.
        Sofortige Beschwerde frist 14 Tage ab Zustellung am 01.04.2024.
      `;
      const detected = detectDeadlines(text);
      const enriched = enrichAllDeadlines(detected, text);

      // At least some should have fristResult
      const withFrist = enriched.filter((d) => d.fristResult);
      expect(withFrist.length).toBeGreaterThan(0);

      // All enriched ones should have high confidence
      for (const d of withFrist) {
        expect(d.confidence).toBe("high");
        expect(d.zustellungsdatum).toBeDefined();
      }
    });
  });

  describe("Vorfrist computation", () => {
    test("Vorfrist is 7 days before fristende, rolled to previous workday", () => {
      const text = "Berufung frist. Zugestellt am 01.03.2024.";
      const detected = detectDeadlines(text);
      const berufung = detected.find((d) => d.suggestedTemplate === "berufung")!;
      const enriched = enrichDetectedDeadline(berufung, text);

      // 4 weeks from 2024-03-01 = 2024-03-29
      // Vorfrist = 2024-03-22 (7 days before) = Friday
      expect(enriched.fristResult!.fristende).toBe("2024-03-29");
      expect(enriched.fristResult!.vorfrist).toBe("2024-03-22");
    });
  });

  describe("Edge cases", () => {
    test("no template → no enrichment", () => {
      const dd: DetectedDeadline = {
        type: "absolute_deadline",
        description: "Frist: 15.03.2024",
        date: "2024-03-15",
        confidence: "high",
        sourceSnippet: "bis 15.03.2024",
        matchedRule: "absolute_date_de",
      };
      const enriched = enrichDetectedDeadline(dd, "some text");
      expect(enriched.fristResult).toBeUndefined();
    });

    test("no Zustellungsdatum and no date → no enrichment", () => {
      const dd: DetectedDeadline = {
        type: "legal_deadline",
        description: "Berufungsfrist",
        confidence: "medium",
        sourceSnippet: "Berufungsfrist",
        matchedRule: "zpo_berufung",
        suggestedTemplate: "berufung",
      };
      const enriched = enrichDetectedDeadline(dd, "Berufungsfrist ohne Datum");
      expect(enriched.fristResult).toBeUndefined();
    });

    test("unknown template → no enrichment", () => {
      const dd: DetectedDeadline = {
        type: "legal_deadline",
        description: "Unknown",
        confidence: "low",
        sourceSnippet: "test",
        matchedRule: "unknown",
        suggestedTemplate: "nonexistent-template",
      };
      const enriched = enrichDetectedDeadline(dd, "test text zugestellt am 01.01.2024");
      expect(enriched.fristResult).toBeUndefined();
    });
  });
});
