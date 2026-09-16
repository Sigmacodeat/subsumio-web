/**
 * LLM-based Memory Extraction — replaces regex-based inference with a
 * single LLM call that extracts structured facts, preferences, and
 * instructions from arbitrary user messages.
 *
 * Architecture (mem0-inspired, April 2026 algorithm):
 * - Single-pass ADD-only extraction: one LLM call, no UPDATE/DELETE
 * - Agent-generated facts are first-class: confirmed actions get stored
 * - Entity extraction: entities are extracted and linked for retrieval
 * - Falls back to regex-based inference when no engine is configured
 *
 * Runs through the engine LLM gateway (`POST /api/llm/complete`, purpose
 * `copilot_memory`, utility tier) — no provider key in the web app.
 */

import { engineComplete, isEngineLLMAvailable, parseJsonObject } from "@/lib/engine-llm";
import type { MemoryType } from "@/lib/copilot-memory";

export interface ExtractedMemory {
  type: MemoryType;
  key: string;
  value: string;
  entities?: string[];
  validFrom?: string;
  validTo?: string;
}

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
  opts?: { caseSlug?: string; headers?: Record<string, string> }
): Promise<ExtractedMemory[]> {
  if (!opts?.headers || !isEngineLLMAvailable()) return [];
  const userPrompt = opts?.caseSlug
    ? `Kontext: Aktuelle Akte ${opts.caseSlug}\nNachricht: ${message}`
    : `Nachricht: ${message}`;
  const result = await engineComplete(opts.headers, {
    purpose: "copilot_memory",
    tier: "utility",
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    json: true,
    maxTokens: 500,
    timeoutMs: 10_000,
  });
  const content = result?.text?.trim();
  if (!content) return [];
  const parsed = parseJsonObject<unknown>(content);
  if (parsed === null) {
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
}

/**
 * Check whether LLM-based extraction is available (engine configured).
 */
export function isLLMExtractionAvailable(): boolean {
  return isEngineLLMAvailable();
}
