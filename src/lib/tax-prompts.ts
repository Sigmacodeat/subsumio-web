/**
 * Tax-specific AI prompt templates.
 * These templates are used by the tax analyze/summarize pipelines
 * and can be injected into the engine's /api/think endpoint.
 *
 * Analog to legal-chat prompt patterns but focused on:
 * - German tax law (AO, EStG, UStG, KStG, GewStG, ErbStG, BewG, StBVV)
 * - Tax deadlines (§ 149 AO, § 109 AO, § 226 AO, § 355 AO, etc.)
 * - Tax assessment analysis (Bescheide, Einsprüche, Betriebsprüfung)
 * - StBVV fee calculation context
 */

export interface TaxPromptContext {
  jurisdiction?: "DE" | "AT";
  taxType?: "ESt" | "USt" | "KSt" | "GewSt" | "ErbSt" | "LSt" | "unknown";
  assessmentPeriod?: string;
  clientName?: string;
}

/**
 * System prompt for tax document analysis.
 * Used by /api/tax/analyze to instruct the LLM to extract tax-relevant information.
 */
export function taxAnalysisSystemPrompt(ctx: TaxPromptContext = {}): string {
  const jur = ctx.jurisdiction ?? "DE";
  const taxType = ctx.taxType ?? "unknown";
  const period = ctx.assessmentPeriod ?? "unbekannt";

  return `Du bist ein qualifizierter Steuerberater (StBerG) mit Spezialisierung auf ${jur === "DE" ? "deutsches" : "österreichisches"} Steuerrecht.

Deine Aufgabe: Analysiere Steuerdokumente mit höchster Sorgfalt und professioneller Genauigkeit.

Geltungsbereich:
- AO (Abgabenordnung): Verfahrensrecht, Fristen, Einsprüche
- EStG, KStG, GewStG, UStG, ErbStG: Materielles Steuerrecht
- BewG: Bewertung
- StBVV: Vergütung
- Steuerart: ${taxType}
- Veranlagungszeitraum: ${period}

KRITISCHE REGELN:
1. Erfinde NIEMALS Gesetzesnormen oder Paragraphen
2. Zitiere AUSSCHLIESSLICH Normen, die im Dokument stehen oder zwingend anwendbar sind
3. Bei Fristen: gib immer die gesetzliche Grundlage an (z.B. "§ 109 AO: 1 Monat nach Zustellung")
4. Bei Beträgen: prüfe Plausibilität gegen bekannte Steuersätze
5. Flagge Widersprüche zwischen Bescheid und Erklärung

Antworte immer auf Deutsch, außer der Mandant verlangt Englisch.`;
}

/**
 * System prompt for tax document summarization.
 * Used by /api/tax/summarize to generate concise summaries of tax documents.
 */
export function taxSummarizeSystemPrompt(ctx: TaxPromptContext = {}): string {
  const jur = ctx.jurisdiction ?? "DE";

  return `Du bist ein Steuerberater-Assistent. Fasse Steuerdokumente präzise und handlungsorientiert zusammen.

Fokus:
- Steuerart und Veranlagungszeitraum
- Festgesetzte Steuer / Nachzahlung / Erstattung
- Fristen (Einspruch, Zahlung, Berichtigung)
- Handlungsbedarf für den Steuerberater
- Risiko-Bewertung (Verspätungszuschlag, Hinterziehung)

Rechtsordnung: ${jur}
Antworte auf Deutsch in maximal 3 Sätzen (brief) oder 5 Sätzen (standard/detailed).`;
}

/**
 * Prompt for tax deadline extraction from documents.
 * Returns structured deadline data with legal basis.
 */
export function taxDeadlineExtractionPrompt(text: string): string {
  const safeText = text.replace(/[<>]/g, "").slice(0, 50_000);

  return `Extrahiere alle Steuerfristen aus dem folgenden Dokument.

Für jede Frist gib an:
- label: Bezeichnung (z.B. "Einspruchsfrist", "Zahlungsfrist")
- date: Datum im ISO-Format (YYYY-MM-DD)
- legal_basis: Gesetzliche Grundlage (z.B. "§ 109 AO", "§ 226 AO")
- urgency: "critical" (≤ 7 Tage), "warning" (≤ 30 Tage), "normal"
- action: Was getan werden muss

Dokument:
---
${safeText}
---

Antworte als JSON-Array:
[{"label":"string","date":"string","legal_basis":"string","urgency":"critical|warning|normal","action":"string"}]`;
}

/**
 * Prompt for tax risk assessment.
 * Analyzes a tax document for potential risks.
 */
export function taxRiskAssessmentPrompt(text: string, ctx: TaxPromptContext = {}): string {
  const safeText = text.replace(/[<>]/g, "").slice(0, 50_000);
  const taxType = ctx.taxType ?? "unknown";

  return `Bewerte die steuerlichen Risiken im folgenden Dokument.

Steuerart: ${taxType}
Prüfe insbesondere:
1. Verspätungszuschlag (§ 152 AO) — sind Fristen gefährdet?
2. Steuerschätzung (§ 162 AO) — liegt eine Schätzung vor?
3. Steuerhinterziehung (§ 370 AO) — Anzeichen für unrichtige Angaben?
4. Festsetzungsverjährung (§ 477 AO) — ist die Festsetzungsfrist gewahrt?
5. Einspruchsfrist (§ 109 AO) — ist noch Zeit für Rechtsbehelfe?

Dokument:
---
${safeText}
---

Antworte als JSON:
{
  "risks": [{"severity":"high|medium|low","description":"string","legal_basis":"string","mitigation":"string"}],
  "overall_risk_level": "high|medium|low",
  "recommendation": "string"
}`;
}

/**
 * Prompt for tax return plausibility check.
 * Compares declared values against typical ranges.
 */
export function taxReturnPlausibilityPrompt(
  taxType: string,
  declaredValues: Record<string, number>
): string {
  const valuesStr = Object.entries(declaredValues)
    .map(([key, val]) => `${key}: ${val}`)
    .join("\n");

  return `Prüfe die Plausibilität der folgenden Steuererklärungswerte.

Steuerart: ${taxType}

Erklärte Werte:
${valuesStr}

Prüfe:
1. Sind die Werte im typischen Bereich für diese Steuerart?
2. Gibt es Auffälligkeiten, die zu einer Betriebsprüfung führen könnten?
3. Fehlen offensichtliche Angaben?

Antworte als JSON:
{
  "plausible": true|false,
  "anomalies": [{"field":"string","issue":"string","severity":"high|medium|low"}],
  "missing_fields": ["string"],
  "recommendation": "string"
}`;
}
