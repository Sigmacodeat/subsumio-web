# LLM-Gateway: Ein Pfad für alle Modellaufrufe

Stand 2026-09-16. Gilt für Web-App (`src/`) und Engine (`server/`).

## Regel

**Die Web-App ruft niemals einen KI-Anbieter direkt auf.** Es gibt keine Provider-Keys im
Web-Container. Jeder Modellaufruf geht an die Engine:

| Zweck                                                                | Endpunkt                   | Wann                                                                                                |
| -------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| Juristische Antwort mit Retrieval, Zitaten, Guardrails, Cross-Verify | `POST /api/think`          | Assistent, Strategie, Briefing-Text, Drafting, Recherche                                            |
| Kleine strukturierte Aufgabe ohne Retrieval                          | `POST /api/llm/complete`   | Copilot-Gedächtnis, WhatsApp-Intent, LLM-Fristen-Fallback, Empfehlungs-Politur im WhatsApp-Briefing |
| Sprache → Text                                                       | `POST /api/llm/transcribe` | WhatsApp-Sprachnachrichten                                                                          |
| Embeddings                                                           | `POST /api/embed`          | Suche, Grounding                                                                                    |

Web-seitiger Client: `src/lib/engine-llm.ts` (`engineComplete`, `engineTranscribe`,
`parseJsonObject`, `isEngineLLMAvailable`). Engine-seitige Logik:
`server/src/core/ai/utility-complete.ts`.

## Warum es vorher zwei Pfade gab — und warum das falsch war

Die Engine bot nur `think`: die schwere Pipeline (Suche, Guardrails, Zitatprüfung, teures
Modell). Für Mini-Aufgaben wie „extrahiere Präferenzen aus dieser Nachricht" war das zu
langsam und zu teuer, also riefen fünf Web-Module OpenRouter direkt mit DeepSeek auf.
Folgen: ein zweiter API-Key, keine Modell-Tiers, kein Budget-/Spend-Tracking, kein
Prompt-Sanitizer, andere Fehlerbehandlung (429 im Log) — und auf Hetzner hatte der
Web-Container den Key gar nicht, die Funktionen liefen dort stumm ins Leere.

## Wie `/api/llm/complete` arbeitet

- Modellwahl über die Engine-Tiers (`models.tier.utility` = Haiku-Klasse; `reasoning`/`deep`
  wählbar) — pro Zweck überschreibbar mit `gbrain config set models.purpose.<purpose> …`.
- Gleicher Gateway wie `think` (Rate-Leases, Budget-Tracker, Fallback-Kette), gleicher
  Injektions-Sanitizer (`sanitizePromptInput`, ohne 500-Zeichen-Kappung).
- `json: true` erzwingt per Anweisung ein JSON-Objekt; Aufrufer parsen trotzdem tolerant
  (`parseJsonObject`).
- Antwort enthält `usage` (Token) und `latency_ms`; Kosten laufen über die Engine-Konten.
- Credits: Utility-Aufrufe werden dem Nutzer nicht als Credits belastet (Cent-Bereich);
  `think`, Dokumentanalyse und Fristen-Erkennung bleiben wie bisher bepreist.

## Neue KI-Funktion anlegen — Checkliste

1. Braucht sie Aktenwissen/Zitate? → `api.query.think` mit `instructions` (Persona) und
   `query` (nur die Nutzerfrage).
2. Nur Text → Struktur? → `engineComplete(headers, { purpose, system, prompt, json: true })`.
3. Nie `fetch("https://openrouter.ai…")` in `src/`. Der Test `src/lib/engine-llm.test.ts`
   pinnt, dass kein Web-Modul Provider-URLs oder Provider-Keys anspricht.
