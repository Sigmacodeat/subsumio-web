"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Reply, X } from "lucide-react";
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

export function ChatPanel({
  context = { type: "global" },
  features,
  persistHistory = true,
  className,
  title,
  initialQuery,
}: ChatPanelProps) {
  const { t } = useLang();
  const confirm = useConfirm();

  const resolvedFeatures = useMemo(() => ({ ...DEFAULT_FEATURES, ...features }), [features]);

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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

  // Load sessions list
  const refreshSessions = useCallback(async () => {
    if (!persistHistory) return;
    const list = await listSessions();
    setSessions(list);
  }, [persistHistory]);

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
      const list = await listSessions();
      if (list.length > 0 && !activeSessionId) {
        const latest = list[0];
        setActiveSessionId(latest.id);
        const msgs = await loadMessages(latest.id);
        setMessages(msgs);
        setSessionTokens(msgs.reduce((sum, m) => sum + (m.tokensUsed ?? 0), 0));
      } else if (list.length === 0) {
        const newId = generateSessionId();
        const now = new Date().toISOString();
        const session: ChatSession = {
          id: newId,
          title: title ?? t("chat.title"),
          contextType: context.type,
          caseSlug: context.caseSlug,
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
    if (initialQuery && !initialQuerySent.current && messages.length === 0) {
      initialQuerySent.current = true;
      handleSend(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, messages.length]);

  // Update session metadata when messages change
  const updateSessionMeta = useCallback(async () => {
    if (!activeSessionId || !persistHistory) return;
    const lastMsg = messages[messages.length - 1];
    await updateSession(activeSessionId, {
      messageCount: messages.length,
      updatedAt: new Date().toISOString(),
      lastPreview: lastMsg?.content.slice(0, 100),
      title:
        messages[0]?.role === "user"
          ? autoTitleFromQuery(messages[0].content)
          : (title ?? t("chat.title")),
    });
    refreshSessions();
  }, [activeSessionId, messages, persistHistory, refreshSessions, title, t]);

  useEffect(() => {
    if (messages.length > 0 && persistHistory) {
      updateSessionMeta();
    }
  }, [messages.length, updateSessionMeta, persistHistory]);

  // Send message
  const handleSend = useCallback(
    async (text: string, attachments?: Array<{ name: string; slug: string }>) => {
      if (!text.trim() && !attachments?.length) return;

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
      const systemPrompt = `Du bist ein intelligenter legaler Assistent für eine Kanzlei im ${jurisdictionLabel.toUpperCase()} Rechtsraum. Beantworte präzise unter Berücksichtigung des ${jurisdictionLabel} Rechts. Zitiere Gesetze mit § und Absatz, und gib am Ende an: "Diese Information ersetzt keine anwaltliche Prüfung."`;

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

      const userInput = `${contextParts.join("\n")}\nNUTZERFRAGE:\n${text}`;
      const prompt = buildSafePrompt(systemPrompt, userInput);

      // Create abort controller
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const result = await api.query.think(prompt, {
          mode: queryModeToThinkMode(queryMode),
          queryMode,
          caseSlug: selectedCaseSlug || context.caseSlug || undefined,
          ...(modelOverride && modelOverride !== "auto" ? { model: modelOverride } : {}),
          signal: controller.signal,
          onChunk: (chunk) => {
            setMessages((m) => {
              const last = m[m.length - 1];
              if (last.role !== "assistant") return m;
              return [...m.slice(0, -1), { ...last, content: last.content + chunk }];
            });
          },
        });

        // Finalize assistant message
        const finalMsg: ChatMessage = {
          ...assistantMsg,
          content: result.answer,
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
      } catch (err) {
        const isAborted = err instanceof DOMException && err.name === "AbortError";
        if (!isAborted) {
          const errorMsg = err instanceof Error ? err.message : t("chat.error_generic");
          setError(errorMsg);
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last.role !== "assistant") return m;
            return [
              ...m.slice(0, -1),
              {
                ...last,
                isStreaming: false,
                error: errorMsg,
                content: last.content || "",
              },
            ];
          });
        } else {
          // Aborted — keep partial content
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last.role !== "assistant") return m;
            return [
              ...m.slice(0, -1),
              {
                ...last,
                isStreaming: false,
                content: last.content || "[Generierung abgebrochen]",
              },
            ];
          });
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
    ]
  );

  // Stop generation
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // Clear chat
  const handleClear = useCallback(async () => {
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
        caseSlug: context.caseSlug,
        pageSlug: context.pageSlug,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
      };
      await createSession(session);
      setActiveSessionId(newId);
      refreshSessions();
    }
  }, [confirm, t, persistHistory, activeSessionId, title, context, refreshSessions]);

  // New session
  const handleNewSession = useCallback(async () => {
    const newId = generateSessionId();
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: newId,
      title: t("chat.new_session"),
      contextType: context.type,
      caseSlug: context.caseSlug,
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
  }, [t, context, refreshSessions]);

  // Select session
  const handleSelectSession = useCallback(async (id: string) => {
    setActiveSessionId(id);
    const msgs = await loadMessages(id);
    setMessages(msgs);
    setSessionTokens(msgs.reduce((sum, m) => sum + (m.tokensUsed ?? 0), 0));
    setError(null);
  }, []);

  // Delete session
  const handleDeleteSession = useCallback(
    async (id: string) => {
      const ok = await confirm({
        title: t("chat.confirm_delete_session"),
        message: "",
        confirmLabel: "Löschen",
        variant: "danger",
      });
      if (!ok) return;
      await deleteSession(id);
      if (id === activeSessionId) {
        const list = await listSessions();
        if (list.length > 0) {
          const latest = list[0];
          setActiveSessionId(latest.id);
          const msgs = await loadMessages(latest.id);
          setMessages(msgs);
          setSessionTokens(msgs.reduce((sum, m) => sum + (m.tokensUsed ?? 0), 0));
        } else {
          await handleNewSession();
        }
      }
      refreshSessions();
    },
    [confirm, t, activeSessionId, refreshSessions, handleNewSession]
  );

  // Regenerate response
  const handleRegenerate = useCallback(
    async (messageId: string) => {
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx < 0 || messages[idx].role !== "assistant") return;
      const userMsg = messages[idx - 1];
      if (!userMsg || userMsg.role !== "user") return;

      // Remove old assistant message
      const removedAssistant = messages[idx];
      setMessages((m) => [...m.slice(0, idx), ...m.slice(idx + 1)]);

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
      const systemPrompt = `Du bist ein intelligenter legaler Assistent für eine Kanzlei im ${jurisdictionLabel.toUpperCase()} Rechtsraum. Beantworte präzise unter Berücksichtigung des ${jurisdictionLabel} Rechts. Zitiere Gesetze mit § und Absatz, und gib am Ende an: "Diese Information ersetzt keine anwaltliche Prüfung."`;

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

      try {
        const result = await api.query.think(prompt, {
          mode: queryModeToThinkMode(queryMode),
          queryMode,
          caseSlug: selectedCaseSlug || context.caseSlug || undefined,
          ...(modelOverride && modelOverride !== "auto" ? { model: modelOverride } : {}),
          signal: controller.signal,
          onChunk: (chunk) => {
            setMessages((m) => {
              const last = m[m.length - 1];
              if (last.role !== "assistant") return m;
              return [...m.slice(0, -1), { ...last, content: last.content + chunk }];
            });
          },
        });

        const finalMsg: ChatMessage = {
          ...assistantMsg,
          content: result.answer,
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
      } catch (err) {
        const isAborted = err instanceof DOMException && err.name === "AbortError";
        if (!isAborted) {
          const errorMsg = err instanceof Error ? err.message : t("chat.error_generic");
          setError(errorMsg);
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last.role !== "assistant") return m;
            return [
              ...m.slice(0, -1),
              { ...last, isStreaming: false, error: errorMsg, content: last.content || "" },
            ];
          });
        } else {
          setMessages((m) => {
            const last = m[m.length - 1];
            if (last.role !== "assistant") return m;
            return [
              ...m.slice(0, -1),
              { ...last, isStreaming: false, content: last.content || "[Generierung abgebrochen]" },
            ];
          });
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [
      messages,
      persistHistory,
      activeSessionId,
      jurisdiction,
      selectedCaseSlug,
      cases,
      context,
      modelOverride,
      queryMode,
      t,
    ]
  );

  // Edit user message and resend
  const handleEdit = useCallback(
    (messageId: string) => {
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx < 0 || messages[idx].role !== "user") return;
      const msg = messages[idx];
      // Remove all messages after the edited one (including its response)
      setMessages((m) => m.slice(0, idx));
      // Re-send the edited content
      handleSend(msg.content, msg.attachments);
    },
    [messages, handleSend]
  );

  // Quote-reply to a message
  const [replyTo, setReplyTo] = useState<{
    id: string;
    role: "user" | "assistant";
    preview: string;
  } | null>(null);
  const handleReply = useCallback(
    (messageId: string) => {
      const msg = messages.find((m) => m.id === messageId);
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
    },
    [messages]
  );

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
    URL.revokeObjectURL(url);
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
        "flex h-full flex-col overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]",
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
                onRegenerate={msg.role === "assistant" ? () => handleRegenerate(msg.id) : undefined}
                onEdit={msg.role === "user" ? () => handleEdit(msg.id) : undefined}
                onReply={() => handleReply(msg.id)}
                onExport={handleExport}
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
        <div className="border-t border-red-500/20 bg-red-500/5 px-4 py-2 text-xs text-red-600 dark:text-red-400">
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
          handleSend(text, atts);
          setReplyTo(null);
        }}
        onStop={handleStop}
        isStreaming={isStreaming}
        features={{ fileUpload: resolvedFeatures.fileUpload }}
      />
    </div>
  );
}
