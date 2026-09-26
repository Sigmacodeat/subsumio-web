import { z } from "zod";
import { createHandler, apiSuccess, apiError, recordCreditConsumption } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { engineTranscribeDetailed } from "@/lib/engine-llm";
import { EU_ONLY_REFUSAL_CODE } from "@/lib/eu-policy-refusal";
import {
  createDictationEntry,
  transitionDictationStatus,
  getPendingCorrections,
  formatDictationDuration,
  type DictationEntry,
} from "@/lib/dictation";

export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

const createSchema = z.object({
  case_slug: z.string().max(300).optional(),
  duration_seconds: z
    .number()
    .min(1)
    .max(60 * 60),
  language: z.enum(["de", "en", "fr", "it"]).default("de"),
  // Recorded audio (base64). Transcribed via the engine, NOT stored: the
  // dictation page keeps the recording until the transcript is saved.
  audio_base64: z
    .string()
    .min(1)
    .max(Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 4),
  mime_type: z.string().max(100).default("audio/webm"),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: createSchema,
    credits: "think",
    audit: (ctx, body) => ({
      action: "case.update" as const,
      entityType: "dictation_entry",
      entityId: ctx.user.email,
      details: { duration: body.duration_seconds, caseSlug: body.case_slug },
    }),
  },
  async (ctx, body) => {
    const bytes = Buffer.from(body.audio_base64, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES) {
      return apiError(
        "audio_size_invalid",
        "Die Aufnahme ist leer oder zu groß (max. 20 MB).",
        400
      );
    }
    const ext = body.mime_type.includes("mp4")
      ? "m4a"
      : body.mime_type.includes("ogg")
        ? "ogg"
        : "webm";
    const outcome = await engineTranscribeDetailed(ctx.headers, {
      bytes,
      mimeType: body.mime_type,
      filename: `diktat.${ext}`,
      language: body.language,
      model: "openai/whisper-1",
    });
    if (!outcome.ok && outcome.code === EU_ONLY_REFUSAL_CODE) {
      // EU-only mode without an EU transcription provider (Mistral): say so
      // instead of asking for a pointless retry. Nothing was sent anywhere.
      return apiError(
        "transcription_unavailable_eu",
        "Das Diktat ist im EU-Datenmodus derzeit nicht verfügbar: Für diese Installation ist kein Verschriftungsdienst mit Verarbeitung in der EU eingerichtet. Die Aufnahme wurde an keinen externen Dienst übermittelt. Bitte wenden Sie sich an den Betreiber.",
        503
      );
    }
    if (!outcome.ok && outcome.code === "transcription_not_configured") {
      return apiError(
        "transcription_not_configured",
        "Die Verschriftung ist für diese Installation nicht eingerichtet. Die Aufnahme wurde an keinen externen Dienst übermittelt. Bitte wenden Sie sich an den Betreiber.",
        503
      );
    }
    if (!outcome.ok && outcome.code === "transcription_timeout") {
      return apiError(
        "transcription_timeout",
        "Der Verschriftungsdienst hat nicht rechtzeitig geantwortet. Die Aufnahme bleibt erhalten — bitte in einigen Minuten erneut versuchen oder kürzer diktieren.",
        504
      );
    }
    const transcript = outcome.ok ? (outcome.result.text?.trim() ?? "") : "";
    // `credits` on createHandler only checks the balance. Without this the
    // transcription would be free forever (see credit-coverage.test.ts).
    if (transcript) void recordCreditConsumption(ctx, "think", body.case_slug || undefined);
    if (!transcript) {
      return apiError(
        "transcription_failed",
        "Die Aufnahme konnte nicht verschriftet werden. Die Aufnahme bleibt erhalten — bitte erneut versuchen.",
        502
      );
    }

    const entry = transitionDictationStatus(
      createDictationEntry({
        case_slug: body.case_slug || undefined,
        lawyer_email: ctx.user.email,
        lawyer_name: ctx.user.name || ctx.user.email,
        duration_seconds: Math.round(body.duration_seconds),
        language: body.language,
      }),
      "transcribed",
      { transcript }
    );
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/dictations/${entry.id}`,
        title: `Diktat: ${entry.lawyer_name} (${formatDictationDuration(entry.duration_seconds)})`,
        type: "dictation_entry",
        content: transcript,
        frontmatter: entry,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Transcript still goes back so nothing the lawyer dictated is lost.
      return apiError(
        "save_failed",
        "Das Diktat wurde verschriftet, aber nicht gespeichert.",
        502,
        {
          transcript,
        }
      );
    }
    return apiSuccess({ entry });
  }
);

const querySchema = z.object({
  case_slug: z.string().max(300).optional(),
  status: z.enum(["recording", "transcribed", "corrected", "filed", "failed"]).optional(),
  // Query values are strings: "?pending_corrections=true".
  pending_corrections: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const pages = await listEnginePages(ctx.headers, "dictation_entry", 2_000);
    let items = pages.map((p) => p.frontmatter as unknown as DictationEntry).filter(Boolean);
    if (query?.case_slug) {
      items = items.filter((e) => e.case_slug === query.case_slug);
    }
    if (query?.status) {
      items = items.filter((e) => e.status === query.status);
    }
    if (query?.pending_corrections) {
      items = getPendingCorrections(items);
    }
    items.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return apiSuccess({ items });
  }
);
