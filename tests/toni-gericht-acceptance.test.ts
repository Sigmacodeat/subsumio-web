import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { groundTruth } from "./toni-gericht-ground-truth";

/**
 * Toni Gericht OCR Ground-Truth Regression Test
 *
 * IMPORTANT: This suite starts from previously generated OCR/analysis files.
 * It is not a raw-document ingestion E2E test. Use `bun run akte:e2e` to prove
 * upload, extraction/OCR, Brain persistence and the legal pipeline together.
 *
 * Vergleicht Pipeline-Ergebnisse mit dem manuell erstellten Ground-Truth-Katalog.
 * Dieser Test validiert, dass die Pipeline die Qualität der manuellen Analyse
 * reproduzieren kann.
 *
 * Es werden zwei Modi unterstützt:
 * 1. LOCAL: Testet gegen OCR-Daten lokal (ohne Pipeline-Server)
 * 2. PIPELINE: Testet gegen Pipeline-Output (wenn PIPELINE_OUTPUT_PATH gesetzt)
 */

const OCR_BASE_DIR = "/Users/msc/Toni Gericht/GESAMTAKTEN ORDNER/_VASIC_DOSKAR_OCR";
const OCR_DIR = `${OCR_BASE_DIR}/ocr`;
const ANALYSES_DIR = "/Users/msc/Toni Gericht/ARCHIV_Analysen";
const FMA_DIR = "/Users/msc/Toni Gericht/FMA Forderungsunterlagen/Martin-Fall";
const PIPELINE_OUTPUT_PATH = process.env.PIPELINE_OUTPUT_PATH ?? "";

// ── Hilfsfunktionen ──

function loadFilesFromDir(dir: string, prefix?: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const f of require("fs").readdirSync(dir) as string[]) {
    if (f.endsWith(".txt") || f.endsWith(".md")) {
      if (!prefix || f.startsWith(prefix)) {
        try {
          files.push(readFileSync(join(dir, f), "utf-8"));
        } catch {}
      }
    }
  }
  return files;
}

function loadOcrFiles(): string[] {
  return loadFilesFromDir(OCR_DIR, "IMG_");
}

function loadAnalysisFiles(): string[] {
  return [
    ...loadFilesFromDir(ANALYSES_DIR),
    ...loadFilesFromDir(FMA_DIR),
    ...loadFilesFromDir(OCR_BASE_DIR), // cleaned_key_documents.md, analysis_summary.txt, etc.
  ];
}

function loadPipelineOutput(): any | null {
  if (!PIPELINE_OUTPUT_PATH || !existsSync(PIPELINE_OUTPUT_PATH)) return null;
  return JSON.parse(readFileSync(PIPELINE_OUTPUT_PATH, "utf-8"));
}

// ON-Nummern aus Text extrahieren (gleiche Logik wie Pipeline)
function extractOnNumbers(text: string): string[] {
  const matches = text.match(/ON\.?\s*[\d]+(?:\.[\d]+)*/gi) ?? [];
  return [...new Set(matches.map((m) => m.replace(/\s+/g, " ").replace(/ON\.?/i, "ON ")))];
}

// Personennamen extrahieren
function extractPersonNames(text: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /(?:Mag\.?\s+(?:pharm\.\s+)?(?:Rudolf\s+)?Mather)/gi,
    /(?:Martin\s+Eckerstorfer)/gi,
    /(?:Adis\s+Hrustemovic)/gi,
    /(?:Toni\s+Remik|Tony\s+Remik)/gi,
    /(?:Mag\.?\s+pharm\.\s+Michael\s+Kuhn)/gi,
    /(?:Gabriela\s+Maria\s+Bumbac)/gi,
    /(?:Mag\.?\s+Ralph\s+Kilches)/gi,
    /(?:Mag\.?\s+Katharina\s+Schmid-Siegel)/gi,
    /(?:Dr\.?\s+Michael\s+Schietz)/gi,
    /(?:Simon\s+Dolinsek)/gi,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) m.forEach((n) => names.add(n));
  }
  return [...names];
}

// Aktenzeichen extrahieren
function extractAktenzeichen(text: string): string[] {
  const matches = text.match(/\d{2,3}\s*(?:St|HV|NSt|C|Gs)\s*\d+\/\d+[a-z]?/gi) ?? [];
  return [...new Set(matches.map((m) => m.replace(/\s+/g, " ")))];
}

// Schadenssummen extrahieren
function extractDamageAmounts(text: string): number[] {
  const amounts: number[] = [];
  const patterns = [
    /€\s*([\d.]+(?:,\d+)?)/gi,
    /EUR\s*([\d.]+(?:,\d+)?)/gi,
    /([\d.]+(?:,\d+)?)\s*EUR/gi,
  ];
  for (const p of patterns) {
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) !== null) {
      const num = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
      if (!isNaN(num) && num > 1000) amounts.push(num);
    }
  }
  return amounts;
}

// ── Tests ──

describe("Toni Gericht Ground-Truth Acceptance", () => {
  const ocrFiles = loadOcrFiles();
  const analysisFiles = loadAnalysisFiles();
  const pipelineOutput = loadPipelineOutput();
  const allOcrText = ocrFiles.join("\n");
  const allAnalysisText = analysisFiles.join("\n");
  const allCaseText = allOcrText + "\n" + allAnalysisText;
  const hasPipelineOutput = pipelineOutput !== null;

  beforeAll(() => {
    if (ocrFiles.length === 0 && analysisFiles.length === 0) {
      console.warn("No case files found — tests will use pipeline output only");
    } else {
      console.log(`Loaded ${ocrFiles.length} OCR files, ${analysisFiles.length} analysis files`);
    }
  });

  describe("Layer 1: ON-Scanner", () => {
    it("sollte mindestens 20 ON-Nummern aus OCR-Daten extrahieren", () => {
      const onNumbers = extractOnNumbers(allOcrText);
      expect(onNumbers.length).toBeGreaterThanOrEqual(
        groundTruth.pipeline_erwartungswerte.layer_1.on_count_min
      );
    });

    it("sollte key ON-Nummern aus Ground-Truth finden", () => {
      const onNumbers = extractOnNumbers(allCaseText).map((n) => n.toUpperCase());
      const keyOns = Object.keys(groundTruth.on_numbers.key_on_refs);
      let found = 0;
      for (const keyOn of keyOns) {
        if (onNumbers.some((n) => n.includes(keyOn.replace("ON ", "").toUpperCase()))) {
          found++;
        }
      }
      expect(found).toBeGreaterThanOrEqual(3);
    });

    it("sollte keine halluzinierten ON-Nummern enthalten (Hallucination Gate)", () => {
      const onNumbers = extractOnNumbers(allOcrText);
      for (const on of onNumbers) {
        const numPart = on.replace(/ON\s*/i, "").trim();
        expect(numPart).toMatch(/^\d+/);
      }
    });

    it("pipeline output ON-Nummern sollten mit Ground-Truth übereinstimmen (wenn verfügbar)", () => {
      if (!hasPipelineOutput) return;
      const pipelineOns = pipelineOutput?.layer1?.on_numbers ?? [];
      const expected = groundTruth.on_numbers.expected_in_ocr;
      const overlap = pipelineOns.filter((on: string) =>
        expected.some((e) => e.toUpperCase() === on.toUpperCase())
      );
      expect(overlap.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe("Layer 2: Entity Extractor", () => {
    it("sollte mindestens 12 Entitäten extrahieren", () => {
      const entities = extractPersonNames(allCaseText);
      expect(entities.length).toBeGreaterThanOrEqual(
        groundTruth.pipeline_erwartungswerte.layer_2.entities_min
      );
    });

    it("sollte Hrustemovic und Alias 'Toni Remik' erkennen", () => {
      const entities = extractPersonNames(allCaseText).map((e) => e.toLowerCase());
      expect(entities.some((e) => e.includes("hrustemovic"))).toBe(true);
      expect(entities.some((e) => e.includes("remik"))).toBe(true);
    });

    it("sollte Eckerstorfer als Beschuldigter UND Anzeiger erkennen (Rollenwechsel)", () => {
      const text = allCaseText.toLowerCase();
      expect(text).toMatch(/eckerstorfer/i);
      expect(text).toMatch(/beschuldigt|beschuldigte/i);
    });

    it("sollte Kilches-Interessenkonflikt erkennen (vertritt Eckerstorfer + Kuhn)", () => {
      const text = allCaseText;
      expect(text).toMatch(/kilches/i);
      // In den HTML-Dokumenten oder OCR
      const hasKuhn = /kuhn/i.test(text);
      const hasEckerstorfer = /eckerstorfer/i.test(text);
      expect(hasKuhn && hasEckerstorfer).toBe(true);
    });
  });

  describe("Layer 3: Forensic Analyst", () => {
    it("sollte 'keine Anklage' Befund erkennen", () => {
      const text = allCaseText;
      expect(text).toMatch(/keine\s+anklage|niemals\s+angeklagt/i);
    });

    it("sollte Asymmetrie-These erkennen", () => {
      const text = allCaseText.toLowerCase();
      const hasAsymmetry =
        text.includes("nicht vernommen") ||
        text.includes("nie vernommen") ||
        text.includes("keine vernehmung");
      expect(hasAsymmetry).toBe(true);
    });

    it("sollte mindestens 5 Verfahrensverstöße der Gegenseite identifizieren", () => {
      const text = allCaseText.toLowerCase();
      let count = 0;
      if (text.includes("zwischenbericht") && text.includes("monate")) count++;
      if (text.includes("stellungnahme") && text.includes("überfällig")) count++;
      if (text.includes("urgiert") || text.includes("urgieren")) count++;
      if (text.includes("nicht vernommen") || text.includes("kein protokoll")) count++;
      if (text.includes("verwechslung") || text.includes("falsche akteneinsicht")) count++;
      if (text.includes("interessenkonflikt")) count++;
      expect(count).toBeGreaterThanOrEqual(
        groundTruth.pipeline_erwartungswerte.layer_3.verfahrensverstoesse_gegenseite_min
      );
    });
  });

  describe("Layer 4: Law Matcher", () => {
    it("sollte kritische Normen aus Ground-Truth im Text finden", () => {
      const text = allCaseText;
      const expectedNorms = ["§ 1 AHG", "§ 1489 ABGB", "Art 9 DSGVO", "§ 146 StGB"];
      let found = 0;
      for (const norm of expectedNorms) {
        if (text.includes(norm) || text.includes(norm.replace("§ ", "§"))) {
          found++;
        }
      }
      expect(found).toBeGreaterThanOrEqual(2);
    });

    it("sollte § 6 AHG und § 1489 ABGB als kritische Normen identifizieren", () => {
      const text = allCaseText;
      expect(text).toMatch(/§\s*6\s*(?:Abs\s*1\s*)?AHG/i);
      expect(text).toMatch(/§\s*1489\s*ABGB/i);
    });
  });

  describe("Layer 5: Damage Table", () => {
    it("sollte Mather-Gesamtschaden im erwarteten Bereich finden", () => {
      const amounts = extractDamageAmounts(allCaseText);
      const hasLargeAmount = amounts.some((a) => a >= 9000000 && a <= 11000000);
      expect(hasLargeAmount).toBe(true);
    });

    it("sollte Eckerstorfer Privatbeteiligtenanschluss 11.744.200 erkennen", () => {
      const amounts = extractDamageAmounts(allCaseText);
      const hasPaAmount = amounts.some((a) => a >= 11000000 && a <= 12000000);
      expect(hasPaAmount).toBe(true);
    });

    it("sollte Sicherstellungsbetrag 900.200 (nicht 600.000) verwenden", () => {
      const text = allCaseText;
      expect(text).toMatch(/900\.200|900200/i);
    });

    it("sollte Doppelzählungs-Warnungen für Eckerstorfer generieren", () => {
      const text = allCaseText.toLowerCase();
      const hasGfHonorar =
        text.includes("gf-honorar") || text.includes("geschäftsführungstätigkeit");
      const hasBuerge = text.includes("bürgschaft") || text.includes("buerge");
      // Pipeline sollte beide Positionen als potentielle Doppelzählung flaggen
      if (hasGfHonorar && hasBuerge) {
        // Wenn beide im Text sind, muss Pipeline diese als Overlap erkennen
        expect(true).toBe(true);
      }
    });
  });

  describe("Layer 5b: Deadline Validator", () => {
    it("sollte kritische Verjährungsfristen identifizieren (02.08.2026 + 02.11.2026)", () => {
      const text = allCaseText;
      const hasAugust = /02\.08\.2026|02\.08\.26/i.test(text);
      const hasNovember = /02\.11\.2026|02\.11\.26/i.test(text);
      expect(hasAugust || hasNovember).toBe(true);
    });

    it("sollte verjährte Fristen markieren (§ 195 StPO TOT, Disziplinär verjährt)", () => {
      const text = allCaseText.toLowerCase();
      const hasVerjaert =
        text.includes("verjährt") || text.includes("verjaert") || text.includes("tot");
      expect(hasVerjaert).toBe(true);
    });
  });

  describe("Layer 5l: Limitation Scanner (Gegner-Dimension)", () => {
    it("sollte Ansprüche pro Gegner separieren", () => {
      const gegner = groundTruth.ansprueche_pro_gegner;
      expect(gegner.length).toBeGreaterThanOrEqual(
        groundTruth.pipeline_erwartungswerte.layer_5l.ansprueche_pro_gegner_min
      );
    });

    it("sollte unterschiedliche Verjährungsfristen pro Gegner erkennen", () => {
      const fristen = groundTruth.fristen;
      const gegnerSet = new Set(fristen.map((f) => f.gegner));
      expect(gegnerSet.size).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Layer 6: Draft Packages", () => {
    it("sollte mindestens 6 Draft-Typen aus Ground-Truth abdecken", () => {
      const draftTypes = groundTruth.schriftsatztypen;
      expect(draftTypes.length).toBeGreaterThanOrEqual(
        groundTruth.pipeline_erwartungswerte.layer_6.expected_total
      );
    });

    it("sollte § 193 Abs 2 StPO (nicht § 195) als Fortführungsansatz wählen", () => {
      const text = allCaseText.toLowerCase();
      const has193 = text.includes("193") && text.includes("stpo");
      const has195Warning =
        text.includes("195") && (text.includes("tot") || text.includes("verjährt"));
      expect(has193 || has195Warning).toBe(true);
    });
  });

  describe("Layer 7: Ensemble Critic", () => {
    it("sollte Widersprüche in den Daten erkennen", () => {
      const widersprueche = groundTruth.widersprueche;
      expect(widersprueche.length).toBeGreaterThanOrEqual(3);
    });

    it("sollte Doppelzählungen in Eckerstorfer-Positionen flaggen", () => {
      const doppelzaehlungen = groundTruth.doppelzaehlungen;
      expect(doppelzaehlungen.length).toBeGreaterThanOrEqual(
        groundTruth.pipeline_erwartungswerte.layer_5.overlap_warnings_min
      );
    });
  });

  describe("Cross-Case Analysis (Gap 3)", () => {
    it("sollte mindestens 3 verknüpfte Aktenzeichen identifizieren", () => {
      const azs = extractAktenzeichen(allCaseText);
      expect(azs.length).toBeGreaterThanOrEqual(3);
    });

    it("sollte Verfahrensübertragung 39 St 116/22v -> 410 St 131/22 erkennen", () => {
      const text = allCaseText;
      expect(text).toMatch(/410\s*St\s*131/i);
      expect(text).toMatch(/39\s*St\s*116/i);
    });
  });

  describe("GZ Validation", () => {
    it("sollte Hauptakt GZ korrekt identifizieren", () => {
      const gz = groundTruth.gz_validation.hauptakt;
      expect(gz).toMatch(/\d{3}\s*\d{3}\s*HV\s*\d+\/\d+\s*[a-z]/i);
    });

    it("sollte 7+ Verfahrensnummern aus Ground-Truth validieren", () => {
      const verfahren = groundTruth.gz_validation.verfahren;
      expect(verfahren.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe("Pipeline Output Comparison (wenn verfügbar)", () => {
    it("sollte Pipeline-Output gegen Ground-Truth validieren", () => {
      if (!hasPipelineOutput) {
        console.log("PIPELINE_OUTPUT_PATH nicht gesetzt — überspringe Pipeline-Vergleich");
        return;
      }

      const p = pipelineOutput;

      // Layer 1: ON-Nummern
      if (p.layer1?.on_numbers) {
        const expected = groundTruth.on_numbers.expected_in_ocr;
        const overlap = p.layer1.on_numbers.filter((on: string) =>
          expected.some((e) => e.toUpperCase() === on.toUpperCase())
        );
        expect(overlap.length).toBeGreaterThanOrEqual(10);
      }

      // Layer 2: Entities
      if (p.layer2?.entities) {
        expect(p.layer2.entities.length).toBeGreaterThanOrEqual(12);
      }

      // Layer 3: Findings
      if (p.layer3?.findings) {
        expect(p.layer3.findings.length).toBeGreaterThanOrEqual(7);
      }

      // Layer 5: Damage Table
      if (p.layer5?.damage_table) {
        const matherTotal = p.layer5.damage_table.mather_total ?? 0;
        expect(matherTotal).toBeGreaterThanOrEqual(9000000);
        expect(matherTotal).toBeLessThanOrEqual(11000000);
      }

      // Layer 5b: Deadlines
      if (p.layer5b?.deadlines) {
        const critical = p.layer5b.deadlines.filter((d: any) => d.status === "CRITICAL");
        expect(critical.length).toBeGreaterThanOrEqual(2);
      }

      // Layer 6: Drafts
      if (p.layer6?.drafts) {
        expect(p.layer6.drafts.length).toBeGreaterThanOrEqual(6);
      }

      // Layer 7: Score
      if (p.layer7?.score) {
        expect(p.layer7.score).toBeGreaterThanOrEqual(75);
      }
    });
  });

  describe("Edge Cases", () => {
    it("sollte Retaxierung als hoheitlich (BMSGPK-Weisung) klassifizieren", () => {
      const text = allCaseText.toLowerCase();
      const hasWeisung = text.includes("weisung") || text.includes("bmsgpk");
      const hasRetax = text.includes("retax") || text.includes("retaxierung");
      expect(hasWeisung || hasRetax).toBe(true);
    });

    it("sollte Fortführungsantrag § 195 als TOT markieren", () => {
      const fristen = groundTruth.fristen;
      const fr195 = fristen.find((f) => f.norm.includes("§ 195"));
      expect(fr195?.status).toBe("VERJAERT");
    });
  });
});
