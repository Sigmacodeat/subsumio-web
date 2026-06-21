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
import { AIBadge, GroundingStatus } from "@/components/legal/CitationLink";
import { CitationBadgesInline } from "@/components/legal/CitationPanel";
import { GAP_ICONS, GAP_LABELS, type ChatMessage } from "@/components/chat/chat-types";

interface ChatMessageBubbleProps {
  message: ChatMessage;
  features?: {
    markdownRendering?: boolean;
    messageActions?: boolean;
    tokenWidget?: boolean;
  };
  onRegenerate?: () => void;
  onEdit?: () => void;
  onExport?: () => void;
  onReply?: () => void;
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
}: ChatMessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const hasCitations = (message.citations?.length ?? 0) > 0;
  const hasGaps = (message.gaps?.length ?? 0) > 0;
  const hasAttachments = (message.attachments?.length ?? 0) > 0;

  function handleCopy() {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const rendered =
    features?.markdownRendering !== false && !isUser ? renderMarkdown(message.content) : null;

  return (
    <div
      className={cn("group flex gap-3 px-4 py-4", isUser ? "justify-end" : "justify-start")}
      role="article"
      aria-label={isUser ? "Nutzer-Nachricht" : "AI-Antwort"}
    >
      <div className={cn("max-w-[85%] space-y-2", isUser ? "order-2" : "w-full max-w-3xl")}>
        {/* Attachments */}
        {hasAttachments && (
          <div className="flex flex-wrap gap-1.5">
            {message.attachments!.map((att) => (
              <span
                key={att.slug}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2.5 py-1 text-xs text-[color:var(--ds-text-muted)]"
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
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
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

        {/* Citations + Gaps (assistant only) */}
        {!isUser && !message.isStreaming && (hasCitations || hasGaps) && (
          <div className="space-y-2">
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
                      href={`/dashboard/brain/${c.slug.split("/").map(encodeURIComponent).join("/")}`}
                      className="hover:brand-text hover:brand-border inline-flex items-center gap-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-all"
                      target="_blank"
                      rel="noopener noreferrer"
                      title={c.title}
                    >
                      <FileText size={9} />
                      {c.title}
                    </a>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        navigator.clipboard.writeText(c.slug);
                        const btn = e.currentTarget;
                        btn.classList.add("text-emerald-500");
                        setTimeout(() => btn.classList.remove("text-emerald-500"), 1500);
                      }}
                      className="ml-0.5 inline-flex items-center justify-center text-[color:var(--ds-text-subtle)] opacity-0 transition-all group-hover/citation:opacity-100 hover:text-[color:var(--ds-text)]"
                      aria-label={`Zitat-Slug kopieren: ${c.slug}`}
                      title="Slug kopieren"
                    >
                      <Copy size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {hasGaps && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-500">
                  <AlertTriangle size={12} />
                  Lücken im Brain ({message.gaps!.length})
                </div>
                <ul className="space-y-1">
                  {message.gaps!.map((gap, i) => {
                    const gapType = parseGapType(gap);
                    const icon = gapType ? GAP_ICONS[gapType] : "⚠";
                    const label = gapType ? GAP_LABELS[gapType] : null;
                    return (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-500"
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
          <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--ds-text-subtle)]">
            <AIBadge size="sm" showTooltip={false} />
            {hasCitations && <GroundingStatus citations={message.citations} gaps={message.gaps} />}
            {features?.tokenWidget && message.tokensUsed != null && (
              <span className="inline-flex items-center gap-1" title="Tokens verbraucht">
                <Zap size={10} />
                {message.tokensUsed.toLocaleString("de-DE")} Tokens
              </span>
            )}
            {features?.tokenWidget && message.latencyMs != null && (
              <span className="inline-flex items-center gap-1" title="Antwortzeit">
                <Clock size={10} />
                {(message.latencyMs / 1000).toFixed(1)}s
              </span>
            )}
            {message.model && (
              <span className="inline-flex items-center gap-1" title="KI-Modell">
                <Cpu size={10} />
                {message.model}
              </span>
            )}
          </div>
        )}

        {/* Action buttons (show on hover) */}
        {features?.messageActions && !message.isStreaming && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
              aria-label="Kopieren"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
            {!isUser && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label="Neu generieren"
              >
                <RefreshCw size={12} />
              </button>
            )}
            {isUser && onEdit && (
              <button
                onClick={onEdit}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label="Bearbeiten"
              >
                <Pencil size={12} />
              </button>
            )}
            {onReply && (
              <button
                onClick={onReply}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label="Antworten"
                title="Auf diese Nachricht antworten"
              >
                <Reply size={12} />
              </button>
            )}
            {onExport && (
              <button
                onClick={onExport}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-[color:var(--ds-text-subtle)] transition-colors hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                aria-label="Exportieren"
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
