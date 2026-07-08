"use client";

import { useState, memo, useMemo, useEffect } from "react";
import {
  Copy,
  Check,
  FileText,
  AlertTriangle,
  Clock,
  Cpu,
  Zap,
  RefreshCw,
  Pencil,
  Download,
  Reply,
  Lightbulb,
  Volume2,
  VolumeX,
} from "lucide-react";
import { CopilotExplanationPanel } from "@/components/copilot/copilot-explanation-panel";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/lib/markdown";
import { useLang } from "@/lib/use-lang";
import { AIBadge, GroundingStatus } from "@/components/legal/CitationLink";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import { type ChatMessage } from "@/components/chat/chat-types";
import { ToolCallBubble } from "@/components/chat/tool-call-bubble";

interface ChatMessageBubbleProps {
  message: ChatMessage;
  features?: {
    markdownRendering?: boolean;
    messageActions?: boolean;
    tokenWidget?: boolean;
  };
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string) => void;
  onExport?: () => void;
  onReply?: (messageId: string) => void;
  onToolConfirm?: (toolCallId: string) => void;
  onToolCancel?: (toolCallId: string) => void;
  onToolRetry?: (toolCallId: string) => void;
  onFollowUp?: (query: string) => void;
}

function ChatMessageBubbleInner({
  message,
  features,
  onRegenerate,
  onEdit,
  onExport,
  onReply,
  onToolConfirm,
  onToolCancel,
  onToolRetry,
  onFollowUp,
}: ChatMessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const { t, lang } = useLang();
  const isUser = message.role === "user";
  const hasCitations = (message.citations?.length ?? 0) > 0;
  const hasAttachments = (message.attachments?.length ?? 0) > 0;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable (non-HTTPS, permissions denied)
    }
  }

  useEffect(() => () => {
    if (isSpeaking) window.speechSynthesis?.cancel();
  }, [isSpeaking]);

  function handleSpeak() {
    if (!("speechSynthesis" in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(displayContent);
    utterance.lang = lang === "en" ? "en-US" : "de-DE";
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  // Extract follow-up suggestions from AI response (💡 **Follow-Up:** ...)
  const followUps = useMemo(() => {
    if (isUser || message.isStreaming || message.error) return [];
    const lines = message.content.split("\n");
    const suggestions: string[] = [];
    for (const line of lines) {
      const match = line.match(/💡\s*\*\*Follow-Up:?\*\*\s*(.+)/i);
      if (match && match[1]) {
        const text = match[1].trim().replace(/^["']+|["']+$/g, "");
        if (text) suggestions.push(text);
      }
    }
    return suggestions.slice(0, 3);
  }, [message.content, isUser, message.isStreaming, message.error]);

  // Strip follow-up lines from displayed content
  const displayContent = useMemo(() => {
    if (isUser || followUps.length === 0) return message.content;
    return message.content
      .split("\n")
      .filter((line) => !line.match(/💡\s*\*\*Follow-Up:?\*\*\s*.+/i))
      .join("\n");
  }, [message.content, isUser, followUps]);

  const displayRendered =
    features?.markdownRendering !== false && !isUser ? renderMarkdown(displayContent) : null;

  return (
    <div
      className={cn("group flex gap-2.5 px-3 py-2.5", isUser ? "justify-end" : "justify-start")}
      role="article"
      aria-label={isUser ? t("chat.msg_user_aria") : t("chat.msg_ai_aria")}
    >
      <div className={cn("max-w-[85%] space-y-1.5", isUser ? "order-2" : "w-full")}>
        {/* Attachments */}
        {hasAttachments && (
          <div className="flex flex-wrap gap-1.5">
            {message.attachments!.map((att) => (
              <span
                key={att.slug}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)]"
              >
                <FileText size={11} />
                {att.name}
              </span>
            ))}
          </div>
        )}

        {/* Message bubble */}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
            isUser
              ? "brand-bg brand-text-on-primary rounded-br-md"
              : "rounded-bl-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text)]"
          )}
        >
          {message.error ? (
            <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{message.error}</span>
            </div>
          ) : displayRendered ? (
            <div className="prose-chat" dangerouslySetInnerHTML={{ __html: displayRendered }} />
          ) : (
            <p className={cn("whitespace-pre-wrap", isUser && "font-medium")}>
              {message.content}
              {message.isStreaming && (
                <span className="ml-1 inline-flex items-center gap-0.5 align-middle">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-60" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-40 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current opacity-20 [animation-delay:300ms]" />
                </span>
              )}
            </p>
          )}
        </div>

        {/* Tool calls (assistant only) */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1.5">
            {message.toolCalls.map((tc) => (
              <ToolCallBubble
                key={tc.id}
                toolCall={tc}
                onConfirm={onToolConfirm}
                onCancel={onToolCancel}
                onRetry={onToolRetry}
              />
            ))}
          </div>
        )}

        {/* Citations + Grounding panel (assistant only) — mandatory for every AI output */}
        {!isUser && !message.isStreaming && !message.error && (
          <CitationPanel
            data={
              {
                citations: message.citations?.map((c) => ({ slug: c.slug, title: c.title })),
                gaps: message.gaps,
                grounding: message.grounding,
                isStreaming: false,
              } satisfies CitationPanelData
            }
            compact
          />
        )}

        {/* Smart Follow-Up suggestions (assistant only) */}
        {!isUser &&
          !message.isStreaming &&
          !message.error &&
          followUps.length > 0 &&
          onFollowUp && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[color:var(--ds-text-subtle)]">
                <Lightbulb size={10} />
                {t("chat.follow_ups" as never)}
              </span>
              {followUps.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => onFollowUp(suggestion)}
                  className="rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1 text-[11px] text-[color:var(--ds-text-muted)] transition-colors hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--brand-primary)]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

        {/* Metadata row (assistant only) */}
        {!isUser && !message.isStreaming && !message.error && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[color:var(--ds-text-subtle)]">
            <AIBadge size="sm" showTooltip={false} />
            {hasCitations && <GroundingStatus citations={message.citations} gaps={message.gaps} />}
            {features?.tokenWidget && message.tokensUsed != null && (
              <span className="inline-flex items-center gap-0.5" title={t("chat.tokens_used")}>
                <Zap size={9} />
                {message.tokensUsed.toLocaleString(lang === "en" ? "en-GB" : "de-DE")}{" "}
                {t("chat.tokens_label")}
              </span>
            )}
            {features?.tokenWidget && message.latencyMs != null && (
              <span className="inline-flex items-center gap-0.5" title={t("chat.response_time")}>
                <Clock size={9} />
                {(message.latencyMs / 1000).toFixed(1)}s
              </span>
            )}
            {message.model && (
              <span className="inline-flex items-center gap-0.5" title={t("chat.ai_model")}>
                <Cpu size={9} />
                {message.model}
              </span>
            )}
          </div>
        )}

        {/* Action buttons (show on hover) */}
        {features?.messageActions && !message.isStreaming && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <button
              onClick={handleCopy}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              aria-label={t("chat.copy")}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
            {!isUser && onRegenerate && (
              <button
                onClick={() => onRegenerate(message.id)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label={t("chat.regenerate")}
              >
                <RefreshCw size={12} />
              </button>
            )}
            {!isUser && typeof window !== "undefined" && "speechSynthesis" in window && (
              <button
                onClick={handleSpeak}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label={isSpeaking ? t("chat.tts_stop") : t("chat.tts_play")}
                aria-pressed={isSpeaking}
              >
                {isSpeaking ? <VolumeX size={12} /> : <Volume2 size={12} />}
              </button>
            )}
            {!isUser && (
              <button
                onClick={() => setShowExplain((v) => !v)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label={lang === "en" ? "Explain" : "Erklären"}
                title={
                  lang === "en"
                    ? "Why this answer? Show reasoning and sources"
                    : "Warum diese Antwort? Zeige Begründung und Quellen"
                }
              >
                <Lightbulb size={12} />
              </button>
            )}
            {isUser && onEdit && (
              <button
                onClick={() => onEdit(message.id)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label={t("chat.edit")}
              >
                <Pencil size={12} />
              </button>
            )}
            {onReply && (
              <button
                onClick={() => onReply(message.id)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label={t("chat.reply_btn")}
                title={t("chat.reply_title")}
              >
                <Reply size={12} />
              </button>
            )}
            {onExport && (
              <button
                onClick={onExport}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label={t("chat.export_btn")}
              >
                <Download size={12} />
              </button>
            )}
          </div>
        )}
      </div>
      {showExplain && !isUser && (
        <div className="mt-2">
          <CopilotExplanationPanel
            query={message.content.slice(0, 500)}
            answer={message.content}
            onClose={() => setShowExplain(false)}
          />
        </div>
      )}
    </div>
  );
}

export const ChatMessageBubble = memo(ChatMessageBubbleInner);
