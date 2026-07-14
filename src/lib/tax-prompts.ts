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

export type TaxJurisdiction = "DE" | "AT" | "CH";

export interface TaxPromptContext {
  jurisdiction?: TaxJurisdiction;
  taxType?: "ESt" | "USt" | "KSt" | "GewSt" | "ErbSt" | "LSt" | "unknown";
  assessmentPeriod?: string;
  clientName?: string;
}

const JUR_LABELS: Record<TaxJurisdiction, string> = {
  DE: "Deutschland (AO, FGO, BFH)",
  AT: "Österreich (BAO, BFG, VwGH)",
  CH: "Schweiz (DBG, MWSTG, StHG, BVGER)",
};

const JUR_ADJECTIVES: Record<TaxJurisdiction, string> = {
  DE: "deutsches",
  AT: "österreichisches",
  CH: "schweizerisches",
};

const JUR_DEADLINE_HINTS: Record<TaxJurisdiction, string> = {
  DE: "§ 355 AO: 1 Monat ab Bekanntgabe. Bekanntgabefiktion: 3 Tage nach Aufgabe zur Post (§ 122 AO).",
  AT: "§ 245 BAO: 1 Monat ab Zustellung.",
  CH: "Art. 108 DBG: 30 Tage ab Zustellung.",
};

function jurLabel(jur?: TaxJurisdiction): string {
  return JUR_LABELS[jur ?? "DE"];
}

function jurAdjective(jur?: TaxJurisdiction): string {
  return JUR_ADJECTIVES[jur ?? "DE"];
}

function jurDeadlineHint(jur?: TaxJurisdiction): string {
  return JUR_DEADLINE_HINTS[jur ?? "DE"];
}

/**
 * System prompt for tax document analysis.
 * Used by /api/tax/analyze to instruct the LLM to extract tax-relevant information.
 */
export function taxAnalysisSystemPrompt(ctx: TaxPromptContext = {}): string {
  const jur = ctx.jurisdiction ?? "DE";
  const taxType = ctx.taxType ?? "unknown";
  const period = ctx.assessmentPeriod ?? "unbekannt";

  return `Du bist ein qualifizierter Steuerberater (StBerG) mit Spezialisierung auf ${jurAdjective(jur)} Steuerrecht.

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

Rechtsordnung: ${jurLabel(jur)}
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
  const jur = ctx.jurisdiction ?? "DE";

  return `Bewerte die steuerlichen Risiken im folgenden Dokument.

Steuerart: ${taxType}
Rechtsordnung: ${jurLabel(jur)}
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

// ── Centralized prompt builders for all tax API routes ──

/**
 * Prompt for /api/tax/analyze — full document analysis.
 */
export function buildTaxAnalyzePrompt(text: string, jurisdiction: string): string {
  const jur = jurisdiction === "all" ? "DE oder AT" : jurisdiction.toUpperCase();
  const safeText = text.replace(/[<>]/g, "");

  return `Du bist ein ${jur === "CH" ? "schweizer" : jur === "AT" ? "österreichischer" : "deutscher"} Steuerexperte (Steuerberater). Analysiere das folgende Steuerdokument.

KRITISCHE REGEL: Du darfst KEINE Gesetzesnormen erfinden oder raten. Nenne AUSSCHLIESSLICH §-Paragraphen, die EXPLIZIT im Dokument genannt werden oder sich zwingend logisch aus dem Dokumenttyp ergeben (Steuerbescheid → § 122 AO, Einspruch → § 347 AO, etc.).

Antworte AUSSCHLIESSLICH als gültiges JSON ohne Markdown-Codeblock, keine anderen Zeichen außerhalb des JSON.

Dokument:
---
${safeText}
---

Steuerordnung: ${jur}

Extrahiere:
1. document_type: Steuerbescheid | Steuererklärung | Einspruch | Berufung | Betriebsprüfungsbericht | Buchführungsunterlage | Jahresabschluss | Lohnabrechnung | Umsatzsteuervoranmeldung | Korrespondenz | sonstiges
2. type_confidence: 0.0–1.0 (wie sicher bist du beim document_type)
3. parties: Vollständige Namen der Beteiligten (Mandant, Finanzamt, Betriebsprüfer, sonstige)
4. deadlines: Steuerfristen und Daten aus dem Dokument (§ 109 AO Einspruchsfrist, § 226 AO Zahlungsfrist, § 149 AO Erklärungsfrist, etc.)
5. cited_statutes: Nur §§ die im Dokument stehen ODER zwingend anwendbar sind (AO, EStG, UStG, KStG, GewStG, ErbStG, BewG, StBVV)
6. risks: Konkrete steuerliche Risiken mit Schweregrad (Nachzahlung, Verspätungszuschlag, Hinterziehung)
7. action_items: Nächste konkrete Schritte für den Steuerberater
8. summary: 2-3 präzise Sätze
9. language: de | en | other
10. tax_details: Steuerliche Details
    - tax_type: ESt | USt | KSt | GewSt | ErbSt | LSt | sonstige
    - assessment_period: Veranlagungszeitraum (z.B. "2024")
    - assessed_amount: festgesetzte Steuer (falls im Dokument)
    - payment_due_date: Fälligkeitsdatum
    - interest_amount: Zinsbetrag (§ 233 AO) falls vorhanden

Antworte JETZT mit reinem JSON:
{
  "document_type": "string",
  "type_confidence": 0.0,
  "parties": [{"name":"string","role":"Mandant|Finanzamt|Betriebsprüfer|sonstige"}],
  "deadlines": [{"label":"string","date":"string","urgency":"critical|normal","source":"exact quote from document","legal_basis":"§ XYZ AO"}],
  "cited_statutes": [{"code":"string","paragraph":"string","context":"why this statute applies"}],
  "risks": [{"severity":"high|medium|low","description":"string","mitigation":"string"}],
  "action_items": ["string"],
  "summary": "string",
  "language": "string",
  "tax_details": {
    "tax_type": "string",
    "assessment_period": "string",
    "assessed_amount": null,
    "payment_due_date": "string",
    "interest_amount": null
  }
}`;
}

/**
 * Prompt for /api/tax/appeal-generator — Einspruchsentwurf.
 */
export function buildTaxAppealPrompt(opts: {
  clientName: string;
  taxType: string;
  year: number | string;
  noticeNumber: string;
  noticeDate: string;
  amount: number | string;
  notes: string;
  contestedPoints?: string;
  jurisdiction: TaxJurisdiction;
  language?: "de" | "en";
}): string {
  const langHint = opts.language === "en" ? "Antworte auf Englisch." : "Antworte auf Deutsch.";

  return `Du bist ein erfahrener Steuerberater und Fachanwalt für Steuerrecht (${jurLabel(opts.jurisdiction)}).
Analysiere den folgenden Steuerbescheid und generiere einen Einspruchsentwurf.

BESCHEIDDATEN:
- Mandant: ${opts.clientName}
- Steuerart: ${opts.taxType}
- Veranlagungszeitraum: ${opts.year}
- Bescheidnummer: ${opts.noticeNumber}
- Bescheiddatum: ${opts.noticeDate}
- Festgesetzte Steuer: ${opts.amount} EUR
- Notizen/Inhalt: ${opts.notes}
${opts.contestedPoints ? `- Vom Mandanten beanstandete Punkte: ${opts.contestedPoints}` : ""}

${langHint}
Berechne die Einspruchsfrist (${jurDeadlineHint(opts.jurisdiction)}).

Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown):
{
  "assessment_summary": "Kurzzusammenfassung des Bescheids (2-3 Sätze)",
  "contested_points": [
    {
      "position": "Bezeichnung der streitigen Position",
      "tax_office_view": "Auffassung des Finanzamts",
      "taxpayer_view": "Auffassung des Steuerpflichtigen",
      "legal_basis": "§ X Gesetz",
      "disputed_amount": 0,
      "success_prospect": "stark|mittel|schwach|keine",
      "required_evidence": ["Benötigte Nachweise"]
    }
  ],
  "success_prospect_summary": "Gesamtbewertung der Erfolgsaussichten (2-3 Sätze)",
  "total_disputed_amount": 0,
  "draft_letter": {
    "recipient": "Finanzamt ...",
    "subject": "Einspruch gegen den ...-Bescheid ... vom ...",
    "body": "Vollständiger Einspruchsschreiben-Text mit rechtlicher Begründung",
    "requests": ["Antrag 1", "Antrag 2"]
  },
  "recommendations": ["Empfohlene Maßnahmen"]
}`;
}

/**
 * Prompt for /api/tax/client-letter — Mandantenbrief.
 */
export function buildTaxClientLetterPrompt(opts: {
  clientName: string;
  clientType: string;
  clientAddress: string;
  clientTaxNumber: string;
  clientEmail: string;
  notes: string;
  occasionLabel: string;
  keyPoints?: string;
  language?: "de" | "en";
}): string {
  const langHint = opts.language === "en" ? "Antworte auf Englisch." : "Antworte auf Deutsch.";

  return `Du bist ein Steuerberater-Assistent, der professionelle Mandantenanschreiben verfasst.

MANDANTENDATEN:
- Name: ${opts.clientName}
- Typ: ${opts.clientType === "company" ? "Unternehmen" : "Person"}
- Adresse: ${opts.clientAddress}
- Steuernummer: ${opts.clientTaxNumber}
- E-Mail: ${opts.clientEmail}
- Notizen: ${opts.notes}

ANLASS: ${opts.occasionLabel}
${opts.keyPoints ? `Wichtige Punkte: ${opts.keyPoints}` : ""}

${langHint}
Verfasse ein professionelles, persönliches Anschreiben an den Mandanten.
Der Ton soll professionell aber freundlich sein (Sie-Form).
Bei Unternehmen: "Sehr geehrte Damen und Herren", bei Personen: "Sehr geehrte(r) Frau/Herr ...".

Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown):
{
  "recipient_name": "${opts.clientName}",
  "recipient_address": "${opts.clientAddress}",
  "subject": "Betreffzeile",
  "body": "Vollständiger Brief-Text mit Anrede, Hauptteil und Schluss",
  "key_points": ["Punkt 1", "Punkt 2"],
  "call_to_action": "Was der Mandant tun soll"
}`;
}

/**
 * Prompt for /api/tax/bfh-feed — BFH-Rechtsprechungs-Feed.
 */
export function buildTaxBfhFeedPrompt(opts: {
  topic: string;
  jurisdiction: TaxJurisdiction;
  corpusResults: Array<{ title: string; snippet: string }>;
}): string {
  const corpusBlock =
    opts.corpusResults.length > 0
      ? "Verfügbare Corpus-Ergebnisse:\n" +
        opts.corpusResults.map((r) => `- ${r.title}: ${r.snippet.slice(0, 200)}`).join("\n")
      : "Keine Corpus-Ergebnisse verfügbar, verwende dein Wissen über aktuelle BFH-Rechtsprechung.";

  return `Du bist ein Steuerrechtsexperte für ${jurLabel(opts.jurisdiction)}.
Analysiere die aktuelle Rechtsprechung zum Thema: "${opts.topic}".

${corpusBlock}

Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown):
{
  "decisions": [
    {
      "court": "BFH" oder "FG" etc.,
      "file_number": "Az. (z.B. VI R 42/23)",
      "date": "YYYY-MM-DD",
      "topic": "Thema der Entscheidung",
      "summary": "Zusammenfassung (3-5 Sätze)",
      "key_holdings": ["Leitsatz 1", "Leitsatz 2"],
      "legal_basis": ["§ X Gesetz"],
      "relevance": "high|medium|low"
    }
  ],
  "topic_summary": "Überblick über die aktuellen Entwicklungen (3-5 Sätze)"
}`;
}

/**
 * Prompt for /api/tax/precedent-search — Präzedenten-Suche.
 */
export function buildTaxPrecedentSearchPrompt(opts: {
  query: string;
  jurisdiction: TaxJurisdiction;
  limit: number;
}): string {
  return `Du bist ein Steuerrecht-Recherche-Experte (${jurLabel(opts.jurisdiction)}).
Suche relevante BFH-Urteile und Finanzgerichtsurteile zur folgenden Frage.

FRAGE:
${opts.query}

Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown), maximal ${opts.limit} Ergebnisse:
{
  "precedents": [
    {
      "court": "BFH | FG <Stadt> | BVerfG",
      "date": "YYYY-MM-DD",
      "file_number": "z.B. VI R 42/23",
      "summary": "Kurzzusammenfassung der Entscheidung (2-3 Sätze)",
      "relevance": 0.0-1.0,
      "key_holdings": ["Leitsätze/Kernaussagen"],
      "legal_basis": ["§ XYZ EStG", "§ XYZ AO"]
    }
  ]
}

WICHTIG: Nenne NUR reale, existierende Urteile. Erfinde KEINE Aktenzeichen oder Daten.
Wenn du keine relevanten Urteile kennst, gib ein leeres Array zurück.`;
}

/**
 * Prompt for /api/tax/risk-analysis — Risikoanalyse.
 */
export function buildTaxRiskAnalysisPrompt(opts: {
  text: string;
  jurisdiction: TaxJurisdiction;
}): string {
  return `Du bist ein Steuerberater-Risikoanalyst (${jurLabel(opts.jurisdiction)}).
Analysiere die folgenden Steuerdaten auf Risiken.

STEUERDATEN:
---
${opts.text}
---

Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown):
{
  "overall_risk_level": "low|medium|high",
  "risks": [
    {
      "category": "Nachzahlung|Verspätungszuschlag|Hinterziehung|Betriebsprüfung|Sonstiges",
      "description": "Konkrete Risikobeschreibung",
      "severity": "low|medium|high",
      "potential_amount": null,
      "mitigation": "Empfohlene Maßnahme",
      "legal_basis": "§ XYZ AO"
    }
  ],
  "recommendations": ["Konkrete Empfehlungen"]
}`;
}

/**
 * Prompt for /api/tax/case-strategy — Strategieempfehlung.
 */
export function buildTaxCaseStrategyPrompt(opts: {
  clientName: string;
  taxType: string;
  year: number | string;
  status: string;
  taxAmount?: number;
  refundAmount?: number;
  notes: string;
  jurisdiction: TaxJurisdiction;
  language?: "de" | "en";
}): string {
  const langHint = opts.language === "en" ? "Antworte auf Englisch." : "Antworte auf Deutsch.";

  return `Du bist ein erfahrener Steuerberater-Strategie-Berater (${jurLabel(opts.jurisdiction)}).
Analysiere die folgende Steuererklärung und entwickle eine Strategieempfehlung.

STEUERERKLÄRUNGSDATEN:
- Mandant: ${opts.clientName}
- Steuerart: ${opts.taxType}
- Jahr: ${opts.year}
- Status: ${opts.status}
- Festgesetzte Steuer: ${opts.taxAmount ?? "nicht bekannt"}
- Erstattung: ${opts.refundAmount ?? "keine"}
- Notizen: ${opts.notes}

${langHint}
Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown):
{
  "summary": "Kurzzusammenfassung der steuerlichen Situation (2-3 Sätze)",
  "recommended": "Empfohlene Strategie in einem Satz",
  "recommendedApproach": "Detaillierte Beschreibung des empfohlenen Vorgehens (3-5 Sätze)",
  "risks": [
    {
      "description": "Risikobeschreibung",
      "probability": "high|medium|low",
      "impact": "high|medium|low",
      "mitigation": "Empfohlene Maßnahme zur Risikominimierung"
    }
  ],
  "next_steps": ["Konkrete nächste Schritte"],
  "cost_estimate": {
    "min": 0,
    "max": 0,
    "currency": "EUR",
    "basis": "Schätzung basierend auf..."
  },
  "success_probability": 0.0
}`;
}

/**
 * Prompt for /api/tax/triage — Steuer-Triage AI-Klassifizierung.
 */
export function buildTaxTriagePrompt(opts: {
  subject: string;
  body: string;
  sender: string;
  date: string;
  jurisdiction: TaxJurisdiction;
}): string {
  return `Du bist ein Steuerrecht-Triage-Assistent (${jurLabel(opts.jurisdiction)}).
Analysiere die folgende eingehende Nachricht und klassifiziere sie steuerrechtlich.

NACHRICHT:
Betreff: ${opts.subject}
Absender: ${opts.sender}
Datum: ${opts.date}
Inhalt: ${opts.body.slice(0, 4000)}

Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (kein Markdown):
{
  "document_type": "steuerbescheid|einspruch|betriebspruefung|voranmeldung|vorauszahlung|zahlungserinnerung|steuererklaerung|datev_import|spendenquittung|lohnabrechnung|finanzamt_schreiben|gerichtsurteil|anwaltsschreiben|sonstiges",
  "tax_area": "einkommensteuer|umsatzsteuer|koerperschaftsteuer|gewerbesteuer|erbschaftsteuer|lohnsteuer|abgabenordnung|steuerstrafrecht|international|sonstiges",
  "deadline_type": "einspruch|berufung|klage|revision|voranmeldung|vorauszahlung|festsetzung|verjaehrung|null",
  "deadline_date": "YYYY-MM-DD oder null",
  "deadline_legal_basis": "§ X Gesetz oder null",
  "required_actions": ["Konkrete Maßnahmen, die zu ergreifen sind"],
  "risk_level": "critical|high|medium|low",
  "estimated_amount": numerischer_Wert_oder_null,
  "jurisdiction": "${opts.jurisdiction.toLowerCase()}",
  "key_entities": [
    {"label": "Steuernummer", "value": "..."},
    {"label": "Bescheidnummer", "value": "..."},
    {"label": "Veranlagungszeitraum", "value": "..."}
  ]
}

WICHTIG:
- Erfinde KEINE Fristen oder Beträge, wenn sie nicht explizit im Text stehen.
- Bei Steuerbescheiden: Prüfe auf Einspruchsfrist (${jurDeadlineHint(opts.jurisdiction)}).
- Bei Betriebsprüfungen: Markiere als critical.
- Bei Steuerhinterziehung/Selbstanzeige: Markiere als critical und konflikt.`;
}
