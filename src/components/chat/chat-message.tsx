"use client";

import { useState, memo } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/lib/markdown";
import { useLang } from "@/lib/use-lang";
import { AIBadge, GroundingStatus } from "@/components/legal/CitationLink";
import { CitationBadgesInline } from "@/components/legal/CitationPanel";
import { GAP_ICONS, GAP_LABELS, type ChatMessage } from "@/components/chat/chat-types";
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
}

function parseGapType(gap: string): string | null {
  const lower = gap.toLowerCase().replace(/[^a-z_]/g, "_");
  for (const key of Object.keys(GAP_LABELS)) {
    if (lower.includes(key)) return key;
  }
  return null;
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
}: ChatMessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const { t, lang } = useLang();
  const isUser = message.role === "user";
  const hasCitations = (message.citations?.length ?? 0) > 0;
  const hasGaps = (message.gaps?.length ?? 0) > 0;
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

  const rendered =
    features?.markdownRendering !== false && !isUser ? renderMarkdown(message.content) : null;

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
                className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 text-[11px] text-[color:var(--ds-text-muted)]"
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
          ) : rendered ? (
            <div className="prose-chat" dangerouslySetInnerHTML={{ __html: rendered }} />
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

        {/* Citations + Gaps (assistant only) */}
        {!isUser && !message.isStreaming && (hasCitations || hasGaps) && (
          <div className="space-y-1.5">
            {hasCitations && (
              <div className="flex flex-wrap items-center gap-1.5">
                <CitationBadgesInline
                  data={{
                    citations: message.citations,
                    gaps: message.gaps,
                    isStreaming: false,
                  }}
                />
                {message.citations!.map((c) => (
                  <div key={c.slug} className="group/citation inline-flex items-center">
                    <a
                      href={`/dashboard/brain/${encodeURIComponent(c.slug)}`}
                      className="hover:brand-text hover:brand-border inline-flex items-center gap-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-[border-color,background-color,color] duration-200"
                      target="_blank"
                      rel="noopener noreferrer"
                      title={
                        c.quote
                          ? `"${c.quote.slice(0, 120)}${c.quote.length > 120 ? "…" : ""}"`
                          : c.title
                      }
                    >
                      <FileText size={9} />
                      {c.title}
                      {c.page_number && (
                        <span className="ml-0.5 rounded bg-[color:var(--ds-surface-3)] px-1 py-0.5 text-[10px] font-medium text-[color:var(--ds-text-subtle)]">
                          S. {c.page_number}
                        </span>
                      )}
                    </a>
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        try {
                          await navigator.clipboard.writeText(c.slug);
                          const btn = e.currentTarget;
                          btn.classList.add("text-emerald-500");
                          setTimeout(() => btn.classList.remove("text-emerald-500"), 1500);
                        } catch {
                          // Clipboard API may be unavailable
                        }
                      }}
                      className="ml-0.5 inline-flex items-center justify-center text-[color:var(--ds-text-subtle)] opacity-0 transition-[opacity,color] duration-200 group-hover/citation:opacity-100 hover:text-[color:var(--ds-text)]"
                      aria-label={`${t("chat.copy_slug_aria")} ${c.slug}`}
                      title={t("chat.copy_slug_title")}
                    >
                      <Copy size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {hasGaps && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-500">
                  <AlertTriangle size={12} />
                  {t("chat.gaps_in_brain")} ({message.gaps!.length})
                </div>
                <ul className="space-y-0.5">
                  {message.gaps!.map((gap, i) => {
                    const gapType = parseGapType(gap);
                    const icon = gapType ? GAP_ICONS[gapType] : "⚠";
                    const label = gapType ? GAP_LABELS[gapType] : null;
                    return (
                      <li
                        key={i}
                        className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-500"
                      >
                        <span className="shrink-0">{icon}</span>
                        <span>
                          {label && <strong className="font-medium">{label}: </strong>}
                          {gap}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Metadata row (assistant only) */}
        {!isUser && !message.isStreaming && !message.error && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[color:var(--ds-text-subtle)]">
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
    </div>
  );
}

export const ChatMessageBubble = memo(ChatMessageBubbleInner);
