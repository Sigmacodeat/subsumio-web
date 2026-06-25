/**
 * WhatsApp Voice Message Transcription
 *
 * Downloads the voice message audio (via media.ts download logic),
 * sends it to OpenAI Whisper API for transcription,
 * and returns the transcribed text for further intent parsing.
 *
 * Fallback: if no OpenAI key is configured, returns a placeholder
 * and logs a warning — the audio file is still stored in the vault.
 */

import { withRetry } from "@/lib/retry";
import type { StoredWhatsAppMedia } from "./media";

interface TranscriptionResult {
  text: string;
  language?: string;
  durationSeconds?: number;
  provider: "openai-whisper" | "none";
}

/**
 * Transcribe a WhatsApp voice message using OpenAI Whisper API.
 *
 * The caller is responsible for downloading and storing the media first
 * (via downloadAndStoreWhatsAppMedia). We then read the stored file
 * and send it to Whisper.
 */
export async function transcribeVoiceMessage(
  media: StoredWhatsAppMedia
): Promise<TranscriptionResult> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    console.warn(
      "[whatsapp/transcribe] OPENAI_API_KEY not configured — voice transcription skipped"
    );
    return {
      text: "",
      provider: "none",
    };
  }

  // Fetch the stored audio file
  let audioBytes: Buffer;
  try {
    // Local file — read from disk
    const { readFile } = await import("node:fs/promises");
    audioBytes = await readFile(media.storagePath);
  } catch (err) {
    console.error(
      "[whatsapp/transcribe] failed to read audio file:",
      err instanceof Error ? err.message : String(err)
    );
    return {
      text: "",
      provider: "none",
    };
  }

  // Send to OpenAI Whisper API
  try {
    const formData = new FormData();
    const audioBlob = new Blob([new Uint8Array(audioBytes)], {
      type: media.mimeType || "audio/ogg",
    });
    formData.append("file", audioBlob, media.filename || "voice-message.ogg");
    formData.append("model", process.env.WHATSAPP_TRANSCRIPTION_MODEL || "whisper-1");
    formData.append("language", process.env.WHATSAPP_TRANSCRIPTION_LANGUAGE || "de");

    const res = await withRetry(() =>
      fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
        },
        body: formData,
      })
    );

    if (!res.ok) {
      const error = await res.text().catch(() => "");
      console.error("[whatsapp/transcribe] Whisper API error:", error || `HTTP ${res.status}`);
      return {
        text: "",
        provider: "none",
      };
    }

    const data = (await res.json().catch(() => ({}))) as {
      text?: string;
      language?: string;
      duration?: number;
    };
    return {
      text: data.text?.trim() ?? "",
      language: data.language,
      durationSeconds: data.duration,
      provider: "openai-whisper",
    };
  } catch (err) {
    console.error(
      "[whatsapp/transcribe] Whisper request failed:",
      err instanceof Error ? err.message : String(err)
    );
    return {
      text: "",
      provider: "none",
    };
  }
}
