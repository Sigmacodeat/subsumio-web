/**
 * AI Auto-Time Extraction API
 * ============================
 *
 * POST /api/time/auto-extract
 *   Analyzes a conversation (WhatsApp, Legal Chat, etc.) and generates
 *   draft time entries with description + minute estimates.
 *
 * POST /api/time/auto-extract?approve=true
 *   Same as above, but also persists the entries to the case.
 */

import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import {
  extractTimeFromConversation,
  extractedToTimeEntry,
  type ConversationMessage,
} from "@/lib/ai-time-extract";
import { createTimeEntry } from "@/lib/time-tracking";
import { broadcastSseEvent } from "@/lib/realtime-bus";

export const dynamic = "force-dynamic";

const messageSchema = z.object({
  role: z.enum(["client", "lawyer", "assistant", "system"]),
  text: z.string(),
  timestamp: z.string().optional(),
  has_media: z.boolean().optional(),
  media_type: z.enum(["voice", "document", "image", "audio", "video"]).optional(),
  word_count: z.number().optional(),
});

const autoExtractSchema = z.object({
  messages: z.array(messageSchema).min(1, "messages_required"),
  case_slug: z.string().optional(),
  case_title: z.string().optional(),
  lawyer_name: z.string().optional(),
  default_rate: z.number().min(0).optional(),
  started_at: z.string().optional(),
  ended_at: z.string().optional(),
  source: z
    .enum(["whatsapp", "legal_chat", "voice_transcription", "document_review"])
    .default("whatsapp"),
  auto_approve: z.boolean().default(false),
});

export const POST = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    body: autoExtractSchema,
    audit: (ctx, body) => ({
      action: "time.auto_extract",
      entityType: "time_entry",
      details: {
        message_count: body.messages.length,
        case_slug: body.case_slug,
        source: body.source,
        auto_approve: body.auto_approve,
      },
    }),
  },
  async (ctx, body, req) => {
    const messages: ConversationMessage[] = body.messages.map((m) => ({
      role: m.role,
      text: m.text,
      timestamp: m.timestamp ?? new Date().toISOString(),
      has_media: m.has_media,
      media_type: m.media_type,
      word_count: m.word_count,
    }));

    const result = extractTimeFromConversation(
      {
        messages,
        case_slug: body.case_slug,
        case_title: body.case_title,
        lawyer_name: body.lawyer_name,
        default_rate: body.default_rate,
        started_at: body.started_at,
        ended_at: body.ended_at,
      },
      body.source
    );

    if (result.skipped_reason) {
      return apiSuccess({
        entries: [],
        skipped: true,
        reason: result.skipped_reason,
        conversation_summary: result.conversation_summary,
      });
    }

    // If auto_approve, persist entries to the case
    const persistedEntries: Array<{ id: string; case_slug: string }> = [];
    if (body.auto_approve && body.case_slug && result.entries.length > 0) {
      for (const extracted of result.entries) {
        const timeEntry = extractedToTimeEntry(extracted);
        try {
          const created = createTimeEntry({
            description: timeEntry.description,
            minutes: timeEntry.minutes,
            date: timeEntry.date,
            rate: timeEntry.rate,
            billable: timeEntry.billable,
            lawyer: timeEntry.lawyer,
            activity_type: timeEntry.activity_type,
          });
          persistedEntries.push({ id: created.id, case_slug: body.case_slug });
        } catch (err) {
          console.error("[auto-extract] Failed to create entry:", err);
        }
      }

      // Broadcast via SSE for real-time dashboard update
      if (ctx.brainId) {
        broadcastSseEvent(ctx.brainId, "time_entry_created", {
          case_slug: body.case_slug,
          count: persistedEntries.length,
          source: "auto_extract",
        });
      }
    }

    return apiSuccess({
      entries: result.entries.map((e) => ({
        ...e,
        persisted: persistedEntries.some((p) => p.id === e.id),
      })),
      total_minutes: result.total_minutes,
      billable_minutes: result.billable_minutes,
      conversation_summary: result.conversation_summary,
      persisted_count: persistedEntries.length,
    });
  }
);
