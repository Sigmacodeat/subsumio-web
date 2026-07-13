/**
 * LLM-based Intent Parser for WhatsApp Natural Chat.
 *
 * When the regex-based `parseIntent()` returns `free_text` or `unknown`,
 * this module calls DeepSeek V3.2 via OpenRouter to interpret the message
 * and return a structured `ParsedIntent`.
 *
 * Architecture:
 *   1. Regex parseIntent (fast, offline, ~80% coverage with exact syntax)
 *   2. LLM fallback (this module, ~95% coverage with natural language)
 *   3. processIntent (execute the structured action)
 *
 * Cost: ~$0.0002 per call (input ~600 tokens, output ~200 tokens)
 * Latency: ~2-4 seconds
 *
 * The LLM is constrained to return only valid ParsedIntent kinds.
 * All dates are pre-expanded by relative-date.ts before sending to the LLM.
 */

import { env } from "@/lib/env";
import type { ParsedIntent } from "@/lib/legal-chat/actions";

const DEFAULT_MODEL = "deepseek/deepseek-chat";

const SYSTEM_PROMPT = `Du bist ein Intent-Parser für einen Legal AI WhatsApp-Assistenten (Subsumio).

Deine Aufgabe: Interpretiere eine WhatsApp-Nachricht eines Anwalts/Anwältin und gib sie als strukturiertes JSON zurück.

Erlaubte Intent-Typen (kind):
- "appointment": Termin anlegen. Felder: caseRef (Aktenzeichen oder ""), title, date (YYYY-MM-DD), time (HH:MM), location (optional), reminderHours (default 24)
- "deadline": Frist anlegen. Felder: caseRef, title, dueDate (YYYY-MM-DD)
- "task": Aufgabe anlegen. Felder: caseRef, title, dueDate (optional, YYYY-MM-DD)
- "time_entry": Zeiterfassung. Felder: minutes (ganze Zahl), caseRef, description, billable (true/false)
- "expense": Auslage. Felder: amount (Zahl), caseRef, description, billable (true/false)
- "case_note": Notiz zu einer Akte. Felder: caseRef, note
- "standalone_note": Notiz ohne Akte. Felder: note
- "list_cases": Akten auflisten
- "list_tasks": Aufgaben auflisten
- "list_deadlines": Fristen auflisten
- "list_appointments": Termine auflisten
- "today": Heutige Übersicht
- "financial_overview": Finanzielle Übersicht
- "case_summary": Aktenzusammenfassung. Felder: caseRef
- "case_lookup": Akte nachschlagen. Felder: caseRef
- "case_activity": Aktenverlauf. Felder: caseRef
- "search": Suche. Felder: query
- "brain_query": Allgemeine Frage. Felder: query
- "rvg_calc": RVG-Kostenberechnung. Felder: streitwert (Zahl)
- "conflict_check": Konflikt-Check. Felder: name, caseRef (optional)
- "create_case": Neue Akte. Felder: clientName, opponentName, legalArea (family/civil/criminal/labor/commercial/tax/administrative/ip), description
- "create_client": Neuer Mandant. Felder: name, phone (optional), email (optional), note (optional)
- "close_case": Akte abschließen. Felder: caseRef
- "create_invoice": Rechnung. Felder: caseRef, amount (Zahl), description
- "mark_done": Erledigt markieren. Felder: caseRef, itemType ("task"|"deadline"), query
- "bea_status": beA-Posteingang
- "datev_status": DATEV-Status
- "free_text": Wenn die Nachricht keine Kanzlei-Aktion ist (z.B. Smalltalk, Rechtsfrage). Felder: text (Originalnachricht)

REGELN:
1. Erkenne den Intent aus dem Kontext, nicht nur aus Keywords.
2. "Termin" mit Uhrzeit → "appointment". "Termin" ohne Uhrzeit → "deadline".
3. Wenn "nicht abrechenbar" in der Nachricht → billable=false, sonst billable=true.
4. Zeiterfassung: "1,5h" → 90 Minuten, "30m" → 30 Minuten, "2 Stunden" → 120 Minuten.
5. Wenn kein Aktenzeichen genannt wird, setze caseRef="".
6. Aktenzeichen erkennen: "akt 2026-014", "akte 2026-014", "az 2026-014" → caseRef="2026-014"
7. Datum-Format: immer YYYY-MM-DD. "15.07.2026" → "2026-07-15".
8. Wenn die Nachricht eine allgemeine Frage ist (keine Aktion), verwende "free_text".
9. Bei Mehrdeutigkeit wähle die wahrscheinlichste Interpretation.

Output-Format: Ein einzelnes JSON-Objekt mit "kind" und den entsprechenden Feldern.
Beispiel: {"kind":"appointment","caseRef":"2026-014","title":"Verhandlung LG München","date":"2026-07-15","time":"14:00","reminderHours":24}

Gib NUR das JSON zurück, keinen erklärenden Text.`;

interface LLMIntentResponse {
  kind: string;
  [key: string]: unknown;
}

/**
 * Check if the LLM intent parser is available (requires OpenRouter API key).
 */
export function isLLMIntentParserAvailable(): boolean {
  return !!(env("OPENROUTER_API_KEY") || env("OPENROUTER_API_KEY_FALLBACK"));
}

/**
 * Parse a natural-language WhatsApp message into a structured ParsedIntent using LLM.
 *
 * @param text The pre-processed message text (relative dates already expanded)
 * @returns A valid ParsedIntent, or null if the LLM is unavailable or fails
 */
export async function parseIntentWithLLM(text: string): Promise<ParsedIntent | null> {
  const apiKey = env("OPENROUTER_API_KEY") || env("OPENROUTER_API_KEY_FALLBACK");
  if (!apiKey) return null;

  const truncatedText = text.slice(0, 1000);

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
        model: DEFAULT_MODEL,
        max_tokens: 300,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: truncatedText },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.warn("[llm-intent] API error:", res.status, errorText.slice(0, 200));
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    let parsed: LLMIntentResponse;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn("[llm-intent] no JSON in response:", content.slice(0, 200));
        return null;
      }
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        console.warn("[llm-intent] JSON parse failed:", content.slice(0, 200));
        return null;
      }
    }

    return validateAndCoerce(parsed, text);
  } catch (err) {
    console.warn("[llm-intent] request failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Validate and coerce the LLM response into a valid ParsedIntent.
 * Returns null if the response is invalid or the kind is not recognized.
 */
function validateAndCoerce(raw: LLMIntentResponse, originalText: string): ParsedIntent | null {
  const kind = String(raw.kind || "").toLowerCase();

  const str = (v: unknown): string => (typeof v === "string" ? v : v != null ? String(v) : "");
  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const bool = (v: unknown): boolean => {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") return !/^(?:false|nein|no|0|nicht\s+abrechenbar)$/i.test(v);
    return true;
  };

  switch (kind) {
    case "appointment":
      return {
        kind: "appointment",
        caseRef: str(raw.caseRef),
        title: str(raw.title) || "Termin",
        date: str(raw.date),
        time: str(raw.time),
        location: raw.location ? str(raw.location) : undefined,
        reminderHours: num(raw.reminderHours) || 24,
      };

    case "deadline":
      return {
        kind: "deadline",
        caseRef: str(raw.caseRef),
        title: str(raw.title) || "Frist",
        dueDate: str(raw.dueDate) || str(raw.date),
      };

    case "task":
      return {
        kind: "task",
        caseRef: str(raw.caseRef),
        title: str(raw.title),
        dueDate: raw.dueDate ? str(raw.dueDate) : undefined,
      };

    case "time_entry":
      return {
        kind: "time_entry",
        minutes: Math.max(1, Math.round(num(raw.minutes))),
        caseRef: str(raw.caseRef),
        description: str(raw.description) || "Zeiterfassung via WhatsApp",
        billable: bool(raw.billable),
      };

    case "expense":
      return {
        kind: "expense",
        amount: Math.max(0, num(raw.amount)),
        caseRef: str(raw.caseRef),
        description: str(raw.description) || "Auslage via WhatsApp",
        billable: bool(raw.billable),
      };

    case "case_note":
      return {
        kind: "case_note",
        caseRef: str(raw.caseRef),
        note: str(raw.note),
      };

    case "standalone_note":
      return {
        kind: "standalone_note",
        note: str(raw.note),
      };

    case "invoice_status":
      return { kind: "invoice_status", caseRef: str(raw.caseRef) };

    case "case_summary":
      return { kind: "case_summary", caseRef: str(raw.caseRef) };

    case "case_lookup":
      return { kind: "case_lookup", caseRef: str(raw.caseRef) };

    case "case_activity":
      return { kind: "case_activity", caseRef: str(raw.caseRef) };

    case "search":
      return { kind: "search", query: str(raw.query) };

    case "brain_query":
      return { kind: "brain_query", query: str(raw.query) };

    case "rvg_calc":
      return { kind: "rvg_calc", streitwert: Math.max(0, num(raw.streitwert)) };

    case "conflict_check":
      return {
        kind: "conflict_check",
        name: str(raw.name),
        caseRef: raw.caseRef ? str(raw.caseRef) : undefined,
      };

    case "create_case":
      return {
        kind: "create_case",
        clientName: str(raw.clientName),
        opponentName: str(raw.opponentName),
        legalArea: str(raw.legalArea) || "civil",
        description: str(raw.description),
      };

    case "create_client":
      return {
        kind: "create_client",
        name: str(raw.name),
        phone: raw.phone ? str(raw.phone) : undefined,
        email: raw.email ? str(raw.email) : undefined,
        note: raw.note ? str(raw.note) : undefined,
      };

    case "close_case":
      return { kind: "close_case", caseRef: str(raw.caseRef) };

    case "create_invoice":
      return {
        kind: "create_invoice",
        caseRef: str(raw.caseRef),
        amount: Math.max(0, num(raw.amount)),
        description: str(raw.description) || "Rechnung via WhatsApp",
      };

    case "mark_done":
      return {
        kind: "mark_done",
        caseRef: str(raw.caseRef),
        itemType: raw.itemType === "deadline" ? "deadline" : "task",
        query: str(raw.query),
      };

    case "list_cases":
      return { kind: "list_cases" };
    case "list_tasks":
      return { kind: "list_tasks" };
    case "list_deadlines":
      return { kind: "list_deadlines" };
    case "list_appointments":
      return { kind: "list_appointments" };
    case "today":
      return { kind: "today" };
    case "financial_overview":
      return { kind: "financial_overview" };
    case "bea_status":
      return { kind: "bea_status" };
    case "datev_status":
      return { kind: "datev_status" };

    case "free_text":
      return { kind: "free_text", text: str(raw.text) || originalText };

    default:
      console.warn("[llm-intent] unknown kind:", kind);
      return null;
  }
}
