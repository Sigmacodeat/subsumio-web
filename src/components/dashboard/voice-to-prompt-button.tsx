"use client";

import { useState, useCallback } from "react";
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleClose}
        >
          <div
            className="mx-4 w-full max-w-md rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-text)]">
                <Mic size={16} />
                {appLang === "en" ? "Voice Input" : "Spracheingabe"}
              </h3>
              <button
                onClick={handleClose}
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
                    ? "animate-pulse bg-red-500 text-white shadow-lg shadow-red-500/30"
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
              <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
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
