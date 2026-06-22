/**
 * AI-Powered Automatic Time Extraction
 * =====================================
 *
 * Analyzes WhatsApp conversations and Legal Chat interactions to automatically
 * generate time entries with description + minute estimates — no manual input needed.
 *
 * The killer feature: every substantive lawyer-client interaction is automatically
 * captured as a draft time entry, ready for approval.
 *
 * Pipeline:
 *   1. Conversation context (messages, case, duration) → feature extraction
 *   2. Heuristic classification → activity type + estimated minutes
 *   3. Draft time entry → approval gate → persist
 *
 * No LLM call required — uses deterministic heuristics based on message patterns,
 * legal activity types, and conversation complexity signals. This makes it
 * fast, free, and auditable.
 */

import { randomUUID } from "node:crypto";
import type { TimeEntry } from "@/lib/legal-types";

// ── Types ─────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: "client" | "lawyer" | "assistant" | "system";
  text: string;
  timestamp: string;
  has_media?: boolean;
  media_type?: "voice" | "document" | "image" | "audio" | "video";
  word_count?: number;
}

export interface ConversationContext {
  messages: ConversationMessage[];
  case_slug?: string;
  case_title?: string;
  lawyer_name?: string;
  default_rate?: number;
  started_at?: string;
  ended_at?: string;
}

export interface ExtractedTimeEntry {
  id: string;
  description: string;
  minutes: number;
  billable: boolean;
  activity_type: string;
  confidence: "high" | "medium" | "low";
  confidence_reason: string;
  suggested_rate?: number;
  source: "whatsapp" | "legal_chat" | "voice_transcription" | "document_review";
  case_slug?: string;
  lawyer?: string;
  date: string;
  draft: boolean;
  needs_approval: boolean;
}

export interface ExtractionResult {
  entries: ExtractedTimeEntry[];
  total_minutes: number;
  billable_minutes: number;
  skipped_reason?: string;
  conversation_summary: string;
}

// ── Activity Type Detection ───────────────────────────────────────────

export type LegalActivityType =
  | "consultation"
  | "research"
  | "drafting"
  | "correspondence"
  | "review"
  | "hearing"
  | "phone_call"
  | "meeting"
  | "document_analysis"
  | "negotiation"
  | "deadline_check"
  | "intake"
  | "case_management"
  | "travel";

const ACTIVITY_KEYWORDS: Array<{ type: LegalActivityType; patterns: RegExp[] }> = [
  {
    type: "review",
    patterns: [
      /\b(?:review|prüfung|pruefung|durchsehen|begutachtung|korrektur|überarbeitung|ueberarbeitung|redline)\b/i,
      /\b(?:vertrag pruefen|vertrag prüfen|dokument pruefen|dokument prüfen|aktennotiz)\b/i,
    ],
  },
  {
    type: "drafting",
    patterns: [
      /\b(?:entwurf|draft|klage|klageschrift|berufung|revision|widerspruch|antrag|schriftsatz|vertragsentwurf)\b/i,
      /\b(?:drafting|verfassen|erstellen|ausarbeiten)\b/i,
    ],
  },
  {
    type: "research",
    patterns: [
      /\b(?:recherche|research|urteil|gerichtsurteil|rechtsprechung|norm|paragraf|gesetz|kommentar|literatur)\b/i,
      /\b(?:pruefung|prüfung|analyse|gutachten|rechtsgutachten)\b/i,
    ],
  },
  {
    type: "correspondence",
    patterns: [
      /\b(?:email|e-mail|brief|schreiben|fax|bea|nachricht|antwort|kuendigung|kündigung)\b/i,
      /\b(?:correspondence|schriftverkehr)\b/i,
    ],
  },
  {
    type: "negotiation",
    patterns: [
      /\b(?:verhandlung|negotiation|vergleich|einigung|settlement|verhandeln)\b/i,
      /\b(?:mediation|schlichtung)\b/i,
    ],
  },
  {
    type: "hearing",
    patterns: [
      /\b(?:termin|verhandlung|gerichtsverhandlung|muenchner|termin wahrnehmen)\b/i,
      /\b(?:hearing|court appearance|saal|richter|vorsitzender)\b/i,
    ],
  },
  {
    type: "phone_call",
    patterns: [
      /\b(?:telefonat|anruf|telefon|call|phone)\b/i,
      /\b(?:angerufen|telefoniert|rueckruf|rückruf)\b/i,
    ],
  },
  {
    type: "meeting",
    patterns: [
      /\b(?:besprechung|meeting|termin mit|mandantengespraech|mandantengespräch|besprechen)\b/i,
      /\b(?:konferenz|beratungsgespraech|beratungsgespräch)\b/i,
    ],
  },
  {
    type: "document_analysis",
    patterns: [
      /\b(?:dokument|urkunde|vertrag analysiert|unterlagen|belege|evidence|beweis)\b/i,
      /\b(?:akte durchgesehen|aktenstudium)\b/i,
    ],
  },
  {
    type: "deadline_check",
    patterns: [
      /\b(?:frist|deadline|fristende|fristberechnung|fristkontrolle|wahrung)\b/i,
      /\b(?:fristablauf|notfrist)\b/i,
    ],
  },
  {
    type: "intake",
    patterns: [
      /\b(?:mandatsaufnahme|intake|neuer mandant|erstgespraech|erstgespräch|aufnahme)\b/i,
      /\b(?:neuer fall|neue akte|mandatierung)\b/i,
    ],
  },
  {
    type: "travel",
    patterns: [
      /\b(?:reise|fahrt|anreise|travel|pendeln|wegstrecke)\b/i,
      /\b(?:gerichtstermin.*fahrt|anfahrt)\b/i,
    ],
  },
  {
    type: "consultation",
    patterns: [
      /\b(?:beratung|consultation|ratschlag|empfehlung|hinweis|auskunft|frage|kurze?)\b/i,
      /\b(?:rechtlicher rat|rechtshinweis)\b/i,
    ],
  },
];

// ── Time Estimation Heuristics ────────────────────────────────────────

const ACTIVITY_BASE_MINUTES: Record<LegalActivityType, number> = {
  consultation: 15,
  research: 30,
  drafting: 45,
  correspondence: 10,
  review: 25,
  hearing: 60,
  phone_call: 10,
  meeting: 30,
  document_analysis: 20,
  negotiation: 30,
  deadline_check: 5,
  intake: 30,
  case_management: 10,
  travel: 30,
};

const ACTIVITY_RATE: Record<LegalActivityType, number | undefined> = {
  consultation: undefined,
  research: undefined,
  drafting: undefined,
  correspondence: undefined,
  review: undefined,
  hearing: undefined,
  phone_call: undefined,
  meeting: undefined,
  document_analysis: undefined,
  negotiation: undefined,
  deadline_check: undefined,
  intake: undefined,
  case_management: undefined,
  travel: undefined,
};

function detectActivityTypes(messages: ConversationMessage[]): LegalActivityType[] {
  const allText = messages.map((m) => m.text).join(" ");
  const detected: Array<{ type: LegalActivityType; score: number }> = [];

  for (const { type, patterns } of ACTIVITY_KEYWORDS) {
    let score = 0;
    for (const pattern of patterns) {
      const matches = allText.match(new RegExp(pattern.source, pattern.flags + "g"));
      if (matches) score += matches.length;
    }
    if (score > 0) detected.push({ type, score });
  }

  detected.sort((a, b) => b.score - a.score);
  return detected.length > 0 ? detected.map((d) => d.type) : ["case_management"];
}

function estimateMinutes(
  messages: ConversationMessage[],
  activityTypes: LegalActivityType[],
  context: ConversationContext
): number {
  const primaryActivity = activityTypes[0] ?? "case_management";
  let baseMinutes = ACTIVITY_BASE_MINUTES[primaryActivity] ?? 15;

  // Adjust based on conversation length
  const _totalWords = messages.reduce(
    (sum, m) => sum + (m.word_count ?? m.text.split(/\s+/).length),
    0
  );
  const lawyerMessages = messages.filter((m) => m.role === "lawyer" || m.role === "assistant");
  const lawyerWords = lawyerMessages.reduce(
    (sum, m) => sum + (m.word_count ?? m.text.split(/\s+/).length),
    0
  );

  // +5 min per 50 lawyer words (substantive legal work), capped at +60
  const wordAdjustment = Math.min(60, Math.floor(lawyerWords / 50) * 5);
  baseMinutes += wordAdjustment;

  // Voice messages: +10 min per voice message (transcription + review)
  const voiceCount = messages.filter((m) => m.media_type === "voice").length;
  baseMinutes += voiceCount * 10;

  // Document review: +15 min per document
  const docCount = messages.filter((m) => m.media_type === "document").length;
  baseMinutes += docCount * 15;

  // Multiple activity types: +5 min per additional activity
  if (activityTypes.length > 1) {
    baseMinutes += (activityTypes.length - 1) * 5;
  }

  // Time span: if conversation spans > 30 min, add proportional time
  if (context.started_at && context.ended_at) {
    const spanMs = new Date(context.ended_at).getTime() - new Date(context.started_at).getTime();
    const spanMin = spanMs / 60000;
    if (spanMin > 30 && spanMin < 480) {
      // Use 50% of span as active work time, but not more than current estimate + 60
      const spanBased = Math.floor(spanMin * 0.5);
      baseMinutes = Math.max(baseMinutes, Math.min(spanBased, baseMinutes + 60));
    }
  }

  // Round to nearest 5 minutes (industry standard for billing)
  baseMinutes = Math.round(baseMinutes / 5) * 5;

  // Minimum 5 minutes, maximum 480 minutes (8 hours)
  return Math.max(5, Math.min(480, baseMinutes));
}

function buildDescription(
  messages: ConversationMessage[],
  activityTypes: LegalActivityType[],
  context: ConversationContext
): string {
  const primary = activityTypes[0] ?? "case_management";
  const activityLabels: Record<LegalActivityType, string> = {
    consultation: "Beratung",
    research: "Recherche",
    drafting: "Entwurf",
    correspondence: "Korrespondenz",
    review: "Prüfung",
    hearing: "Gerichtstermin",
    phone_call: "Telefonat",
    meeting: "Besprechung",
    document_analysis: "Dokumentenanalyse",
    negotiation: "Verhandlung",
    deadline_check: "Fristkontrolle",
    intake: "Mandatsaufnahme",
    case_management: "Aktenführung",
    travel: "Reisezeit",
  };

  const label = activityLabels[primary];
  const caseLabel = context.case_title ? ` — ${context.case_title}` : "";

  // Try to extract a topic from the conversation
  const firstLawyerMsg = messages.find((m) => m.role === "lawyer" || m.role === "assistant");
  let topic = "";
  if (firstLawyerMsg) {
    // Take first 60 chars of the first substantive lawyer message
    const text = firstLawyerMsg.text.trim().replace(/\s+/g, " ");
    topic = text.length > 60 ? text.slice(0, 57) + "…" : text;
  }

  if (topic) {
    return `${label}: ${topic}${caseLabel}`;
  }
  return `${label}${caseLabel}`;
}

function assessConfidence(
  messages: ConversationMessage[],
  activityTypes: LegalActivityType[]
): { confidence: "high" | "medium" | "low"; reason: string } {
  const lawyerMessages = messages.filter((m) => m.role === "lawyer" || m.role === "assistant");
  const clientMessages = messages.filter((m) => m.role === "client");

  if (lawyerMessages.length === 0) {
    return {
      confidence: "low",
      reason: "No lawyer/assistant messages in conversation — cannot verify substantive work",
    };
  }

  const lawyerWords = lawyerMessages.reduce(
    (sum, m) => sum + (m.word_count ?? m.text.split(/\s+/).length),
    0
  );

  if (lawyerWords < 20) {
    return {
      confidence: "low",
      reason: "Very short lawyer response — likely a brief acknowledgment, not substantive work",
    };
  }

  if (lawyerWords > 40 && activityTypes.length >= 2) {
    return {
      confidence: "high",
      reason: "Substantial lawyer response with multiple detectable activity types",
    };
  }

  if (lawyerWords > 20 && clientMessages.length > 0) {
    return {
      confidence: "medium",
      reason: "Moderate lawyer response in a client conversation",
    };
  }

  return {
    confidence: "medium",
    reason: "Some lawyer activity detected, but context is limited",
  };
}

function shouldSkipConversation(messages: ConversationMessage[]): {
  skip: boolean;
  reason?: string;
} {
  if (messages.length === 0) {
    return { skip: true, reason: "Empty conversation" };
  }

  // Skip if only system messages
  const nonSystem = messages.filter((m) => m.role !== "system");
  if (nonSystem.length === 0) {
    return { skip: true, reason: "Only system messages" };
  }

  // Skip if only very short messages (e.g., "Ja", "Ok", "👍")
  const substantive = messages.filter((m) => (m.word_count ?? m.text.split(/\s+/).length) > 5);
  if (substantive.length === 0) {
    return { skip: true, reason: "No substantive messages (all under 6 words)" };
  }

  // Skip if only client messages (no lawyer work performed)
  const hasLawyerMessage = messages.some((m) => m.role === "lawyer" || m.role === "assistant");
  if (!hasLawyerMessage) {
    return { skip: true, reason: "No lawyer/assistant response — no billable work detected" };
  }

  return { skip: false };
}

function buildConversationSummary(messages: ConversationMessage[]): string {
  const lawyerMsgs = messages.filter((m) => m.role === "lawyer" || m.role === "assistant");
  const clientMsgs = messages.filter((m) => m.role === "client");
  const voiceMsgs = messages.filter((m) => m.media_type === "voice");
  const docMsgs = messages.filter((m) => m.media_type === "document");

  const parts: string[] = [];
  parts.push(`${messages.length} Nachrichten`);
  parts.push(`${clientMsgs.length} Mandant / ${lawyerMsgs.length} Kanzlei`);
  if (voiceMsgs.length > 0) parts.push(`${voiceMsgs.length} Sprachnachricht(en)`);
  if (docMsgs.length > 0) parts.push(`${docMsgs.length} Dokument(e)`);

  return parts.join(", ");
}

// ── Main Extraction Function ──────────────────────────────────────────

export function extractTimeFromConversation(
  context: ConversationContext,
  source: ExtractedTimeEntry["source"] = "whatsapp"
): ExtractionResult {
  const { messages } = context;

  const skipCheck = shouldSkipConversation(messages);
  if (skipCheck.skip) {
    return {
      entries: [],
      total_minutes: 0,
      billable_minutes: 0,
      skipped_reason: skipCheck.reason,
      conversation_summary: buildConversationSummary(messages),
    };
  }

  const activityTypes = detectActivityTypes(messages);
  const minutes = estimateMinutes(messages, activityTypes, context);
  const description = buildDescription(messages, activityTypes, context);
  const { confidence, reason: confidence_reason } = assessConfidence(messages, activityTypes);

  // Non-billable if low confidence and very short
  const billable = confidence !== "low" || minutes > 10;

  const entry: ExtractedTimeEntry = {
    id: randomUUID(),
    description,
    minutes,
    billable,
    activity_type: activityTypes[0] ?? "case_management",
    confidence,
    confidence_reason,
    suggested_rate: context.default_rate ?? ACTIVITY_RATE[activityTypes[0] as LegalActivityType],
    source,
    case_slug: context.case_slug,
    lawyer: context.lawyer_name,
    date: context.ended_at ?? new Date().toISOString().split("T")[0],
    draft: true,
    needs_approval: true,
  };

  return {
    entries: [entry],
    total_minutes: minutes,
    billable_minutes: billable ? minutes : 0,
    conversation_summary: buildConversationSummary(messages),
  };
}

// ── Convert to TimeEntry ──────────────────────────────────────────────

export function extractedToTimeEntry(
  extracted: ExtractedTimeEntry,
  overrides?: Partial<TimeEntry>
): TimeEntry {
  return {
    id: extracted.id,
    description: overrides?.description ?? extracted.description,
    minutes: overrides?.minutes ?? extracted.minutes,
    date: overrides?.date ?? extracted.date,
    rate: overrides?.rate ?? extracted.suggested_rate,
    billable: overrides?.billable ?? extracted.billable,
    billed: false,
    lawyer: overrides?.lawyer ?? extracted.lawyer,
    activity_type: overrides?.activity_type ?? extracted.activity_type,
    note:
      overrides?.note ??
      `Auto-extracted from ${extracted.source} (confidence: ${extracted.confidence})`,
  };
}

// ── Batch Extraction for Multiple Conversations ───────────────────────

export function extractTimeFromMultipleConversations(
  conversations: Array<{ context: ConversationContext; source?: ExtractedTimeEntry["source"] }>
): ExtractionResult {
  const allEntries: ExtractedTimeEntry[] = [];
  let totalMinutes = 0;
  let billableMinutes = 0;

  for (const { context, source } of conversations) {
    const result = extractTimeFromConversation(context, source);
    allEntries.push(...result.entries);
    totalMinutes += result.total_minutes;
    billableMinutes += result.billable_minutes;
  }

  return {
    entries: allEntries,
    total_minutes: totalMinutes,
    billable_minutes: billableMinutes,
    conversation_summary: `${conversations.length} Konversation(en) analysiert, ${allEntries.length} Zeiteinträge generiert`,
  };
}
