# LLM-Gateway: Ein Pfad für alle Modellaufrufe

Stand 2026-09-23. Gilt für Web-App (`src/`) und Engine (`server/`).

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
Prompt-Sanitizer, andere Fehlerbehandlung (429 im Log) — und in Produktion hatte der
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

## Provider-Modi (`SUBSUMIO_AI_PROVIDER`)

Der Modus legt nur die **Standardmodelle** pro Tier fest (`server/src/core/model-config.ts`,
`tierDefaultsFor`). `models.tier.<tier>` und `models.purpose.<purpose>` überschreiben weiterhin.

| Modus           | utility   | reasoning | deep   | Weg                                              |
| --------------- | --------- | --------- | ------ | ------------------------------------------------ |
| leer (`native`) | Haiku 4.5 | Sonnet 5  | Opus 5 | Anthropic-API direkt (`ANTHROPIC_API_KEY`)       |
| `openrouter`    | Haiku 4.5 | Sonnet 5  | Opus 5 | OpenRouter, nur `openrouter:`-Modelle zulässig   |
| `bedrock-eu`    | Haiku 4.5 | Sonnet 5  | Opus 5 | Amazon Bedrock, EU-Inferenzprofile, eu-central-1 |

`bedrock-eu` nutzt das Rezept `bedrock` (`server/src/core/ai/recipes/bedrock.ts`) mit
`createBedrockAnthropic` aus `@ai-sdk/amazon-bedrock`: Anthropic-Messages-API über den
`bedrock-runtime`-InvokeModel-Endpunkt. Tool-Aufrufe, Streaming, adaptives Denken und
Prompt-Caching (`providerOptions.anthropic.cacheControl`, TTL 5 min/1 h) funktionieren wie beim
direkten Anthropic-Weg. Unter der Mindestlänge eines Cache-Punkts (Haiku 4.5: 4.096 Token,
Sonnet 5: 1.024, Opus 5: 512) cacht Bedrock still nicht — kein Fehler.

Modell-IDs (Bedrock-Modellkarten, geprüft 2026-09-23, `server/src/core/ai/bedrock-config.ts`):

| Modell    | Bedrock-ID                                    |
| --------- | --------------------------------------------- |
| Haiku 4.5 | `eu.anthropic.claude-haiku-4-5-20251001-v1:0` |
| Sonnet 5  | `eu.anthropic.claude-sonnet-5`                |
| Opus 5    | `eu.anthropic.claude-opus-5`                  |

Auf `bedrock-runtime` gibt es diese drei nur als Geo- oder Global-Profil. Das `eu.`-Profil routet
von eu-central-1 aus nach eu-central-1, eu-north-1, eu-south-1, eu-south-2, eu-west-1, eu-west-3.
Fable 5.1 hat auf Bedrock kein EU-Profil; die Nutzerauswahl „Fable 5.1" fällt im Modus
`bedrock-eu` auf „auto" zurück.

Zugang: `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` (optional `AWS_SESSION_TOKEN`) oder
`AWS_BEARER_TOKEN_BEDROCK`; `AWS_REGION` (Standard `eu-central-1`). Region und Endpunkt werden
explizit an das SDK gegeben — `AWS_ENDPOINT_URL*` aus der Prozessumgebung wird nicht gelesen.

Subagenten laufen auf Bedrock nur über die Gateway-Toolschleife:
`gbrain config set agent.use_gateway_loop true`. Der alte Anthropic-SDK-Direktweg in
`minions/handlers/subagent.ts` lehnt Nicht-`anthropic:`-Modelle ab.

Preise stehen nur in `server/src/core/model-pricing.ts` (Listenpreis × 1,1 für regionale
Bedrock-Endpunkte laut Anthropic-Preisseite; gegen die AWS-Preisliste noch nicht geprüft).

## EU-only (`SUBSUMIO_EU_ONLY=1`)

Anlass: ÖRAK KI-Checkliste 2025 / § 40 Abs 3 RL-BA — Mandantendaten nur auf Servern in EU/EWR.

**Eine Tabelle entscheidet:** `PROVIDER_RESIDENCY` in `server/src/core/model-registry.ts`.
Registry-Einträge leiten `data_residency` daraus ab; `server/src/core/ai/eu-policy.ts` setzt sie
zur Laufzeit gegen die aktuelle Umgebung durch.

| Anbieter                                                                                                                                                             | Einstufung                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `bedrock`                                                                                                                                                            | EU nur mit `eu.`-Profil (oder In-Region-ID) in einer EU-Mitgliedsstaat-Region |
| `mistral`                                                                                                                                                            | EU                                                                            |
| `azure-openai`                                                                                                                                                       | EU nur mit `SUBSUMIO_AZURE_OPENAI_RESIDENCY=eu` (Ressource in EU-Region)      |
| `openrouter`                                                                                                                                                         | EU nur mit `SUBSUMIO_OPENROUTER_RESIDENCY=eu` (Enterprise-In-Region-Routing)  |
| `litellm`, `ollama`, `llama-server`, `llama-server-reranker`                                                                                                         | EU nur mit `SUBSUMIO_LITELLM_RESIDENCY` / `SUBSUMIO_SELF_HOSTED_RESIDENCY=eu` |
| `anthropic`, `openai`, `google`, `deepseek`, `groq`, `together`, `voyage`, `zeroentropyai`, `dashscope`, `zhipu`, `minimax`, `xai`, `cohere`, `moonshot`, `deepgram` | Nicht-EU                                                                      |
| unbekannt                                                                                                                                                            | Nicht-EU                                                                      |

`eu-west-2` (London) und `eu-central-2` (Zürich) zählen nicht als EU: ihr `eu.`-Profil routet
auch nach UK bzw. CH.

Was mit dem Schalter passiert — immer **Ablehnung vor dem Request**, nie stilles Umleiten
(`EuResidencyError`, Unterklasse von `AIConfigError`):

| Aufruf                                                        | Verhalten bei Nicht-EU-Ziel                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `chat`, `chatStream`, `toolLoop`, Utility-Completion, `think` | Fehler an den Aufrufer                                                     |
| Anbieter-Failover (Anthropic → OpenRouter)                    | findet nicht statt; der Originalfehler bleibt                              |
| Query-Expansion, Bild-OCR                                     | Expansion fällt auf die Originalanfrage zurück, OCR liefert keinen Text    |
| Reranker (`gateway.rerank`, LLM-Reranker-Kette)               | Nicht-EU-Modelle werden übersprungen; Ergebnis bleibt in RRF-Reihenfolge   |
| Transkription (`/api/llm/transcribe`, `transcription.ts`)     | abgelehnt (HTTP 403 `eu_only_refused`) — es gibt keinen EU-Weg für Sprache |
| Subagent-Tier (`models.tier.subagent`)                        | Auflösung schlägt fehl (der Direktweg umgeht sonst das Gateway)            |
| Embeddings                                                    | siehe unten                                                                |

### Embeddings unter EU-only

Die gespeicherten Vektoren gehören zu einem Modell (`openrouter:openai/text-embedding-3-small`,
1536 Dimensionen). Ein anderes Modell heißt: ganzer Korpus neu einbetten. Deshalb:

- `SUBSUMIO_EU_ONLY=1` allein sperrt Embeddings **nicht** (einmalige Warnung im Log).
- `SUBSUMIO_EU_ONLY_EMBEDDINGS=1` zusätzlich: dokumentseitige Embeddings (neue Aufnahme) über
  einen Nicht-EU-Anbieter werden abgelehnt; Such-Embeddings bleiben erlaubt, damit die Suche
  gegen den bestehenden Index weiter funktioniert. Korpus-Läufe mit öffentlichem Gesetzestext
  können den Schalter in ihrer Umgebung auf `0` setzen.

Migrationsoptionen (nicht umgesetzt):

1. **Bedrock Cohere Embed Multilingual v3 / Embed v4** oder **Titan Text Embeddings V2** in
   eu-central-1 — gleicher AWS-Vertrag; neues Rezept-Touchpoint `embedding` für `bedrock`,
   neue Vektorspalte, vollständiges Neu-Einbetten.
2. **Mistral Embed** (`mistral-embed`, EU) — OpenAI-kompatibler Endpunkt, Rezept `mistral`
   bekäme ein `embedding`-Touchpoint.
3. **Selbst gehostetes Qwen3-Embedding** auf dem netcup-Server (Wien) über `llama-server` mit
   `SUBSUMIO_SELF_HOSTED_RESIDENCY=eu` — deckt sich mit dem Embedding-Bakeoff (Qwen3-8B vorn).

Bei allen drei: neue Spalte über den Mehrspalten-Pfad (`embedding_column`), Parallel-Betrieb,
Umschalten erst nach vollständigem Neu-Einbetten.

## OpenRouter: kein Speichern, kein Training

Unabhängig vom EU-Schalter schickt jede OpenRouter-Anfrage aus dem Gateway (Chat, Expansion,
Embeddings) Anbieter-Präferenzen mit: `provider.data_collection = "deny"` und
`provider.zdr = true` (`applyOpenRouterPrivacyPreferences` in
`server/src/core/ai/recipes/openrouter.ts`). OpenRouter routet dann nur auf Endpunkte ohne
Speicherung/Training. `SUBSUMIO_OPENROUTER_ZDR=off` nimmt nur `zdr` weg — nötig für Modelle ohne
ZDR-Endpunkt (z. B. Fable 5.1). Nicht abgedeckt: die Transkription in
`server/src/commands/web-api.ts` (Multipart-Upload an OpenRouter, keine JSON-Präferenzen).
