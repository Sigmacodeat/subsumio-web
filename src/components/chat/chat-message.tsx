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
  ThumbsDown,
  ThumbsUp,
  Lightbulb,
  Volume2,
  VolumeX,
} from "lucide-react";
import { CopilotExplanationPanel } from "@/components/copilot/copilot-explanation-panel";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/lib/markdown";
import { linkCitationsInHtml } from "@/lib/citation-gate-client";
import { useLang } from "@/lib/use-lang";
import { CitationPanel, type CitationPanelData } from "@/components/legal/CitationPanel";
import { type AnswerDownReason, type ChatMessage } from "@/components/chat/chat-types";
import { ToolCallBubble } from "@/components/chat/tool-call-bubble";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { SaveToMatterButton } from "@/components/legal/save-to-matter-button";

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
  /** Rate an assistant answer; a down vote may carry a reason. */
  onFeedback?: (messageId: string, rating: "up" | "down", reason?: AnswerDownReason) => void;
  /** Offer "In Akte speichern" on finished answers; preselects this matter ("" = choose). */
  saveToMatterCase?: string;
}

/** Waiting state of an answer that has not produced text yet. One honest line:
 *  the engine streams text only (no progress events), so there are no invented
 *  "searching / verifying" phases — just what is happening and for how long. */
function AnswerPending({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      className="flex items-center gap-2.5 text-[13px] text-[color:var(--ds-text-muted)]"
      role="status"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--brand-primary)] opacity-40 motion-reduce:hidden" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--brand-primary)]" />
      </span>
      <span>{label}</span>
      {seconds >= 3 && (
        <span className="text-[color:var(--ds-text-subtle)] tabular-nums">{seconds} s</span>
      )}
    </div>
  );
}

const DOWN_REASONS: Array<{ value: AnswerDownReason; de: string; en: string }> = [
  { value: "wrong", de: "Falsch", en: "Wrong" },
  { value: "missing_source", de: "Quelle fehlt", en: "Source missing" },
  { value: "incomplete", de: "Unvollständig", en: "Incomplete" },
  { value: "other", de: "Anderes", en: "Other" },
];

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
  onFeedback,
  saveToMatterCase,
}: ChatMessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const { t, lang } = useLang();
  const isUser = message.role === "user";
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

  useEffect(
    () => () => {
      if (isSpeaking) window.speechSynthesis?.cancel();
    },
    [isSpeaking]
  );

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
    features?.markdownRendering !== false && !isUser
      ? linkCitationsInHtml(
          renderMarkdown(displayContent),
          message.grounding?.grounded_citations ?? []
        )
      : null;

  const pending = !isUser && message.isStreaming && !message.content && !message.error;

  return (
    <div
      className={cn(
        // One reading column for the whole conversation (wide panels would
        // otherwise run answers across 1,800 px).
        "group mx-auto flex w-full max-w-3xl gap-3 px-4 py-3",
        isUser ? "justify-end" : "justify-start"
      )}
      role="article"
      aria-label={isUser ? t("chat.msg_user_aria") : t("chat.msg_ai_aria")}
    >
      {!isUser && <SubsumioMark size={24} animated={false} className="mt-0.5 hidden sm:block" />}
      <div className={cn("min-w-0 space-y-2", isUser ? "relative order-2 max-w-[85%]" : "flex-1")}>
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

        {/* The question sits in a quiet surface bubble; the answer is plain text
            on the page — it is the document, not a chat bubble. */}
        <div
          className={cn(
            "text-[14px] leading-relaxed",
            isUser
              ? "rounded-2xl rounded-br-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-4 py-2.5 text-[color:var(--ds-text)]"
              : "text-[color:var(--ds-text)]"
          )}
        >
          {pending ? (
            <AnswerPending label={t("chat.typing")} />
          ) : message.error ? (
            <div className="flex items-start gap-2 text-[color:var(--ds-danger-text)]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{message.error}</span>
            </div>
          ) : displayRendered ? (
            <div className="prose-chat" dangerouslySetInnerHTML={{ __html: displayRendered }} />
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
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
                citations: message.citations?.map((c) => ({
                  slug: c.slug,
                  title: c.title,
                  quote: c.quote,
                })),
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
                  className="rounded-full border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1 text-[11px] text-[color:var(--ds-text-muted)] transition-[background-color,border-color,color] hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

        {/* Metadata row (assistant only) */}
        {!isUser && !message.isStreaming && !message.error && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[color:var(--ds-text-subtle)]">
            {/* "KI-generiert" and the grounding state live in the CitationPanel
                directly above — repeating both here showed four badges for one
                answer. This line only carries the run facts. */}
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

        {/* Why an answer was unhelpful — asked once after a down vote */}
        {!isUser &&
          onFeedback &&
          message.feedback?.rating === "down" &&
          !message.feedback.reason && (
            <div
              className="flex flex-wrap items-center gap-1.5 text-[11px]"
              role="group"
              aria-label={lang === "en" ? "What was wrong?" : "Was war nicht gut?"}
            >
              <span className="text-[color:var(--ds-text-subtle)]">
                {lang === "en" ? "What was wrong?" : "Was war nicht gut?"}
              </span>
              {DOWN_REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => onFeedback(message.id, "down", r.value)}
                  className="rounded-full border border-[color:var(--ds-border)] px-2 py-0.5 text-[color:var(--ds-text-muted)] hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                >
                  {lang === "en" ? r.en : r.de}
                </button>
              ))}
            </div>
          )}

        {/* Action buttons: on hover, when focused with the keyboard, and always on touch screens */}
        {features?.messageActions && !message.isStreaming && (
          <div
            className={cn(
              "flex items-center gap-0.5 transition-opacity duration-[var(--ds-duration-normal)] group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
              // The question's actions float under the bubble (out of the flow) so
              // they do not hold 28 px of empty space open between messages.
              isUser
                ? "absolute top-full right-0 z-10 pt-1 opacity-0 [@media(hover:none)]:static [@media(hover:none)]:pt-0"
                : "-ml-1.5 opacity-60"
            )}
          >
            <button
              onClick={handleCopy}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
              aria-label={t("chat.copy")}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            {!isUser && onRegenerate && (
              <button
                onClick={() => onRegenerate(message.id)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
                aria-label={t("chat.regenerate")}
              >
                <RefreshCw size={14} />
              </button>
            )}
            {!isUser && typeof window !== "undefined" && "speechSynthesis" in window && (
              <button
                onClick={handleSpeak}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
                aria-label={isSpeaking ? t("chat.tts_stop") : t("chat.tts_play")}
                aria-pressed={isSpeaking}
              >
                {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            )}
            {!isUser && (
              <button
                onClick={() => setShowExplain((v) => !v)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
                aria-label={lang === "en" ? "Explain" : "Erklären"}
                title={
                  lang === "en"
                    ? "Why this answer? Show reasoning and sources"
                    : "Warum diese Antwort? Zeige Begründung und Quellen"
                }
              >
                <Lightbulb size={14} />
              </button>
            )}
            {isUser && onEdit && (
              <button
                onClick={() => onEdit(message.id)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
                aria-label={t("chat.edit")}
              >
                <Pencil size={14} />
              </button>
            )}
            {onReply && (
              <button
                onClick={() => onReply(message.id)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
                aria-label={t("chat.reply_btn")}
                title={t("chat.reply_title")}
              >
                <Reply size={14} />
              </button>
            )}
            {!isUser && onFeedback && !message.error && (
              <>
                <button
                  onClick={() => onFeedback(message.id, "up")}
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-lg transition-[background-color,color] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none",
                    message.feedback?.rating === "up"
                      ? "text-[color:var(--brand-primary)]"
                      : "text-[color:var(--ds-text-subtle)]"
                  )}
                  aria-label={lang === "en" ? "Helpful answer" : "Hilfreiche Antwort"}
                  aria-pressed={message.feedback?.rating === "up"}
                >
                  <ThumbsUp size={14} />
                </button>
                <button
                  onClick={() => onFeedback(message.id, "down")}
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-lg transition-[background-color,color] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none",
                    message.feedback?.rating === "down"
                      ? "text-[color:var(--ds-danger-text)]"
                      : "text-[color:var(--ds-text-subtle)]"
                  )}
                  aria-label={lang === "en" ? "Unhelpful answer" : "Nicht hilfreiche Antwort"}
                  aria-pressed={message.feedback?.rating === "down"}
                >
                  <ThumbsDown size={14} />
                </button>
              </>
            )}
            {!isUser && saveToMatterCase !== undefined && !message.error && message.content && (
              <SaveToMatterButton
                source="chat"
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-lg p-0 text-[color:var(--ds-text-subtle)]"
                defaultCase={saveToMatterCase}
                defaultTitle={
                  message.content
                    .replace(/[#*_>`]/g, "")
                    .trim()
                    .split("\n")[0]
                    .slice(0, 80) || "KI-Antwort"
                }
                content={message.content}
                citations={message.grounding?.grounded_citations}
              />
            )}
            {onExport && (
              <button
                onClick={onExport}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[color:var(--ds-text-subtle)] transition-[background-color,color] duration-[var(--ds-duration-normal)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.99] motion-reduce:transition-none"
                aria-label={t("chat.export_btn")}
              >
                <Download size={14} />
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
