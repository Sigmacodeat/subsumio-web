import { sanitizeUserInput } from "@/lib/prompt-sanitizer";

/**
 * Build the LLM analysis prompt for inline-text document analysis.
 *
 * The prompt instructs the model to act as a DACH legal expert, extract
 * structured fields (parties, deadlines, statutes, risks, privilege),
 * and return pure JSON — no markdown fences.
 *
 * Used by Route B (/api/think) when no document_slug is available.
 */
export function buildAnalysisPrompt(text: string, jurisdiction: string): string {
  const jurHint =
    jurisdiction === "all"
      ? "AT (\u00d6sterreich), DE (Deutschland) oder CH (Schweiz)"
      : jurisdiction.toUpperCase();

  const safeText = sanitizeUserInput(text);

  return `Du bist ein \u00f6sterreichischer/deutscher Rechtsexperte. Analysiere das folgende Rechtsdokument.

KRITISCHE REGEL: Du darfst KEINE Gesetzesnormen erfinden oder raten. Nenne AUSSCHLIESSLICH \u00a7-Paragraphen, die EXPLIZIT im Dokument genannt werden oder sich zwingend logisch aus dem Dokumenttyp ergeben (Kaufvertrag \u2192 \u00a7 433 BGB, Gew\u00e4hrleistung \u2192 \u00a7 922 ABGB, etc.).

Antworte AUSSCHLIESSLICH als g\u00fcltiges JSON ohne Markdown-Codeblock, keine anderen Zeichen au\u00dferhalb des JSON.

Dokument:
---
${safeText}
---

Rechtsordnung: ${jurHint}

Extrahiere:
1. document_type: Kaufvertrag | Mietvertrag | Arbeitsvertrag | Gerichtsurteil | Schriftsatz | Mahnschreiben | Anwaltsschreiben | Rechnung | Gesetzesentwurf | Korrespondenz | sonstiges
2. type_confidence: 0.0\u20131.0 (wie sicher bist du beim document_type)
3. parties: Vollst\u00e4ndige Namen der Beteiligten (Klient, Gegner, Gericht, Beh\u00f6rde)
4. deadlines: Fristen und Daten aus dem Dokument
5. cited_statutes: Nur \u00a7\u00a7 die im Dokument stehen ODER zwingend anwendbar sind
6. risks: Konkrete rechtliche Risiken mit Schweregrad
7. action_items: N\u00e4chste konkrete Schritte f\u00fcr den Anwalt
8. summary: 2-3 pr\u00e4zise S\u00e4tze
9. language: de | en | other
10. privilege: Pr\u00fcfe ob das Dokument dem anwaltlichen Geheimnisschutz unterliegt
    - is_privileged: true wenn es sich um anwaltliche Kommunikation, Mandatsbriefe, interne Notizen, oder Dokumente mit anwaltlicher Stellungnahme handelt
    - privilege_type: "attorney_client" | "work_product" | "settlement_negotiation" | "none"
    - privilege_basis: Kurze Begr\u00fcndung warum privilegiert oder nicht

Hinweis: Nach deiner Analyse wird automatisch nach relevanten Gerichtsentscheidungen (OGH, BGH, BFH, EuGH) gesucht. Deine zitierten Normen und Risiko-Beschreibungen werden als Suchkriterien verwendet — formuliere sie präzise.

Antworte JETZT mit reinem JSON:
{
  "document_type": "string",
  "type_confidence": 0.0,
  "parties": [{"name":"string","role":"Klient|Gegner|Gericht|Beh\u00f6rde|Zeuge|sonstige"}],
  "deadlines": [{"label":"string","date":"string","urgency":"critical|normal","source":"exact quote from document"}],
  "cited_statutes": [{"code":"string","paragraph":"string","context":"why this statute applies"}],
  "risks": [{"severity":"high|medium|low","description":"string","mitigation":"string"}],
  "action_items": ["string"],
  "summary": "string",
  "language": "string",
  "privilege": {
    "is_privileged": false,
    "privilege_type": "none",
    "privilege_basis": "string"
  }
}`;
}
