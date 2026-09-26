/**
 * Speech-to-text for the engine's `/api/llm/transcribe` (dictation, WhatsApp
 * voice notes).
 *
 * Provider choice:
 *   - EU-only mode (SUBSUMIO_EU_ONLY=1): only an EU route may be used —
 *     Mistral Voxtral on La Plateforme (EU-hosted, see PROVIDER_RESIDENCY in
 *     model-registry.ts). Without MISTRAL_API_KEY the request is refused with
 *     `eu_only_refused`; nothing leaves the process.
 *   - Otherwise: OpenRouter Whisper as before; Mistral is used when no
 *     OpenRouter key is configured but MISTRAL_API_KEY is.
 *
 * Mistral API (docs.mistral.ai, "Offline Transcription" + API reference
 * "audio/transcriptions", checked 2026-09-26):
 *   POST https://api.mistral.ai/v1/audio/transcriptions
 *   multipart/form-data: file, model (voxtral-mini-latest), language
 *   Authorization: Bearer <MISTRAL_API_KEY>
 *   response JSON: { model, text, language, segments, usage }
 * Batch transcription handles up to ≈3 h of audio; our upload cap is 25 MB.
 *
 * The audio bytes are only forwarded, never written to disk or the database.
 */

import { euRefusal } from "./eu-policy.ts";

type Env = Record<string, string | undefined>;

export const MISTRAL_TRANSCRIBE_URL = "https://api.mistral.ai/v1/audio/transcriptions";
export const MISTRAL_TRANSCRIBE_MODEL = "voxtral-mini-latest";
export const OPENROUTER_TRANSCRIBE_URL = "https://openrouter.ai/api/v1/audio/transcriptions";
export const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024;
export const TRANSCRIBE_TIMEOUT_MS = 60_000;

export type TranscriptionProvider = "mistral" | "openrouter";

export interface TranscriptionInput {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  language: string;
  /** Only honoured for OpenRouter (Whisper model id). */
  model?: string;
}

export interface TranscriptionSuccess {
  ok: true;
  text: string;
  language?: string;
  duration_seconds?: number;
  provider: "mistral-voxtral" | "openrouter-whisper";
}

export interface TranscriptionFailure {
  ok: false;
  status: number;
  error:
    | "eu_only_refused"
    | "transcription_not_configured"
    | "audio_size_invalid"
    | "transcription_failed"
    | "transcription_timeout";
  message: string;
}

export type TranscriptionOutcome = TranscriptionSuccess | TranscriptionFailure;

/** Which provider this env may use, or the refusal when none is allowed. */
export function selectTranscriptionProvider(
  env: Env
): { provider: TranscriptionProvider; apiKey: string } | TranscriptionFailure {
  const mistralKey = (env.MISTRAL_API_KEY ?? "").trim();
  const openrouterKey = (env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY_FALLBACK || "").trim();

  // EU route first: allowed under every policy.
  const openrouterRefusal = euRefusal("openrouter:whisper-1", "transcription", env);
  if (openrouterRefusal) {
    // EU-only and OpenRouter not attested as EU → Mistral or nothing.
    if (mistralKey) return { provider: "mistral", apiKey: mistralKey };
    return {
      ok: false,
      status: 403,
      error: "eu_only_refused",
      message:
        "EU-only mode: no EU transcription provider configured (set MISTRAL_API_KEY). No request was sent.",
    };
  }
  if (openrouterKey) return { provider: "openrouter", apiKey: openrouterKey };
  if (mistralKey) return { provider: "mistral", apiKey: mistralKey };
  return {
    ok: false,
    status: 503,
    error: "transcription_not_configured",
    message: "No transcription provider key (MISTRAL_API_KEY or OPENROUTER_API_KEY)",
  };
}

export async function transcribeAudio(
  input: TranscriptionInput,
  env: Env,
  fetchImpl: typeof fetch = fetch
): Promise<TranscriptionOutcome> {
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_TRANSCRIBE_BYTES) {
    return {
      ok: false,
      status: 400,
      error: "audio_size_invalid",
      message: `Audio must be between 1 byte and ${MAX_TRANSCRIBE_BYTES} bytes`,
    };
  }
  const choice = selectTranscriptionProvider(env);
  if ("ok" in choice) return choice;

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }),
    input.filename
  );
  let url: string;
  const headers: Record<string, string> = { Authorization: `Bearer ${choice.apiKey}` };
  if (choice.provider === "mistral") {
    url = MISTRAL_TRANSCRIBE_URL;
    form.append("model", MISTRAL_TRANSCRIBE_MODEL);
  } else {
    url = OPENROUTER_TRANSCRIBE_URL;
    form.append("model", input.model || "whisper-1");
    headers["HTTP-Referer"] = "https://subsum.io";
    headers["X-Title"] = "Subsumio";
  }
  form.append("language", input.language || "de");

  let upstream: Response;
  try {
    upstream = await fetchImpl(url, {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return {
        ok: false,
        status: 504,
        error: "transcription_timeout",
        message: `Transcription provider did not answer within ${TRANSCRIBE_TIMEOUT_MS / 1000}s`,
      };
    }
    return {
      ok: false,
      status: 502,
      error: "transcription_failed",
      message: e instanceof Error ? e.message : "network error",
    };
  }
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return {
      ok: false,
      status: 502,
      error: "transcription_failed",
      message: `${choice.provider}: ${detail.slice(0, 300) || `HTTP ${upstream.status}`}`,
    };
  }
  const data = (await upstream.json().catch(() => ({}))) as {
    text?: string;
    language?: string | null;
    duration?: number;
  };
  return {
    ok: true,
    text: (data.text ?? "").trim(),
    language: data.language ?? undefined,
    duration_seconds: data.duration,
    provider: choice.provider === "mistral" ? "mistral-voxtral" : "openrouter-whisper",
  };
}
