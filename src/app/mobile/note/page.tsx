"use client";

/**
 * Mobile: Quick-Note
 * Voice-to-text or typed quick notes saved directly to the brain.
 * Uses Web Speech API for voice (Capacitor plugin fallback).
 */

import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Save, CheckCircle2, Loader2, X, Tag, FolderOpen } from "lucide-react";
import { api } from "@/lib/api";

interface SavedNote {
  timestamp: string;
  text: string;
  slug: string;
}

export default function MobileNotePage() {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState("");
  const [matter, setMatter] = useState("");
  const recognitionRef = useRef<unknown>(null);

  // ── Voice Recording ───────────────────────────────────────────────

  const startRecording = useCallback(() => {
    const SpeechRecognition =
      (
        window as unknown as {
          SpeechRecognition?: new () => {
            lang: string;
            continuous: boolean;
            interimResults: boolean;
            onresult: (event: unknown) => void;
            onend: () => void;
            onerror: () => void;
            start: () => void;
            stop: () => void;
          };
          webkitSpeechRecognition?: new () => {
            lang: string;
            continuous: boolean;
            interimResults: boolean;
            onresult: (event: unknown) => void;
            onend: () => void;
            onerror: () => void;
            start: () => void;
            stop: () => void;
          };
        }
      ).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown })
        .webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Spracheingabe nicht verfügbar. Bitte Text eingeben.");
      return;
    }

    const recognition = new SpeechRecognition() as {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: (event: unknown) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    };
    recognition.lang = "de-AT";
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalTranscript = text;

    recognition.onresult = (event: unknown) => {
      const e = event as {
        resultIndex: number;
        results: Array<Array<{ transcript: string }> & { isFinal: boolean }>;
      };
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalTranscript += (finalTranscript ? " " : "") + t;
        } else {
          interim = t;
        }
      }
      setText(finalTranscript + (interim ? " " + interim : ""));
    };

    recognition.onend = () => {
      setRecording(false);
      setText(finalTranscript);
    };

    recognition.onerror = () => {
      setRecording(false);
      setError("Spracherkennung fehlgeschlagen.");
    };

    recognition.start();
    recognitionRef.current = recognition;
    setRecording(true);
    setError(null);
  }, [text]);

  const stopRecording = useCallback(() => {
    (recognitionRef.current as { stop?: () => void })?.stop?.();
    setRecording(false);
  }, []);

  // ── Save to Brain ─────────────────────────────────────────────────

  const saveNote = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const title = text.slice(0, 60) + (text.length > 60 ? "…" : "");
      const now = new Date().toISOString();
      const result = await api.brain.createPage({
        slug: `note-${Date.now()}`,
        title: `Notiz ${new Date().toLocaleDateString("de-AT")} – ${title}`,
        content: text,
        type: "note",
        frontmatter: {
          type: "note",
          created_at: now,
          matter: matter || undefined,
          tags: tagList,
          source: "mobile_quick_note",
        },
      });
      setSaved({ timestamp: now, text, slug: result.slug });
      setText("");
      setTags("");
      setMatter("");
    } catch (e) {
      setError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 24,
          textAlign: "center",
        }}
      >
        <CheckCircle2 size={48} style={{ color: "#22c55e", marginBottom: 16 }} />
        <div style={{ fontSize: 18, fontWeight: 600, color: "#e8e8f0", marginBottom: 8 }}>
          Notiz gespeichert
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#8a8aa8",
            marginBottom: 6,
            maxWidth: 280,
            lineHeight: 1.5,
          }}
        >
          {saved.text.slice(0, 120)}
          {saved.text.length > 120 ? "…" : ""}
        </div>
        <div style={{ fontSize: 11, color: "#4a4a6a", marginBottom: 28 }}>
          {new Date(saved.timestamp).toLocaleString("de-AT")}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setSaved(null)}
            style={{
              padding: "10px 20px",
              background: "#6366f1",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Neue Notiz
          </button>
          <a
            href={`/dashboard/pages/${saved.slug}`}
            style={{
              padding: "10px 20px",
              background: "#1e1e3a",
              border: "1px solid #2e2e5a",
              borderRadius: 10,
              color: "#c0c0d8",
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Öffnen
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", background: "#06060f" }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px 12px",
          background: "#0a0a18",
          borderBottom: "1px solid #1e1e3a",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0" }}>Schnellnotiz</h1>
        <p style={{ fontSize: 12, color: "#6a6a8a", marginTop: 2 }}>
          Gesprochen oder getippt — direkt ins Brain
        </p>
      </div>

      <div
        style={{
          flex: 1,
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflowY: "auto",
        }}
      >
        {/* Text area */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Notiz eingeben oder Mikrofon drücken…"
          rows={6}
          style={
            {
              width: "100%",
              background: "#0d0d1a",
              border: "1px solid #1e1e3a",
              borderRadius: 12,
              padding: "12px 14px",
              color: "#e8e8f0",
              fontSize: 15,
              lineHeight: 1.6,
              resize: "none",
              outline: "none",
              boxSizing: "border-box",
            } as React.CSSProperties
          }
        />

        {/* Mic button */}
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={(e) => {
            e.preventDefault();
            startRecording();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            stopRecording();
          }}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 14,
            background: recording ? "#ef444420" : "#6366f120",
            border: `2px solid ${recording ? "#ef4444" : "#6366f1"}`,
            color: recording ? "#ef4444" : "#6366f1",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            transition: "all 0.15s",
          }}
        >
          {recording ? (
            <>
              <MicOff size={20} /> Aufnahme stoppen
            </>
          ) : (
            <>
              <Mic size={20} /> Gedrückt halten zum Aufnehmen
            </>
          )}
        </button>

        {/* Matter link */}
        <div>
          <label
            style={{
              fontSize: 11,
              color: "#6a6a8a",
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 5,
            }}
          >
            <FolderOpen size={12} /> Akte (optional)
          </label>
          <input
            value={matter}
            onChange={(e) => setMatter(e.target.value)}
            placeholder="Akte-Slug oder Titel"
            style={
              {
                width: "100%",
                background: "#0d0d1a",
                border: "1px solid #1e1e3a",
                borderRadius: 10,
                padding: "9px 12px",
                color: "#e8e8f0",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              } as React.CSSProperties
            }
          />
        </div>

        {/* Tags */}
        <div>
          <label
            style={{
              fontSize: 11,
              color: "#6a6a8a",
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginBottom: 5,
            }}
          >
            <Tag size={12} /> Tags (kommagetrennt)
          </label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="bspw. wichtig, mandant, frist"
            style={
              {
                width: "100%",
                background: "#0d0d1a",
                border: "1px solid #1e1e3a",
                borderRadius: 10,
                padding: "9px 12px",
                color: "#e8e8f0",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              } as React.CSSProperties
            }
          />
        </div>

        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#ef444415",
              border: "1px solid #ef444430",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            <X size={14} style={{ color: "#ef4444" }} />
            <span style={{ fontSize: 13, color: "#ef4444" }}>{error}</span>
          </div>
        )}

        {/* Save */}
        <button
          onClick={saveNote}
          disabled={!text.trim() || saving}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 14,
            background: text.trim() ? "#6366f1" : "#1e1e3a",
            border: "none",
            color: text.trim() ? "#fff" : "#6a6a8a",
            fontSize: 15,
            fontWeight: 600,
            cursor: text.trim() ? "pointer" : "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {saving ? (
            <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Save size={18} />
          )}
          {saving ? "Speichern…" : "Ins Brain speichern"}
        </button>
      </div>
      <style jsx global>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
