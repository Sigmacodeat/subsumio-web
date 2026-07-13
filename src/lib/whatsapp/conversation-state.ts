/**
 * Conversation State Management for WhatsApp Multi-Step Interactions.
 *
 * When a user sends an incomplete command (e.g., "neuer termin" without details),
 * the system stores a "conversation state" that tracks what information is missing.
 * The next message from the same user is then checked against the pending state
 * to complete the interaction.
 *
 * States are stored as brain pages with type "chat_conversation_state".
 * They expire after 10 minutes of inactivity.
 */

import { randomUUID } from "node:crypto";
import { engineRequest, listPages } from "@/lib/engine-client";
import type { BrainPage } from "@/lib/types";
import { phoneHash } from "@/lib/whatsapp/verify";
import type { WhatsAppIdentity } from "@/lib/whatsapp/types";
import type { ParsedIntent } from "@/lib/legal-chat/actions";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const STATE_TYPE = "chat_conversation_state";

export interface ConversationState {
  /** The intent kind that needs more information */
  expectedKind: string;
  /** Which fields are still missing */
  missingFields: string[];
  /** Partial data already collected */
  partial: Record<string, unknown>;
  /** ISO timestamp when the state was created */
  createdAt: string;
  /** The original user message that started this conversation */
  originalText: string;
}

function fm(page: BrainPage): Record<string, unknown> {
  return page.frontmatter ?? {};
}

function str(val: unknown): string {
  return typeof val === "string" ? val : "";
}

/**
 * Save a conversation state for a sender.
 */
export async function saveConversationState(
  sender: WhatsAppIdentity,
  fromPhone: string,
  state: ConversationState
): Promise<void> {
  const senderHash = phoneHash(fromPhone);
  const slug = `chat/state/${senderHash}/${Date.now()}-${randomUUID().slice(0, 8)}`;

  await engineRequest(sender.brainId, "/api/pages", {
    method: "POST",
    body: JSON.stringify({
      slug,
      type: STATE_TYPE,
      title: `Conversation State: ${state.expectedKind}`,
      content: JSON.stringify(state, null, 2),
      frontmatter: {
        type: STATE_TYPE,
        sender_hash: senderHash,
        brain_id: sender.brainId,
        expected_kind: state.expectedKind,
        missing_fields: state.missingFields,
        created_at: state.createdAt,
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
      },
    }),
  });
}

/**
 * Find the latest active conversation state for a sender.
 * Returns null if no state exists or it has expired.
 */
export async function getConversationState(
  sender: WhatsAppIdentity,
  fromPhone: string
): Promise<ConversationState | null> {
  const senderHash = phoneHash(fromPhone);
  const pages = await listPages(sender.brainId, STATE_TYPE, 50).catch(() => [] as BrainPage[]);

  const now = Date.now();
  const active = pages
    .filter((p) => str(fm(p).sender_hash) === senderHash)
    .filter((p) => {
      const expiresAt = str(fm(p).expires_at);
      if (!expiresAt) return false;
      return new Date(expiresAt).getTime() > now;
    })
    .sort((a, b) => {
      const aTime = new Date(str(fm(a).updated_at) || str(fm(a).created_at) || 0).getTime();
      const bTime = new Date(str(fm(b).updated_at) || str(fm(b).created_at) || 0).getTime();
      return bTime - aTime;
    });

  if (active.length === 0) return null;

  const latest = active[0];
  try {
    const state = JSON.parse(latest.content || "{}") as ConversationState;
    if (!state.expectedKind) return null;
    return state;
  } catch {
    return null;
  }
}

/**
 * Clear (expire) all conversation states for a sender.
 * Called after a state is consumed or when the user sends an unrelated command.
 */
export async function clearConversationState(
  sender: WhatsAppIdentity,
  fromPhone: string
): Promise<void> {
  const senderHash = phoneHash(fromPhone);
  const pages = await listPages(sender.brainId, STATE_TYPE, 50).catch(() => [] as BrainPage[]);

  const now = new Date().toISOString();
  for (const page of pages) {
    if (str(fm(page).sender_hash) !== senderHash) continue;
    const expiresAt = str(fm(page).expires_at);
    if (!expiresAt || new Date(expiresAt).getTime() > Date.now()) {
      // Expire it by setting expires_at to now
      await engineRequest(sender.brainId, "/api/pages", {
        method: "POST",
        body: JSON.stringify({
          slug: page.slug,
          type: STATE_TYPE,
          frontmatter: {
            ...fm(page),
            expires_at: now,
            updated_at: now,
          },
        }),
      }).catch(() => {});
    }
  }
}

/**
 * Determine which fields are missing from a partial intent.
 * Returns a list of field names that are required but empty/missing.
 */
export function missingFieldsForIntent(intent: ParsedIntent): string[] {
  switch (intent.kind) {
    case "appointment": {
      const missing: string[] = [];
      if (!intent.date) missing.push("date");
      if (!intent.time) missing.push("time");
      if (!intent.title) missing.push("title");
      return missing;
    }
    case "deadline": {
      const missing: string[] = [];
      if (!intent.dueDate) missing.push("dueDate");
      if (!intent.title) missing.push("title");
      return missing;
    }
    case "task": {
      const missing: string[] = [];
      if (!intent.title) missing.push("title");
      return missing;
    }
    case "time_entry": {
      const missing: string[] = [];
      if (!intent.minutes || intent.minutes <= 0) missing.push("minutes");
      return missing;
    }
    case "expense": {
      const missing: string[] = [];
      if (!intent.amount || intent.amount <= 0) missing.push("amount");
      return missing;
    }
    case "case_note": {
      const missing: string[] = [];
      if (!intent.note) missing.push("note");
      return missing;
    }
    default:
      return [];
  }
}

/**
 * Build a clarifying question for missing fields.
 */
export function buildClarifyingQuestion(expectedKind: string, missing: string[]): string {
  const questions: Record<string, string[]> = {
    date: ["Wann soll der Termin sein?", "Bitte Datum angeben (z.B. 15.07.2026 oder morgen)."],
    time: ["Zu welcher Uhrzeit?", "Bitte Uhrzeit angeben (z.B. 14:00)."],
    title: ["Worum geht es?", "Bitte Thema/Betreff angeben."],
    dueDate: ["Bis wann ist die Frist?", "Bitte Datum angeben (z.B. 15.07.2026 oder in 3 Tagen)."],
    minutes: ["Wie lange hast du gearbeitet?", "Bitte Zeit angeben (z.B. 30m, 1,5h, 2 Stunden)."],
    amount: ["Wie hoch ist die Auslage?", "Bitte Betrag angeben (z.B. 12,50 EUR)."],
    note: ["Was soll ich notieren?", "Bitte Notiztext angeben."],
  };

  const lines: string[] = [];
  for (const field of missing) {
    const q = questions[field];
    if (q) lines.push(q[0]);
  }

  if (lines.length === 0) {
    return "Bitte ergänze die fehlenden Informationen.";
  }

  return lines.join("\n");
}

/**
 * Merge new information from a follow-up message into an existing partial state.
 * Uses the LLM intent parser to extract the missing pieces.
 */
export function mergePartialIntent(
  state: ConversationState,
  newIntent: ParsedIntent
): { merged: Record<string, unknown>; stillMissing: string[] } {
  const merged = { ...state.partial };

  // Copy any non-empty fields from the new intent
  if (newIntent.kind === "appointment") {
    if (newIntent.date) merged.date = newIntent.date;
    if (newIntent.time) merged.time = newIntent.time;
    if (newIntent.title) merged.title = newIntent.title;
    if (newIntent.caseRef) merged.caseRef = newIntent.caseRef;
    if (newIntent.location) merged.location = newIntent.location;
  } else if (newIntent.kind === "deadline") {
    if (newIntent.dueDate) merged.dueDate = newIntent.dueDate;
    if (newIntent.title) merged.title = newIntent.title;
    if (newIntent.caseRef) merged.caseRef = newIntent.caseRef;
  } else if (newIntent.kind === "task") {
    if (newIntent.title) merged.title = newIntent.title;
    if (newIntent.caseRef) merged.caseRef = newIntent.caseRef;
    if (newIntent.dueDate) merged.dueDate = newIntent.dueDate;
  } else if (newIntent.kind === "time_entry") {
    if (newIntent.minutes > 0) merged.minutes = newIntent.minutes;
    if (newIntent.caseRef) merged.caseRef = newIntent.caseRef;
    if (newIntent.description) merged.description = newIntent.description;
    merged.billable = newIntent.billable;
  } else if (newIntent.kind === "expense") {
    if (newIntent.amount > 0) merged.amount = newIntent.amount;
    if (newIntent.caseRef) merged.caseRef = newIntent.caseRef;
    if (newIntent.description) merged.description = newIntent.description;
    merged.billable = newIntent.billable;
  } else if (newIntent.kind === "case_note") {
    if (newIntent.note) merged.note = newIntent.note;
    if (newIntent.caseRef) merged.caseRef = newIntent.caseRef;
  }

  // Check what's still missing
  const stillMissing: string[] = [];
  for (const field of state.missingFields) {
    if (!merged[field]) stillMissing.push(field);
  }

  return { merged, stillMissing };
}
