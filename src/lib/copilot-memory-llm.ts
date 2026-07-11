/**
 * LLM-based Memory Extraction — replaces regex-based inference with a
 * single LLM call that extracts structured facts, preferences, and
 * instructions from arbitrary user messages.
 *
 * Architecture (mem0-inspired, April 2026 algorithm):
 * - Single-pass ADD-only extraction: one LLM call, no UPDATE/DELETE
 * - Agent-generated facts are first-class: confirmed actions get stored
 * - Entity extraction: entities are extracted and linked for retrieval
 * - Falls back to regex-based inference when no LLM key is configured
 *
 * Cost: ~$0.0001 per call with gpt-4o-mini (input ~500 tokens, output ~200 tokens)
 */

import { env } from "@/lib/env";
import type { MemoryType } from "@/lib/copilot-memory";

export interface ExtractedMemory {
  type: MemoryType;
  key: string;
  value: string;
  entities?: string[];
  validFrom?: string;
  validTo?: string;
}

const DEFAULT_MODEL = "deepseek/deepseek-chat";

const SYSTEM_PROMPT = `Du bist ein Memory-Extraktor für einen legal AI Copilot (Subsumio).
Deine Aufgabe: Extrahiere persistente Erinnerungen aus Anwalts-Nachrichten.

Extrahiere NUR Informationen, die über die aktuelle Konversation hinaus relevant sind:
- Präferenzen (Antwortstil, Sprache, Detailgrad, Format)
- Fakten über den Nutzer (Kanzlei, Spezialisierung, Erfahrung)
- Standing instructions ("immer mit RVG-Nummern", "immer auf Deutsch")
- Case-übergreifende Notizen ("Mandant Müller immer in Fristen warnen")
- Bestätigte Aktionen ("Ich habe die Frist berechnet" → Fact)

Extrahiere NICHT:
- Aktuelle Konversationsinhalte ("Was ist BGB § 280?")
- Temporäre Anfragen ("Zeige mir Akte X")
- Informationen über Mandanten (die gehören ins GBrain, nicht ins Copilot-Memory)

Output-Format: JSON-Array, jedes Element:
{
  "type": "preference" | "fact" | "topic" | "instruction" | "case_note",
  "key": "kurzer_schluessel",
  "value": "Der extrahierte Wert als natürlicher Satz",
  "entities": ["Mandant Müller", "Mietrecht"],
  "valid_from": "ISO-8601 oder null — nur wenn explizite Zeitreferenz (z.B. 'ab nächstem Monat')",
  "valid_to": "ISO-8601 oder null — nur wenn explizite Endzeit (z.B. 'bis Ende Q3')"
}

Gib "[]" zurück wenn keine persistente Erinnerung extrahierbar ist.
Maximal 5 Extraktionen pro Nachricht.`;

export async function extractMemoriesWithLLM(
  message: string,
  opts?: { caseSlug?: string }
): Promise<ExtractedMemory[]> {
  const apiKey = env("OPENROUTER_API_KEY") || env("OPENROUTER_API_KEY_FALLBACK");
  if (!apiKey) return [];

  const model = env("COPILOT_MEMORY_LLM_MODEL") || DEFAULT_MODEL;

  const userPrompt = opts?.caseSlug
    ? `Kontext: Aktuelle Akte ${opts.caseSlug}\nNachricht: ${message}`
    : `Nachricht: ${message}`;

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
        max_tokens: 500,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[copilot-memory-llm] Extraction failed: HTTP ${res.status} ${res.statusText}`);
      return [];
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return [];

    // Parse JSON — response_format json_object wraps in { "memories": [...] }
    // but also handle raw array format for robustness
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("[copilot-memory-llm] Failed to parse LLM response as JSON");
      return [];
    }

    // Accept both { memories: [...] } and [...] shapes
    const memories: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Record<string, unknown>)?.memories)
        ? ((parsed as Record<string, unknown>).memories as unknown[])
        : [];

    const validTypes: MemoryType[] = ["preference", "fact", "topic", "instruction", "case_note"];

    const extracted: ExtractedMemory[] = [];
    for (const item of memories) {
      if (typeof item !== "object" || item === null) continue;
      const m = item as Record<string, unknown>;
      const type = String(m.type ?? "") as MemoryType;
      if (!validTypes.includes(type)) continue;
      const key = String(m.key ?? "").trim();
      const value = String(m.value ?? "").trim();
      if (!key || !value) continue;
      const entities = Array.isArray(m.entities)
        ? m.entities.filter((e): e is string => typeof e === "string")
        : undefined;
      const validFrom = m.valid_from ? String(m.valid_from) : undefined;
      const validTo = m.valid_to ? String(m.valid_to) : undefined;
      extracted.push({ type, key, value, entities, validFrom, validTo });
    }

    return extracted.slice(0, 5);
  } catch (err) {
    console.error(
      "[copilot-memory-llm] Extraction error:",
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}

/**
 * Check whether LLM-based extraction is available (API key configured).
 */
export function isLLMExtractionAvailable(): boolean {
  return Boolean(env("OPENROUTER_API_KEY") || env("OPENROUTER_API_KEY_FALLBACK"));
}
