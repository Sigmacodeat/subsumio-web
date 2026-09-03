/**
 * Completeness Check — Stage 2 der Legal Analysis Pipeline.
 *
 * Deterministischer, LLM-freier Check: "Ist die Akte vollständig?"
 * Vergleicht eingetroffene Dokumente (klassifiziert via doc-classifier.ts)
 * gegen eine Fall-Typ-spezifische Expected-Pieces-Liste.
 *
 * Architektur inspiriert von Microsoft Content Processing Accelerator
 * (GapAnalysisRulesetGuide.md, 2026): YAML-DSL mit required_documents,
 * conditional rules (`when`), severity, rationale. Kein Code für neue
 * Rules nötig — Domain-Experten editieren die Rule-Sets.
 *
 * Output pro Piece:
 *   - OK:        Dokument vorhanden und gültig
 *   - MISSING:   Dokument nicht gefunden
 *   - EXPIRED:   Dokument vorhanden aber abgelaufen (z.B. alte Versicherung)
 *   - INVALID:   Dokument vorhanden aber unvollständig/fehlerhaft
 *
 * Verdict über gesamte Akte:
 *   - COMPLETE:  Alle Blocker OK, keine MISSING high-severity
 *   - CHASE:     Required non-blocker outstanding, aber Blocker OK
 *   - HOLD:      Mindestens ein Blocker MISSING/EXPIRED/INVALID
 *
 * Pure Funktionen — testbar ohne DB/Netz. Engine-I/O nur in der
 * Orchestrator-Funktion `runCompletenessCheck`.
 */

import type { LegalDocType } from "./doc-classifier.ts";

// ── Types ──────────────────────────────────────────────────────────────

export type CompletenessStatus = "OK" | "MISSING" | "EXPIRED" | "INVALID";
export type CompletenessSeverity = "high" | "medium" | "low";
export type CompletenessVerdict = "COMPLETE" | "CHASE" | "HOLD";

export interface ExpectedPiece {
  /** Business role: "Klage", "Gutachten", "Feuerwehrbericht" */
  role: string;
  /** Mappt auf LegalDocType aus doc-classifier.ts */
  docTypes: LegalDocType[];
  /** 0 = optional, 1 = required */
  minCount: number;
  /** null = any number OK */
  maxCount: number | null;
  /** Bedingung auf Fall-Felder (z.B. "loss_type == 'fire'") */
  requiredWhen?: string;
  /** Kann die Akte weitergehen, wenn dies fehlt? */
  blocksPayment: boolean;
  /** Mensch-lesbare Begründung */
  rationale: string;
}

export interface CompletenessRuleSet {
  id: string;
  version: string;
  description: string;
  caseType: string;
  pieces: ExpectedPiece[];
}

export interface ArrivedDocument {
  slug: string;
  title: string;
  docType: LegalDocType;
  confidence: number;
  uploadedAt?: string;
  /** Optional: Ablaufdatum für Versicherungen etc. */
  expiresAt?: string;
}

export interface CaseFields {
  /** Fall-spezifische Felder für conditional rules */
  [key: string]: string | number | boolean | undefined;
}

export interface CompletenessPieceResult {
  role: string;
  status: CompletenessStatus;
  severity: CompletenessSeverity;
  rationale: string;
  arrivedCount: number;
  expectedCount: number;
  blocksPayment: boolean;
  matchedSlugs: string[];
  /** Wenn EXPIRED: welches Dokument ist abgelaufen */
  expiredSlug?: string;
}

export interface CompletenessResult {
  ruleSetId: string;
  caseType: string;
  verdict: CompletenessVerdict;
  pieces: CompletenessPieceResult[];
  completenessPercent: number;
  checkedAt: string;
}

// ── Rule-Sets (DACH Fall-Typen) ────────────────────────────────────────
// In einer produktiven Umgebung würden diese als YAML-Dateien leben
// (z.B. server/src/core/legal/rules/*.yaml). Für jetzt sind sie inline
// als TypeScript-Objekte — leicht zu testen, typensicher, kein Parser nötig.

export const RULE_SETS: Record<string, CompletenessRuleSet> = {
  // ── Schadenersatz (AT/DE) ─────────────────────────────────────────────
  schadenersatz: {
    id: "schadenersatz-at-de",
    version: "1.0.0",
    description: "Schadenersatzfall — Vollständigkeit der Akte",
    caseType: "schadenersatz",
    pieces: [
      {
        role: "Klage / Klagebeantwortung",
        docTypes: ["pleading"],
        minCount: 1,
        maxCount: null,
        blocksPayment: true,
        rationale: "Klage oder Klagebeantwortung ist erforderlich für die rechtliche Prüfung.",
      },
      {
        role: "Vertrag / Geschäftsgrundlage",
        docTypes: ["contract"],
        minCount: 1,
        maxCount: null,
        blocksPayment: true,
        rationale: "Vertragliche Grundlage ist erforderlich zur Prüfung der Anspruchsgrundlage.",
      },
      {
        role: "Gutachten / Sachverständigenbericht",
        docTypes: ["expert_report", "medical_report"],
        minCount: 0,
        maxCount: null,
        blocksPayment: false,
        rationale: "Gutachten stützt die Schadenshöhe — empfohlen, aber nicht zwingend.",
      },
      {
        role: "Rechnungen / Kostennachweis",
        docTypes: ["invoice", "financial_record"],
        minCount: 1,
        maxCount: null,
        blocksPayment: false,
        rationale: "Rechnungen belegen die Schadenshöhe — erforderlich für Bezifferung.",
      },
      {
        role: "Polizeiliche Bestätigung",
        docTypes: ["police_report"],
        minCount: 0,
        maxCount: null,
        requiredWhen: "loss_type == 'theft'",
        blocksPayment: false,
        rationale: "Bei Diebstahl ist ein Polizeibericht erforderlich.",
      },
      {
        role: "Feuerwehrbericht",
        docTypes: ["police_report"],
        minCount: 1,
        maxCount: null,
        requiredWhen: "loss_type == 'fire'",
        blocksPayment: false,
        rationale: "Bei Brandschaden ist ein Feuerwehrbericht erforderlich.",
      },
      {
        role: "Gerichtliche Entscheidung",
        docTypes: ["court_order", "court_judgment"],
        minCount: 0,
        maxCount: null,
        blocksPayment: false,
        rationale: "Vorinstanzliche Entscheidungen — falls vorhanden, für Berufung relevant.",
      },
      {
        role: "Korrespondenz / Schriftverkehr",
        docTypes: ["correspondence"],
        minCount: 0,
        maxCount: null,
        blocksPayment: false,
        rationale: "Schriftverkehr kann Verhandlungsverlauf und Vergleichsangebote zeigen.",
      },
    ],
  },

  // ── Mietrecht (AT) ────────────────────────────────────────────────────
  mietrecht: {
    id: "mietrecht-at",
    version: "1.0.0",
    description: "Mietrechtlicher Streit — Vollständigkeit der Akte",
    caseType: "mietrecht",
    pieces: [
      {
        role: "Klage / Klagebeantwortung",
        docTypes: ["pleading"],
        minCount: 1,
        maxCount: null,
        blocksPayment: true,
        rationale: "Klage oder Klagebeantwortung ist erforderlich.",
      },
      {
        role: "Mietvertrag",
        docTypes: ["contract"],
        minCount: 1,
        maxCount: null,
        blocksPayment: true,
        rationale: "Mietvertrag ist die Anspruchsgrundlage — zwingend erforderlich.",
      },
      {
        role: "Zahlungsbelege / Mietkonto",
        docTypes: ["invoice", "financial_record"],
        minCount: 1,
        maxCount: null,
        blocksPayment: false,
        rationale: "Mietkonto zeigt Zahlungsverlauf — wichtig bei Mietrückständen.",
      },
      {
        role: "Schriftverkehr",
        docTypes: ["correspondence"],
        minCount: 1,
        maxCount: null,
        blocksPayment: false,
        rationale: "Schriftverkehr zeigt Mahnverlauf und Parteikommunikation.",
      },
      {
        role: "Gerichtliche Entscheidung",
        docTypes: ["court_order", "court_judgment"],
        minCount: 0,
        maxCount: null,
        blocksPayment: false,
        rationale: "Vorinstanzliche Entscheidungen falls vorhanden.",
      },
    ],
  },

  // ── Arbeitsrecht (AT/DE) ──────────────────────────────────────────────
  arbeitsrecht: {
    id: "arbeitsrecht-at-de",
    version: "1.0.0",
    description: "Arbeitsrechtlicher Streit — Vollständigkeit der Akte",
    caseType: "arbeitsrecht",
    pieces: [
      {
        role: "Klage / Klagebeantwortung",
        docTypes: ["pleading"],
        minCount: 1,
        maxCount: null,
        blocksPayment: true,
        rationale: "Klage oder Klagebeantwortung ist erforderlich.",
      },
      {
        role: "Arbeitsvertrag",
        docTypes: ["contract"],
        minCount: 1,
        maxCount: null,
        blocksPayment: true,
        rationale: "Arbeitsvertrag ist die Anspruchsgrundlage — zwingend erforderlich.",
      },
      {
        role: "Kündigung / Beendigungsschreiben",
        docTypes: ["correspondence"],
        minCount: 1,
        maxCount: null,
        requiredWhen: "dispute_type == 'termination'",
        blocksPayment: true,
        rationale: "Kündigungsschreiben ist bei Kündigungsstreit erforderlich.",
      },
      {
        role: "Gehaltsabrechnungen",
        docTypes: ["invoice", "financial_record"],
        minCount: 1,
        maxCount: null,
        blocksPayment: false,
        rationale: "Gehaltsabrechnungen belegen offene Ansprüche.",
      },
      {
        role: "Schriftverkehr",
        docTypes: ["correspondence"],
        minCount: 0,
        maxCount: null,
        blocksPayment: false,
        rationale: "Schriftverkehr zeigt Verhandlungsverlauf.",
      },
    ],
  },

  // ── Strafrecht (AT) ───────────────────────────────────────────────────
  strafrecht: {
    id: "strafrecht-at",
    version: "1.0.0",
    description: "Strafrechtliches Verfahren — Vollständigkeit der Akte",
    caseType: "strafrecht",
    pieces: [
      {
        role: "Anklageschrift / Strafantrag",
        docTypes: ["pleading", "strafantrag"],
        minCount: 1,
        maxCount: null,
        blocksPayment: true,
        rationale: "Anklageschrift oder Strafantrag ist erforderlich.",
      },
      {
        role: "Zeugenaussagen",
        docTypes: ["witness_statement"],
        minCount: 0,
        maxCount: null,
        blocksPayment: false,
        rationale: "Zeugenaussagen stützen oder entlasten den Vorwurf.",
      },
      {
        role: "Gutachten",
        docTypes: ["expert_report", "medical_report"],
        minCount: 0,
        maxCount: null,
        blocksPayment: false,
        rationale: "Gutachten (z.B. psychiatrisch, forensisch) falls erstellt.",
      },
      {
        role: "Akteneinsicht / Akteninhalt",
        docTypes: ["akteneinsicht"],
        minCount: 1,
        maxCount: null,
        blocksPayment: true,
        rationale: "Akteneinsicht ist erforderlich für die Verteidigung.",
      },
      {
        role: "Gerichtliche Entscheidung",
        docTypes: ["court_order", "court_judgment"],
        minCount: 0,
        maxCount: null,
        blocksPayment: false,
        rationale: "Vorinstanzliche Entscheidungen falls vorhanden.",
      },
    ],
  },
};

// ── Condition Evaluator ────────────────────────────────────────────────
// Minimaler Parser für `field == 'value'` und `field in [a, b]` conditions.
// Kein eval() — pure string matching.

function evaluateCondition(condition: string, fields: CaseFields): boolean {
  if (!condition || !condition.trim()) return true;

  // `field == 'value'`
  const eqMatch = condition.match(/^(\w+)\s*==\s*'([^']*)'$/);
  if (eqMatch) {
    const [, field, value] = eqMatch;
    return String(fields[field] ?? "") === value;
  }

  // `field in [a, b, c]`
  const inMatch = condition.match(/^(\w+)\s+in\s*\[([^\]]+)\]$/);
  if (inMatch) {
    const [, field, valuesStr] = inMatch;
    const values = valuesStr.split(",").map((v) => v.trim().replace(/^['"]|['"]$/g, ""));
    return values.includes(String(fields[field] ?? ""));
  }

  // `field exists`
  const existsMatch = condition.match(/^(\w+)\s+exists$/);
  if (existsMatch) {
    const [, field] = existsMatch;
    return fields[field] !== undefined && fields[field] !== "";
  }

  // Unknown condition format → fail-safe: don't require
  return false;
}

// ── Core Check Logic ───────────────────────────────────────────────────

/**
 * Prüft eine einzelne Expected-Piece gegen die eingetroffenen Dokumente.
 * Pure Funktion — testbar ohne Engine.
 */
export function checkPiece(
  piece: ExpectedPiece,
  arrived: ArrivedDocument[],
  fields: CaseFields,
  now: Date = new Date()
): CompletenessPieceResult {
  // Check condition first — if condition fails, piece is not required
  if (piece.requiredWhen && !evaluateCondition(piece.requiredWhen, fields)) {
    return {
      role: piece.role,
      status: "OK",
      severity: "low",
      rationale: `Nicht erforderlich in diesem Fall-Typ (${piece.requiredWhen} nicht erfüllt).`,
      arrivedCount: 0,
      expectedCount: 0,
      blocksPayment: false,
      matchedSlugs: [],
    };
  }

  // Find matching documents
  const matched = arrived.filter((d) => piece.docTypes.includes(d.docType));
  const matchedSlugs = matched.map((d) => d.slug);

  // Check expiration
  const nowMs = now.getTime();
  const expired = matched.find((d) => {
    if (!d.expiresAt) return false;
    const expMs = new Date(d.expiresAt).getTime();
    return !isNaN(expMs) && expMs < nowMs;
  });

  if (expired) {
    return {
      role: piece.role,
      status: "EXPIRED",
      severity: piece.blocksPayment ? "high" : "medium",
      rationale: piece.rationale + " (Dokument abgelaufen!)",
      arrivedCount: matched.length,
      expectedCount: piece.minCount,
      blocksPayment: piece.blocksPayment,
      matchedSlugs,
      expiredSlug: expired.slug,
    };
  }

  // Check count
  if (matched.length < piece.minCount) {
    return {
      role: piece.role,
      status: "MISSING",
      severity: piece.blocksPayment ? "high" : "medium",
      rationale: piece.rationale,
      arrivedCount: matched.length,
      expectedCount: piece.minCount,
      blocksPayment: piece.blocksPayment,
      matchedSlugs,
    };
  }

  // Check max count (too many documents of a type can indicate misfiling)
  if (piece.maxCount !== null && matched.length > piece.maxCount) {
    return {
      role: piece.role,
      status: "INVALID",
      severity: "low",
      rationale: `${piece.rationale} (Zu viele Dokumente: ${matched.length}, erwartet max. ${piece.maxCount})`,
      arrivedCount: matched.length,
      expectedCount: piece.minCount,
      blocksPayment: piece.blocksPayment,
      matchedSlugs,
    };
  }

  return {
    role: piece.role,
    status: "OK",
    severity: "low",
    rationale: piece.rationale,
    arrivedCount: matched.length,
    expectedCount: piece.minCount,
    blocksPayment: piece.blocksPayment,
    matchedSlugs,
  };
}

/**
 * Aggregiert Piece-Results zu einem Verdict.
 * Pure Funktion — testbar ohne Engine.
 */
export function computeVerdict(pieces: CompletenessPieceResult[]): {
  verdict: CompletenessVerdict;
  completenessPercent: number;
} {
  const total = pieces.length;
  if (total === 0) return { verdict: "COMPLETE", completenessPercent: 100 };

  const okCount = pieces.filter((p) => p.status === "OK").length;
  const hasBlockerMissing = pieces.some(
    (p) =>
      p.blocksPayment &&
      (p.status === "MISSING" || p.status === "EXPIRED" || p.status === "INVALID")
  );
  const hasRequiredMissing = pieces.some(
    (p) => !p.blocksPayment && p.status === "MISSING" && p.severity === "medium"
  );

  const completenessPercent = Math.round((okCount / total) * 100);

  let verdict: CompletenessVerdict;
  if (hasBlockerMissing) {
    verdict = "HOLD";
  } else if (hasRequiredMissing) {
    verdict = "CHASE";
  } else {
    verdict = "COMPLETE";
  }

  return { verdict, completenessPercent };
}

/**
 * Hauptfunktion: führt Completeness-Check für eine Akte durch.
 * Pure Funktion — nimmt arrived docs + fields, gibt Result zurück.
 */
export function runCompletenessCheck(
  ruleSetId: string,
  arrived: ArrivedDocument[],
  fields: CaseFields = {},
  now: Date = new Date()
): CompletenessResult {
  const ruleSet = RULE_SETS[ruleSetId];
  if (!ruleSet) {
    return {
      ruleSetId,
      caseType: "unknown",
      verdict: "HOLD",
      pieces: [],
      completenessPercent: 0,
      checkedAt: now.toISOString(),
    };
  }

  const pieces = ruleSet.pieces.map((piece) => checkPiece(piece, arrived, fields, now));
  const { verdict, completenessPercent } = computeVerdict(pieces);

  return {
    ruleSetId: ruleSet.id,
    caseType: ruleSet.caseType,
    verdict,
    pieces,
    completenessPercent,
    checkedAt: now.toISOString(),
  };
}

/**
 * Erkennt den Fall-Typ anhand der Dokumente und Felder.
 * Heuristisch: wenn ≥2 Verträge + Klage → Schadenersatz/Mietrecht;
 * wenn Kündigungsschreiben → Arbeitsrecht; wenn Strafantrag → Strafrecht.
 */
export function detectCaseType(arrived: ArrivedDocument[], fields: CaseFields = {}): string {
  const types = arrived.map((d) => d.docType);
  const hasPleading = types.includes("pleading");
  const hasContract = types.includes("contract");
  const hasStrafantrag = types.includes("strafantrag");
  const hasAkteneinsicht = types.includes("akteneinsicht");
  const hasWitness = types.includes("witness_statement");

  if (hasStrafantrag || hasAkteneinsicht || (hasWitness && !hasContract)) {
    return "strafrecht";
  }

  const disputeType = String(fields.dispute_type ?? "");
  if (disputeType === "termination" || disputeType === "arbeitsrecht") {
    return "arbeitsrecht";
  }

  const lossType = String(fields.loss_type ?? "");
  if (lossType === "fire" || lossType === "theft" || lossType === "schadenersatz") {
    return "schadenersatz";
  }

  if (hasContract && hasPleading) {
    // Default civil dispute with contract → mietrecht or schadenersatz
    return "schadenersatz";
  }

  return "schadenersatz"; // safe default
}
