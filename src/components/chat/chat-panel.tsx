"use client";

// grounding-exempt: answers are grounded here (stream gate or useGroundedAnswer) and
// rendered with CitationPanel in ChatMessageBubble (chat-message.tsx).

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Reply, X, ArrowDown, Quote, MessageSquare, Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { api, CASE_PICKER_MAX } from "@/lib/api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useLang } from "@/lib/use-lang";
import { useMe } from "@/lib/queries/auth";
import { buildSafePrompt } from "@/lib/prompt-sanitizer";
import { localizeAnswerSections } from "@/lib/answer-sections";
import { ApiRequestError } from "@/lib/api";
import type { DashboardKey } from "@/content/dashboard";

/** Human copy for engine/API failures; raw JSON bodies never reach the chat. */
function describeChatError(err: unknown, t: (key: DashboardKey) => string): string {
  if (err instanceof ApiRequestError) {
    if (err.code === "quota_exceeded") return t("chat.error_quota");
    if (err.code === "insufficient_credits" || err.status === 402) return t("chat.error_credits");
    if (err.code === "demo_limit") return t("chat.error_demo_limit");
    if (err.code === "demo_daily_limit") return t("chat.error_demo_daily_limit");
    if (err.code === "rate_limited" || err.status === 429) return t("chat.error_rate_limit");
    if (err.status >= 502 && err.status <= 504) return t("chat.error_engine");
    if (err.message && !err.message.trim().startsWith("{")) return err.message;
    return t("chat.error_generic");
  }
  if (err instanceof Error && err.message && !err.message.trim().startsWith("{"))
    return err.message;
  return t("chat.error_generic");
}
import { csrfFetch } from "@/lib/csrf";
import { tracking } from "@/lib/tracking";
import { synthesisInput } from "@/components/chat/tool-synthesis";
import { mergeSessionLists } from "@/components/chat/chat-session-merge";
import {
  fetchServerSession,
  listServerSessions,
  saveSessionToServer,
  shareSession,
} from "@/lib/chat-server-sync";
import { buildChatExportMarkdown } from "@/components/chat/chat-export";
import {
  buildPromptContext,
  processStreamingChunk,
  type UserContext,
} from "@/components/chat/system-prompt";
import { buildFullMemoryContext, trackMessageInSession } from "@/lib/session-memory";
import { type QueryMode } from "@/lib/matter-context-types";
import type { BrainPage } from "@/lib/types";
import { caseFrontmatter } from "@/lib/legal-types";
import {
  DEFAULT_FEATURES,
  DEFAULT_EXAMPLE_QUERIES,
  DEFAULT_EXAMPLE_QUERIES_EN,
  type ChatMessage,
  type ChatSession,
  type AnswerDownReason,
  type ChatFeatures,
  type ChatContextType,
  type Jurisdiction,
  type ThinkMode,
  type ToolCall,
  type ToolType,
  type ToolResultDisplay,
  DESTRUCTIVE_TOOLS,
  AUTO_EXECUTE_TOOLS,
} from "@/components/chat/chat-types";
import {
  generateSessionId,
  generateMessageId,
  autoTitleFromQuery,
  createSession,
  updateSession,
  deleteSession,
  getSession,
  listSessions,
  loadMessages,
  saveMessage,
  pinSession,
  unpinSession,
  setSessionTags,
} from "@/components/chat/chat-session-store";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatInput } from "@/components/chat/chat-input";
import { SubsumptionPanel } from "@/components/chat/subsumption-panel";
import { ChatMessageBubble } from "@/components/chat/chat-message";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { useGroundedAnswer, withSupportCheck } from "@/lib/use-grounded-answer";
import type { GroundingMetadata } from "@/lib/citation-gate-client";
import type { TFunc } from "@/content/dashboard";
import type { ReactNode } from "react";
import { useAiDocxExport } from "@/components/legal/use-ai-docx-export";

interface ChatPanelProps {
  context?: {
    type: ChatContextType;
    caseSlug?: string;
    pageSlug?: string;
    pageLabel?: string;
  };
  features?: Partial<ChatFeatures>;
  persistHistory?: boolean;
  className?: string;
  title?: string;
  initialQuery?: string;
  /** Load this session on mount instead of the latest one (panel → fullscreen handoff). */
  initialSessionId?: string;
  /** Owner of `initialSessionId` when it is a colleague's shared conversation. */
  initialSessionOwner?: string;
  placeholder?: string;
  onStreamingChange?: (isStreaming: boolean) => void;
  exampleQueries?: string[];
  headerActions?: ReactNode;
  /**
   * Whether this panel is currently visible to the user (open sidebar drawer,
   * or a page that's always visible). A panel that stays mounted while
   * collapsed — the docked copilot sidebar — doesn't re-fetch the session
   * list on its own; pass this so a session started elsewhere (the other
   * mounted instance, or the fullscreen /dashboard/chat page) shows up the
   * moment the panel is opened rather than only after a reload.
   */
  isVisible?: boolean;
}

function queryModeToThinkMode(mode: QueryMode): ThinkMode {
  return mode === "deep_matter"
    ? "tokenmax"
    : mode === "conservative"
      ? "conservative"
      : "balanced";
}

// ── Copilot Tool Detection ────────────────────────────────────────────
// Parses AI response for structured tool-use markers and executes tools.

interface ToolSpec {
  tool: ToolType;
  label: string;
  /**
   * Turns a marker's key="value" attributes (order-independent — see
   * parseToolMarkerAttrs below) into the tool's params. Returns null when a
   * required attribute is missing, so that marker is skipped exactly like an
   * unmatched regex used to be skipped.
   */
  transform: (attrs: Record<string, string>) => Record<string, unknown> | null;
}

// Each tool used to have its own regex with a fixed attribute order
// (`route="…"` had to come before nothing, `search_deadlines` required
// `status` to be the LAST attribute the model emitted, etc.) — if the model
// wrote the same attributes in a different order, the whole marker silently
// failed to match and the tool never ran. TOOL_SPECS instead only declares
// how to turn a name→value attribute map into params; parseToolMarkers below
// finds every `[TOOL:name ...]` block generically and reads its attributes
// regardless of order.
const TOOL_SPECS: ToolSpec[] = [
  {
    tool: "navigate",
    label: "chat.tool.navigate",
    transform: (a) => (a.route ? { route: a.route } : null),
  },
  {
    tool: "search_cases",
    label: "chat.tool.search_cases",
    transform: (a) => (a.query ? { query: a.query } : null),
  },
  {
    tool: "search_deadlines",
    label: "chat.tool.search_deadlines",
    transform: (a) => (a.status ? { case_slug: a.case_slug || undefined, status: a.status } : null),
  },
  {
    tool: "search_knowledge",
    label: "chat.tool.search_knowledge",
    transform: (a) => (a.query ? { query: a.query } : null),
  },
  {
    tool: "create_case",
    label: "chat.tool.create_case",
    transform: (a) =>
      a.title
        ? {
            title: a.title,
            client_name: a.client_name || undefined,
            opponent_name: a.opponent_name || undefined,
            case_type: a.case_type || undefined,
          }
        : null,
  },
  {
    tool: "case_summary",
    label: "chat.tool.case_summary",
    transform: (a) => (a.case_slug ? { case_slug: a.case_slug } : null),
  },
  {
    tool: "email_draft",
    label: "chat.tool.email_draft",
    transform: (a) =>
      a.subject
        ? {
            subject: a.subject,
            recipient: a.recipient || undefined,
            case_slug: a.case_slug || undefined,
            tone: (a.tone as "formal" | "neutral" | "urgent") || "formal",
          }
        : null,
  },
  // No send_email spec: the Copilot is never offered sending mail, so a
  // send_email marker can only come from injected text. Mail goes out from
  // the mailbox after a draft (email_draft).
  {
    tool: "deadline_extract",
    label: "chat.tool.deadline_extract",
    transform: (a) => (a.document_slug ? { document_slug: a.document_slug } : null),
  },
  {
    tool: "document_summary",
    label: "chat.tool.document_summary",
    transform: (a) => (a.document_slug ? { document_slug: a.document_slug } : null),
  },
  {
    tool: "conflict_check",
    label: "chat.tool.conflict_check",
    transform: (a) => (a.name ? { name: a.name } : null),
  },
  {
    tool: "time_entry",
    label: "chat.tool.time_entry",
    transform: (a) =>
      a.case_slug && a.description
        ? {
            case_slug: a.case_slug,
            description: a.description,
            hours: a.hours ? parseFloat(a.hours) : undefined,
            activity_type:
              (a.activity_type as
                | "research"
                | "drafting"
                | "review"
                | "meeting"
                | "correspondence"
                | "other") || "other",
          }
        : null,
  },
  {
    tool: "client_update",
    label: "chat.tool.client_update",
    transform: (a) =>
      a.case_slug
        ? {
            case_slug: a.case_slug,
            update_type:
              (a.update_type as "status" | "deadline" | "next_steps" | "summary") || "status",
          }
        : null,
  },
  {
    tool: "meeting_tasks",
    label: "chat.tool.meeting_tasks",
    transform: (a) => (a.notes ? { notes: a.notes, case_slug: a.case_slug || undefined } : null),
  },
  {
    tool: "intake_create",
    label: "chat.tool.intake_create",
    transform: (a) =>
      a.client_name && a.matter_type
        ? {
            client_name: a.client_name,
            matter_type: a.matter_type,
            jurisdiction: "at",
            urgency: (a.urgency as "low" | "medium" | "high" | "critical") || "medium",
          }
        : null,
  },
  {
    tool: "document_request_create",
    label: "chat.tool.document_request_create",
    transform: (a) =>
      a.case_slug
        ? {
            case_slug: a.case_slug,
            items: a.items
              ? a.items
                  .split(";")
                  .map((item) => item.trim())
                  .filter(Boolean)
              : undefined,
            message_draft: a.message || undefined,
          }
        : null,
  },
  {
    tool: "precedent_search",
    label: "chat.tool.precedent_search",
    transform: (a) =>
      a.query
        ? {
            query: a.query,
            jurisdiction: a.jurisdiction?.toLowerCase() === "at" ? "at" : undefined,
            legal_area: a.legal_area || undefined,
          }
        : null,
  },
  {
    tool: "translate_text",
    label: "chat.tool.translate_text",
    transform: (a) =>
      a.target_language
        ? {
            target_language: a.target_language,
            source_language: a.source_language || undefined,
            text: a.text || undefined,
            document_slug: a.document_slug || undefined,
          }
        : null,
  },
  {
    tool: "obligation_extract",
    label: "chat.tool.obligation_extract",
    transform: (a) => ({
      document_slug: a.document_slug || undefined,
      jurisdiction: a.jurisdiction?.toLowerCase() === "all" ? "all" : "at",
      text: a.text || undefined,
    }),
  },
  {
    tool: "tabular_review",
    label: "chat.tool.tabular_review",
    transform: (a) =>
      a.questions
        ? {
            questions: a.questions
              .split(";")
              .map((question) => question.trim())
              .filter(Boolean),
            document_slugs: a.document_slugs
              ? a.document_slugs
                  .split(";")
                  .map((slug) => slug.trim())
                  .filter(Boolean)
              : undefined,
            case_slug: a.case_slug || undefined,
          }
        : null,
  },
  {
    tool: "client_lookup",
    label: "chat.tool.client_lookup",
    transform: (a) =>
      a.query
        ? {
            query: a.query,
            deadline_status:
              (a.deadline_status as "open" | "critical" | "overdue" | "all") || "open",
          }
        : null,
  },
  {
    tool: "deadline_mark_done",
    label: "chat.tool.deadline_mark_done",
    transform: (a) => (a.deadline_slug ? { deadline_slug: a.deadline_slug } : null),
  },
  {
    tool: "search_tasks",
    label: "chat.tool.search_tasks",
    transform: (a) => ({
      case_slug: a.case_slug || undefined,
      status: (a.status as "open" | "done" | "all") || "open",
      priority: (a.priority as "low" | "medium" | "high" | "critical" | "all") || "all",
    }),
  },
  {
    tool: "search_calendar",
    label: "chat.tool.search_calendar",
    transform: (a) => ({
      date: a.date || undefined,
      range: (a.range as "today" | "week" | "month") || "week",
      case_slug: a.case_slug || undefined,
    }),
  },
  {
    tool: "create_task",
    label: "chat.tool.create_task",
    // case_slug is optional here (not required by transform) even though the
    // server requires it — this tool is in MATTER_SCOPED_TOOLS, so
    // detectToolCalls fills case_slug from the open matter afterwards when
    // the model omits it, the same way email_draft/search_deadlines do.
    // Requiring it here would make that auto-fill unreachable: the marker
    // would already be dropped as "missing required attribute" before
    // auto-injection ever ran.
    transform: (a) =>
      a.title
        ? { case_slug: a.case_slug, title: a.title, due_date: a.due_date || undefined }
        : null,
  },
  {
    tool: "create_deadline",
    label: "chat.tool.create_deadline",
    // Same reasoning as create_task above — case_slug left to auto-inject.
    transform: (a) =>
      a.title && a.due_date
        ? { case_slug: a.case_slug, title: a.title, due_date: a.due_date }
        : null,
  },
  {
    tool: "create_contact",
    label: "chat.tool.create_contact",
    transform: (a) =>
      a.name
        ? {
            name: a.name,
            role: a.role || undefined,
            email: a.email || undefined,
            phone: a.phone || undefined,
            company: a.company || undefined,
          }
        : null,
  },
  {
    tool: "request_signature",
    label: "chat.tool.request_signature",
    // Same reasoning as create_task above — case_slug left to auto-inject.
    transform: (a) =>
      a.document_name && a.recipient_name
        ? {
            case_slug: a.case_slug,
            document_name: a.document_name,
            recipient_name: a.recipient_name,
            recipient_email: a.recipient_email || undefined,
            template: a.template === "nda" ? "nda" : "manual",
          }
        : null,
  },
  {
    tool: "render_template",
    label: "chat.tool.render_template",
    transform: (a) =>
      a.template_query
        ? {
            template_query: a.template_query,
            case_slug: a.case_slug || undefined,
            create_document: a.create_document === "true",
          }
        : null,
  },
  {
    tool: "register_lookup",
    label: "chat.tool.register_lookup",
    transform: (a) =>
      a.query || a.register_number
        ? {
            register: a.register || undefined,
            query: a.query || undefined,
            register_number: a.register_number || undefined,
            court: a.court || undefined,
          }
        : null,
  },
  {
    tool: "invoice_draft",
    label: "chat.tool.invoice_draft",
    // case_slug wie bei create_task: Auto-Inject aus der offenen Akte.
    transform: (a) => ({ case_slug: a.case_slug, notes: a.notes || undefined }),
  },
  {
    tool: "organize_documents",
    label: "chat.tool.organize_documents",
    transform: (a) => ({
      case_slug: a.case_slug || undefined,
      only_unsorted: a.only_unsorted !== "false",
      overwrite: a.overwrite === "true",
    }),
  },
  {
    tool: "create_automation_rule",
    label: "chat.tool.create_automation_rule",
    transform: (a) =>
      a.name && a.event && a.action_type
        ? {
            name: a.name,
            event: a.event,
            within_days: a.within_days ? Number(a.within_days) : undefined,
            action: {
              type: a.action_type,
              title: a.action_title || undefined,
              message: a.action_message || undefined,
              assignee: a.action_assignee || undefined,
              due_in_days: a.action_due_in_days ? Number(a.action_due_in_days) : undefined,
              workflow_template_id: a.action_workflow_template_id || undefined,
              recipient: a.action_recipient || undefined,
              status: a.action_status || undefined,
            },
          }
        : null,
  },
];

const TOOL_SPEC_BY_NAME = new Map(TOOL_SPECS.map((spec) => [spec.tool as string, spec]));

/** Matches one `[TOOL:name key="value" key2="value2" …]` marker, attributes in any order. */
const TOOL_MARKER_PATTERN = /\[TOOL:([a-z_]+)((?:\s+[a-z_]+="[^"]*")*)\s*\]/gi;
const TOOL_ATTR_PATTERN = /([a-z_]+)="([^"]*)"/gi;

function parseToolMarkerAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = new RegExp(TOOL_ATTR_PATTERN.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    attrs[m[1].toLowerCase()] = m[2];
  }
  return attrs;
}

// Detect all tool markers in AI response — supports multiple tools per response (G16)
export function detectToolCalls(
  answer: string,
  context: { type: ChatContextType; caseSlug?: string; pageSlug?: string }
): ToolCall[] {
  const matterSlug = context.caseSlug;

  // Tools that benefit from automatic matter-scoping
  const MATTER_SCOPED_TOOLS = new Set([
    "email_draft",
    "send_email",
    "client_update",
    "time_entry",
    "case_summary",
    "search_deadlines",
    "client_lookup",
    "create_task",
    "create_deadline",
    "request_signature",
    "render_template",
    "invoice_draft",
    "organize_documents",
  ]);

  const calls: ToolCall[] = [];
  const re = new RegExp(TOOL_MARKER_PATTERN.source, "gi");
  let match: RegExpExecArray | null;
  // A single left-to-right scan finds every marker — of any tool, repeated
  // any number of times — already in the order the model emitted them (G16:
  // tool chaining), so no separate per-rule pass or position sort is needed.
  while ((match = re.exec(answer))) {
    const spec = TOOL_SPEC_BY_NAME.get(match[1].toLowerCase());
    if (!spec) continue; // unknown tool name — left for the display-side stripper to remove

    const params = spec.transform(parseToolMarkerAttrs(match[2] ?? ""));
    if (!params) continue; // a required attribute was missing

    if (matterSlug && MATTER_SCOPED_TOOLS.has(spec.tool) && !params.case_slug) {
      params.case_slug = matterSlug;
    }

    // Only free, read-only lookups run without a click; paid runs, drafts and
    // anything that changes data wait for confirmation (prompt-injection guard).
    const needsClick = DESTRUCTIVE_TOOLS.has(spec.tool) || !AUTO_EXECUTE_TOOLS.has(spec.tool);
    calls.push({
      id: `${spec.tool}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: spec.tool,
      label: spec.label,
      params,
      status: needsClick ? "pending" : "executing",
      requiresConfirmation: needsClick,
    });
  }

  return calls;
}

// Execute a single tool call (used for both immediate and confirmed execution)
async function executeToolCall(
  toolCall: ToolCall,
  context?: { caseSlug?: string }
): Promise<ToolCall> {
  try {
    const result = DESTRUCTIVE_TOOLS.has(toolCall.type)
      ? await api.copilot.executeConfirmedTool(toolCall.type, toolCall.params)
      : await api.copilot.executeTool(toolCall.type, toolCall.params);
    const executed: ToolCall = {
      ...toolCall,
      status: result.success ? "completed" : "error",
      result: {
        success: result.success,
        data: result.data,
        error: result.error,
        display: result.display as ToolResultDisplay,
      },
    };

    // P2.7: Record successful agent actions as memories (agent-generated facts)
    if (result.success) {
      api.memory
        .recordAgentAction({
          key: `tool_${toolCall.type}_${Date.now()}`,
          value: `Tool "${toolCall.type}" ausgeführt: ${JSON.stringify(toolCall.params).slice(0, 200)}`,
          type: "fact",
          caseSlug: context?.caseSlug,
        })
        .catch(() => {});
    }

    return executed;
  } catch (err) {
    return {
      ...toolCall,
      status: "error",
      result: {
        success: false,
        error: err instanceof Error ? err.message : "Tool execution failed",
        display: {
          kind: "confirmation",
          title: "Fehler",
          message: "Tool konnte nicht ausgeführt werden",
        },
      },
    };
  }
}

// Detect tools and run the auto-execute allowlist immediately; everything else stays pending
async function detectAndExecuteTools(
  answer: string,
  context: { type: ChatContextType; caseSlug?: string; pageSlug?: string }
): Promise<ToolCall[]> {
  const allCalls = detectToolCalls(answer, context);

  // Execute allowlisted read-only tools immediately, leave the rest pending
  const results = await Promise.all(
    allCalls.map((tc) =>
      tc.requiresConfirmation
        ? Promise.resolve(tc)
        : executeToolCall(tc, { caseSlug: context.caseSlug })
    )
  );

  return results;
}

/** The matter's jurisdiction for the prompt; Austrian law when the matter names none. */
function matterJurisdiction(value: unknown): Jurisdiction {
  const code = typeof value === "string" ? value.toLowerCase() : "";
  return code === "de" || code === "ch" || code === "eu" ? code : "at";
}

function sanitizeSessionMessages(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map((msg) => {
    let changed = false;
    let next = msg;

    if (msg.isStreaming) {
      next = { ...next, isStreaming: false, content: next.content || "[Generierung abgebrochen]" };
      changed = true;
    }

    if (msg.toolCalls?.some((tc) => tc.status === "pending")) {
      next = {
        ...next,
        toolCalls: msg.toolCalls.map((tc) =>
          tc.status === "pending"
            ? {
                ...tc,
                status: "error" as const,
                result: {
                  success: false,
                  error: "Bestätigung abgelaufen — bitte erneut anfragen",
                  display: {
                    kind: "confirmation" as const,
                    title: "Abgelaufen",
                    message: "Diese Tool-Aktion wurde nicht bestätigt und ist abgelaufen.",
                  },
                },
              }
            : tc
        ),
      };
      changed = true;
    }

    return changed ? next : msg;
  });
}

export interface ChatPanelHandle {
  sendMessage: (
    text: string,
    options?: {
      attachments?: Array<{ name: string; slug: string }>;
      replyTo?: { id: string; role: "user" | "assistant"; preview: string } | null;
    }
  ) => void;
  /** Current session id — used to hand the conversation off to the fullscreen chat. */
  getActiveSessionId: () => string | undefined;
  loadSession: (id: string) => Promise<void>;
  /** Pin a passage the person marked on the page; the next question is about it. */
  quoteSelection: (text: string, source?: string) => void;
}

// AP4: Tool-type → specific follow-up suggestions
const TOOL_FOLLOW_UPS_DE: Partial<Record<ToolType, Array<{ label: string; query: string }>>> = {
  search_deadlines: [
    { label: "Überfällige Fristen", query: "Welche Fristen sind bereits überfällig?" },
    { label: "Kritische Fristen", query: "Welche Fristen laufen in den nächsten 3 Tagen ab?" },
    { label: "Fristenseite öffnen", query: "Öffne die Fristen-Übersicht" },
  ],
  search_cases: [
    { label: "Frist dieser Akte", query: "Welche Fristen hat diese Akte?" },
    { label: "Aufgaben prüfen", query: "Welche Aufgaben sind noch offen?" },
    { label: "Zur Akte", query: "Zeige mir die Details dieser Akte" },
  ],
  client_lookup: [
    { label: "Fristen prüfen", query: "Welche Fristen hat dieser Mandant?" },
    { label: "Status-Update", query: "Erstelle ein Mandantenupdate für diesen Fall" },
    { label: "E-Mail entwerfen", query: "Entwerfe eine E-Mail an den Mandanten" },
  ],
  case_summary: [
    { label: "Offene Fristen", query: "Welche Fristen sind in dieser Akte noch offen?" },
    { label: "Nächste Schritte", query: "Was sind die nächsten Schritte in dieser Akte?" },
    { label: "Mandantenupdate", query: "Erstelle ein Mandantenupdate aus dem Aktenstand" },
  ],
  deadline_extract: [
    { label: "Frist anlegen", query: "Lege eine Frist für diese Deadline an" },
    { label: "Wiedervorlage", query: "Setze eine Wiedervorlage für nächste Woche" },
    { label: "Zur Fristenseite", query: "Öffne die Fristen-Übersicht" },
  ],
  email_draft: [
    { label: "Formeller Ton", query: "Passe den Ton auf formell an" },
    { label: "Kürzen", query: "Kürze die E-Mail auf das Wesentliche" },
    { label: "Betreff anpassen", query: "Ändere den Betreff der E-Mail" },
  ],
  conflict_check: [
    { label: "Mandate prüfen", query: "Prüfe alle aktiven Mandate auf Konflikte" },
    { label: "Neue Akte anlegen", query: "Lege eine neue Akte an" },
    { label: "Mandatsaufnahme", query: "Erstelle eine neue Mandatsaufnahme" },
  ],
  navigate: [
    { label: "Was ist dort?", query: "Was sind die wichtigsten Aufgaben auf dieser Seite?" },
    { label: "Übersicht", query: "Gib mir eine Übersicht des aktuellen Status" },
    { label: "Nächste Schritte", query: "Was sollte ich als nächstes tun?" },
  ],
};

const TOOL_FOLLOW_UPS_EN: Partial<Record<ToolType, Array<{ label: string; query: string }>>> = {
  search_deadlines: [
    { label: "Overdue", query: "Which deadlines are already overdue?" },
    { label: "Critical", query: "Which deadlines expire in the next 3 days?" },
    { label: "Open deadlines page", query: "Open the deadlines overview" },
  ],
  search_cases: [
    { label: "Case deadlines", query: "What deadlines does this case have?" },
    { label: "Check tasks", query: "Which tasks are still open?" },
    { label: "Case details", query: "Show me the details of this case" },
  ],
  client_lookup: [
    { label: "Check deadlines", query: "What deadlines does this client have?" },
    { label: "Status update", query: "Create a client status update for this case" },
    { label: "Draft email", query: "Draft an email to the client" },
  ],
  case_summary: [
    { label: "Open deadlines", query: "Which deadlines in this case are still open?" },
    { label: "Next steps", query: "What are the next steps in this case?" },
    { label: "Client update", query: "Create a client update from the case status" },
  ],
  deadline_extract: [
    { label: "Create deadline", query: "Create a deadline entry for this" },
    { label: "Follow-up", query: "Set a follow-up for next week" },
    { label: "Open deadlines", query: "Open the deadlines overview" },
  ],
  email_draft: [
    { label: "Formal tone", query: "Make the tone more formal" },
    { label: "Shorten", query: "Shorten the email to the essentials" },
    { label: "Change subject", query: "Change the subject of the email" },
  ],
  conflict_check: [
    { label: "Check mandates", query: "Check all active cases for conflicts" },
    { label: "New case", query: "Create a new case" },
    { label: "Intake", query: "Create a new client intake" },
  ],
  navigate: [
    { label: "What's here?", query: "What are the main tasks on this page?" },
    { label: "Overview", query: "Give me an overview of the current status" },
    { label: "Next steps", query: "What should I do next?" },
  ],
};

function SuggestedFollowUps({
  lastMessage,
  onSelect,
  t,
  lang,
}: {
  lastMessage: ChatMessage;
  onSelect: (query: string) => void;
  t: TFunc;
  lang: string;
}) {
  const isEn = lang === "en";
  const suggestions = useMemo(() => {
    // AP4: Tool-specific follow-ups take priority
    const toolTypes =
      lastMessage.toolCalls
        ?.filter((tc) => tc.status === "completed" && tc.result?.success)
        .map((tc) => tc.type) ?? [];

    const toolFollowUps = isEn ? TOOL_FOLLOW_UPS_EN : TOOL_FOLLOW_UPS_DE;
    for (const toolType of toolTypes) {
      const specific = toolFollowUps[toolType];
      if (specific && specific.length > 0) return specific.slice(0, 3);
    }

    // Fallback: content-based suggestions
    const content = lastMessage.content.toLowerCase();
    const chips: Array<{ label: string; query: string }> = [];

    if (content.includes("frist") || content.includes("deadline")) {
      chips.push({
        label: t("chat.follow_up.deadlines"),
        query: isEn ? "Are there open deadlines related to this?" : "Gibt es dazu offene Fristen?",
      });
    }
    if (content.includes("akte") || content.includes("case") || content.includes("mandant")) {
      chips.push({
        label: t("chat.follow_up.next_steps"),
        query: isEn
          ? "What are the next steps in this case?"
          : "Was sind die nächsten Schritte in dieser Akte?",
      });
    }
    if (
      content.includes("vertrag") ||
      content.includes("contract") ||
      content.includes("klausel")
    ) {
      chips.push({
        label: t("chat.follow_up.related"),
        query: isEn ? "Are there related legal questions?" : "Gibt es verwandte Rechtsfragen dazu?",
      });
    }
    if (lastMessage.citations && lastMessage.citations.length > 0) {
      chips.push({
        label: t("chat.follow_up.more_details"),
        query: isEn
          ? "Can you support this with further sources?"
          : "Können Sie das mit weiteren Quellen belegen?",
      });
    }
    if (chips.length < 3) {
      chips.push({
        label: t("chat.follow_up.more_details"),
        query: isEn
          ? "Can you explain this in more detail?"
          : "Können Sie das detaillierter erklären?",
      });
    }
    chips.push({
      label: t("chat.follow_up.email"),
      query: isEn ? "Draft an email about this." : "Entwerfe eine E-Mail dazu.",
    });

    return chips.slice(0, 4);
  }, [lastMessage, t, isEn]);

  if (suggestions.length === 0) return null;

  return (
    <div className="px-4 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-[color:var(--ds-text-subtle)]">
          {t("chat.follow_ups")}
        </span>
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s.query)}
            className="rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1 text-xs text-[color:var(--ds-text-muted)] transition-[border-color,background-color,color] duration-[var(--ds-duration-normal)] hover:border-[color:var(--ds-border-strong)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(function ChatPanel(
  {
    context = { type: "global" },
    features,
    persistHistory = true,
    className,
    title,
    initialQuery,
    initialSessionId,
    initialSessionOwner,
    placeholder,
    onStreamingChange,
    exampleQueries: providedExampleQueries,
    headerActions,
    isVisible,
  },
  ref
) {
  const { t, lang } = useLang();
  const router = useRouter();
  const confirm = useConfirm();
  const meQuery = useMe();
  const { groundAnswer } = useGroundedAnswer();

  const resolvedFeatures = useMemo(() => ({ ...DEFAULT_FEATURES, ...features }), [features]);

  // Build user context for personalized AI responses
  const userContext = useMemo<UserContext | undefined>(() => {
    const user = meQuery.data?.user;
    if (!user) return undefined;
    return {
      name: user.name as string | undefined,
      role: user.role as string | undefined,
      preferredLanguage: (user.locale as "de" | "en" | undefined) ?? (lang === "en" ? "en" : "de"),
    };
  }, [meQuery.data?.user, lang]);

  // State
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const messagesRef = useRef(messages);
  const setMessages = useCallback(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      setMessagesState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        messagesRef.current = next;
        return next;
      });
    },
    []
  );
  const [isStreaming, setIsStreaming] = useState(false);
  // A passage the person marked on the page ("Markieren & fragen").
  const [quoted, setQuoted] = useState<{ text: string; source?: string } | null>(null);
  useEffect(() => {
    onStreamingChange?.(isStreaming);
  }, [isStreaming, onStreamingChange]);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<Array<{ slug: string; title: string }>>([]);
  const [selectedCaseSlug, setSelectedCaseSlug] = useState(context.caseSlug ?? "");
  const [matterVitals, setMatterVitals] = useState<
    | {
        deadlineCount: number;
        openDeadlineCount: number;
        nextDeadlineDate?: string;
        taskCount: number;
        openTaskCount: number;
        documentCount: number;
        totalHours: number;
        expenseTotal: number;
      }
    | undefined
  >(undefined);
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("at");
  const [queryMode, setQueryMode] = useState<QueryMode>("deep_matter");
  const [modelOverride, setModelOverride] = useState<string | undefined>(undefined);
  const [sessionTokens, setSessionTokens] = useState(0);
  const [_isCompact, setIsCompact] = useState(false);
  const [subsumptionMode, setSubsumptionMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect narrow panel for compact header mode. 420px so the docked
  // Copilot sidebar (default 360px) gets the slim header — at full width
  // the jurisdiction pill + model name would overflow the toolbar there.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompact(entry.contentRect.width < 420);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Session state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);
  const [sessionSearch, setSessionSearch] = useState("");

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load cases
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Every matter up to the picker bound (was: the 100 most recently edited).
        const pages = await api.brain.listAllPages({ type: "legal_case", max: CASE_PICKER_MAX });
        if (cancelled) return;
        setCases(
          pages
            .map((p: BrainPage) => ({ slug: p.slug, title: p.title || p.slug }))
            .sort((a, b) => a.title.localeCompare(b.title))
        );
        // If we have a context case slug, derive jurisdiction from it
        const ctxSlug = context.caseSlug;
        if (ctxSlug) {
          const casePage = pages.find((p) => p.slug === ctxSlug);
          if (casePage) {
            const fm = caseFrontmatter(casePage);
            setJurisdiction(matterJurisdiction(fm.jurisdiction));
            // Extract matter vitals for copilot context
            const deadlines = fm.deadlines || [];
            const tasks = fm.tasks || [];
            const documents = fm.documents || [];
            const timeEntries = fm.time_entries || [];
            const expenses = fm.expenses || [];
            const openDeadlines = deadlines.filter((d) => d.status !== "done");
            const openTasks = tasks.filter((t) => !t.done);
            const nextDeadline = openDeadlines
              .map((d) => d.due_date || "")
              .filter(Boolean)
              .sort()[0];
            const totalHours = timeEntries.reduce(
              (sum, t) => sum + (typeof t.minutes === "number" ? t.minutes / 60 : 0),
              0
            );
            const expenseTotal = expenses.reduce(
              (sum, e) => sum + (typeof e.amount === "number" ? e.amount : 0),
              0
            );
            setMatterVitals({
              deadlineCount: deadlines.length,
              openDeadlineCount: openDeadlines.length,
              nextDeadlineDate: nextDeadline || undefined,
              taskCount: tasks.length,
              openTaskCount: openTasks.length,
              documentCount: documents.length,
              totalHours: Math.round(totalHours * 100) / 100,
              expenseTotal: Math.round(expenseTotal * 100) / 100,
            });
          }
        }
      } catch {
        if (!cancelled) setCases([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [context.caseSlug]);

  // Keep selectedCaseSlug in sync with the route-driven context prop.
  //
  // The desktop Copilot sidebar mounts ChatPanel ONCE in dashboard/layout.tsx
  // and reuses the same instance across every matter page the attorney
  // navigates to (no `key` prop) — only `context.caseSlug` changes per
  // navigation. `selectedCaseSlug` was initialized once from `context.caseSlug`
  // at mount and otherwise only updated by the manual case-selector dropdown,
  // so once it held a non-empty value it won every downstream
  // `selectedCaseSlug || context.caseSlug` fallback FOREVER — including on
  // later navigation to a different matter. Concretely: open Mandat A's page
  // (selectedCaseSlug="mandat-a"), then navigate to Mandat B's page
  // (context.caseSlug becomes "mandat-b") and ask the copilot a question — it
  // would silently keep querying/recording under "mandat-a" while the UI
  // shows Mandat B, because the engine's matter-scope filter (server/src/
  // commands/web-api.ts) treats the client-supplied case_slug as authoritative
  // for narrowing an otherwise firm-wide-authorized session. Resetting here
  // on every context.caseSlug change fixes that while still letting an
  // in-page manual override (case selector, context.caseSlug unchanged)
  // persist for the rest of that page visit.
  useEffect(() => {
    setSelectedCaseSlug(context.caseSlug ?? "");
  }, [context.caseSlug]);

  // Load sessions list — filtered by matter for isolation
  const refreshSessionsGenerationRef = useRef(0);
  const refreshSessions = useCallback(async () => {
    if (!persistHistory) return;
    const generation = ++refreshSessionsGenerationRef.current;
    const caseFilter = selectedCaseSlug || context.caseSlug;
    const [list, remote] = await Promise.all([
      listSessions({ caseSlug: caseFilter, contextType: context.type }),
      // Conversations that live only on the server: written on another device,
      // or shared by a colleague. Without them a device change shows no history.
      listServerSessions(caseFilter),
    ]);
    const merged = mergeSessionLists(list, remote, {
      caseSlug: caseFilter,
      contextType: context.type,
    });
    // Stale-response guard: if selectedCaseSlug/context.caseSlug/context.type
    // changed again (e.g. rapid matter switching) while this request was in
    // flight, a newer call already bumped the generation counter — drop this
    // now-stale result instead of overwriting the sessions list with the
    // wrong matter's threads.
    if (generation === refreshSessionsGenerationRef.current) {
      setSessions(merged);
    }
  }, [persistHistory, selectedCaseSlug, context.caseSlug, context.type]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // A panel that stays mounted while hidden (the docked copilot sidebar)
  // never re-runs the effect above on its own, so a session started in the
  // other mounted instance — or in the fullscreen /dashboard/chat page —
  // wouldn't show up until something else changed the deps. Re-fetch the
  // instant this panel becomes visible.
  const wasVisibleRef = useRef(isVisible);
  useEffect(() => {
    if (isVisible && !wasVisibleRef.current) {
      refreshSessions();
    }
    wasVisibleRef.current = isVisible;
  }, [isVisible, refreshSessions]);

  // Auto-scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || messages.length === 0) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Initialize or load session
  useEffect(() => {
    if (!persistHistory) return;
    (async () => {
      // Explicit session handoff (panel → fullscreen): load the requested
      // session regardless of context filters.
      if (initialSessionId && !activeSessionId) {
        const handoff = await getSession(initialSessionId);
        if (handoff) {
          setActiveSessionId(handoff.id);
          const msgs = await loadMessages(handoff.id);
          const sanitized = sanitizeSessionMessages(msgs);
          // History arrives asynchronously; never replace what was sent meanwhile.
          setMessages((current) => (current.length > 0 ? current : sanitized));
          setSessionTokens(sanitized.reduce((sum, m) => sum + (m.tokensUsed ?? 0), 0));
          return;
        }
        // Not in this browser: a conversation from another device or one a
        // colleague shared. Load it from the server and keep a local copy.
        const imported = await importRemoteSession(initialSessionId, initialSessionOwner);
        if (imported) {
          setActiveSessionId(initialSessionId);
          setMessages((current) => (current.length > 0 ? current : imported));
          return;
        }
      }
      const list = await listSessions({
        caseSlug: selectedCaseSlug || context.caseSlug,
        contextType: context.type,
      });
      if (list.length > 0 && !activeSessionId) {
        const latest = list[0];
        setActiveSessionId(latest.id);
        const msgs = await loadMessages(latest.id);
        const sanitized = sanitizeSessionMessages(msgs);
        setMessages((current) => (current.length > 0 ? current : sanitized));
        setSessionTokens(sanitized.reduce((sum, m) => sum + (m.tokensUsed ?? 0), 0));
      } else if (list.length === 0) {
        const newId = generateSessionId();
        const now = new Date().toISOString();
        const session: ChatSession = {
          id: newId,
          title: title ?? t("chat.title"),
          contextType: context.type,
          caseSlug: selectedCaseSlug || context.caseSlug,
          pageSlug: context.pageSlug,
          createdAt: now,
          updatedAt: now,
          messageCount: 0,
        };
        await createSession(session);
        setActiveSessionId(newId);
        setSessions([session]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistHistory]);

  // Auto-send initial query from URL param
  const initialQuerySent = useRef(false);
  useEffect(() => {
    // Fire when session is ready, or immediately if persistence is disabled
    const ready = activeSessionId || !persistHistory;
    if (initialQuery && !initialQuerySent.current && messages.length === 0 && ready) {
      initialQuerySent.current = true;
      handleSend(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, messages.length, activeSessionId, persistHistory]);

  // Update session metadata when messages change
  const updateSessionMeta = useCallback(async () => {
    if (!activeSessionId || !persistHistory) return;
    const msgs = messagesRef.current;
    const lastMsg = msgs[msgs.length - 1];
    await updateSession(activeSessionId, {
      messageCount: msgs.length,
      updatedAt: new Date().toISOString(),
      lastPreview: lastMsg?.content.slice(0, 100),
      title:
        msgs[0]?.role === "user" ? autoTitleFromQuery(msgs[0].content) : (title ?? t("chat.title")),
    });
    refreshSessions();
  }, [activeSessionId, persistHistory, refreshSessions, title, t]);

  useEffect(() => {
    if (messages.length > 0 && persistHistory) {
      updateSessionMeta();
    }
  }, [messages.length, updateSessionMeta, persistHistory]);

  // Keep the server copy current once an answer is finished (chat-server-sync.ts).
  useEffect(() => {
    if (!persistHistory || !activeSessionId || isStreaming || messages.length === 0) return;
    const timer = window.setTimeout(() => {
      const msgs = messagesRef.current;
      void saveSessionToServer({
        id: activeSessionId,
        title:
          msgs[0]?.role === "user"
            ? autoTitleFromQuery(msgs[0].content)
            : (title ?? "Unterhaltung"),
        caseSlug: selectedCaseSlug || context.caseSlug,
        messages: msgs,
      });
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [
    persistHistory,
    activeSessionId,
    isStreaming,
    messages.length,
    title,
    selectedCaseSlug,
    context.caseSlug,
  ]);

  // Send message
  const handleSend = useCallback(
    async (
      text: string,
      attachments?: Array<{ name: string; slug: string }>,
      replyTo?: { id: string; role: "user" | "assistant"; preview: string } | null,
      selection?: { text: string; source?: string } | null
    ) => {
      if (!text.trim() && !attachments?.length) return;
      if (isStreaming) return; // Prevent concurrent streams

      const userMsg: ChatMessage = {
        id: generateMessageId(),
        role: "user",
        // The marked passage stays visible in the conversation it was asked in.
        content: selection?.text.trim()
          ? `> ${selection.text.trim().slice(0, 300).replace(/\s+/g, " ")}${selection.text.trim().length > 300 ? " …" : ""}\n\n${text}`
          : text,
        createdAt: new Date().toISOString(),
        attachments,
      };

      const assistantMsg: ChatMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: "",
        isStreaming: true,
        createdAt: new Date().toISOString(),
      };

      setMessages((m) => [...m, userMsg, assistantMsg]);
      setIsStreaming(true);
      setError(null);
      if (meQuery.data?.demo) tracking.demo?.questionAsked();

      // Non-blocking: infer memories from user message
      if (text.length > 10) {
        csrfFetch("/api/copilot/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "infer", message: text, caseSlug: context.caseSlug }),
        }).catch(() => {});
      }

      // P1.5: Track message in session memory (ephemeral layer)
      if (activeSessionId) {
        trackMessageInSession(activeSessionId, text);
      }

      if (persistHistory && activeSessionId) {
        await saveMessage(activeSessionId, userMsg);
        await saveMessage(activeSessionId, assistantMsg);
      }

      // Build prompt via shared context builder
      // Pass conversation history (all messages before the current user+assistant pair)
      const historyForPrompt = messagesRef.current
        .slice(0, -2)
        .filter((m) => !m.error && m.content.trim().length > 0);
      const { systemPrompt, userInput, conversationContext } = await buildPromptContext({
        jurisdiction,
        selectedCaseSlug,
        cases,
        contextType: context.type,
        contextCaseSlug: context.caseSlug,
        pageSlug: context.pageSlug,
        pageLabel: context.pageLabel,
        attachments,
        replyTo,
        selection,
        userText: text,
        attachmentFetcher: async (slug) => {
          const page = await api.brain.getPage(slug);
          return page.content || "";
        },
        userContext,
        conversationHistory: historyForPrompt,
        matterVitals,
        memoryContext: await buildFullMemoryContext({
          sessionId: activeSessionId,
          caseSlug: context.caseSlug,
          query: text,
          userId: meQuery.data?.user?.id as string | undefined,
        }).catch(() => ""),
      });
      // Persona/tool docs travel as system-prompt instructions; only the
      // (delimited) user input is the query the engine retrieves and routes on.
      const prompt = buildSafePrompt("", userInput).trim();

      // Create abort controller
      const controller = new AbortController();
      abortControllerRef.current = controller;
      // Buffer for incomplete [TOOL:...] markers that span chunk boundaries
      let toolMarkerBuffer = "";

      try {
        const result = await api.query.think(prompt, {
          instructions: systemPrompt,
          context: conversationContext,
          mode: queryModeToThinkMode(queryMode),
          queryMode,
          caseSlug: selectedCaseSlug || context.caseSlug || undefined,
          ...(modelOverride && modelOverride !== "auto" ? { model: modelOverride } : {}),
          signal: controller.signal,
          onChunk: (chunk) => {
            toolMarkerBuffer = processStreamingChunk(chunk, toolMarkerBuffer, setMessages);
          },
        });

        // Finalize assistant message — strip tool markers from displayed content
        const cleanAnswer = localizeAnswerSections(
          result.answer.replace(/\[TOOL:[^\]]+\]/gi, "").trim(),
          lang === "en" ? "en" : "de"
        );
        if (!cleanAnswer) {
          // Empty response from engine — show fallback message
          const emptyMsg: ChatMessage = {
            ...assistantMsg,
            content: "[Keine Antwort erhalten — bitte erneut versuchen]",
            isStreaming: false,
            error: "empty_response",
          };
          setMessages((m) => [...m.slice(0, -1), emptyMsg]);
          if (persistHistory && activeSessionId) {
            await saveMessage(activeSessionId, emptyMsg);
          }
          return;
        }
        const finalMsg: ChatMessage = {
          ...assistantMsg,
          content: cleanAnswer,
          citations: result.citations,
          gaps: result.gaps,
          isStreaming: false,
          tokensUsed: result.tokens_used,
          latencyMs: result.latency_ms,
          // The engine reports what it really used (the firm's model profile
          // can override a pick); fall back to the pick while it is missing.
          model:
            result.model ?? (modelOverride && modelOverride !== "auto" ? modelOverride : undefined),
          mode: queryMode,
        };

        setMessages((m) => [...m.slice(0, -1), finalMsg]);
        if (meQuery.data?.demo) tracking.demo?.answerReceived();

        if (persistHistory && activeSessionId) {
          await saveMessage(activeSessionId, finalMsg);
        }

        if (result.tokens_used) {
          setSessionTokens((prev) => prev + result.tokens_used!);
        }

        // ── Progressive Grounding ──
        // Run corpus grounding on the answer text after the response is displayed.
        // This is non-blocking — the user sees the answer immediately, and the
        // grounding metadata (verified/unverified citations) appears shortly after.
        // Uses the stream gate's result, else /api/legal/ground via useGroundedAnswer.
        // The stream's citation gate usually grounded it already (one pass on
        // the server); only fall back to the ground route when it did not.
        const applyGrounding = (grounding: GroundingMetadata) => {
          setMessages((m) => {
            const last = m[m.length - 1];
            if (!last || last.role !== "assistant" || last.id !== assistantMsg.id) return m;
            return [...m.slice(0, -1), { ...last, grounding }];
          });
          if (persistHistory && activeSessionId) {
            setMessages((m) => {
              const last = m[m.length - 1];
              if (!last || last.id !== assistantMsg.id) return m;
              saveMessage(activeSessionId, { ...last, grounding });
              return m;
            });
          }
        };
        (result._grounding ? Promise.resolve(result._grounding) : groundAnswer(cleanAnswer))
          .then(async (grounding) => {
            if (!grounding) return;
            applyGrounding(grounding);
            // Second stage: does each verified source carry its statement?
            const checked = await withSupportCheck(cleanAnswer, grounding);
            if (checked !== grounding) applyGrounding(checked);
          })
          .catch(() => {
            // Grounding failure is non-fatal — the answer is still displayed
          });

        // ── Copilot Tool Detection ──
        // Detect tool-use intent from the AI response and execute tools
        const toolCalls = await detectAndExecuteTools(result.answer, {
          type: context.type,
          caseSlug: selectedCaseSlug || context.caseSlug,
          pageSlug: context.pageSlug,
        });
        if (toolCalls.length > 0) {
          const msgWithTools = { ...finalMsg, toolCalls };
          setMessages((m) => [...m.slice(0, -1), msgWithTools]);
          if (persistHistory && activeSessionId) {
            await saveMessage(activeSessionId, msgWithTools);
          }

          // AP1: Auto-navigate — when the navigate tool completes, push the route
          // immediately without requiring the user to click the card button.
          const navCall = toolCalls.find(
            (tc) => tc.type === "navigate" && tc.status === "completed" && tc.result?.success
          );
          if (navCall) {
            const route = (navCall.result?.data as { route?: string })?.route;
            if (route) {
              // Small delay so the user sees the card before the page transitions
              window.setTimeout(() => router.push(route), 400);
            }
          }

          // Results of read-only tools go back to the model once, so the
          // answer is built on them (tool-synthesis.ts).
          const followUpQuery = navCall ? null : synthesisInput(text, toolCalls);
          if (followUpQuery && !controller.signal.aborted) {
            const followMsg: ChatMessage = {
              id: generateMessageId(),
              role: "assistant",
              content: "",
              isStreaming: true,
              createdAt: new Date().toISOString(),
            };
            const patchFollow = (patch: Partial<ChatMessage>) =>
              setMessages((m) => m.map((x) => (x.id === followMsg.id ? { ...x, ...patch } : x)));
            setMessages((m) => [...m, followMsg]);
            let streamed = "";
            try {
              const follow = await api.query.think(buildSafePrompt("", followUpQuery).trim(), {
                instructions: systemPrompt,
                context: conversationContext,
                mode: queryModeToThinkMode(queryMode),
                queryMode,
                caseSlug: selectedCaseSlug || context.caseSlug || undefined,
                signal: controller.signal,
                onChunk: (chunk) => {
                  streamed += chunk;
                  patchFollow({ content: streamed.replace(/\[TOOL:[^\]]*\]?/gi, "") });
                },
              });
              const followClean = localizeAnswerSections(
                follow.answer.replace(/\[TOOL:[^\]]+\]/gi, "").trim(),
                lang === "en" ? "en" : "de"
              );
              const followDone: ChatMessage = {
                ...followMsg,
                content: followClean || "[Keine Auswertung erhalten]",
                isStreaming: false,
                citations: follow.citations,
                gaps: follow.gaps,
                ...(followClean ? {} : { error: "empty_response" }),
              };
              patchFollow(followDone);
              if (persistHistory && activeSessionId) await saveMessage(activeSessionId, followDone);
              if (followClean) {
                (follow._grounding ? Promise.resolve(follow._grounding) : groundAnswer(followClean))
                  .then((grounding) => {
                    if (grounding) patchFollow({ grounding });
                  })
                  .catch(() => {
                    // Grounding failure is non-fatal
                  });
              }
            } catch {
              patchFollow({
                isStreaming: false,
                content: streamed || "[Auswertung der Werkzeugergebnisse fehlgeschlagen]",
                error: "tool_synthesis_failed",
              });
            }
          }
        }
      } catch (err) {
        const isAborted = err instanceof DOMException && err.name === "AbortError";
        if (!isAborted) {
          const errorMsg = describeChatError(err, t);
          setError(errorMsg);
          // Demo funnel: hitting the question budget is a conversion moment.
          if (
            meQuery.data?.demo &&
            /^demo_(daily_)?limit$/.test((err as { code?: string } | null)?.code ?? "")
          ) {
            tracking.demo?.capReached();
          }
          let errorMsgFinal: ChatMessage | null = null;
          setMessages((m) => {
            const last = m[m.length - 1];
            if (!last || last.role !== "assistant") return m;
            errorMsgFinal = {
              ...last,
              isStreaming: false,
              error: errorMsg,
              content: last.content || "",
            };
            return [...m.slice(0, -1), errorMsgFinal];
          });
          // Persist error state to avoid stale isStreaming on restore
          if (persistHistory && activeSessionId && errorMsgFinal) {
            await saveMessage(activeSessionId, errorMsgFinal);
          }
        } else {
          // Aborted — keep partial content
          let abortedMsg: ChatMessage | null = null;
          setMessages((m) => {
            const last = m[m.length - 1];
            if (!last || last.role !== "assistant") return m;
            abortedMsg = {
              ...last,
              isStreaming: false,
              content: last.content || "[Generierung abgebrochen]",
            };
            return [...m.slice(0, -1), abortedMsg];
          });
          // Persist aborted state to avoid stale isStreaming on restore
          if (persistHistory && activeSessionId && abortedMsg) {
            await saveMessage(activeSessionId, abortedMsg);
          }
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [
      activeSessionId,
      cases,
      context,
      jurisdiction,
      meQuery.data?.user?.id,
      modelOverride,
      persistHistory,
      queryMode,
      router,
      selectedCaseSlug,
      t,
      isStreaming,
      setMessages,
      userContext,
      matterVitals,
      groundAnswer,
      lang,
      meQuery.data?.demo,
    ]
  );

  // Stop generation
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // ── G15: Tool Confirmation / Cancel handlers ──
  const handleToolConfirm = useCallback(
    async (toolCallId: string) => {
      // Find the tool call using ref to avoid stale closure
      let foundToolCall: ToolCall | undefined;
      let foundMsgId: string | undefined;

      for (const msg of messagesRef.current) {
        if (msg.toolCalls) {
          const tc = msg.toolCalls.find((t) => t.id === toolCallId);
          if (tc) {
            foundToolCall = tc;
            foundMsgId = msg.id;
            break;
          }
        }
      }

      if (!foundToolCall || !foundMsgId) return;
      // Prevent double-execution: if already executing or completed, skip
      if (foundToolCall.status === "executing" || foundToolCall.status === "completed") return;

      // Update status to executing
      setMessages((m) =>
        m.map((msg) =>
          msg.id !== foundMsgId
            ? msg
            : {
                ...msg,
                toolCalls: msg.toolCalls?.map((tc) =>
                  tc.id === toolCallId ? { ...tc, status: "executing" } : tc
                ),
              }
        )
      );

      // Execute the tool
      const executed = await executeToolCall(foundToolCall, {
        caseSlug: selectedCaseSlug || context.caseSlug,
      });

      // Update message with result
      setMessages((m) =>
        m.map((msg) =>
          msg.id !== foundMsgId
            ? msg
            : {
                ...msg,
                toolCalls: msg.toolCalls?.map((tc) => (tc.id === toolCallId ? executed : tc)),
              }
        )
      );

      // Persist updated message
      if (persistHistory && activeSessionId) {
        const updatedMsg = messagesRef.current.find((m) => m.id === foundMsgId);
        if (updatedMsg) {
          const msgWithUpdatedTools = {
            ...updatedMsg,
            toolCalls: updatedMsg.toolCalls?.map((tc) => (tc.id === toolCallId ? executed : tc)),
          };
          await saveMessage(activeSessionId, msgWithUpdatedTools);
        }
      }
    },
    [persistHistory, activeSessionId, setMessages, context.caseSlug, selectedCaseSlug]
  );

  const handleToolCancel = useCallback(
    async (toolCallId: string) => {
      // Find using ref to avoid stale closure
      let foundMsgId: string | undefined;

      for (const msg of messagesRef.current) {
        if (msg.toolCalls?.some((t) => t.id === toolCallId)) {
          foundMsgId = msg.id;
          break;
        }
      }

      if (!foundMsgId) return;

      // Mark as cancelled (set status to error with cancelled message)
      setMessages((m) =>
        m.map((msg) =>
          msg.id !== foundMsgId
            ? msg
            : {
                ...msg,
                toolCalls: msg.toolCalls?.map((tc) =>
                  tc.id === toolCallId
                    ? {
                        ...tc,
                        status: "error",
                        result: {
                          success: false,
                          error: "Abgebrochen durch Nutzer",
                          display: {
                            kind: "confirmation",
                            title: "Abgebrochen",
                            message: "Tool-Ausführung wurde abgebrochen",
                          },
                        },
                      }
                    : tc
                ),
              }
        )
      );

      // Persist
      if (persistHistory && activeSessionId) {
        const updatedMsg = messagesRef.current.find((m) => m.id === foundMsgId);
        if (updatedMsg) {
          const msgWithCancelledTool = {
            ...updatedMsg,
            toolCalls: updatedMsg.toolCalls?.map((tc) =>
              tc.id === toolCallId
                ? {
                    ...tc,
                    status: "error" as const,
                    result: {
                      success: false,
                      error: "Abgebrochen durch Nutzer",
                      display: {
                        kind: "confirmation" as const,
                        title: "Abgebrochen",
                        message: "Tool-Ausführung wurde abgebrochen",
                      },
                    },
                  }
                : tc
            ),
          };
          await saveMessage(activeSessionId, msgWithCancelledTool);
        }
      }
    },
    [persistHistory, activeSessionId, setMessages]
  );

  // ── Retry failed tool calls ──
  const handleToolRetry = useCallback(
    async (toolCallId: string) => {
      let foundToolCall: ToolCall | undefined;
      let foundMsgId: string | undefined;

      for (const msg of messagesRef.current) {
        if (msg.toolCalls) {
          const tc = msg.toolCalls.find((t) => t.id === toolCallId);
          if (tc) {
            foundToolCall = tc;
            foundMsgId = msg.id;
            break;
          }
        }
      }

      if (!foundToolCall || !foundMsgId) return;
      // Prevent double-execution: if already executing, skip
      if (foundToolCall.status === "executing") return;

      // Reset to executing
      setMessages((m) =>
        m.map((msg) =>
          msg.id !== foundMsgId
            ? msg
            : {
                ...msg,
                toolCalls: msg.toolCalls?.map((tc) =>
                  tc.id === toolCallId ? { ...tc, status: "executing" } : tc
                ),
              }
        )
      );

      // Re-execute
      const executed = await executeToolCall(foundToolCall, {
        caseSlug: selectedCaseSlug || context.caseSlug,
      });

      setMessages((m) =>
        m.map((msg) =>
          msg.id !== foundMsgId
            ? msg
            : {
                ...msg,
                toolCalls: msg.toolCalls?.map((tc) => (tc.id === toolCallId ? executed : tc)),
              }
        )
      );

      if (persistHistory && activeSessionId) {
        const updatedMsg = messagesRef.current.find((m) => m.id === foundMsgId);
        if (updatedMsg) {
          const msgWithRetriedTool = {
            ...updatedMsg,
            toolCalls: updatedMsg.toolCalls?.map((tc) => (tc.id === toolCallId ? executed : tc)),
          };
          await saveMessage(activeSessionId, msgWithRetriedTool);
        }
      }
    },
    [persistHistory, activeSessionId, setMessages, context.caseSlug, selectedCaseSlug]
  );

  // Clear chat
  const handleClear = useCallback(async () => {
    if (isStreaming) return; // Prevent clear during active stream
    const ok = await confirm({
      title: t("chat.clear"),
      message: t("chat.confirm_clear"),
      confirmLabel: "Löschen",
      variant: "danger",
    });
    if (!ok) return;
    setMessages([]);
    setSessionTokens(0);
    setError(null);
    if (persistHistory && activeSessionId) {
      await deleteSession(activeSessionId);
      const newId = generateSessionId();
      const now = new Date().toISOString();
      const session: ChatSession = {
        id: newId,
        title: title ?? t("chat.title"),
        contextType: context.type,
        caseSlug: selectedCaseSlug || context.caseSlug,
        pageSlug: context.pageSlug,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
      };
      await createSession(session);
      setActiveSessionId(newId);
      refreshSessions();
    }
  }, [
    confirm,
    t,
    persistHistory,
    activeSessionId,
    title,
    context,
    refreshSessions,
    selectedCaseSlug,
    isStreaming,
    setMessages,
  ]);

  // New session
  const handleNewSession = useCallback(async () => {
    if (isStreaming) return; // Prevent new session during active stream
    const newId = generateSessionId();
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: newId,
      title: t("chat.new_session"),
      contextType: context.type,
      caseSlug: selectedCaseSlug || context.caseSlug,
      pageSlug: context.pageSlug,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };
    await createSession(session);
    setActiveSessionId(newId);
    setMessages([]);
    setSessionTokens(0);
    setError(null);
    refreshSessions();
  }, [t, context, refreshSessions, selectedCaseSlug, isStreaming, setMessages]);

  /**
   * Fetch a conversation that is only on the server (another device, or a
   * colleague's shared one) and keep a local copy. Returns its messages.
   */
  const importRemoteSession = useCallback(
    async (id: string, ownerId?: string): Promise<ChatMessage[] | null> => {
      const remote = await fetchServerSession(id, ownerId);
      if (!remote?.messages?.length) return null;
      const now = new Date().toISOString();
      const imported: ChatSession = {
        id: remote.id,
        title:
          remote.shared && remote.owner_name
            ? `${remote.title} · ${remote.owner_name}`
            : remote.title,
        contextType: remote.case_slug ? "case" : "global",
        caseSlug: remote.case_slug,
        createdAt: remote.messages[0]?.createdAt ?? now,
        updatedAt: remote.updated_at || now,
        messageCount: remote.messages.length,
      };
      const msgs: ChatMessage[] = remote.messages.map((m) => ({ ...m }));
      await createSession(imported);
      for (const m of msgs) await saveMessage(imported.id, m);
      return msgs;
    },
    []
  );

  // Select session
  const handleSelectSession = useCallback(
    async (id: string) => {
      if (isStreaming) return; // Prevent session switch during active stream
      const entry = sessions.find((session) => session.id === id);
      setActiveSessionId(id);
      setError(null);
      if (entry?.remote) {
        const imported = await importRemoteSession(
          id,
          entry.remote.shared ? entry.remote.ownerId : undefined
        );
        if (!imported) {
          setError(t("chat.err_session_load"));
          return;
        }
        setMessages(imported);
        setSessionTokens(0);
        refreshSessions();
        return;
      }
      const msgs = await loadMessages(id);
      const sanitizedMsgs = sanitizeSessionMessages(msgs);
      setMessages(sanitizedMsgs);
      setSessionTokens(sanitizedMsgs.reduce((sum, m) => sum + (m.tokensUsed ?? 0), 0));
    },
    [isStreaming, setMessages, sessions, importRemoteSession, refreshSessions, t]
  );

  useImperativeHandle(
    ref,
    () => ({
      sendMessage: (
        text: string,
        options?: {
          attachments?: Array<{ name: string; slug: string }>;
          replyTo?: { id: string; role: "user" | "assistant"; preview: string } | null;
        }
      ) => handleSend(text, options?.attachments, options?.replyTo ?? undefined),
      getActiveSessionId: () => activeSessionId,
      loadSession: handleSelectSession,
      quoteSelection: (text: string, source?: string) => setQuoted({ text, source }),
    }),
    [handleSend, activeSessionId, handleSelectSession]
  );

  // Delete session
  const handleDeleteSession = useCallback(
    async (id: string) => {
      if (isStreaming) return; // Prevent deletion during active stream
      const ok = await confirm({
        title: t("chat.confirm_delete_session"),
        message: "",
        confirmLabel: "Löschen",
        variant: "danger",
      });
      if (!ok) return;
      await deleteSession(id);
      if (id === activeSessionId) {
        const list = await listSessions({
          caseSlug: selectedCaseSlug || context.caseSlug,
          contextType: context.type,
        });
        if (list.length > 0) {
          const latest = list[0];
          setActiveSessionId(latest.id);
          const msgs = await loadMessages(latest.id);
          const sanitized = sanitizeSessionMessages(msgs);
          setMessages(sanitized);
          setSessionTokens(sanitized.reduce((sum, m) => sum + (m.tokensUsed ?? 0), 0));
        } else {
          await handleNewSession();
        }
      }
      refreshSessions();
    },
    [
      confirm,
      t,
      activeSessionId,
      refreshSessions,
      handleNewSession,
      isStreaming,
      context,
      selectedCaseSlug,
      setMessages,
    ]
  );

  // Regenerate response
  const handleRegenerate = useCallback(
    async (messageId: string) => {
      if (isStreaming) return; // Prevent regenerate during active stream
      const currentMsgs = messagesRef.current;
      const idx = currentMsgs.findIndex((m) => m.id === messageId);
      if (idx < 0 || currentMsgs[idx].role !== "assistant") return;
      const userMsg = currentMsgs[idx - 1];
      if (!userMsg || userMsg.role !== "user") return;
      const removedAssistant = currentMsgs[idx];

      // Remove old assistant message — use findIndex inside callback for safety
      setMessages((m) => {
        const i = m.findIndex((mm) => mm.id === messageId);
        if (i < 0) return m;
        return [...m.slice(0, i), ...m.slice(i + 1)];
      });

      // Create new streaming assistant message
      const assistantMsg: ChatMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: "",
        isStreaming: true,
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, assistantMsg]);
      setIsStreaming(true);
      setError(null);

      if (persistHistory && activeSessionId) {
        await saveMessage(activeSessionId, assistantMsg);
      }

      // Rebuild prompt via shared context builder
      // Pass conversation history (all messages before the user message being regenerated)
      const regenHistory = currentMsgs
        .slice(0, idx - 1 >= 0 ? idx - 1 : 0)
        .filter((m) => !m.error && m.content.trim().length > 0);
      const {
        systemPrompt: regenSystemPrompt,
        userInput: regenUserInput,
        conversationContext: regenContext,
      } = await buildPromptContext({
        jurisdiction,
        selectedCaseSlug,
        cases,
        contextType: context.type,
        contextCaseSlug: context.caseSlug,
        pageSlug: context.pageSlug,
        pageLabel: context.pageLabel,
        attachments: userMsg.attachments,
        replyTo: null,
        userText: userMsg.content,
        attachmentFetcher: async (slug) => {
          const page = await api.brain.getPage(slug);
          return page.content || "";
        },
        userContext,
        conversationHistory: regenHistory,
        memoryContext: await buildFullMemoryContext({
          sessionId: activeSessionId,
          caseSlug: context.caseSlug,
          query: userMsg.content,
          userId: meQuery.data?.user?.id as string | undefined,
        }).catch(() => ""),
      });
      const prompt = buildSafePrompt("", regenUserInput).trim();

      const controller = new AbortController();
      abortControllerRef.current = controller;
      // Buffer for incomplete [TOOL:...] markers that span chunk boundaries
      let toolMarkerBuffer = "";

      try {
        const result = await api.query.think(prompt, {
          instructions: regenSystemPrompt,
          context: regenContext,
          mode: queryModeToThinkMode(queryMode),
          queryMode,
          caseSlug: selectedCaseSlug || context.caseSlug || undefined,
          ...(modelOverride && modelOverride !== "auto" ? { model: modelOverride } : {}),
          signal: controller.signal,
          onChunk: (chunk) => {
            toolMarkerBuffer = processStreamingChunk(chunk, toolMarkerBuffer, setMessages);
          },
        });

        const cleanRegenAnswer = localizeAnswerSections(
          result.answer.replace(/\[TOOL:[^\]]+\]/gi, "").trim(),
          lang === "en" ? "en" : "de"
        );
        if (!cleanRegenAnswer) {
          const emptyMsg: ChatMessage = {
            ...assistantMsg,
            content: "[Keine Antwort erhalten — bitte erneut versuchen]",
            isStreaming: false,
            error: "empty_response",
          };
          setMessages((m) => [...m.slice(0, -1), emptyMsg]);
          if (persistHistory && activeSessionId) {
            await saveMessage(activeSessionId, emptyMsg);
          }
          return;
        }
        const finalMsg: ChatMessage = {
          ...assistantMsg,
          content: cleanRegenAnswer,
          citations: result.citations,
          gaps: result.gaps,
          isStreaming: false,
          tokensUsed: result.tokens_used,
          latencyMs: result.latency_ms,
          // The engine reports what it really used (the firm's model profile
          // can override a pick); fall back to the pick while it is missing.
          model:
            result.model ?? (modelOverride && modelOverride !== "auto" ? modelOverride : undefined),
          mode: queryMode,
        };
        setMessages((m) => [...m.slice(0, -1), finalMsg]);
        if (persistHistory && activeSessionId) {
          await saveMessage(activeSessionId, finalMsg);
        }
        if (result.tokens_used) {
          setSessionTokens(
            (prev) => prev + (result.tokens_used! - (removedAssistant.tokensUsed ?? 0))
          );
        }

        // ── Progressive Grounding (regenerate path) ──
        // Same non-blocking corpus-grounding pass as handleSend — every AI
        // answer surface must carry grounding metadata, regenerated answers
        // included (a regenerated answer is a first-class new answer, not a
        // variant that inherits the original's grounding).
        // The stream's citation gate usually grounded it already (one pass on
        // the server); only fall back to the ground route when it did not.
        const applyGrounding = (grounding: GroundingMetadata) => {
          setMessages((m) => {
            const last = m[m.length - 1];
            if (!last || last.role !== "assistant" || last.id !== assistantMsg.id) return m;
            return [...m.slice(0, -1), { ...last, grounding }];
          });
          if (persistHistory && activeSessionId) {
            setMessages((m) => {
              const last = m[m.length - 1];
              if (!last || last.id !== assistantMsg.id) return m;
              saveMessage(activeSessionId, { ...last, grounding });
              return m;
            });
          }
        };
        (result._grounding ? Promise.resolve(result._grounding) : groundAnswer(cleanRegenAnswer))
          .then(async (grounding) => {
            if (!grounding) return;
            applyGrounding(grounding);
            // Second stage: does each verified source carry its statement?
            const checked = await withSupportCheck(cleanRegenAnswer, grounding);
            if (checked !== grounding) applyGrounding(checked);
          })
          .catch(() => {
            // Grounding failure is non-fatal — the answer is still displayed
          });

        // ── Copilot Tool Detection (regenerate path) ──
        const toolCalls = await detectAndExecuteTools(result.answer, {
          type: context.type,
          caseSlug: selectedCaseSlug || context.caseSlug,
          pageSlug: context.pageSlug,
        });
        if (toolCalls.length > 0) {
          const msgWithTools = { ...finalMsg, toolCalls };
          setMessages((m) => [...m.slice(0, -1), msgWithTools]);
          if (persistHistory && activeSessionId) {
            await saveMessage(activeSessionId, msgWithTools);
          }
        }
      } catch (err) {
        const isAborted = err instanceof DOMException && err.name === "AbortError";
        if (!isAborted) {
          const errorMsg = describeChatError(err, t);
          setError(errorMsg);
          let errorMsgFinal: ChatMessage | null = null;
          setMessages((m) => {
            const last = m[m.length - 1];
            if (!last || last.role !== "assistant") return m;
            errorMsgFinal = {
              ...last,
              isStreaming: false,
              error: errorMsg,
              content: last.content || "",
            };
            return [...m.slice(0, -1), errorMsgFinal];
          });
          if (persistHistory && activeSessionId && errorMsgFinal) {
            await saveMessage(activeSessionId, errorMsgFinal);
          }
        } else {
          let abortedMsg: ChatMessage | null = null;
          setMessages((m) => {
            const last = m[m.length - 1];
            if (!last || last.role !== "assistant") return m;
            abortedMsg = {
              ...last,
              isStreaming: false,
              content: last.content || "[Generierung abgebrochen]",
            };
            return [...m.slice(0, -1), abortedMsg];
          });
          if (persistHistory && activeSessionId && abortedMsg) {
            await saveMessage(activeSessionId, abortedMsg);
          }
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [
      persistHistory,
      activeSessionId,
      jurisdiction,
      meQuery.data?.user?.id,
      selectedCaseSlug,
      cases,
      context,
      modelOverride,
      queryMode,
      t,
      isStreaming,
      setMessages,
      userContext,
      groundAnswer,
      lang,
    ]
  );

  // Edit user message and resend
  const handleEdit = useCallback(
    async (messageId: string) => {
      if (isStreaming) return;
      const msg = messagesRef.current.find((m) => m.id === messageId);
      if (!msg || msg.role !== "user") return;

      const idx = messagesRef.current.findIndex((m) => m.id === messageId);
      const messagesAfter = messagesRef.current.length - idx - 1;

      if (messagesAfter > 2) {
        const ok = await confirm({
          title: t("chat.edit_confirm_title"),
          message: `${t("chat.edit_confirm_prefix")} ${messagesAfter} ${t("chat.edit_confirm_suffix")}`,
          confirmLabel: t("chat.edit_confirm_btn"),
          cancelLabel: t("chat.edit_cancel"),
          variant: "danger",
        });
        if (!ok) return;
      }

      const editedContent = msg.content;
      const editedAttachments = msg.attachments;
      setMessages((m) => {
        const idx = m.findIndex((mm) => mm.id === messageId);
        if (idx < 0) return m;
        return m.slice(0, idx);
      });
      handleSend(editedContent, editedAttachments);
    },
    [handleSend, isStreaming, confirm, setMessages, t]
  );

  // Quote-reply to a message
  const [replyTo, setReplyTo] = useState<{
    id: string;
    role: "user" | "assistant";
    preview: string;
  } | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [dismissedError, setDismissedError] = useState(false);

  // Reply-to Esc shortcut
  useEffect(() => {
    if (!replyTo) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setReplyTo(null);
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [replyTo]);

  // Scroll-to-bottom button visibility
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    function handleScroll() {
      const el = scrollContainerRef.current;
      if (!el) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      setShowScrollBtn(!nearBottom && messages.length > 4);
    }
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [messages.length]);

  // Reset dismissed error when new error appears
  useEffect(() => {
    if (error) setDismissedError(false);
  }, [error]);

  // Date separator helper
  function getDateLabel(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();
    if (isToday) return t("chat.today");
    if (isYesterday) return t("chat.yesterday");
    return date.toLocaleDateString(lang === "en" ? "en-GB" : "de-AT", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleReply = useCallback((messageId: string) => {
    const msg = messagesRef.current.find((m) => m.id === messageId);
    if (!msg) return;
    setReplyTo({
      id: msg.id,
      role: msg.role,
      preview: msg.content.slice(0, 120),
    });
    requestAnimationFrame(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>("textarea[data-chat-input]");
      textarea?.focus();
    });
  }, []);

  // Pin/unpin session
  const handleTogglePin = useCallback(
    async (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;
      if (session.pinned) {
        await unpinSession(sessionId);
      } else {
        await pinSession(sessionId);
      }
      refreshSessions();
    },
    [sessions, refreshSessions]
  );

  // Tag session
  const handleTagSession = useCallback(
    async (sessionId: string, tags: string[]) => {
      await setSessionTags(sessionId, tags);
      refreshSessions();
    },
    [refreshSessions]
  );

  // Export chat — Word document with the checked citations and the AI notice.
  // AI text leaves the firm only after the citation check and a lawyer's
  // release (the release dialog opens when the server asks for it); there is
  // no client-side fallback that would bypass it.
  const { exportDocx: exportAiDocx, dialog: exportReleaseDialog } = useAiDocxExport({
    onError: setError,
  });
  const handleExport = useCallback(async () => {
    const docTitle = title ?? t("chat.title");
    const markdown = buildChatExportMarkdown(messages, {
      user: t("chat.export_user"),
      ai: t("chat.export_ai"),
      date: t("chat.export_date"),
      sources: t("chat.export_sources"),
      gaps: t("chat.export_gaps"),
      locale: lang === "en" ? "en-GB" : "de-DE",
    });
    const stamp = new Date().toISOString().slice(0, 10);
    await exportAiDocx({ title: docTitle, markdown }, `chat-${stamp}.docx`);
  }, [messages, title, t, lang, exportAiDocx]);

  // Share chat (read-only link via base64 encoding)
  // Share: the conversation is saved on the server and shared with colleagues
  // who may see its matter; the link opens it for them.
  const handleShare = useCallback(async () => {
    if (messages.length === 0 || !activeSessionId) return;
    const saved = await saveSessionToServer({
      id: activeSessionId,
      title:
        messages[0]?.role === "user"
          ? autoTitleFromQuery(messages[0].content)
          : (title ?? t("chat.title")),
      caseSlug: selectedCaseSlug || context.caseSlug,
      messages,
    });
    const url = saved ? await shareSession(activeSessionId) : null;
    if (!url) {
      setError(
        lang === "en"
          ? "The conversation could not be shared."
          : "Die Unterhaltung konnte nicht geteilt werden."
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt(lang === "en" ? "Link to the conversation" : "Link zur Unterhaltung", url);
    }
  }, [messages, activeSessionId, title, t, selectedCaseSlug, context.caseSlug, lang]);

  // Stable callback wrappers for memoized ChatMessageBubble (avoid inline closures)
  const handleRegenerateById = useCallback(
    (messageId: string) => handleRegenerate(messageId),
    [handleRegenerate]
  );
  const handleEditById = useCallback((messageId: string) => handleEdit(messageId), [handleEdit]);
  const handleReplyById = useCallback((messageId: string) => handleReply(messageId), [handleReply]);

  // Rate an answer: shown at once, stored on the server with its question and
  // sources (lib/answer-feedback.ts) and kept on the local message.
  const handleFeedback = useCallback(
    (messageId: string, rating: "up" | "down", reason?: AnswerDownReason) => {
      const msgs = messagesRef.current;
      const index = msgs.findIndex((m) => m.id === messageId);
      const answer = msgs[index];
      if (!answer) return;
      const question =
        [...msgs.slice(0, index)].reverse().find((m) => m.role === "user")?.content ?? "";
      const feedback = { rating, ...(reason ? { reason } : {}) };
      const rated = { ...answer, feedback };
      setMessages((m) => m.map((x) => (x.id === messageId ? rated : x)));
      if (persistHistory && activeSessionId) void saveMessage(activeSessionId, rated);
      void csrfFetch("/api/copilot/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_id: messageId,
          rating,
          ...(reason ? { reason } : {}),
          question: question.slice(0, 2_000),
          answer: answer.content.slice(0, 20_000),
          citations: (answer.citations ?? []).map((c) => c.slug).slice(0, 50),
          ...(selectedCaseSlug || context.caseSlug
            ? { case_slug: selectedCaseSlug || context.caseSlug }
            : {}),
          ...(answer.model ? { model: answer.model } : {}),
        }),
      }).catch(() => {});
    },
    [setMessages, persistHistory, activeSessionId, selectedCaseSlug, context.caseSlug]
  );

  // Follow-up suggestion click: send as new user message
  const handleFollowUp = useCallback(
    (query: string) => {
      if (query.trim()) handleSend(query.trim());
    },
    [handleSend]
  );

  // Example queries
  const exampleQueries = useMemo(() => {
    if (providedExampleQueries?.length) return providedExampleQueries;
    if (context.type === "case" && selectedCaseSlug) {
      const caseTitle = cases.find((c) => c.slug === selectedCaseSlug)?.title ?? selectedCaseSlug;
      if (lang === "en") {
        return [
          `What is the current status of case ${caseTitle}?`,
          "Which deadlines are open in this case?",
          "Which documents are missing in this case?",
          "Are there any contradictions in the case notes?",
          "Summarize the communication with the client.",
        ];
      }
      return [
        `Was ist der aktuelle Stand der Akte ${caseTitle}?`,
        "Welche Fristen sind in dieser Akte offen?",
        "Welche Dokumente fehlen in dieser Akte?",
        "Gibt es Widersprüche in den Aktennotizen?",
        "Fasse die Kommunikation mit dem Mandanten zusammen.",
      ];
    }
    return lang === "en" ? DEFAULT_EXAMPLE_QUERIES_EN : DEFAULT_EXAMPLE_QUERIES;
  }, [providedExampleQueries, context.type, selectedCaseSlug, cases, lang]);

  const contextLabel = useMemo(() => {
    if (context.type === "case" && selectedCaseSlug) {
      return cases.find((c) => c.slug === selectedCaseSlug)?.title ?? selectedCaseSlug;
    }
    if (context.type === "brain_page" && context.pageSlug) {
      return context.pageSlug;
    }
    return undefined;
  }, [context, selectedCaseSlug, cases]);

  const messageFeatures = useMemo(
    () => ({
      markdownRendering: resolvedFeatures.markdownRendering,
      messageActions: resolvedFeatures.messageActions,
      tokenWidget: resolvedFeatures.tokenWidget,
    }),
    [resolvedFeatures]
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]",
        className
      )}
      role="region"
      aria-label={title ?? t("chat.title")}
    >
      {exportReleaseDialog}
      <ChatHeader
        isStreaming={isStreaming}
        features={{
          modelSelector: resolvedFeatures.modelSelector,
          modeSelector: resolvedFeatures.modeSelector,
          caseSelector: resolvedFeatures.caseSelector,
          jurisdictionSelector: resolvedFeatures.jurisdictionSelector,
          brainStatus: resolvedFeatures.brainStatus,
          tokenWidget: resolvedFeatures.tokenWidget,
          exportChat: resolvedFeatures.exportChat,
        }}
        modelOverride={modelOverride}
        onModelChange={setModelOverride}
        queryMode={queryMode}
        onQueryModeChange={setQueryMode}
        jurisdiction={jurisdiction}
        onJurisdictionChange={setJurisdiction}
        cases={cases}
        selectedCaseSlug={selectedCaseSlug}
        onCaseChange={(slug) => {
          setSelectedCaseSlug(slug);
          // Sync jurisdiction from the selected case
          if (slug) {
            api.brain
              .getPage(slug)
              .then((page) => {
                const fm = caseFrontmatter(page as BrainPage);
                setJurisdiction(matterJurisdiction(fm.jurisdiction));
              })
              .catch((err) =>
                console.warn(
                  "[chat] Failed to load case jurisdiction:",
                  err instanceof Error ? err.message : err
                )
              );
          }
        }}
        onClear={handleClear}
        onExport={handleExport}
        onShare={handleShare}
        onNewSession={handleNewSession}
        sessionTokens={sessionTokens}
        messageCount={messages.length}
        sessions={persistHistory ? sessions : undefined}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        onTogglePin={handleTogglePin}
        onTagSession={handleTagSession}
        sessionSearch={sessionSearch}
        onSessionSearchChange={setSessionSearch}
        trailingActions={headerActions}
      />

      {/* Work mode: conversation or structured subsumption — a segmented
          control, same pattern as the Auto/Schnell/Gründlich switch above. */}
      <div className="flex items-center border-b border-[var(--ds-border)] px-3 py-2">
        <div
          role="tablist"
          aria-label={lang === "en" ? "Work mode" : "Arbeitsmodus"}
          className="inline-flex items-center gap-1 rounded-lg bg-[color:var(--ds-surface-2)] p-1"
        >
          {[
            { on: !subsumptionMode, set: false, label: t("copilot.copilot"), Icon: MessageSquare },
            { on: subsumptionMode, set: true, label: "Subsumtion", Icon: Scale },
          ].map(({ on, set, label, Icon }) => (
            <button
              key={label}
              role="tab"
              aria-selected={on}
              onClick={() => setSubsumptionMode(set)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none ${
                on
                  ? "bg-[color:var(--ds-surface)] text-[color:var(--ds-text)] shadow-sm"
                  : "text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              }`}
            >
              <Icon size={13} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Subsumption Mode */}
      {subsumptionMode ? (
        <SubsumptionPanel
          jurisdiction={jurisdiction}
          caseSlug={selectedCaseSlug || context.caseSlug || undefined}
          onClose={() => setSubsumptionMode(false)}
        />
      ) : (
        <>
          {/* Messages area */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto"
            role="log"
            aria-live="polite"
            aria-busy={isStreaming}
          >
            {messages.length === 0 ? (
              <ChatEmptyState
                onExampleClick={(q) => handleSend(q)}
                exampleQueries={exampleQueries}
                contextLabel={contextLabel}
                userName={userContext?.name}
              />
            ) : (
              <div className="py-2">
                {messages.map((msg, idx) => {
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const showDateSeparator =
                    !prevMsg ||
                    new Date(prevMsg.createdAt).toDateString() !==
                      new Date(msg.createdAt).toDateString();
                  return (
                    <div
                      key={msg.id}
                      style={
                        messages.length > 30 && idx < messages.length - 10
                          ? { contentVisibility: "auto", containIntrinsicSize: "auto 120px" }
                          : undefined
                      }
                    >
                      {showDateSeparator && (
                        <div className="mx-auto my-3 flex w-full max-w-3xl items-center gap-3 px-4">
                          <div className="h-px flex-1 bg-[color:var(--ds-border)]" />
                          <span className="text-[11px] font-medium tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
                            {getDateLabel(msg.createdAt)}
                          </span>
                          <div className="h-px flex-1 bg-[color:var(--ds-border)]" />
                        </div>
                      )}
                      <ChatMessageBubble
                        message={msg}
                        features={messageFeatures}
                        onRegenerate={msg.role === "assistant" ? handleRegenerateById : undefined}
                        onEdit={msg.role === "user" ? handleEditById : undefined}
                        onReply={handleReplyById}
                        onExport={handleExport}
                        onToolConfirm={handleToolConfirm}
                        onToolCancel={handleToolCancel}
                        onToolRetry={handleToolRetry}
                        onFollowUp={handleFollowUp}
                        onFeedback={msg.role === "assistant" ? handleFeedback : undefined}
                        saveToMatterCase={
                          msg.role === "assistant" && !msg.isStreaming
                            ? selectedCaseSlug || context.caseSlug || ""
                            : undefined
                        }
                      />
                    </div>
                  );
                })}
                {/* The waiting state lives inside the pending answer itself
                    (chat-message.tsx) — a second "is typing" line below an empty
                    bubble said the same thing twice. */}
                {/* Suggested follow-ups after last AI message */}
                {!isStreaming &&
                  messages.length > 0 &&
                  messages[messages.length - 1].role === "assistant" &&
                  !messages[messages.length - 1].error &&
                  messages[messages.length - 1].content.trim().length > 0 && (
                    <SuggestedFollowUps
                      lastMessage={messages[messages.length - 1]}
                      onSelect={(q) => handleSend(q)}
                      t={t}
                      lang={lang}
                    />
                  )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Scroll-to-bottom button */}
          {showScrollBtn && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-24 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-lg transition-[opacity,transform] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none"
              aria-label={t("chat.scroll_bottom")}
            >
              <ArrowDown size={16} className="text-[color:var(--ds-text-muted)]" />
            </button>
          )}

          {/* Error banner */}
          {error && !dismissedError && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex items-center gap-2 border-t border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-4 py-2 text-xs text-[color:var(--ds-danger-text)]"
            >
              <span className="min-w-0 flex-1 truncate">{error}</span>
              <button
                onClick={() => setDismissedError(true)}
                className="shrink-0 text-[color:var(--ds-danger-text)] transition-[background-color,border-color,color] hover:text-[color:var(--ds-danger-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none motion-reduce:transition-none"
                aria-label={t("chat.dismiss_error")}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Reply preview */}
          {replyTo && (
            <div className="flex items-center gap-2 border-t border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-4 py-2 text-xs">
              <Reply size={12} className="shrink-0 text-[color:var(--ds-text-muted)]" />
              <span className="text-[color:var(--ds-text-subtle)]">
                {t("chat.reply_to")}{" "}
                {replyTo.role === "user" ? t("chat.reply_user") : t("chat.reply_ai")}:
              </span>
              <span className="min-w-0 flex-1 truncate text-[color:var(--ds-text-muted)]">
                {replyTo.preview}
              </span>
              <button
                onClick={() => setReplyTo(null)}
                className="shrink-0 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)]"
                aria-label={t("chat.close_reply_preview")}
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Marked passage the next question is about */}
          {quoted && (
            <div className="flex items-start gap-2 border-t border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-4 py-2 text-xs">
              <Quote
                size={12}
                className="mt-0.5 shrink-0 text-[color:var(--brand-primary)]"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[color:var(--ds-text-subtle)]">
                  {lang === "en" ? "Asking about" : "Frage zu"}
                  {quoted.source ? ` · ${quoted.source}` : ""}
                </span>
                <span className="line-clamp-3 text-[color:var(--ds-text-muted)]">
                  „{quoted.text}“
                </span>
              </span>
              <button
                type="button"
                onClick={() => setQuoted(null)}
                className="shrink-0 rounded p-1 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                aria-label={lang === "en" ? "Remove marked passage" : "Markierung entfernen"}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Input area - only in copilot mode */}
          <ChatInput
            onSend={(text, atts) => {
              handleSend(text, atts, replyTo, quoted);
              setReplyTo(null);
              setQuoted(null);
            }}
            onStop={handleStop}
            isStreaming={isStreaming}
            placeholder={placeholder}
            features={{
              fileUpload: resolvedFeatures.fileUpload,
              modelSelector: false,
            }}
            modelOverride={modelOverride}
            onModelChange={setModelOverride}
          />
        </>
      )}
    </div>
  );
});
