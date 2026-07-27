"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { Send, Square, Paperclip, X, FileText, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import { motion, useDashboardMotion } from "@/components/dashboard/motion";
import { CHAT_TEMPLATES, CHAT_TEMPLATES_EN, type ChatTemplate } from "@/components/chat/chat-types";
import { ModelSelector } from "@/components/dashboard/model-selector";
import { UPLOAD_ACCEPT_ATTRIBUTE } from "@/lib/upload-formats";
import { maxUploadSizeFor } from "@/lib/upload-validation";
import { VoiceToPromptButton } from "@/components/dashboard/voice-to-prompt-button";
import { tracking } from "@/lib/tracking";

interface ChatInputProps {
  onSend: (text: string, attachments?: Array<{ name: string; slug: string }>) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  placeholder?: string;
  features?: {
    fileUpload?: boolean;
    modelSelector?: boolean;
  };
  className?: string;
  modelOverride?: string;
  onModelChange?: (model: string | undefined) => void;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  placeholder,
  features,
  className,
  modelOverride,
  onModelChange,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Array<{ name: string; slug: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);
  const { t, lang } = useLang();
  const { popoverTransition, popoverInitial, popoverAnimate, popoverExit } = useDashboardMotion();
  const templates = lang === "en" ? CHAT_TEMPLATES_EN : CHAT_TEMPLATES;

  const charCount = text.length;
  const nearLimit = charCount > 45_000;
  const overLimit = charCount > 50_000;
  const canSend = text.trim().length > 0 && !isStreaming && !disabled && !uploading && !overLimit;

  const autoFocus = useCallback(() => {
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  useEffect(() => {
    autoFocus();
  }, [autoFocus]);

  // Close template and mode dropdowns on outside click
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
    if (!trimmed || isStreaming || disabled || overLimit) return;
    tracking.chat.messageSent(trimmed.length);
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
    setUploadError(null);
    if (files.length > 10) {
      setUploadError(t("chat.input.too_many_files"));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const oversized = files.filter((file) => file.size > maxUploadSizeFor(file.name, file.type));
    if (oversized.length > 0) {
      setUploadError(t("chat.input.file_too_large"));
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map((f) => api.upload.file(f, { source: "chat" })));
      // A large upload may only have created a processing stub. Never attach
      // that stub to a prompt: wait until extraction and semantic indexing are
      // complete. Partial OCR fails closed and asks the user to review it.
      await Promise.all(uploaded.map((item) => api.upload.waitUntilQueryable(item.slug)));
      setAttachments((prev) => [
        ...prev,
        ...uploaded.map((u) => ({ name: u.title, slug: u.slug })),
      ]);
    } catch (err) {
      console.error("[chat-input] upload failed:", err);
      setUploadError(t("chat.input.upload_failed"));
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
        "bg-gradient-to-t from-[color:var(--ds-surface)] via-[color:var(--ds-surface)] to-transparent pt-2",
        className
      )}
    >
      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-2">
          {attachments.map((att) => (
            <span
              key={att.slug}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)]"
            >
              <FileText size={11} />
              {att.name}
              <button
                onClick={() => removeAttachment(att.slug)}
                className="ml-0.5 text-[color:var(--ds-text-subtle)] transition-colors hover:text-red-500"
                aria-label={t("chat.input.remove_attachment")}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="flex items-center gap-2 px-4 pt-2 text-xs text-red-600 dark:text-red-400">
          <X size={12} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{uploadError}</span>
          <button
            onClick={() => setUploadError(null)}
            className="shrink-0 text-red-400 transition-colors hover:text-red-600 dark:text-red-500 dark:hover:text-red-300"
            aria-label={t("chat.dismiss_error")}
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Single-row composer, state-of-the-art layout (Claude.ai/ChatGPT pattern):
          textarea on top, one compact icon toolbar below — no separate
          mode/model row taking up its own vertical band. */}
      <div className="px-3 pb-3">
        <div
          className={cn(
            "relative rounded-2xl border bg-[color:var(--ds-surface)] shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:shadow-md",
            overLimit
              ? "border-red-500"
              : nearLimit
                ? "border-amber-400/60"
                : "border-[color:var(--ds-border)] focus-within:border-[color:var(--brand-primary)]/40"
          )}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            data-chat-input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={
              isStreaming ? t("chat.input.ai_responding") : (placeholder ?? t("chat.placeholder"))
            }
            rows={1}
            maxLength={50000}
            className="min-h-[36px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[14px] leading-relaxed text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-1 disabled:opacity-50"
            aria-label={t("chat.input.enter_message")}
          />

          {/* Char counter — visible when approaching limit */}
          {nearLimit && (
            <span
              className={cn(
                "absolute top-2 right-3 text-xs font-medium",
                overLimit ? "text-red-500" : "text-amber-500"
              )}
            >
              {charCount.toLocaleString(lang === "en" ? "en-GB" : "de-DE")} / 50.000
            </span>
          )}

          {/* Icon toolbar — single row, everything lives here */}
          <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
            {/* Template picker */}
            <div ref={templateRef} className="relative">
              <button
                onClick={() => setShowTemplates((v) => !v)}
                disabled={isStreaming || disabled}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-95 disabled:opacity-50"
                aria-label={t("chat.input.templates")}
                title={t("chat.input.templates")}
              >
                <LayoutTemplate size={15} />
              </button>
              <AnimatePresence initial={false}>
                {showTemplates && (
                  <motion.div
                    className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] shadow-lg"
                    initial={popoverInitial}
                    animate={popoverAnimate}
                    exit={popoverExit}
                    transition={popoverTransition}
                  >
                    <div className="border-b border-[color:var(--ds-border)] px-3 py-2 text-xs font-medium text-[color:var(--ds-text-muted)]">
                      {t("chat.input.templates")}
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1">
                      {templates.map((tpl: ChatTemplate) => (
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
                          <span className="text-xs text-[color:var(--ds-text-subtle)]">
                            {tpl.category}
                          </span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* File upload button */}
            {features?.fileUpload !== false && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming || uploading || disabled}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[color:var(--ds-text-muted)] transition-[background-color,color] duration-200 hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] active:scale-95 disabled:opacity-50"
                  aria-label={t("chat.input.upload_file")}
                  title={t("chat.input.upload_file")}
                >
                  <Paperclip size={15} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  accept={UPLOAD_ACCEPT_ATTRIBUTE}
                />
              </>
            )}

            {/* Voice-to-Prompt button */}
            <VoiceToPromptButton
              onTranscript={(text) => {
                setText((prev) => (prev ? prev + " " : "") + text);
                textareaRef.current?.focus();
              }}
              className="shrink-0"
            />

            {/* Model selector */}
            {features?.modelSelector && onModelChange && (
              <ModelSelector
                selectedModelId={modelOverride}
                onSelect={onModelChange}
                variant="compact"
              />
            )}

            {/* Spacer pushes send/stop to the far right */}
            <div className="flex-1" />

            {/* Micro hint — Enter to send */}
            {text.length === 0 && !isStreaming && (
              <span className="pointer-events-none hidden pr-1 text-[11px] text-[color:var(--ds-text-subtle)]/50 sm:block">
                ↵
              </span>
            )}

            {/* Send / Stop button */}
            {isStreaming ? (
              <button
                onClick={() => onStop?.()}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-500 transition-[background-color,transform] duration-200 hover:bg-red-500/20 active:scale-95"
                aria-label={t("chat.input.stop_generation")}
                title={t("chat.input.stop_esc")}
              >
                <Square size={12} className="fill-current" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSend}
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color:var(--brand-primary)] text-white transition-[background-color,transform,opacity] duration-200 hover:bg-[color:var(--brand-primary-hover)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-30",
                  overLimit && "bg-red-500"
                )}
                aria-label={t("chat.send")}
                title={t("chat.input.send_enter")}
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
