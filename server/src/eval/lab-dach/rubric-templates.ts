/**
 * LAB-DACH v3 — Rubric Templates for 9 Legal Areas
 *
 * Harvey-style rubric templates for cross-judge evaluation.
 * Each template defines 5 core dimensions:
 *   1. Struktur (Structure & Organization)
 *   2. Zitate (Citations & Grounding)
 *   3. Subsumtion (Legal Subsumption)
 *   4. Vollständigkeit (Completeness)
 *   5. Halluzination (Hallucination Detection)
 *
 * These templates are used to generate task criteria for new tasks
 * created through the human review workflow.
 */

import type { Criterion, LegalArea } from "./types.ts";

// ── Template Dimensions ───────────────────────────────────────────────

export interface RubricDimension {
  /** Dimension key. */
  key: "struktur" | "zitate" | "subsumtion" | "vollstaendigkeit" | "halluzination";
  /** Display label. */
  label: string;
  /** Default severity for this dimension. */
  severity: "low" | "medium" | "high" | "critical";
  /** Whether this dimension is always critical (overrides severity). */
  always_critical?: boolean;
  /** The judge question template. */
  judge_question: string;
  /** Description for the criterion. */
  description: string;
}

// ── Base Dimensions (shared across all legal areas) ──────────────────

const STRUKTUR: RubricDimension = {
  key: "struktur",
  label: "Struktur & Aufbau",
  severity: "medium",
  description: "Die Ausgabe folgt einer klaren juristischen Struktur (Sachverhalt, Rechtsfrage, Würdigung, Ergebnis).",
  judge_question:
    "Folgt die Ausgabe einer klaren juristischen Struktur mit erkennbaren Abschnitten (Sachverhalt, Rechtsfrage, rechtliche Würdigung, Ergebnis)? Sind die Abschnitte logisch aufeinander aufgebaut?",
};

const ZITATE: RubricDimension = {
  key: "zitate",
  label: "Zitate & Belege",
  severity: "critical",
  always_critical: true,
  description: "Alle zitierten Normen (§/Art.) sind korrekt und im Kontext belegt.",
  judge_question:
    "Sind alle zitierten Normen (§/Art.-Nummern) korrekt und werden sie im Kontext begründet? Werden keine Normen erfunden oder falsch zitiert?",
};

const SUBSUMTION: RubricDimension = {
  key: "subsumtion",
  label: "Subsumtion & Rechtsanwendung",
  severity: "critical",
  always_critical: true,
  description: "Die rechtliche Subsumtion ist methodisch korrekt (Obersatz → Untersatz → Schluss).",
  judge_question:
    "Ist die rechtliche Subsumtion methodisch korrekt? Werden die abstrakten Normmerkmale auf den konkreten Sachverhalt angewendet (Obersatz → Untersatz → Schluss)? Ist die Argumentation schlüssig?",
};

const VOLLSTAENDIGKEIT: RubricDimension = {
  key: "vollstaendigkeit",
  label: "Vollständigkeit & Vollständigkeit der Anspruchsprüfung",
  severity: "high",
  description: "Alle relevanten Ansprüche, Gegenansprüche und Einwendungen werden geprüft.",
  judge_question:
    "Werden alle relevanten rechtlichen Aspekte geprüft (Anspruchsgrundlagen, Gegenansprüche, Einwendungen, Verjährung)? Gibt es offensichtliche Lücken in der rechtlichen Würdigung?",
};

const HALLUZINATION: RubricDimension = {
  key: "halluzination",
  label: "Halluzinationsfreiheit",
  severity: "critical",
  always_critical: true,
  description: "Die Ausgabe enthält keine erfundenen Normen, Urteile oder Rechtsbehauptungen.",
  judge_question:
    "Enthält die Ausgabe erfundene Normen, fiktive Urteile oder unbegründete Rechtsbehauptungen, die nicht durch den Kontext oder allgemeines Rechtswissen gedeckt sind? Werden Behauptungen ohne Beleg aufgestellt?",
};

// ── Legal Area Templates ──────────────────────────────────────────────

export interface RubricTemplate {
  /** Legal area this template applies to. */
  legal_area: LegalArea;
  /** Template name. */
  name: string;
  /** The 5 core dimensions. */
  dimensions: RubricDimension[];
  /** Additional area-specific dimensions (if any). */
  extra_dimensions?: RubricDimension[];
}

/**
 * Generate criteria from a rubric template.
 * Each dimension becomes one criterion with crit-NNN IDs.
 */
export function generateCriteriaFromTemplate(template: RubricTemplate): Criterion[] {
  const allDimensions = [...template.dimensions, ...(template.extra_dimensions ?? [])];
  return allDimensions.map((dim, idx) => {
    const num = String(idx + 1).padStart(3, "0");
    return {
      id: `crit-${num}`,
      description: dim.description,
      check_type: "llm_judge",
      critical: dim.always_critical ?? dim.severity === "critical",
      required: dim.severity === "critical" || dim.always_critical === true,
      severity: dim.severity,
      judge_question: dim.judge_question,
    } satisfies Criterion;
  });
}

// ── 9 Legal Area Templates ────────────────────────────────────────────

export const RUBRIC_TEMPLATES: Record<LegalArea, RubricTemplate> = {
  // 1. Litigation (Zivilprozessrecht)
  litigation: {
    legal_area: "litigation",
    name: "Zivilrechtliche Streitigkeit — Harvey-Standard",
    dimensions: [STRUKTUR, ZITATE, SUBSUMTION, VOLLSTAENDIGKEIT, HALLUZINATION],
    extra_dimensions: [
      {
        key: "struktur",
        label: "Anspruchsgrundlage identifiziert",
        severity: "high",
        description: "Die zutreffende Anspruchsgrundlage (Anspruchsnorm) wird korrekt identifiziert.",
        judge_question:
          "Wird die zutreffende Anspruchsgrundlage (z.B. § 433 II BGB, § 812 BGB, § 280 I BGB) korrekt identifiziert und begründet? Wird die Norm genannt, aus der sich der Anspruch ergibt?",
      },
    ],
  },

  // 2. Corporate / M&A (Gesellschaftsrecht)
  corporate_m_and_a: {
    legal_area: "corporate_m_and_a",
    name: "Gesellschaftsrecht & M&A — Harvey-Standard",
    dimensions: [STRUKTUR, ZITATE, SUBSUMTION, VOLLSTAENDIGKEIT, HALLUZINATION],
    extra_dimensions: [
      {
        key: "struktur",
        label: "Gesellschaftsrechtliche Spezialprüfung",
        severity: "high",
        description: "Gesellschaftsrechtliche Spezialfragen (Haftung, Vertretung, Gesellschafterrechte) werden korrekt geprüft.",
        judge_question:
          "Werden gesellschaftsrechtliche Spezialfragen (persönliche Haftung, Vertretungsmacht, Gesellschafterbeschlüsse, Informationsrechte) korrekt identifiziert und rechtlich gewürdigt?",
      },
    ],
  },

  // 3. Employment (Arbeitsrecht)
  employment: {
    legal_area: "employment",
    name: "Arbeitsrecht — Harvey-Standard",
    dimensions: [STRUKTUR, ZITATE, SUBSUMTION, VOLLSTAENDIGKEIT, HALLUZINATION],
    extra_dimensions: [
      {
        key: "struktur",
        label: "Kündigungsschutz & Sonderkündigungsschutz",
        severity: "high",
        description: "Kündigungsschutz und Sonderkündigungsschutz werden korrekt geprüft.",
        judge_question:
          "Werden allgemeiner Kündigungsschutz (KSchG) und Sonderkündigungsschutz (Mutterschutz, Schwerbehinderung, Betriebsrat) korrekt geprüft? Wird die Sozialwidrigkeit der Kündigung erörtert?",
      },
    ],
  },

  // 4. Real Estate (Immobilienrecht / Baurecht)
  real_estate: {
    legal_area: "real_estate",
    name: "Immobilien- & Baurecht — Harvey-Standard",
    dimensions: [STRUKTUR, ZITATE, SUBSUMTION, VOLLSTAENDIGKEIT, HALLUZINATION],
    extra_dimensions: [
      {
        key: "struktur",
        label: "Grundstücksrechtliche Besonderheiten",
        severity: "high",
        description: "Grundstücksrechtliche Besonderheiten (Auflassung, Grundbuch, Vormerkung) werden korrekt geprüft.",
        judge_question:
          "Werden grundstücksrechtliche Besonderheiten (Auflassung § 925 BGB, Grundbuch, Vormerkung § 883 BGB, Eigentumserwerb) korrekt identifiziert und rechtlich gewürdigt?",
      },
    ],
  },

  // 5. Tax (Steuerrecht)
  tax: {
    legal_area: "tax",
    name: "Steuerrecht — Harvey-Standard",
    dimensions: [STRUKTUR, ZITATE, SUBSUMTION, VOLLSTAENDIGKEIT, HALLUZINATION],
    extra_dimensions: [
      {
        key: "struktur",
        label: "Steuerliche Beurteilung & Steuerschuld",
        severity: "high",
        description: "Die steuerliche Beurteilung (Steuerart, Bemessungsgrundlage, Steuerschuldner) wird korrekt vorgenommen.",
        judge_question:
          "Wird die steuerliche Beurteilung korrekt vorgenommen (Steuerart, Bemessungsgrundlage, Steuerschuldner, Fälligkeit)? Werden die einschlägigen Normen des EStG/UStG/AO korrekt angewendet?",
      },
    ],
  },

  // 6. Criminal (Strafrecht)
  criminal: {
    legal_area: "criminal",
    name: "Strafrecht — Harvey-Standard",
    dimensions: [STRUKTUR, ZITATE, SUBSUMTION, VOLLSTAENDIGKEIT, HALLUZINATION],
    extra_dimensions: [
      {
        key: "struktur",
        label: "Tatbestandsmäßigkeit & Schuld",
        severity: "critical",
        always_critical: true,
        description: "Tatbestandsmäßigkeit, Rechtswidrigkeit und Schuld werden korrekt geprüft (dreistufiger Aufbau).",
        judge_question:
          "Wird der dreistufige strafrechtliche Aufbau korrekt angewendet (Tatbestandsmäßigkeit → Rechtswidrigkeit → Schuld)? Werden alle Tatbestandsmerkmale einzeln geprüft?",
      },
    ],
  },

  // 7. Family (Familienrecht)
  family: {
    legal_area: "family",
    name: "Familienrecht — Harvey-Standard",
    dimensions: [STRUKTUR, ZITATE, SUBSUMTION, VOLLSTAENDIGKEIT, HALLUZINATION],
    extra_dimensions: [
      {
        key: "struktur",
        label: "Familienrechtliche Spezialprüfung",
        severity: "high",
        description: "Familienrechtliche Spezialfragen (Unterhalt, Zugewinn, Sorgerecht) werden korrekt geprüft.",
        judge_question:
          "Werden familienrechtliche Spezialfragen (Unterhalt § 1601 BGB, Zugewinnausgleich § 1373 BGB, elterliche Sorge § 1626 BGB) korrekt identifiziert und rechtlich gewürdigt?",
      },
    ],
  },

  // 8. Inheritance (Erbrecht)
  inheritance: {
    legal_area: "inheritance",
    name: "Erbrecht — Harvey-Standard",
    dimensions: [STRUKTUR, ZITATE, SUBSUMTION, VOLLSTAENDIGKEIT, HALLUZINATION],
    extra_dimensions: [
      {
        key: "struktur",
        label: "Erbrechtliche Spezialprüfung",
        severity: "high",
        description: "Erbrechtliche Spezialfragen (Pflichtteil, Testamentsergänzung, Erbfolge) werden korrekt geprüft.",
        judge_question:
          "Werden erbrechtliche Spezialfragen (gesetzliche Erbfolge, Testamentsergänzung § 2325 BGB, Pflichtteil § 2303 BGB, Erbschein) korrekt identifiziert und rechtlich gewürdigt?",
      },
    ],
  },
};

/**
 * Get the rubric template for a legal area.
 */
export function getRubricTemplate(legalArea: LegalArea): RubricTemplate {
  const template = RUBRIC_TEMPLATES[legalArea];
  if (!template) {
    throw new Error(`No rubric template found for legal area: ${legalArea}`);
  }
  return template;
}

/**
 * Get the list of all legal areas that have rubric templates.
 */
export function getAvailableLegalAreas(): LegalArea[] {
  return Object.keys(RUBRIC_TEMPLATES) as LegalArea[];
}
