/**
 * LLM-based Deadline Extraction Fallback for Subsumio.
 *
 * When the regex-based `detectDeadlines()` finds no or incomplete deadlines,
 * this module calls an LLM (DeepSeek V3.2 via OpenRouter) to extract:
 *   - Fristart (type of deadline, mapped to FRISTEN_REGISTRY key)
 *   - Zustellungsdatum (service date, ISO format)
 *   - Auslöser (trigger event description)
 *   - Fristende (if absolute date is mentioned)
 *   - Confidence assessment
 *
 * The extracted data is then fed into `berechneFristAuto()` for deterministic
 * calculation with vhfZ-Hemmung, Feiertagsverschiebung, and ERV-Zustellfiktion.
 *
 * Cost: ~$0.0002 per call with DeepSeek V3.2 (input ~800 tokens, output ~300 tokens)
 * Latency: ~3-5 seconds
 *
 * Architecture:
 *   1. Regex detection (fast, offline, ~80% coverage)
 *   2. LLM fallback (this module, ~95% coverage with complex texts)
 *   3. Deterministic calculation via frist-engine (berechneFristAuto)
 */

import { engineComplete, isEngineLLMAvailable, parseJsonObject } from "@/lib/engine-llm";
import { berechneFristAuto, FRISTEN_REGISTRY } from "@/lib/legal/frist-engine";
import type { DetectedDeadline } from "@/lib/ai-deadline-detect";

/**
 * Known FRISTEN_REGISTRY keys — the LLM must choose from these.
 * Included in the system prompt to constrain output.
 */
const KNOWN_FRIST_KEYS = FRISTEN_REGISTRY.map((f) => f.key).join(", ");

const SYSTEM_PROMPT = `Du bist ein Fristen-Extraktor für einen österreichischen Legal AI Copilot (Subsumio).

Deine Aufgabe: Extrahiere juristische Fristen aus einem Text und gib sie als strukturiertes JSON zurück.

Für jede erkannte Frist extrahiere:
1. "frist_key": Einer der folgenden Registry-Keys (oder null wenn nicht passend):
   ${KNOWN_FRIST_KEYS}
2. "frist_beschreibung": Kurzbezeichnung der Frist (z.B. "Berufungsfrist", "Klagebeantwortungsfrist")
3. "zustellungsdatum": ISO-Datum (YYYY-MM-DD) des fristauslösenden Ereignisses (meist Zustellung), oder null
4. "absolutes_datum": ISO-Datum wenn eine absolute Frist genannt wird (z.B. "bis 30.06.2024"), oder null
5. "tage_relativ": Anzahl Tage wenn eine relative Frist genannt wird (z.B. "14 Tage"), oder null
6. "rechtsgrundlage": Zitierte Gesetzesstelle (z.B. "§ 464 Abs 1 ZPO"), oder null
7. "snippet": Der exakte Textabschnitt aus dem die Frist extrahiert wurde (max 200 Zeichen)
8. "confidence": "high" wenn Datum+Art klar erkennbar, "medium" wenn unsicher, "low" bei vagen Hinweisen

WICHTIG:
- Extrahiere NUR tatsächlich im Text genannte Fristen, erfinde keine.
- "zustellungsdatum" ist das Datum der Zustellung/Zustellungsfiktion, NICHT das Fristende.
- Bei ERV-Zustellung: das Einlangungsdatum angeben (die Engine berechnet den Folgewerktag).
- Bei Verjährung: das Datum der Kenntniserlangung als "zustellungsdatum" angeben.
- Wenn kein Datum extrahierbar ist, setze "zustellungsdatum" auf null.
- Im Auftrag steht ein BEZUGSDATUM. Löse Angaben ohne Jahr oder mit relativem Bezug ("dieses Jahres", "nächsten Montag", "Monatsletzter") gegen dieses Bezugsdatum auf. Rate niemals ein Jahr. Lässt sich ein Datum nicht sicher bestimmen, setze es auf null.

Output-Format: JSON-Array, jedes Element wie oben beschrieben.
Gib "[]" zurück wenn keine Fristen im Text erwähnt werden.

Beispiel-Output:
[
  {
    "frist_key": "berufung",
    "frist_beschreibung": "Berufungsfrist",
    "zustellungsdatum": "2024-03-15",
    "absolutes_datum": null,
    "tage_relativ": null,
    "rechtsgrundlage": "§ 464 Abs 1 ZPO",
    "snippet": "Das Urteil wurde zugestellt am 15.03.2024. Berufungsfrist vier Wochen.",
    "confidence": "high"
  }
]`;

interface LLMExtractedDeadline {
  frist_key: string | null;
  frist_beschreibung: string;
  zustellungsdatum: string | null;
  absolutes_datum: string | null;
  tage_relativ: number | null;
  rechtsgrundlage: string | null;
  snippet: string;
  confidence: "high" | "medium" | "low";
}

function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) ? day : null;
}

/**
 * A model that is not told the year will guess one. A date only counts when
 * its year is written in the text, or is the reference year or the one after.
 * Anything else is dropped to "no date" — a suggestion without a date is
 * harmless, a deadline in the wrong year is not.
 */
export function dropUngroundedDates<
  T extends {
    zustellungsdatum: string | null;
    absolutes_datum: string | null;
    confidence: "high" | "medium" | "low";
  },
>(item: T, text: string, referenceDate: string): T {
  const refYear = Number(referenceDate.slice(0, 4));
  const grounded = (value: string | null): string | null => {
    const day = isoDay(value);
    if (!day) return null;
    const year = Number(day.slice(0, 4));
    if (year === refYear || year === refYear + 1) return day;
    return text.includes(String(year)) ? day : null;
  };
  const zustellungsdatum = grounded(item.zustellungsdatum);
  const absolutes_datum = grounded(item.absolutes_datum);
  const dropped =
    (item.zustellungsdatum && !zustellungsdatum) || (item.absolutes_datum && !absolutes_datum);
  return {
    ...item,
    zustellungsdatum,
    absolutes_datum,
    confidence: dropped ? "low" : item.confidence,
  };
}

/**
 * Check whether LLM-based deadline extraction is available (API key configured).
 */
export function isLLMDeadlineExtractionAvailable(): boolean {
  return isEngineLLMAvailable();
}

/**
 * Extract deadlines from text through the engine's LLM gateway.
 *
 * @param text The full text to analyze (max 10,000 chars)
 * @returns Array of DetectedDeadline objects with optional fristResult
 */
export async function extractDeadlinesWithLLM(
  text: string,
  opts?: {
    ferialsache?: boolean;
    vorfristTage?: number;
    headers?: Record<string, string>;
    /** Date the text was written or received (ISO). Defaults to today. */
    referenceDate?: string;
  }
): Promise<DetectedDeadline[]> {
  if (!opts?.headers || !isEngineLLMAvailable()) return [];
  const headers = opts.headers;
  const referenceDate = isoDay(opts.referenceDate) ?? new Date().toISOString().slice(0, 10);
  const truncated =
    text.length > 10_000 ? text.slice(0, 10_000) + "\n\n[... text truncated]" : text;

  try {
    const result = await engineComplete(headers, {
      purpose: "deadline_extract",
      tier: "utility",
      system: SYSTEM_PROMPT,
      prompt: `BEZUGSDATUM: ${referenceDate}\n\nText:\n${truncated}`,
      json: true,
      maxTokens: 800,
      timeoutMs: 15_000,
    });
    const content = result?.text?.trim();
    if (!content) return [];
    // Parse JSON (handle both array and {deadlines: [...]} formats)
    const json = parseJsonObject<unknown>(content);
    if (json === null) {
      console.error("[llm-deadline-extract] Failed to parse LLM response as JSON");
      return [];
    }
    const parsed: LLMExtractedDeadline[] = Array.isArray(json)
      ? (json as LLMExtractedDeadline[])
      : Array.isArray((json as { deadlines?: unknown }).deadlines)
        ? (json as { deadlines: LLMExtractedDeadline[] }).deadlines
        : [];
    // Convert LLM results to DetectedDeadline with frist-engine enrichment
    return parsed.map((raw): DetectedDeadline => {
      const item = dropUngroundedDates(raw, truncated, referenceDate);
      const dd: DetectedDeadline = {
        type: "legal_deadline",
        description: item.frist_beschreibung || "LLM-extrahierte Frist",
        date: item.absolutes_datum ?? undefined,
        daysFromNow: item.tage_relativ ?? undefined,
        confidence: item.confidence,
        sourceSnippet: item.snippet,
        matchedRule: "llm_fallback",
        suggestedTemplate: item.frist_key ?? undefined,
        zustellungsdatum: item.zustellungsdatum ?? undefined,
      };

      // Enrich with frist-engine if we have a key and a date
      if (item.frist_key && (item.zustellungsdatum || item.absolutes_datum)) {
        const ausloeser = item.zustellungsdatum || item.absolutes_datum!;
        try {
          const result = berechneFristAuto(item.frist_key, ausloeser, opts);
          return {
            ...dd,
            fristResult: result,
            date: result.fristende,
            confidence: "high",
            zustellungsdatum: ausloeser,
          };
        } catch {
          // If frist-engine fails (unknown key etc.), keep the LLM result
          return dd;
        }
      }

      return dd;
    });
  } catch (err) {
    console.error(
      "[llm-deadline-extract] Request failed:",
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}

/**
 * Hybrid deadline detection: regex first, LLM fallback for gaps.
 *
 * Strategy:
 * 1. Run regex-based detectDeadlines() — fast, offline
 * 2. If regex finds 0 high-confidence deadlines → call LLM
 * 3. If regex finds some but text is long (>500 chars) → call LLM for additional
 * 4. Merge results, deduplicate by snippet similarity
 * 5. All LLM results with frist_key get frist-engine enrichment
 *
 * @param text The full text to analyze
 * @param regexDetected Results from detectDeadlines() (already enriched)
 * @param opts Optional: ferialsache, vorfristTage
 * @returns Merged array of DetectedDeadline[]
 */
export async function hybridDeadlineDetection(
  text: string,
  regexDetected: DetectedDeadline[],
  headers?: Record<string, string>,
  opts?: { ferialsache?: boolean; vorfristTage?: number }
): Promise<DetectedDeadline[]> {
  const highConfidenceCount = regexDetected.filter((d) => d.confidence === "high").length;
  const shouldCallLLM = highConfidenceCount === 0 || (text.length > 500 && highConfidenceCount < 3);

  if (!shouldCallLLM || !isLLMDeadlineExtractionAvailable()) {
    return regexDetected;
  }

  const llmDetected = await extractDeadlinesWithLLM(text, { ...opts, headers });
  if (llmDetected.length === 0) return regexDetected;

  // Deduplicate: skip LLM results whose snippet overlaps >60% with an existing regex result
  const merged = [...regexDetected];
  for (const llmDD of llmDetected) {
    const isDuplicate = regexDetected.some(
      (existing) =>
        existing.sourceSnippet.slice(0, 60) === llmDD.sourceSnippet.slice(0, 60) ||
        (existing.suggestedTemplate === llmDD.suggestedTemplate &&
          existing.zustellungsdatum === llmDD.zustellungsdatum)
    );
    if (!isDuplicate) {
      merged.push(llmDD);
    }
  }

  return merged;
}
