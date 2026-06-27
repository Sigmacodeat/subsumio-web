"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Reply, X, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useLang } from "@/lib/use-lang";
import { buildSafePrompt } from "@/lib/prompt-sanitizer";
import { buildPromptContext, processStreamingChunk } from "@/components/chat/system-prompt";
import { type QueryMode } from "@/lib/matter-context-types";
import type { BrainPage } from "@/lib/types";
import { caseFrontmatter } from "@/lib/legal-types";
import {
  DEFAULT_FEATURES,
  DEFAULT_EXAMPLE_QUERIES,
  type ChatMessage,
  type ChatSession,
  type ChatFeatures,
  type ChatContextType,
  type Jurisdiction,
  type ThinkMode,
  type ToolCall,
  type ToolType,
  DESTRUCTIVE_TOOLS,
} from "@/components/chat/chat-types";
import {
  generateSessionId,
  generateMessageId,
  autoTitleFromQuery,
  createSession,
  updateSession,
  deleteSession,
  listSessions,
  loadMessages,
  saveMessage,
  pinSession,
  unpinSession,
  setSessionTags,
} from "@/components/chat/chat-session-store";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessageBubble } from "@/components/chat/chat-message";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { ChatStreamingIndicator } from "@/components/chat/chat-streaming-indicator";

interface ChatPanelProps {
  context?: {
    type: ChatContextType;
    caseSlug?: string;
    pageSlug?: string;
  };
  features?: Partial<ChatFeatures>;
  persistHistory?: boolean;
  className?: string;
  title?: string;
  initialQuery?: string;
  placeholder?: string;
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

interface ToolDetectionRule {
  pattern: RegExp;
  tool: ToolType;
  label: string;
  extractParams: (match: RegExpMatchArray) => Record<string, unknown>;
}

const TOOL_RULES: ToolDetectionRule[] = [
  {
    pattern: /\[TOOL:navigate\s+route="([^"]+)"\]/i,
    tool: "navigate",
    label: "chat.tool.navigate",
    extractParams: (m) => ({ route: m[1] }),
  },
  {
    pattern: /\[TOOL:search_cases\s+query="([^"]+)"\]/i,
    tool: "search_cases",
    label: "chat.tool.search_cases",
    extractParams: (m) => ({ query: m[1] }),
  },
  {
    pattern: /\[TOOL:search_deadlines(?:\s+case_slug="([^"]+)")?\s+status="([^"]+)"\]/i,
    tool: "search_deadlines",
    label: "chat.tool.search_deadlines",
    extractParams: (m) => ({ case_slug: m[1] || undefined, status: m[2] }),
  },
  {
    pattern: /\[TOOL:search_knowledge\s+query="([^"]+)"\]/i,
    tool: "search_knowledge",
    label: "chat.tool.search_knowledge",
    extractParams: (m) => ({ query: m[1] }),
  },
  {
    pattern:
      /\[TOOL:create_case\s+title="([^"]+)"(?:\s+client_name="([^"]+)")?(?:\s+opponent_name="([^"]+)")?(?:\s+case_type="([^"]+)")?\]/i,
    tool: "create_case",
    label: "chat.tool.create_case",
    extractParams: (m) => ({
      title: m[1],
      client_name: m[2] || undefined,
      opponent_name: m[3] || undefined,
      case_type: m[4] || undefined,
    }),
  },
  {
    pattern: /\[TOOL:case_summary\s+case_slug="([^"]+)"\]/i,
    tool: "case_summary",
    label: "chat.tool.case_summary",
    extractParams: (m) => ({ case_slug: m[1] }),
  },
  {
    pattern:
      /\[TOOL:email_draft\s+subject="([^"]+)"(?:\s+recipient="([^"]+)")?(?:\s+case_slug="([^"]+)")?(?:\s+tone="([^"]+)")?\]/i,
    tool: "email_draft",
    label: "chat.tool.email_draft",
    extractParams: (m) => ({
      subject: m[1],
      recipient: m[2] || undefined,
      case_slug: m[3] || undefined,
      tone: (m[4] as "formal" | "neutral" | "urgent") || "formal",
    }),
  },
  {
    pattern:
      /\[TOOL:send_email\s+to="([^"]+)"\s+subject="([^"]+)"(?:\s+text="([^"]*)")?(?:\s+case_slug="([^"]+)")?\]/i,
    tool: "send_email",
    label: "chat.tool.send_email",
    extractParams: (m) => ({
      to: m[1],
      subject: m[2],
      text: m[3] || "",
      case_slug: m[4] || undefined,
    }),
  },
  {
    pattern: /\[TOOL:deadline_extract\s+document_slug="([^"]+)"\]/i,
    tool: "deadline_extract",
    label: "chat.tool.deadline_extract",
    extractParams: (m) => ({ document_slug: m[1] }),
  },
  {
    pattern: /\[TOOL:document_summary\s+document_slug="([^"]+)"\]/i,
    tool: "document_summary",
    label: "chat.tool.document_summary",
    extractParams: (m) => ({ document_slug: m[1] }),
  },
  {
    pattern: /\[TOOL:conflict_check\s+name="([^"]+)"\]/i,
    tool: "conflict_check",
    label: "chat.tool.conflict_check",
    extractParams: (m) => ({ name: m[1] }),
  },
  {
    pattern:
      /\[TOOL:time_entry\s+case_slug="([^"]+)"\s+description="([^"]+)"(?:\s+hours="([^"]+)")?(?:\s+activity_type="([^"]+)")?\]/i,
    tool: "time_entry",
    label: "chat.tool.time_entry",
    extractParams: (m) => ({
      case_slug: m[1],
      description: m[2],
      hours: m[3] ? parseFloat(m[3]) : undefined,
      activity_type:
        (m[4] as "research" | "drafting" | "review" | "meeting" | "correspondence" | "other") ||
        "other",
    }),
  },
  {
    pattern: /\[TOOL:client_update\s+case_slug="([^"]+)"(?:\s+update_type="([^"]+)")?\]/i,
    tool: "client_update",
    label: "chat.tool.client_update",
    extractParams: (m) => ({
      case_slug: m[1],
      update_type: (m[2] as "status" | "deadline" | "next_steps" | "summary") || "status",
    }),
  },
  {
    pattern: /\[TOOL:meeting_tasks\s+notes="([^"]+)"(?:\s+case_slug="([^"]+)")?\]/i,
    tool: "meeting_tasks",
    label: "chat.tool.meeting_tasks",
    extractParams: (m) => ({ notes: m[1], case_slug: m[2] || undefined }),
  },
  {
    pattern:
      /\[TOOL:intake_create\s+client_name="([^"]+)"\s+matter_type="([^"]+)"(?:\s+jurisdiction="([^"]+)")?(?:\s+urgency="([^"]+)")?\]/i,
    tool: "intake_create",
    label: "chat.tool.intake_create",
    extractParams: (m) => ({
      client_name: m[1],
      matter_type: m[2],
      jurisdiction: (m[3] as "de" | "at" | "ch") || "de",
      urgency: (m[4] as "low" | "medium" | "high" | "critical") || "medium",
    }),
  },
  {
    pattern: /\[TOOL:rvg_calculate\s+streitwert="([^"]+)"\]/i,
    tool: "rvg_calculate",
    label: "chat.tool.rvg_calculate",
    extractParams: (m) => ({ streitwert: parseFloat(m[1]) }),
  },
  {
    pattern:
      /\[TOOL:document_request_create\s+case_slug="([^"]+)"(?:\s+items="([^"]+)")?(?:\s+message="([^"]+)")?\]/i,
    tool: "document_request_create",
    label: "chat.tool.document_request_create",
    extractParams: (m) => ({
      case_slug: m[1],
      items: m[2]
        ? m[2]
            .split(";")
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined,
      message_draft: m[3] || undefined,
    }),
  },
  {
    pattern:
      /\[TOOL:precedent_search\s+query="([^"]+)"(?:\s+jurisdiction="([^"]+)")?(?:\s+legal_area="([^"]+)")?\]/i,
    tool: "precedent_search",
    label: "chat.tool.precedent_search",
    extractParams: (m) => ({
      query: m[1],
      jurisdiction: (m[2] as "at" | "de" | "ch") || undefined,
      legal_area: m[3] || undefined,
    }),
  },
  {
    pattern:
      /\[TOOL:translate_text\s+target_language="([^"]+)"(?:\s+source_language="([^"]+)")?(?:\s+text="([^"]+)")?(?:\s+document_slug="([^"]+)")?\]/i,
    tool: "translate_text",
    label: "chat.tool.translate_text",
    extractParams: (m) => ({
      target_language: m[1],
      source_language: m[2] || undefined,
      text: m[3] || undefined,
      document_slug: m[4] || undefined,
    }),
  },
  {
    pattern:
      /\[TOOL:obligation_extract(?:\s+document_slug="([^"]+)")?(?:\s+jurisdiction="([^"]+)")?(?:\s+text="([^"]+)")?\]/i,
    tool: "obligation_extract",
    label: "chat.tool.obligation_extract",
    extractParams: (m) => ({
      document_slug: m[1] || undefined,
      jurisdiction: (m[2] as "at" | "de" | "ch" | "all") || "all",
      text: m[3] || undefined,
    }),
  },
  {
    pattern:
      /\[TOOL:tabular_review\s+questions="([^"]+)"(?:\s+document_slugs="([^"]+)")?(?:\s+case_slug="([^"]+)")?\]/i,
    tool: "tabular_review",
    label: "chat.tool.tabular_review",
    extractParams: (m) => ({
      questions: m[1]
        .split(";")
        .map((question) => question.trim())
        .filter(Boolean),
      document_slugs: m[2]
        ? m[2]
            .split(";")
            .map((slug) => slug.trim())
            .filter(Boolean)
        : undefined,
      case_slug: m[3] || undefined,
    }),
  },
];

// Detect all tool markers in AI response — supports multiple tools per response (G16)
function detectToolCalls(
  answer: string,
  context: { type: ChatContextType; caseSlug?: string; pageSlug?: string }
): ToolCall[] {
  const calls: Array<{ toolCall: ToolCall; position: number }> = [];
  const matterSlug = context.caseSlug;

  // Tools that benefit from automatic matter-scoping
  const MATTER_SCOPED_TOOLS = new Set([
    "email_draft",
    "send_email",
    "client_update",
    "time_entry",
    "case_summary",
    "search_deadlines",
  ]);

  for (const rule of TOOL_RULES) {
    // Use matchAll to find ALL occurrences of each tool marker (G16: tool chaining)
    let cursor = 0;
    while (cursor < answer.length) {
      const slice = answer.slice(cursor);
      const match = slice.match(rule.pattern);
      if (!match || match.index === undefined) break;

      const params = rule.extractParams(match);

      // Auto-inject case_slug from context for matter-scoped tools
      if (matterSlug && MATTER_SCOPED_TOOLS.has(rule.tool) && !params.case_slug) {
        params.case_slug = matterSlug;
      }

      const isDestructive = DESTRUCTIVE_TOOLS.has(rule.tool);

      const toolCall: ToolCall = {
        id: `${rule.tool}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: rule.tool,
        label: rule.label,
        params,
        status: isDestructive ? "pending" : "executing",
        requiresConfirmation: isDestructive,
      };

      // Track absolute position in answer for correct ordering
      const absolutePos = cursor + match.index;
      calls.push({ toolCall, position: absolutePos });

      cursor += match.index + match[0].length;
    }
  }

  // Sort by position in the answer string (order the AI emitted them)
  calls.sort((a, b) => a.position - b.position);
  return calls.map((c) => c.toolCall);
}

// Execute a single tool call (used for both immediate and confirmed execution)
async function executeToolCall(toolCall: ToolCall): Promise<ToolCall> {
  try {
    const result = await api.copilot.executeTool(toolCall.type, toolCall.params);
    return {
      ...toolCall,
      status: result.success ? "completed" : "error",
      result: {
        success: result.success,
        data: result.data,
        error: result.error,
        display: result.display,
      },
    };
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

// Detect tools and execute non-destructive ones immediately; destructive ones stay pending
async function detectAndExecuteTools(
  answer: string,
  context: { type: ChatContextType; caseSlug?: string; pageSlug?: string }
): Promise<ToolCall[]> {
  const allCalls = detectToolCalls(answer, context);

  // Execute non-destructive tools immediately, leave destructive ones pending
  const results = await Promise.all(
    allCalls.map((tc) => (tc.requiresConfirmation ? Promise.resolve(tc) : executeToolCall(tc)))
  );

  return results;
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
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(function ChatPanel(
  {
    context = { type: "global" },
    features,
    persistHistory = true,
    className,
    title,
    initialQuery,
    placeholder,
  },
  ref
) {
  const { t, lang } = useLang();
  const confirm = useConfirm();

  const resolvedFeatures = useMemo(() => ({ ...DEFAULT_FEATURES, ...features }), [features]);

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
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<Array<{ slug: string; title: string }>>([]);
  const [selectedCaseSlug, setSelectedCaseSlug] = useState(context.caseSlug ?? "");
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("de");
  const [queryMode, setQueryMode] = useState<QueryMode>("deep_matter");
  const [modelOverride, setModelOverride] = useState<string | undefined>(undefined);
  const [sessionTokens, setSessionTokens] = useState(0);
  const [isCompact, setIsCompact] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect narrow panel for compact header mode
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompact(entry.contentRect.width < 360);
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
        const pages = await api.brain.listPages({ type: "legal_case", limit: 100 });
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
            if (fm.jurisdiction) setJurisdiction(fm.jurisdiction as Jurisdiction);
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

  // Load sessions list — filtered by matter for isolation
  const refreshSessions = useCallback(async () => {
    if (!persistHistory) return;
    const list = await listSessions({
      caseSlug: selectedCaseSlug || context.caseSlug,
      contextType: context.type,
    });
    setSessions(list);
  }, [persistHistory, selectedCaseSlug, context.caseSlug, context.type]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

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
      const list = await listSessions({
        caseSlug: selectedCaseSlug || context.caseSlug,
        contextType: context.type,
      });
      if (list.length > 0 && !activeSessionId) {
        const latest = list[0];
        setActiveSessionId(latest.id);
        const msgs = await loadMessages(latest.id);
        const sanitized = sanitizeSessionMessages(msgs);
        setMessages(sanitized);
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

  // Send message
  const handleSend = useCallback(
    async (
      text: string,
      attachments?: Array<{ name: string; slug: string }>,
      replyTo?: { id: string; role: "user" | "assistant"; preview: string } | null
    ) => {
      if (!text.trim() && !attachments?.length) return;
      if (isStreaming) return; // Prevent concurrent streams

      const userMsg: ChatMessage = {
        id: generateMessageId(),
        role: "user",
        content: text,
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

      if (persistHistory && activeSessionId) {
        await saveMessage(activeSessionId, userMsg);
        await saveMessage(activeSessionId, assistantMsg);
      }

      // Build prompt via shared context builder
      const { systemPrompt, userInput } = await buildPromptContext({
        jurisdiction,
        selectedCaseSlug,
        cases,
        contextType: context.type,
        contextCaseSlug: context.caseSlug,
        pageSlug: context.pageSlug,
        attachments,
        replyTo,
        userText: text,
        attachmentFetcher: async (slug) => {
          const page = await api.brain.getPage(slug);
          return page.content || "";
        },
      });
      const prompt = buildSafePrompt(systemPrompt, userInput);

      // Create abort controller
      const controller = new AbortController();
      abortControllerRef.current = controller;
      // Buffer for incomplete [TOOL:...] markers that span chunk boundaries
      let toolMarkerBuffer = "";

      try {
        const result = await api.query.think(prompt, {
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
        const cleanAnswer = result.answer.replace(/\[TOOL:[^\]]+\]/gi, "").trim();
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
          model: modelOverride && modelOverride !== "auto" ? modelOverride : undefined,
          mode: queryMode,
        };

        setMessages((m) => [...m.slice(0, -1), finalMsg]);

        if (persistHistory && activeSessionId) {
          await saveMessage(activeSessionId, finalMsg);
        }

        if (result.tokens_used) {
          setSessionTokens((prev) => prev + result.tokens_used!);
        }

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
        }
      } catch (err) {
        const isAborted = err instanceof DOMException && err.name === "AbortError";
        if (!isAborted) {
          const errorMsg = err instanceof Error ? err.message : t("chat.error_generic");
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
      modelOverride,
      persistHistory,
      queryMode,
      selectedCaseSlug,
      t,
      isStreaming,
      setMessages,
    ]
  );

  // Stop generation
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Imperative API for parent components (Quick Actions, Copilot Sidebar)
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
    }),
    [handleSend]
  );

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
      const executed = await executeToolCall(foundToolCall);

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
    [persistHistory, activeSessionId, setMessages]
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
      const executed = await executeToolCall(foundToolCall);

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
    [persistHistory, activeSessionId, setMessages]
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

  // Select session
  const handleSelectSession = useCallback(
    async (id: string) => {
      if (isStreaming) return; // Prevent session switch during active stream
      setActiveSessionId(id);
      const msgs = await loadMessages(id);
      const sanitizedMsgs = sanitizeSessionMessages(msgs);
      setMessages(sanitizedMsgs);
      setSessionTokens(sanitizedMsgs.reduce((sum, m) => sum + (m.tokensUsed ?? 0), 0));
      setError(null);
    },
    [isStreaming, setMessages]
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
      const { systemPrompt: regenSystemPrompt, userInput: regenUserInput } =
        await buildPromptContext({
          jurisdiction,
          selectedCaseSlug,
          cases,
          contextType: context.type,
          contextCaseSlug: context.caseSlug,
          pageSlug: context.pageSlug,
          attachments: userMsg.attachments,
          replyTo: null,
          userText: userMsg.content,
          attachmentFetcher: async (slug) => {
            const page = await api.brain.getPage(slug);
            return page.content || "";
          },
        });
      const prompt = buildSafePrompt(regenSystemPrompt, regenUserInput);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      // Buffer for incomplete [TOOL:...] markers that span chunk boundaries
      let toolMarkerBuffer = "";

      try {
        const result = await api.query.think(prompt, {
          mode: queryModeToThinkMode(queryMode),
          queryMode,
          caseSlug: selectedCaseSlug || context.caseSlug || undefined,
          ...(modelOverride && modelOverride !== "auto" ? { model: modelOverride } : {}),
          signal: controller.signal,
          onChunk: (chunk) => {
            toolMarkerBuffer = processStreamingChunk(chunk, toolMarkerBuffer, setMessages);
          },
        });

        const cleanRegenAnswer = result.answer.replace(/\[TOOL:[^\]]+\]/gi, "").trim();
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
          model: modelOverride && modelOverride !== "auto" ? modelOverride : undefined,
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
          const errorMsg = err instanceof Error ? err.message : t("chat.error_generic");
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
      selectedCaseSlug,
      cases,
      context,
      modelOverride,
      queryMode,
      t,
      isStreaming,
      setMessages,
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
    return date.toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", {
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

  // Export chat
  const handleExport = useCallback(() => {
    const lines = messages.map((m) => {
      const prefix =
        m.role === "user" ? `**👤 ${t("chat.export_user")}:**` : `**🤖 ${t("chat.export_ai")}:**`;
      const meta = [
        m.tokensUsed
          ? ` (${m.tokensUsed.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} tokens)`
          : "",
        m.latencyMs ? ` · ${(m.latencyMs / 1000).toFixed(1)}s` : "",
        m.model ? ` · ${m.model}` : "",
      ].join("");
      const citations = m.citations?.length
        ? `\n\n> **${t("chat.export_sources")}:** ${m.citations.map((c) => c.title).join(", ")}`
        : "";
      const gaps = m.gaps?.length ? `\n\n> **${t("chat.export_gaps")}:** ${m.gaps.join("; ")}` : "";
      return `${prefix}${meta}\n\n${m.content}${citations}${gaps}\n`;
    });
    const content = `# ${title ?? t("chat.title")}\n\n${t("chat.export_date")} ${new Date().toLocaleString(lang === "en" ? "en-GB" : "de-DE")}\n\n---\n\n${lines.join("\n---\n\n")}`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [messages, title, t, lang]);

  // Share chat (read-only link via base64 encoding)
  const handleShare = useCallback(async () => {
    if (messages.length === 0) return;
    const shareData = {
      title: title ?? t("chat.title"),
      messages: messages.map((m) => ({
        r: m.role,
        c: m.content,
        ts: m.createdAt,
      })),
      createdAt: new Date().toISOString(),
    };
    const encoded = btoa(encodeURIComponent(JSON.stringify(shareData)));
    const url = `${window.location.origin}/dashboard/chat?shared=${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback: open in new tab
      window.open(url, "_blank");
    }
  }, [messages, title, t]);

  // Stable callback wrappers for memoized ChatMessageBubble (avoid inline closures)
  const handleRegenerateById = useCallback(
    (messageId: string) => handleRegenerate(messageId),
    [handleRegenerate]
  );
  const handleEditById = useCallback((messageId: string) => handleEdit(messageId), [handleEdit]);
  const handleReplyById = useCallback((messageId: string) => handleReply(messageId), [handleReply]);

  // Example queries
  const exampleQueries = useMemo(() => {
    if (context.type === "case" && selectedCaseSlug) {
      const caseTitle = cases.find((c) => c.slug === selectedCaseSlug)?.title ?? selectedCaseSlug;
      return [
        `Was ist der aktuelle Stand der Akte ${caseTitle}?`,
        "Welche Fristen sind in dieser Akte offen?",
        "Welche Dokumente fehlen in dieser Akte?",
        "Gibt es Widersprüche in den Aktennotizen?",
        "Fasse die Kommunikation mit dem Mandanten zusammen.",
      ];
    }
    return DEFAULT_EXAMPLE_QUERIES;
  }, [context.type, selectedCaseSlug, cases]);

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
      <ChatHeader
        compact={isCompact}
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
                if (fm.jurisdiction) setJurisdiction(fm.jurisdiction as Jurisdiction);
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
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-2 text-[11px] text-[color:var(--ds-text-subtle)]">
        <span className="inline-flex items-center gap-1.5 font-medium text-[color:var(--ds-text-muted)]">
          {t("chat.trust_badge")}
        </span>
        <span className="hidden h-3 w-px bg-[color:var(--ds-border)] sm:block" aria-hidden />
        <span>{t("chat.trust_desc")}</span>
      </div>

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
                    <div className="my-2 flex items-center gap-2 px-4">
                      <div className="h-px flex-1 bg-[color:var(--ds-border)]" />
                      <span className="text-xs font-medium text-[color:var(--ds-text-subtle)]">
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
                  />
                </div>
              );
            })}
            {isStreaming &&
              messages.length > 0 &&
              messages[messages.length - 1].role === "assistant" &&
              !messages[messages.length - 1].content && <ChatStreamingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-lg transition-[opacity,transform] duration-200 hover:bg-[color:var(--ds-hover)] active:scale-95"
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
          className="flex items-center gap-2 border-t border-red-500/20 bg-red-500/5 px-4 py-2 text-xs text-red-600 dark:text-red-400"
        >
          <span className="min-w-0 flex-1 truncate">{error}</span>
          <button
            onClick={() => setDismissedError(true)}
            className="shrink-0 text-red-400 transition-colors hover:text-red-600 dark:text-red-500 dark:hover:text-red-300"
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

      {/* Input area */}
      <ChatInput
        onSend={(text, atts) => {
          handleSend(text, atts, replyTo);
          setReplyTo(null);
        }}
        onStop={handleStop}
        isStreaming={isStreaming}
        placeholder={placeholder}
        features={{
          fileUpload: resolvedFeatures.fileUpload,
          modelSelector: false,
          modeSelector: false,
        }}
        modelOverride={modelOverride}
        onModelChange={setModelOverride}
        queryMode={queryMode}
        onQueryModeChange={setQueryMode}
      />
    </div>
  );
});
