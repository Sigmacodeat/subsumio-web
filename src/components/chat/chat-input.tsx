"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Send, Square, Paperclip, X, FileText, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import { CHAT_TEMPLATES, type ChatTemplate } from "@/components/chat/chat-types";

interface ChatInputProps {
  onSend: (text: string, attachments?: Array<{ name: string; slug: string }>) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  features?: {
    fileUpload?: boolean;
  };
  className?: string;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  placeholder,
  features,
  className,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Array<{ name: string; slug: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);
  const { t } = useLang();

  const autoFocus = useCallback(() => {
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  useEffect(() => {
    autoFocus();
  }, [autoFocus]);

  // Close template dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (templateRef.current && !templateRef.current.contains(e.target as Node)) {
        setShowTemplates(false);
      }
    }
    if (showTemplates) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showTemplates]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [text]);

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || disabled) return;
    if (trimmed.length > 50_000) return;
    onSend(trimmed, attachments.length > 0 ? attachments : undefined);
    setText("");
    setAttachments([]);
    autoFocus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      if (showTemplates) {
        e.preventDefault();
        setShowTemplates(false);
        return;
      }
      if (isStreaming) {
        e.preventDefault();
        onStop?.();
      }
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (files.length > 10) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map((f) => api.upload.file(f, { source: "chat" })));
      setAttachments((prev) => [
        ...prev,
        ...uploaded.map((u) => ({ name: u.title, slug: u.slug })),
      ]);
    } catch (err) {
      console.error("[chat-input] upload failed:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeAttachment(slug: string) {
    setAttachments((prev) => prev.filter((a) => a.slug !== slug));
  }

  return (
    <div
      className={cn(
        "border-t border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]",
        className
      )}
    >
      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {attachments.map((att) => (
            <span
              key={att.slug}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2.5 py-1 text-xs text-[color:var(--ds-text-muted)]"
            >
              <FileText size={11} />
              {att.name}
              <button
                onClick={() => removeAttachment(att.slug)}
                className="ml-0.5 text-[color:var(--ds-text-subtle)] transition-colors hover:text-red-500"
                aria-label="Anhang entfernen"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 px-4 py-3">
        {/* Template picker */}
        <div ref={templateRef} className="relative">
          <button
            onClick={() => setShowTemplates((v) => !v)}
            disabled={isStreaming || disabled}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] transition-all hover:border-[color:var(--ds-border-strong)] hover:text-[color:var(--ds-text)] disabled:opacity-50"
            aria-label="Vorlagen"
            title="Vorlagen"
          >
            <LayoutTemplate size={16} />
          </button>
          {showTemplates && (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-lg">
              <div className="border-b border-[color:var(--ds-border)] px-3 py-2 text-xs font-medium text-[color:var(--ds-text-muted)]">
                Vorlagen
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {CHAT_TEMPLATES.map((tpl: ChatTemplate) => (
                  <button
                    key={tpl.id}
                    onClick={() => {
                      setText(tpl.template);
                      setShowTemplates(false);
                      autoFocus();
                    }}
                    className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[color:var(--ds-hover)]"
                  >
                    <span className="text-xs font-medium text-[color:var(--ds-text)]">
                      {tpl.label}
                    </span>
                    <span className="text-[10px] text-[color:var(--ds-text-subtle)]">
                      {tpl.category}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* File upload button */}
        {features?.fileUpload !== false && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming || uploading || disabled}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] transition-all hover:border-[color:var(--ds-border-strong)] hover:text-[color:var(--ds-text)] disabled:opacity-50"
              aria-label="Datei hochladen"
              title="Datei hochladen"
            >
              <Paperclip size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              accept=".pdf,.doc,.docx,.txt,.md,.eml,.msg"
            />
          </>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          data-chat-input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder ?? t("chat.placeholder")}
          rows={1}
          className="min-h-[36px] flex-1 resize-none rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-3 py-2 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:ring-1 focus:ring-[color:var(--brand-primary)] focus:outline-none disabled:opacity-50"
          aria-label="Nachricht eingeben"
        />

        {/* Send / Stop button */}
        {isStreaming ? (
          <button
            onClick={() => onStop?.()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white transition-all hover:bg-red-600"
            aria-label="Generierung stoppen"
            title="Stoppen (Esc)"
          >
            <Square size={16} className="fill-current" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || disabled || uploading}
            className="brand-bg brand-text-on-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Senden"
            title="Senden (Enter)"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
