/**
 * Cross-Model Citation Verifier — Tier 1
 *
 * After Tier-0 deterministic guardrail, this module sends the answer + context
 * to a deep-tier model (Grok 4.3) for semantic hallucination detection.
 *
 * Unlike the deterministic guardrail (regex-based), this catches:
 * - §-citations that exist in context but are misapplied to wrong facts
 * - Definitions derived/interpolated rather than quoted
 * - Cross-law confusion (citing DE § for AT case)
 * - Subtle fabrications that pass regex checks
 *
 * Cost: ~$0.003/query (Grok 4.3, ~500 tokens output)
 * Only runs in legalMode (auto-detected from page types).
 */

import { chat as gatewayChat, type ChatMessage } from "../ai/gateway.ts";
import { resolveModel } from "../model-config.ts";
import type { BrainEngine } from "../engine.ts";

export interface CrossVerifyFlag {
  type: string;
  detail: string;
  citation?: string;
  severity: "high" | "medium" | "low";
}

export interface CrossVerifyResult {
  clean: boolean;
  flags: CrossVerifyFlag[];
  verified_citations: string[];
  flagged_citations: string[];
  /** True when the verifier itself failed (technical error, no model, parse failure).
   *  Callers MUST treat this as NEEDS_HUMAN_REVIEW, never as VERIFIED. */
  verifier_error?: boolean;
}

const VERIFY_SYSTEM_PROMPT = `Du bist ein juristischer Zitations-Verifier. Du prüfst, ob jede §-Zitat in einer Antwort tatsächlich durch den Kontext gedeckt ist.

PRÜFE FOLGENDES:
1. EXISTENZ: Jeder zitierte § muss wörtlich im Kontext vorkommen
2. ANWENDUNG: Der § wird korrekt auf den Sachverhalt angewendet (nicht falsch interpretiert)
3. JURISDIKTION: Bei AT-Fällen werden keine DE-§§ zitiert (und umgekehrt)
4. ABLEITUNG: Keine Definitionen oder Erklärungen, die nicht wörtlich im Kontext stehen
5. ERFINDUNG: Keine fingierten Artikel, Verordnungen oder Richtlinien

OUTPUT: JSON mit folgender Struktur:
{
  "clean": true | false,
  "flags": [
    {
      "type": "ungrounded_citation|wrong_application|jurisdiction_mismatch|derived_definition|fabricated_reference",
      "detail": "Kurze Beschreibung des Problems",
      "citation": "Der zitierte §",
      "severity": "high|medium|low"
    }
  ],
  "verified_citations": ["§ 1 AHG", "§ 1311 ABGB"],
  "flagged_citations": ["§ 14 UGB"]
}

Nur JSON. Kein Markdown.`;

export async function crossVerifyCitations(
  answer: string,
  context: string,
  jurisdiction?: string,
  engine?: BrainEngine | null
): Promise<CrossVerifyResult> {
  // Fail-closed: when the verifier itself fails (no model, no output, parse
  // error, exception), we return clean=false with a verifier_error flag.
  // This forces callers to route the output to NEEDS_HUMAN_REVIEW instead
  // of silently treating it as verified.
  const verifierErrorFallback: CrossVerifyResult = {
    clean: false,
    flags: [
      {
        type: "verifier_error",
        detail: "Cross-verify failed (technical error) — human review required",
        severity: "high",
      },
    ],
    verified_citations: [],
    flagged_citations: [],
    verifier_error: true,
  };

  try {
    const model = await resolveModel(engine ?? null, {
      tier: "deep",
      fallback: "x-ai:grok-4-3",
    });
    if (!model) return verifierErrorFallback;

    const userPrompt = [
      `## JURISDIKTION: ${jurisdiction ?? "unbekannt"}`,
      "",
      "## KONTEXT (Rechtsquellen)",
      context.slice(0, 24_000),
      "",
      "## ANTWORT (zu prüfen)",
      answer.slice(0, 8_000),
      "",
      "Prüfe JEDEN zitierten § in der Antwort gegen den Kontext.",
      "Markiere nur §-Zitate, die NICHT im Kontext stehen oder falsch angewendet werden.",
      "Wenn alle Zitate korrekt sind: clean=true, flags=[].",
    ].join("\n");

    const messages: ChatMessage[] = [{ role: "user", content: userPrompt }];
    const result = await gatewayChat({
      model,
      system: VERIFY_SYSTEM_PROMPT,
      messages,
      maxTokens: 1500,
    });

    if (!result.text) return verifierErrorFallback;

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return verifierErrorFallback;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<CrossVerifyResult>;
    return {
      clean: Boolean(parsed.clean),
      flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      verified_citations: Array.isArray(parsed.verified_citations) ? parsed.verified_citations : [],
      flagged_citations: Array.isArray(parsed.flagged_citations) ? parsed.flagged_citations : [],
    };
  } catch {
    return verifierErrorFallback;
  }
}

export function buildCrossVerifyRegenerationPrompt(
  originalSystem: string,
  verifyResult: CrossVerifyResult
): string {
  const flagList = verifyResult.flags
    .map((f) => `- ${f.citation ?? "(kein §)"}: ${f.detail} [${f.severity}]`)
    .join("\n");

  return (
    originalSystem +
    "\n\n" +
    "## ZUSÄTZLICHE WARNUNG — CROSS-MODEL VERIFICATION HAT FOLGENDE PROBLEME GEFUNDEN:\n" +
    flagList +
    "\n\n" +
    "KORRIGIERE: Entferne oder ersetze die markierten §-Zitate. " +
    "Verwende NUR §§ die wörtlich im Kontext vorkommen. " +
    "Wenn ein § nicht im Kontext steht: schreibe " +
    '"Diese Information ist in den bereitgestellten Rechtsquellen nicht enthalten."'
  );
}
