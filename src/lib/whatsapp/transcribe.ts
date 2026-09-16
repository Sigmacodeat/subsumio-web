/**
 * WhatsApp Voice Message Transcription
 *
 * Downloads the voice message audio (via media.ts download logic),
 * sends it to OpenRouter Whisper API for transcription,
 * and returns the transcribed text for further intent parsing.
 *
 * Fallback: if no OpenRouter key is configured, returns a placeholder
 * and logs a warning — the audio file is still stored in the vault.
 */

import { logger } from "@/lib/logger";
import { engineTranscribe, isEngineLLMAvailable } from "@/lib/engine-llm";
import { engineHeadersForBrain } from "@/lib/engine";
import type { StoredWhatsAppMedia } from "./media";

const log = logger("whatsapp/transcribe");

interface TranscriptionResult {
  text: string;
  language?: string;
  durationSeconds?: number;
  provider: "openrouter-whisper" | "none";
}

/**
 * Transcribe a WhatsApp voice message using OpenAI Whisper API.
 *
 * The caller is responsible for downloading and storing the media first
 * (via downloadAndStoreWhatsAppMedia). We then read the stored file
 * and send it to Whisper.
 */
export async function transcribeVoiceMessage(
  media: StoredWhatsAppMedia,
  brainId?: string
): Promise<TranscriptionResult> {
  if (!brainId || !isEngineLLMAvailable()) {
    log.warn("engine not configured — voice transcription skipped");
    return { text: "", provider: "none" };
  }
  // Fetch the stored audio file
  let audioBytes: Buffer;
  try {
    const { readFile } = await import("node:fs/promises");
    audioBytes = await readFile(media.storagePath);
  } catch (err) {
    log.error("failed to read audio file", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { text: "", provider: "none" };
  }
  const result = await engineTranscribe(engineHeadersForBrain(brainId), {
    bytes: new Uint8Array(audioBytes),
    mimeType: media.mimeType || "audio/ogg",
    filename: media.filename || "voice-message.ogg",
    language: process.env.WHATSAPP_TRANSCRIPTION_LANGUAGE || "de",
    model: process.env.WHATSAPP_TRANSCRIPTION_MODEL || "whisper-1",
  });
  if (!result) return { text: "", provider: "none" };
  return {
    text: result.text?.trim() ?? "",
    language: result.language,
    durationSeconds: result.duration_seconds,
    provider: "openrouter-whisper",
  };
}
