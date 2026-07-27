"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Mic, MicOff, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceInput } from "@/lib/use-voice-input";
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";

interface VoiceToPromptButtonProps {
  onTranscript: (text: string) => void;
  className?: string;
  lang?: string;
}

export function VoiceToPromptButton({ onTranscript, className, lang }: VoiceToPromptButtonProps) {
  const { lang: appLang } = useLang();
  const [showModal, setShowModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const voice = useVoiceInput({
    lang: lang ?? (appLang === "en" ? "en-US" : "de-DE"),
    interimResults: true,
    onResult: () => {
      setSubmitted(false);
    },
  });

  const handleToggle = useCallback(() => {
    if (voice.isListening) {
      voice.stop();
    } else {
      voice.reset();
      setSubmitted(false);
      voice.start();
    }
  }, [voice]);

  const handleSend = useCallback(() => {
    const text = (voice.transcript + " " + voice.interimTranscript).trim();
    if (text) {
      onTranscript(text);
      voice.reset();
      setShowModal(false);
      setSubmitted(true);
    }
  }, [voice, onTranscript]);

  const handleClose = useCallback(() => {
    voice.stop();
    voice.reset();
    setShowModal(false);
  }, [voice]);

  // A11y for the voice modal: autofocus on open, focus restoration on close.
  // Self-contained — the global dashboard focus trap only covers
  // layout-registered overlays.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const sendButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!showModal) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => sendButtonRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      previouslyFocused?.focus();
    };
  }, [showModal]);

  // Keyboard handling for the voice modal: Escape closes, Tab cycles focus
  // within the dialog.
  useEffect(() => {
    if (!showModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showModal, handleClose]);

  if (!voice.isSupported) return null;

  const fullText = (voice.transcript + " " + voice.interimTranscript).trim();

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn("gap-1.5", className)}
        onClick={() => setShowModal(true)}
        title="Voice-to-Prompt"
      >
        <Mic size={16} />
      </Button>

      {showModal && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Backdrop click-to-close; keyboard users close via Escape or the close button.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="voice-input-title"
            className="mx-4 w-full max-w-md rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3
                id="voice-input-title"
                className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]"
              >
                <Mic size={16} />
                {appLang === "en" ? "Voice Input" : "Spracheingabe"}
              </h3>
              <button
                onClick={handleClose}
                aria-label="Spracheingabe schließen"
                className="text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Mic visual */}
            <div className="mb-4 flex flex-col items-center gap-3">
              <button
                onClick={handleToggle}
                className={cn(
                  "flex h-16 w-16 items-center justify-center rounded-full transition-all",
                  voice.isListening
                    ? "animate-pulse bg-[color:var(--ds-danger-solid)] text-white shadow-lg shadow-[color:var(--ds-danger-solid)]/30"
                    : "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)]"
                )}
              >
                {voice.isListening ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
              <span className="text-xs text-[color:var(--ds-text-muted)]">
                {voice.isListening
                  ? appLang === "en"
                    ? "Listening…"
                    : "Aufnahme läuft…"
                  : appLang === "en"
                    ? "Tap to speak"
                    : "Tippen zum Sprechen"}
              </span>
            </div>

            {/* Error */}
            {voice.error && (
              <div className="mb-3 rounded-lg border border-[color:var(--ds-danger-border)] bg-[color:var(--ds-danger-bg)] px-3 py-2 text-xs text-[color:var(--ds-danger-text)]">
                {voice.error === "not-allowed"
                  ? appLang === "en"
                    ? "Microphone access denied"
                    : "Mikrofonzugriff verweigert"
                  : voice.error}
              </div>
            )}

            {/* Transcript */}
            <div className="mb-4 min-h-[80px] rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
              {fullText ? (
                <p className="text-sm text-[color:var(--ds-text)]">{fullText}</p>
              ) : (
                <p className="text-sm text-[color:var(--ds-text-subtle)]">
                  {appLang === "en"
                    ? "Your speech will appear here…"
                    : "Deine Spracheingabe erscheint hier…"}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleClose}>
                {appLang === "en" ? "Cancel" : "Abbrechen"}
              </Button>
              <Button
                ref={sendButtonRef}
                variant="primary"
                size="sm"
                className="brand-bg gap-1.5 text-white"
                onClick={handleSend}
                disabled={!fullText || submitted}
              >
                {submitted ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {appLang === "en" ? "Send" : "Senden"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
