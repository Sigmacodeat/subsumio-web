"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Loader2, Mic, RotateCcw, Square, Upload } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { csrfFetch } from "@/lib/csrf";
import type { DictationEntry } from "@/lib/dictation";
import { formatDictationDuration } from "@/lib/dictation";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";
import { CaseSelect, useCaseOptions } from "@/components/legal/case-select";
import { SaveToMatterButton } from "@/components/legal/save-to-matter-button";

const LANGUAGES = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "Englisch" },
  { value: "fr", label: "Französisch" },
  { value: "it", label: "Italienisch" },
] as const;

const MAX_SECONDS = 20 * 60;

/** Best container the browser can record (Safari: mp4, others: webm/opus). */
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

type Recording = { blob: Blob; seconds: number; mimeType: string; url: string };

export default function DictationPage() {
  const { addToast } = useToast();
  const { t } = useLang();
  const [entries, setEntries] = useState<DictationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [caseSlug, setCaseSlug] = useState("");
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]["value"]>("de");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(0);
  const { data: caseOptions = [] } = useCaseOptions();
  // Decided after mount: the server render cannot know the browser's recorder.
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => setSupported(!!pickMimeType() && !!navigator.mediaDevices), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dictation");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data?: { items?: DictationEntry[] } };
      setEntries(body.data?.items ?? []);
    } catch {
      addToast({ type: "error", title: t("dictation.err_load") });
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  // Release the microphone and the object URL when leaving the page.
  useEffect(() => () => stopTracks(), []);
  useEffect(() => () => (recording ? URL.revokeObjectURL(recording.url) : undefined), [recording]);

  async function start() {
    setError(null);
    const mimeType = pickMimeType();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        const seconds = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
        const blob = new Blob(chunks, { type: rec.mimeType || mimeType });
        stopTracks();
        setIsRecording(false);
        setRecording({ blob, seconds, mimeType: blob.type, url: URL.createObjectURL(blob) });
      };
      recorderRef.current = rec;
      startedRef.current = Date.now();
      setElapsed(0);
      rec.start(1000);
      setIsRecording(true);
      timerRef.current = setInterval(() => {
        const s = Math.round((Date.now() - startedRef.current) / 1000);
        setElapsed(s);
        if (s >= MAX_SECONDS) recorderRef.current?.stop();
      }, 500);
    } catch {
      stopTracks();
      setError(
        "Kein Zugriff auf das Mikrofon. Bitte erlauben Sie den Zugriff in den Browser-Einstellungen."
      );
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  function discard() {
    setRecording(null);
    setError(null);
  }

  async function send() {
    if (!recording) return;
    setSending(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/dictation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_slug: caseSlug || undefined,
          language,
          duration_seconds: recording.seconds,
          mime_type: recording.mimeType.split(";")[0] || "audio/webm",
          audio_base64: await blobToBase64(recording.blob),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: { transcript?: string };
      };
      if (!res.ok) {
        // Keep the recording so the lawyer can retry without dictating again.
        setError(
          body.details?.transcript
            ? `${body.error ?? "Speichern fehlgeschlagen."} Text: ${body.details.transcript}`
            : (body.error ??
                "Die Aufnahme konnte nicht verarbeitet werden. Bitte erneut versuchen.")
        );
        return;
      }
      addToast({ type: "success", title: "Diktat verschriftet und gespeichert" });
      setRecording(null);
      void load();
    } catch {
      setError("Verbindung fehlgeschlagen. Die Aufnahme bleibt erhalten — bitte erneut senden.");
    } finally {
      setSending(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      addToast({ type: "success", title: "Text kopiert" });
    } catch {
      addToast({ type: "error", title: "Kopieren nicht möglich" });
    }
  }

  const caseTitle = (slug: string) =>
    caseOptions.find((c) => c.slug === slug)?.title ?? slug.split("/").pop();

  return (
    <div className="ds-page ds-page-medium space-y-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        title={t("dictation.title")}
        description="Diktieren Sie direkt im Browser. Die Aufnahme wird verschriftet und als Text gespeichert; die Audiodatei selbst wird nicht aufbewahrt. Datenweg: Zur Verschriftung geht die Aufnahme an einen externen KI-Dienst. Im EU-Datenmodus ausschließlich an Mistral AI (Voxtral, Verarbeitung in der EU); sonst an Whisper über OpenRouter (Verarbeitung außerhalb der EU möglich). Ohne eingerichteten EU-Dienst ist das Diktat im EU-Datenmodus nicht verfügbar."
        breadcrumbs={[
          { label: t("breadcrumb.dashboard"), href: "/dashboard" },
          { label: t("dictation.title") },
        ]}
      />

      <section
        aria-label="Neues Diktat"
        className="space-y-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-1">
            <Label htmlFor="dict-case" className="text-xs text-[color:var(--ds-text-muted)]">
              {t("dictation.case")}
            </Label>
            <CaseSelect
              id="dict-case"
              value={caseSlug}
              onChange={setCaseSlug}
              placeholder="Ohne Aktenbezug"
              disabled={isRecording || sending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dict-lang" className="text-xs text-[color:var(--ds-text-muted)]">
              Sprache
            </Label>
            <select
              id="dict-lang"
              value={language}
              disabled={isRecording || sending}
              onChange={(e) => setLanguage(e.target.value as typeof language)}
              className="h-11 w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 text-base text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none sm:h-9 sm:text-sm"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {supported === null ? null : !supported ? (
          <p className="text-sm text-[color:var(--ds-text-muted)]">
            Dieser Browser unterstützt keine Audioaufnahme. Bitte verwenden Sie einen aktuellen
            Chrome, Edge, Firefox oder Safari.
          </p>
        ) : isRecording ? (
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="inline-flex items-center gap-2 text-sm text-[color:var(--ds-danger-text)] tabular-nums"
              aria-live="polite"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 animate-pulse rounded-full bg-[color:var(--ds-danger-text)] motion-reduce:animate-none"
              />
              Aufnahme läuft · {formatDictationDuration(elapsed)}
            </span>
            <Button onClick={stop} variant="secondary" className="gap-2">
              <Square size={14} aria-hidden="true" /> Aufnahme beenden
            </Button>
          </div>
        ) : recording ? (
          <div className="space-y-3">
            <audio controls src={recording.url} className="w-full" aria-label="Aufnahme anhören" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void send()} disabled={sending} className="gap-2">
                {sending ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Upload size={14} aria-hidden="true" />
                )}
                {sending ? "Wird verschriftet …" : "Verschriften und speichern"}
              </Button>
              <Button onClick={discard} variant="ghost" disabled={sending} className="gap-2">
                <RotateCcw size={14} aria-hidden="true" /> Verwerfen
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => void start()} className="gap-2">
            <Mic size={16} aria-hidden="true" /> Aufnahme starten
          </Button>
        )}

        {error && (
          <p role="alert" className="text-sm text-[color:var(--ds-danger-text)]">
            {error}
          </p>
        )}
        <p className="text-xs text-[color:var(--ds-text-muted)]">
          Höchstens {MAX_SECONDS / 60} Minuten pro Aufnahme. Zur Verschriftung wird die Aufnahme an
          den Transkriptionsdienst der Kanzlei-KI übertragen.
        </p>
      </section>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Mic}
          title={t("dictation.empty")}
          description={t("dictation.empty_hint")}
        />
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{entry.lawyer_name}</span>
                <Badge
                  variant="default"
                  className={`text-xs ${entry.status === "failed" ? "border-[color:var(--ds-danger-border)] text-[color:var(--ds-danger-text)]" : ""}`}
                >
                  {entry.status === "transcribed"
                    ? t("dictation.status_transcribed")
                    : entry.status === "corrected"
                      ? t("dictation.status_corrected")
                      : entry.status === "filed"
                        ? t("dictation.status_filed")
                        : entry.status === "failed"
                          ? t("dictation.status_failed")
                          : t("dictation.status_recording")}
                </Badge>
                <span className="text-xs text-[color:var(--ds-text-muted)]">
                  {formatDictationDuration(entry.duration_seconds)}
                  {entry.case_slug ? ` · ${caseTitle(entry.case_slug)}` : ""}
                  {entry.created_at
                    ? ` · ${new Date(entry.created_at).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" })}`
                    : ""}
                </span>
                {entry.transcript && (
                  <button
                    type="button"
                    onClick={() => void copy(entry.corrected_text || entry.transcript || "")}
                    className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none"
                  >
                    <Copy size={12} aria-hidden="true" /> Text kopieren
                  </button>
                )}
                {entry.transcript && (
                  <SaveToMatterButton
                    source="dictation"
                    variant="ghost"
                    defaultCase={entry.case_slug ?? ""}
                    defaultTitle={`Diktat vom ${entry.created_at ? new Date(entry.created_at).toLocaleDateString("de-AT") : ""}`.trim()}
                    content={entry.corrected_text || entry.transcript}
                  />
                )}
              </div>
              {(entry.corrected_text || entry.transcript) && (
                <details className="mt-1 text-sm text-[color:var(--ds-text)]">
                  <summary className="line-clamp-2 cursor-pointer text-xs text-[color:var(--ds-text-muted)]">
                    {entry.corrected_text || entry.transcript}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap">
                    {entry.corrected_text || entry.transcript}
                  </p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
