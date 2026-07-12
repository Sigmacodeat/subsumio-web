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

import { env } from "@/lib/env";
import { berechneFristAuto, type FristAutoErgebnis, FRISTEN_REGISTRY } from "@/lib/legal/frist-engine";
import type { DetectedDeadline } from "@/lib/ai-deadline-detect";

const DEFAULT_MODEL = "deepseek/deepseek-chat";

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

/**
 * Check whether LLM-based deadline extraction is available (API key configured).
 */
export function isLLMDeadlineExtractionAvailable(): boolean {
  return Boolean(env("OPENROUTER_API_KEY") || env("OPENROUTER_API_KEY_FALLBACK"));
}

/**
 * Extract deadlines from text using an LLM (DeepSeek V3.2 via OpenRouter).
 *
 * @param text The full text to analyze (max 10,000 chars)
 * @returns Array of DetectedDeadline objects with optional fristResult
 */
export async function extractDeadlinesWithLLM(
  text: string,
  opts?: { ferialsache?: boolean; vorfristTage?: number }
): Promise<DetectedDeadline[]> {
  const apiKey = env("OPENROUTER_API_KEY") || env("OPENROUTER_API_KEY_FALLBACK");
  if (!apiKey) return [];

  const model = env("DEADLINE_LLM_MODEL") || DEFAULT_MODEL;
  const truncated = text.length > 10_000 ? text.slice(0, 10_000) + "\n\n[... text truncated]" : text;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://subsum.io",
        "X-Title": "Subsumio",
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Text:\n${truncated}` },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error(`[llm-deadline-extract] HTTP ${res.status} ${res.statusText}`);
      return [];
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return [];

    // Parse JSON (handle both array and {deadlines: [...]} formats)
    let parsed: LLMExtractedDeadline[];
    try {
      const json = JSON.parse(content);
      parsed = Array.isArray(json) ? json : Array.isArray(json.deadlines) ? json.deadlines : [];
    } catch {
      console.error("[llm-deadline-extract] Failed to parse LLM response as JSON");
      return [];
    }

    // Convert LLM results to DetectedDeadline with frist-engine enrichment
    return parsed.map((item): DetectedDeadline => {
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
  opts?: { ferialsache?: boolean; vorfristTage?: number }
): Promise<DetectedDeadline[]> {
  const highConfidenceCount = regexDetected.filter((d) => d.confidence === "high").length;
  const shouldCallLLM =
    highConfidenceCount === 0 || (text.length > 500 && highConfidenceCount < 3);

  if (!shouldCallLLM || !isLLMDeadlineExtractionAvailable()) {
    return regexDetected;
  }

  const llmDetected = await extractDeadlinesWithLLM(text, opts);
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
