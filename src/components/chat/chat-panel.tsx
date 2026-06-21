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
import { Reply, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useLang } from "@/lib/use-lang";
import { buildSafePrompt } from "@/lib/prompt-sanitizer";
import { QUERY_MODE_LABELS, type QueryMode } from "@/lib/matter-context-types";
import type { BrainPage } from "@/lib/types";
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
  type ToolResult,
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
  clearAllSessions,
  pinSession,
  unpinSession,
  setSessionTags,
} from "@/components/chat/chat-session-store";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessageBubble } from "@/components/chat/chat-message";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { ChatStreamingIndicator } from "@/components/chat/chat-streaming-indicator";
import { ChatLoadingSkeleton } from "@/components/chat/chat-loading-skeleton";

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
}

const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  de: "deutsches",
  at: "österreichisches",
  ch: "schweizerisches",
  eu: "EU-",
};

function queryModeToThinkMode(mode: QueryMode): ThinkMode {
  return mode === "deep_matter" || mode === "admin_audit" ? "tokenmax" : "balanced";
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
    label: "Navigation",
    extractParams: (m) => ({ route: m[1] }),
  },
  {
    pattern: /\[TOOL:search_cases\s+query="([^"]+)"\]/i,
    tool: "search_cases",
    label: "Akten durchsuchen",
    extractParams: (m) => ({ query: m[1] }),
  },
  {
    pattern: /\[TOOL:search_deadlines(?:\s+case_slug="([^"]+)")?\s+status="([^"]+)"\]/i,
    tool: "search_deadlines",
    label: "Fristen prüfen",
    extractParams: (m) => ({ case_slug: m[1] || undefined, status: m[2] }),
  },
  {
    pattern: /\[TOOL:search_knowledge\s+query="([^"]+)"\]/i,
    tool: "search_knowledge",
    label: "Wissensdatenbank durchsuchen",
    extractParams: (m) => ({ query: m[1] }),
  },
  {
    pattern:
      /\[TOOL:create_case\s+title="([^"]+)"(?:\s+client_name="([^"]+)")?(?:\s+opponent_name="([^"]+)")?(?:\s+case_type="([^"]+)")?\]/i,
    tool: "create_case",
    label: "Akte erstellen",
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
    label: "Aktenzusammenfassung",
    extractParams: (m) => ({ case_slug: m[1] }),
  },
  {
    pattern:
      /\[TOOL:email_draft\s+subject="([^"]+)"(?:\s+recipient="([^"]+)")?(?:\s+case_slug="([^"]+)")?(?:\s+tone="([^"]+)")?\]/i,
    tool: "email_draft",
    label: "Email-Entwurf",
    extractParams: (m) => ({
      subject: m[1],
      recipient: m[2] || undefined,
      case_slug: m[3] || undefined,
      tone: (m[4] as "formal" | "neutral" | "urgent") || "formal",
    }),
  },
  {
    pattern: /\[TOOL:deadline_extract\s+document_slug="([^"]+)"\]/i,
    tool: "deadline_extract",
    label: "Fristen extrahieren",
    extractParams: (m) => ({ document_slug: m[1] }),
  },
  {
    pattern: /\[TOOL:document_summary\s+document_slug="([^"]+)"\]/i,
    tool: "document_summary",
    label: "Dokument zusammenfassen",
    extractParams: (m) => ({ document_slug: m[1] }),
  },
  {
    pattern: /\[TOOL:conflict_check\s+name="([^"]+)"\]/i,
    tool: "conflict_check",
    label: "Konfliktprüfung",
    extractParams: (m) => ({ name: m[1] }),
  },
  {
    pattern:
      /\[TOOL:time_entry\s+case_slug="([^"]+)"\s+description="([^"]+)"(?:\s+hours="([^"]+)")?(?:\s+activity_type="([^"]+)")?\]/i,
    tool: "time_entry",
    label: "Zeiteintrag",
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
    label: "Mandanten-Update",
    extractParams: (m) => ({
      case_slug: m[1],
      update_type: (m[2] as "status" | "deadline" | "next_steps" | "summary") || "status",
    }),
  },
  {
    pattern: /\[TOOL:meeting_tasks\s+notes="([^"]+)"(?:\s+case_slug="([^"]+)")?\]/i,
    tool: "meeting_tasks",
    label: "Besprechungsnotizen analysieren",
    extractParams: (m) => ({ notes: m[1], case_slug: m[2] || undefined }),
  },
  {
    pattern:
      /\[TOOL:intake_create\s+client_name="([^"]+)"\s+matter_type="([^"]+)"(?:\s+jurisdiction="([^"]+)")?(?:\s+urgency="([^"]+)")?\]/i,
    tool: "intake_create",
    label: "Mandantsaufnahme",
    extractParams: (m) => ({
      client_name: m[1],
      matter_type: m[2],
      jurisdiction: (m[3] as "de" | "at" | "ch") || "de",
      urgency: (m[4] as "low" | "medium" | "high" | "critical") || "medium",
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
  sendMessage: (text: string) => void;
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(function ChatPanel(
  { context = { type: "global" }, features, persistHistory = true, className, title, initialQuery },
  ref
) {
  const { t } = useLang();
  const confirm = useConfirm();
  const router = useRouter();

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
      } catch {
        if (!cancelled) setCases([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
  }, [activeSessionId, messages.length, persistHistory, refreshSessions, title, t]);

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

      // Build prompt
      const contextParts: string[] = [];
      if (attachments && attachments.length > 0) {
        contextParts.push("--- ANGEHÄNGTE DOKUMENTE ---");
        for (const att of attachments) {
          try {
            const page = await api.brain.getPage(att.slug);
            contextParts.push(`\nDOKUMENT: ${att.name}\n${(page.content || "").slice(0, 8000)}\n`);
          } catch {
            contextParts.push(`\nDOKUMENT: ${att.name}\n[Inhalt nicht abrufbar]\n`);
          }
        }
        contextParts.push("--- ENDE DOKUMENTE ---\n");
      }

      const jurisdictionLabel = JURISDICTION_LABELS[jurisdiction];
      const systemPrompt = `Du bist der Brain Copilot für eine Kanzlei im ${jurisdictionLabel.toUpperCase()} Rechtsraum. Beantworte präzise unter Berücksichtigung des ${jurisdictionLabel} Rechts. Zitiere Gesetze mit § und Absatz, und gib am Ende an: "Diese Information ersetzt keine anwaltliche Prüfung."\n\nWICHTIG — MANDANTENISOLATION:\nWenn eine konkrete Akte aktiv ist, beantworte Fragen NUR im Kontext dieser Akte. Vermeide mandantenübergreifende Informationen. Wenn ein Nutzer nach anderen Mandanten fragt, weise darauf hin, dass du nur im Kontext der aktuellen Akte antworten kannst.\n\nDu hast Zugriff auf Kanzlei-Funktionen. Wenn der Nutzer eine Aktion wünscht, kannst du Tool-Marker in deine Antwort einbetten (unsichtbar für den Nutzer, aber vom System erkannt):\n- Navigation: [TOOL:navigate route="/dashboard/cases"]\n- Akten suchen: [TOOL:search_cases query="Muster GmbH"]\n- Fristen prüfen: [TOOL:search_deadlines status="open"] oder [TOOL:search_deadlines case_slug="cases/123" status="overdue"]\n- Wissen suchen: [TOOL:search_knowledge query="BGB § 280"]\n- Akte erstellen: [TOOL:create_case title="Klage Muster GmbH" client_name="Max Mustermann" opponent_name="Gegner AG"]\n- Aktenzusammenfassung: [TOOL:case_summary case_slug="cases/123"]\n- Email-Entwurf: [TOOL:email_draft subject="Status Update" recipient="mandant@email.de" case_slug="cases/123" tone="formal"]\n- Fristen extrahieren: [TOOL:deadline_extract document_slug="urteil-2026"]\n- Dokument zusammenfassen: [TOOL:document_summary document_slug="vertrag-2026"]\n- Konfliktprüfung: [TOOL:conflict_check name="Muster GmbH"]\n- Zeiteintrag: [TOOL:time_entry case_slug="cases/123" description="Aktenanalyse" hours="1.5" activity_type="research"]\n- Mandanten-Update: [TOOL:client_update case_slug="cases/123" update_type="status"]\n- Besprechungsnotizen: [TOOL:meeting_tasks notes="Besprechung mit Mandant..." case_slug="cases/123"]\n- Mandantsaufnahme: [TOOL:intake_create client_name="Max Mustermann" matter_type="Zivilrecht" jurisdiction="de" urgency="medium"]\n\nVerwende Tools nur wenn der Nutzer explizit eine Aktion wünscht. Antworte sonst normal.\n\nDu kannst MEHRERE Tool-Marker in einer einzigen Antwort verwenden, wenn mehrere Aktionen sinnvoll sind (z.B. zuerst eine Akte suchen, dann eine Frist prüfen). Setze jeden Marker in eine eigene Zeile.\n\nWICHTIG: Tools, die Daten erstellen oder verändern (create_case, intake_create, time_entry), erfordern eine Bestätigung durch den Nutzer. Betten Sie diese Tool-Marker wie gewohnt ein — das System zeigt dem Nutzer einen Bestätigungsdialog an.`;

      if (selectedCaseSlug) {
        const selected = cases.find((c) => c.slug === selectedCaseSlug);
        contextParts.push(
          `--- AKTENKONTEXT ---\nAktive Akte: ${selected?.title ?? selectedCaseSlug}\nSlug: ${selectedCaseSlug}\nNutze Matter Context und zitiere nur belegte Aussagen.\n--- ENDE AKTENKONTEXT ---\n`
        );
      }

      if (context.type === "brain_page" && context.pageSlug) {
        contextParts.push(
          `--- SEITENKONTEXT ---\nBrain-Seite: ${context.pageSlug}\nBeantworte Fragen im Kontext dieser Seite.\n--- ENDE SEITENKONTEXT ---\n`
        );
      }

      if (selectedCaseSlug) {
        const selected = cases.find((c) => c.slug === selectedCaseSlug);
        const caseTitle = selected?.title ?? selectedCaseSlug;
        contextParts.push(`AKTE: ${caseTitle} (slug: ${selectedCaseSlug})`);
      }

      if (replyTo) {
        contextParts.push(
          `--- ZITIERTE NACHRICHT ---\nAntworte auf die folgende ${replyTo.role === "user" ? "Nutzernachricht" : "KI-Antwort"}:\n"${replyTo.preview}"\n--- ENDE ZITAT ---`
        );
      }

      const userInput = `${contextParts.join("\n")}\nNUTZERFRAGE:\n${text}`;
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
            // Prepend any buffered partial marker from previous chunk
            const combined = toolMarkerBuffer + chunk;
            toolMarkerBuffer = "";

            // Check for incomplete [TOOL: marker at end (no closing ])
            const lastOpen = combined.lastIndexOf("[TOOL:");
            if (lastOpen !== -1 && combined.indexOf("]", lastOpen) === -1) {
              // Incomplete marker — buffer it and don't show
              toolMarkerBuffer = combined.slice(lastOpen);
              const beforeMarker = combined.slice(0, lastOpen);
              // Still filter any complete markers in the visible part
              const cleanChunk = beforeMarker.replace(/\[TOOL:[^\]]*\]/gi, "");
              if (!cleanChunk) return;
              setMessages((m) => {
                const last = m[m.length - 1];
                if (!last || last.role !== "assistant") return m;
                return [...m.slice(0, -1), { ...last, content: last.content + cleanChunk }];
              });
              return;
            }

            // No incomplete marker — filter complete markers normally
            const cleanChunk = combined.replace(/\[TOOL:[^\]]*\]/gi, "");
            if (!cleanChunk) return;
            setMessages((m) => {
              const last = m[m.length - 1];
              if (!last || last.role !== "assistant") return m;
              return [...m.slice(0, -1), { ...last, content: last.content + cleanChunk }];
            });
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
      sendMessage: (text: string) => handleSend(text),
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
    [persistHistory, activeSessionId]
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
    [persistHistory, activeSessionId]
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
    [persistHistory, activeSessionId]
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
  }, [t, context, refreshSessions, selectedCaseSlug, isStreaming]);

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
    [isStreaming]
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

      // Rebuild prompt (same as handleSend)
      const contextParts: string[] = [];
      if (userMsg.attachments && userMsg.attachments.length > 0) {
        contextParts.push("--- ANGEHÄNGTE DOKUMENTE ---");
        for (const att of userMsg.attachments) {
          try {
            const page = await api.brain.getPage(att.slug);
            contextParts.push(`\nDOKUMENT: ${att.name}\n${(page.content || "").slice(0, 8000)}\n`);
          } catch {
            contextParts.push(`\nDOKUMENT: ${att.name}\n[Inhalt nicht abrufbar]\n`);
          }
        }
        contextParts.push("--- ENDE DOKUMENTE ---\n");
      }

      const jurisdictionLabel = JURISDICTION_LABELS[jurisdiction];
      const systemPrompt = `Du bist der Brain Copilot für eine Kanzlei im ${jurisdictionLabel.toUpperCase()} Rechtsraum. Beantworte präzise unter Berücksichtigung des ${jurisdictionLabel} Rechts. Zitiere Gesetze mit § und Absatz, und gib am Ende an: "Diese Information ersetzt keine anwaltliche Prüfung."\n\nWICHTIG — MANDANTENISOLATION:\nWenn eine konkrete Akte aktiv ist, beantworte Fragen NUR im Kontext dieser Akte. Vermeide mandantenübergreifende Informationen. Wenn ein Nutzer nach anderen Mandanten fragt, weise darauf hin, dass du nur im Kontext der aktuellen Akte antworten kannst.\n\nDu hast Zugriff auf Kanzlei-Funktionen. Wenn der Nutzer eine Aktion wünscht, kannst du Tool-Marker in deine Antwort einbetten (unsichtbar für den Nutzer, aber vom System erkannt):\n- Navigation: [TOOL:navigate route="/dashboard/cases"]\n- Akten suchen: [TOOL:search_cases query="Muster GmbH"]\n- Fristen prüfen: [TOOL:search_deadlines status="open"] oder [TOOL:search_deadlines case_slug="cases/123" status="overdue"]\n- Wissen suchen: [TOOL:search_knowledge query="BGB § 280"]\n- Akte erstellen: [TOOL:create_case title="Klage Muster GmbH" client_name="Max Mustermann" opponent_name="Gegner AG"]\n- Aktenzusammenfassung: [TOOL:case_summary case_slug="cases/123"]\n- Email-Entwurf: [TOOL:email_draft subject="Status Update" recipient="mandant@email.de" case_slug="cases/123" tone="formal"]\n- Fristen extrahieren: [TOOL:deadline_extract document_slug="urteil-2026"]\n- Dokument zusammenfassen: [TOOL:document_summary document_slug="vertrag-2026"]\n- Konfliktprüfung: [TOOL:conflict_check name="Muster GmbH"]\n- Zeiteintrag: [TOOL:time_entry case_slug="cases/123" description="Aktenanalyse" hours="1.5" activity_type="research"]\n- Mandanten-Update: [TOOL:client_update case_slug="cases/123" update_type="status"]\n- Besprechungsnotizen: [TOOL:meeting_tasks notes="Besprechung mit Mandant..." case_slug="cases/123"]\n- Mandantsaufnahme: [TOOL:intake_create client_name="Max Mustermann" matter_type="Zivilrecht" jurisdiction="de" urgency="medium"]\n\nVerwende Tools nur wenn der Nutzer explizit eine Aktion wünscht. Antworte sonst normal.\n\nDu kannst MEHRERE Tool-Marker in einer einzigen Antwort verwenden, wenn mehrere Aktionen sinnvoll sind (z.B. zuerst eine Akte suchen, dann eine Frist prüfen). Setze jeden Marker in eine eigene Zeile.\n\nWICHTIG: Tools, die Daten erstellen oder verändern (create_case, intake_create, time_entry), erfordern eine Bestätigung durch den Nutzer. Betten Sie diese Tool-Marker wie gewohnt ein — das System zeigt dem Nutzer einen Bestätigungsdialog an.`;

      if (selectedCaseSlug) {
        const selected = cases.find((c) => c.slug === selectedCaseSlug);
        contextParts.push(
          `--- AKTENKONTEXT ---\nAktive Akte: ${selected?.title ?? selectedCaseSlug}\nSlug: ${selectedCaseSlug}\nNutze Matter Context und zitiere nur belegte Aussagen.\n--- ENDE AKTENKONTEXT ---\n`
        );
      }
      if (context.type === "brain_page" && context.pageSlug) {
        contextParts.push(
          `--- SEITENKONTEXT ---\nBrain-Seite: ${context.pageSlug}\nBeantworte Fragen im Kontext dieser Seite.\n--- ENDE SEITENKONTEXT ---\n`
        );
      }

      const userInput = `${contextParts.join("\n")}\nNUTZERFRAGE:\n${userMsg.content}`;
      const prompt = buildSafePrompt(systemPrompt, userInput);

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
            const combined = toolMarkerBuffer + chunk;
            toolMarkerBuffer = "";

            const lastOpen = combined.lastIndexOf("[TOOL:");
            if (lastOpen !== -1 && combined.indexOf("]", lastOpen) === -1) {
              toolMarkerBuffer = combined.slice(lastOpen);
              const beforeMarker = combined.slice(0, lastOpen);
              const cleanChunk = beforeMarker.replace(/\[TOOL:[^\]]*\]/gi, "");
              if (!cleanChunk) return;
              setMessages((m) => {
                const last = m[m.length - 1];
                if (!last || last.role !== "assistant") return m;
                return [...m.slice(0, -1), { ...last, content: last.content + cleanChunk }];
              });
              return;
            }

            const cleanChunk = combined.replace(/\[TOOL:[^\]]*\]/gi, "");
            if (!cleanChunk) return;
            setMessages((m) => {
              const last = m[m.length - 1];
              if (!last || last.role !== "assistant") return m;
              return [...m.slice(0, -1), { ...last, content: last.content + cleanChunk }];
            });
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
    ]
  );

  // Edit user message and resend
  const handleEdit = useCallback(
    (messageId: string) => {
      if (isStreaming) return; // Prevent editing during active stream
      const msg = messagesRef.current.find((m) => m.id === messageId);
      if (!msg || msg.role !== "user") return;
      const editedContent = msg.content;
      const editedAttachments = msg.attachments;
      // Remove all messages after the edited one (including its response)
      setMessages((m) => {
        const idx = m.findIndex((mm) => mm.id === messageId);
        if (idx < 0) return m;
        return m.slice(0, idx);
      });
      // Re-send the edited content
      handleSend(editedContent, editedAttachments);
    },
    [handleSend, isStreaming]
  );

  // Quote-reply to a message
  const [replyTo, setReplyTo] = useState<{
    id: string;
    role: "user" | "assistant";
    preview: string;
  } | null>(null);
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
      const prefix = m.role === "user" ? "**👤 Nutzer:**" : "**🤖 AI:**";
      const meta = [
        m.tokensUsed ? ` (${m.tokensUsed.toLocaleString("de-DE")} tokens)` : "",
        m.latencyMs ? ` · ${(m.latencyMs / 1000).toFixed(1)}s` : "",
        m.model ? ` · ${m.model}` : "",
      ].join("");
      const citations = m.citations?.length
        ? `\n\n> **Quellen:** ${m.citations.map((c) => c.title).join(", ")}`
        : "";
      const gaps = m.gaps?.length ? `\n\n> **Lücken:** ${m.gaps.join("; ")}` : "";
      return `${prefix}${meta}\n\n${m.content}${citations}${gaps}\n`;
    });
    const content = `# ${title ?? t("chat.title")}\n\nExportiert am ${new Date().toLocaleString("de-DE")}\n\n---\n\n${lines.join("\n---\n\n")}`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [messages, title, t]);

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
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]",
        className
      )}
      role="region"
      aria-label={title ?? t("chat.title")}
    >
      <ChatHeader
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
        onCaseChange={setSelectedCaseSlug}
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
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
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
            ))}
            {isStreaming &&
              messages.length > 0 &&
              messages[messages.length - 1].role === "assistant" &&
              !messages[messages.length - 1].content && <ChatLoadingSkeleton />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="border-t border-red-500/20 bg-red-500/5 px-4 py-2 text-xs text-red-600 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 border-t border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-4 py-2 text-xs">
          <Reply size={12} className="shrink-0 text-[color:var(--ds-text-muted)]" />
          <span className="text-[color:var(--ds-text-subtle)]">
            Antwort auf {replyTo.role === "user" ? "Nutzer" : "AI"}:
          </span>
          <span className="min-w-0 flex-1 truncate text-[color:var(--ds-text-muted)]">
            {replyTo.preview}
          </span>
          <button
            onClick={() => setReplyTo(null)}
            className="shrink-0 text-[color:var(--ds-text-subtle)] hover:text-[color:var(--ds-text)]"
            aria-label="Antwort-Vorschau schließen"
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
        features={{ fileUpload: resolvedFeatures.fileUpload }}
      />
    </div>
  );
});
