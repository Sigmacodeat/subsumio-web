"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { formatCitationTitle } from "@/lib/ogh-format";
import { Copy, Check, Download, ChevronRight, Save, FolderOpen, Trash2 } from "lucide-react";

const STORAGE_KEY = "subsumio:subsumption-sessions";

interface SavedSession {
  id: string;
  title: string;
  scenario: string;
  messages: Message[];
  jurisdiction: string;
  savedAt: string;
}

function loadSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: SavedSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // localStorage might be full or unavailable
  }
}

interface SubsumptionResult {
  answer: string;
  citations: Array<{ title: string; slug?: string }>;
  warnings?: string[];
}

interface SubsumptionPanelProps {
  jurisdiction: string;
  caseSlug?: string;
  onClose?: () => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ title: string; slug?: string }>;
  isStreaming?: boolean;
}

/** Detect structured subsumption sections in the answer */
function parseSubsumptionSections(content: string): Array<{ title: string; body: string }> {
  const sections: Array<{ title: string; body: string }> = [];
  const lines = content.split("\n");
  let currentTitle = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,3}\s+(.*)/);
    if (headerMatch) {
      if (currentTitle || currentBody.length > 0) {
        sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
      }
      currentTitle = headerMatch[1]!;
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  if (currentTitle || currentBody.length > 0) {
    sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
  }

  return sections;
}

export function SubsumptionPanel({ jurisdiction, caseSlug, onClose }: SubsumptionPanelProps) {
  const [scenario, setScenario] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Persistence state
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Load sessions from localStorage on mount
  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  const handleSaveSession = useCallback(() => {
    if (messages.length === 0) return;
    const session: SavedSession = {
      id: `session-${Date.now()}`,
      title: scenario.slice(0, 80) || "Subsumtion",
      scenario,
      messages,
      jurisdiction,
      savedAt: new Date().toISOString(),
    };
    const updated = [session, ...loadSessions()].slice(0, 20);
    saveSessions(updated);
    setSessions(updated);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }, [messages, scenario, jurisdiction]);

  const handleLoadSession = useCallback((id: string) => {
    const session = loadSessions().find((s) => s.id === id);
    if (!session) return;
    setScenario(session.scenario);
    setMessages(session.messages);
    setFollowUp("");
    setShowSessions(false);
  }, []);

  const handleDeleteSession = useCallback((id: string) => {
    const updated = loadSessions().filter((s) => s.id !== id);
    saveSessions(updated);
    setSessions(updated);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!scenario.trim() || isStreaming) return;

      const userMsg: Message = { role: "user", content: scenario };
      const assistantMsg: Message = {
        role: "assistant",
        content: "",
        isStreaming: true,
      };
      setMessages((m) => [...m, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/legal/subsumption", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario,
            jurisdiction,
            case_slug: caseSlug,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          setMessages((m) => [
            ...m.slice(0, -1),
            {
              role: "assistant",
              content: `Fehler: ${err.message ?? "Subsumtion fehlgeschlagen."}`,
            },
          ]);
          return;
        }

        const contentType = res.headers.get("content-type") ?? "";

        if (contentType.includes("text/event-stream")) {
          const reader = res.body?.getReader();
          if (!reader) return;
          const decoder = new TextDecoder();
          let accumulated = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const parsed = JSON.parse(line.slice(6)) as {
                    chunk?: string;
                    answer?: string;
                    citations?: unknown[];
                  };
                  if (parsed.chunk) {
                    accumulated += parsed.chunk;
                    setMessages((m) => [
                      ...m.slice(0, -1),
                      {
                        role: "assistant",
                        content: accumulated,
                        isStreaming: true,
                      },
                    ]);
                  }
                  if (parsed.answer && !accumulated) {
                    accumulated = parsed.answer;
                    setMessages((m) => [
                      ...m.slice(0, -1),
                      {
                        role: "assistant",
                        content: accumulated,
                        citations: Array.isArray(parsed.citations)
                          ? (parsed.citations as Array<{ title: string; slug?: string }>)
                          : [],
                      },
                    ]);
                  }
                } catch {
                  // skip malformed chunks
                }
              }
            }
          }
          setMessages((m) => [
            ...m.slice(0, -1),
            { role: "assistant", content: accumulated, isStreaming: false },
          ]);
        } else {
          const data = (await res.json()) as SubsumptionResult;
          setMessages((m) => [
            ...m.slice(0, -1),
            {
              role: "assistant",
              content: data.answer,
              citations: data.citations,
              isStreaming: false,
            },
          ]);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setMessages((m) => [
          ...m.slice(0, -1),
          {
            role: "assistant",
            content: `Fehler: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`,
          },
        ]);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [scenario, isStreaming, jurisdiction, caseSlug]
  );

  const handleFollowUp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!followUp.trim() || isStreaming || messages.length === 0) return;

      const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
      const userMsg: Message = { role: "user", content: followUp };
      const assistantMsg: Message = {
        role: "assistant",
        content: "",
        isStreaming: true,
      };
      setMessages((m) => [...m, userMsg, assistantMsg]);
      setIsStreaming(true);
      setFollowUp("");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/legal/subsumption", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenario,
            jurisdiction,
            follow_up: followUp,
            previous_result: lastAssistant?.content,
            case_slug: caseSlug,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          setMessages((m) => [
            ...m.slice(0, -1),
            {
              role: "assistant",
              content: "Fehler bei der Verfeinerung.",
            },
          ]);
          return;
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("text/event-stream")) {
          const reader = res.body?.getReader();
          if (!reader) return;
          const decoder = new TextDecoder();
          let accumulated = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const parsed = JSON.parse(line.slice(6)) as { chunk?: string };
                  if (parsed.chunk) {
                    accumulated += parsed.chunk;
                    setMessages((m) => [
                      ...m.slice(0, -1),
                      {
                        role: "assistant",
                        content: accumulated,
                        isStreaming: true,
                      },
                    ]);
                  }
                } catch {
                  // skip
                }
              }
            }
          }
          setMessages((m) => [
            ...m.slice(0, -1),
            { role: "assistant", content: accumulated, isStreaming: false },
          ]);
        } else {
          const data = (await res.json()) as SubsumptionResult;
          setMessages((m) => [
            ...m.slice(0, -1),
            {
              role: "assistant",
              content: data.answer,
              citations: data.citations,
              isStreaming: false,
            },
          ]);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setMessages((m) => [
          ...m.slice(0, -1),
          {
            role: "assistant",
            content: `Fehler: ${err instanceof Error ? err.message : "Unbekannt"}`,
          },
        ]);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [followUp, isStreaming, messages, scenario, jurisdiction, caseSlug]
  );

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const handleReset = () => {
    setMessages([]);
    setScenario("");
    setFollowUp("");
  };

  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopy = useCallback(async (content: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // clipboard not available
    }
  }, []);

  const handleExport = useCallback(
    (content: string, idx: number) => {
      const lastUser = [...messages.slice(0, idx)].reverse().find((m) => m.role === "user");
      const header = `# Subsumtion — ${new Date().toLocaleDateString("de-DE")}\n\n**Sachverhalt:** ${lastUser?.content ?? ""}\n\n**Jurisdiktion:** ${jurisdiction.toUpperCase()}\n\n---\n\n`;
      const full = header + content;
      const blob = new Blob([full], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subsumtion-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [messages, jurisdiction]
  );

  return (
    <div className="flex h-full flex-col bg-[var(--ds-surface-1)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--ds-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[var(--brand-primary)]"
          >
            <path d="M3 6h18" />
            <path d="M7 12h10" />
            <path d="M10 18h4" />
          </svg>
          <span className="text-sm font-semibold text-[var(--ds-text)]">
            Interaktive Subsumtion
          </span>
          <span className="rounded-full bg-[var(--ds-surface-2)] px-2 py-0.5 text-xs text-[var(--ds-text-muted)]">
            {jurisdiction.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <>
              <button
                onClick={handleSaveSession}
                className="inline-flex items-center gap-1 text-xs text-[var(--ds-text-muted)] transition-colors hover:text-[var(--ds-text)]"
                title="Sitzung speichern"
              >
                {savedFlash ? (
                  <>
                    <Check className="h-3 w-3 text-green-500" /> Gespeichert
                  </>
                ) : (
                  <>
                    <Save className="h-3 w-3" /> Speichern
                  </>
                )}
              </button>
              <button
                onClick={() => setShowSessions((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-[var(--ds-text-muted)] transition-colors hover:text-[var(--ds-text)]"
                title="Gespeicherte Sitzungen"
              >
                <FolderOpen className="h-3 w-3" /> Laden
                {sessions.length > 0 && (
                  <span className="rounded-full bg-[var(--ds-surface-2)] px-1.5 text-[10px]">
                    {sessions.length}
                  </span>
                )}
              </button>
              <button
                onClick={handleReset}
                className="text-xs text-[var(--ds-text-muted)] transition-colors hover:text-[var(--ds-text)]"
              >
                Zurücksetzen
              </button>
            </>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-[var(--ds-text-muted)] transition-colors hover:text-[var(--ds-text)]"
              aria-label="Schließen"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Saved sessions dropdown */}
      {showSessions && (
        <div className="border-b border-[var(--ds-border)] bg-[var(--ds-surface-2)] px-4 py-3">
          <div className="mb-2 text-xs font-semibold text-[var(--ds-text-muted)]">
            Gespeicherte Sitzungen
          </div>
          {sessions.length === 0 ? (
            <p className="text-xs text-[var(--ds-text-muted)]">
              Noch keine Sitzungen gespeichert.
            </p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--ds-surface-1)]"
                >
                  <button
                    onClick={() => handleLoadSession(s.id)}
                    className="flex-1 truncate text-left text-[var(--ds-text)]"
                  >
                    <span className="font-medium">{s.title}</span>
                    <span className="ml-2 text-xs text-[var(--ds-text-muted)]">
                      {new Date(s.savedAt).toLocaleDateString("de-DE")} · {s.messages.length} Nachrichten
                    </span>
                  </button>
                  <button
                    onClick={() => handleDeleteSession(s.id)}
                    className="ml-2 text-[var(--ds-text-muted)] hover:text-red-500"
                    title="Löschen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="py-12 text-center">
            <div className="mb-3 text-4xl">⚖️</div>
            <h3 className="mb-2 text-lg font-semibold text-[var(--ds-text)]">
              Subsumtion erstellen
            </h3>
            <p className="mx-auto max-w-md text-sm text-[var(--ds-text-muted)]">
              Beschreiben Sie einen Sachverhalt. Der Agent sucht die einschlägigen Paragraphen,
              erstellt eine strukturierte Subsumtion und prüft Einwendungen. Sie können danach
              folgen.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isAssistant = msg.role === "assistant";
          const sections =
            isAssistant && !msg.isStreaming ? parseSubsumptionSections(msg.content) : [];
          const hasSections = sections.length > 1;
          const renderedHtml = isAssistant && msg.content ? renderMarkdown(msg.content) : "";

          return (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-[var(--brand-primary)] text-white"
                    : "bg-[var(--ds-surface-2)] text-[var(--ds-text)]"
                }`}
              >
                {isAssistant && msg.isStreaming && !msg.content && (
                  <div className="flex items-center gap-2 text-sm text-[var(--ds-text-muted)]">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--brand-primary)]" />
                    <span>Suche Paragraphen...</span>
                  </div>
                )}

                {/* Markdown-rendered content */}
                {isAssistant && msg.content && (
                  <>
                    {hasSections ? (
                      <div className="space-y-3">
                        {sections.map((sec, si) => (
                          <div key={si}>
                            {sec.title && (
                              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[var(--brand-primary)] uppercase">
                                <ChevronRight className="h-3 w-3" />
                                {sec.title}
                              </div>
                            )}
                            <div
                              className="prose-chat text-sm leading-relaxed"
                              dangerouslySetInnerHTML={{
                                __html: renderMarkdown(sec.body) || "&nbsp;",
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        className="prose-chat text-sm leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: renderedHtml }}
                      />
                    )}
                    {msg.isStreaming && (
                      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-[var(--brand-primary)] align-text-bottom" />
                    )}
                  </>
                )}

                {/* User content (plain text) */}
                {msg.role === "user" && (
                  <p className="text-sm leading-relaxed font-medium whitespace-pre-wrap">
                    {msg.content}
                  </p>
                )}

                {/* Citations */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 border-t border-[var(--ds-border)] pt-3">
                    <div className="mb-1 text-xs font-semibold text-[var(--ds-text-muted)]">
                      Quellen:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.citations.map((c, j) => (
                        <span
                          key={j}
                          className="rounded bg-[var(--ds-surface-1)] px-2 py-0.5 text-xs text-[var(--ds-text-muted)]"
                        >
                          {formatCitationTitle(c.title, c.slug)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons for completed assistant messages */}
                {isAssistant && !msg.isStreaming && msg.content && (
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      onClick={() => handleCopy(msg.content, i)}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-surface-1)] hover:text-[var(--ds-text)]"
                      title="In Zwischenablage kopieren"
                    >
                      {copiedIdx === i ? (
                        <>
                          <Check className="h-3 w-3 text-green-500" /> Kopiert
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Kopieren
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleExport(msg.content, i)}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-surface-1)] hover:text-[var(--ds-text)]"
                      title="Als Markdown exportieren"
                    >
                      <Download className="h-3 w-3" /> Export
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input area */}
      <div className="space-y-3 border-t border-[var(--ds-border)] p-4">
        {messages.length === 0 ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="Beschreiben Sie den Sachverhalt... Beispiel: 'Mein Mandant wurde bei einem Hundebiss verletzt. Der Hund gehört dem Nachbarn und war nicht angeleint.'"
              rows={4}
              className="w-full resize-none rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface-2)] px-4 py-3 text-sm text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
              disabled={isStreaming}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--ds-text-muted)]">
                Der Agent sucht automatisch nach einschlägigen §§ und OGH-Judikatur.
              </span>
              <button
                type="submit"
                disabled={!scenario.trim() || isStreaming}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {isStreaming ? "Analysiere..." : "Subsumtion starten"}
                {!isStreaming && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 12 7-7 7 7" />
                    <path d="M12 19V5" />
                  </svg>
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleFollowUp} className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Follow-up: z.B. 'Prüfe auch Mitverschulden' oder 'Welche OGH-Judikatur gibt es?'"
                className="flex-1 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface-2)] px-3 py-2 text-sm text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
                disabled={isStreaming}
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="rounded-lg border border-[var(--ds-border)] px-3 py-2 text-sm text-[var(--ds-text-muted)] hover:bg-[var(--ds-surface-2)]"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!followUp.trim()}
                  className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Senden
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Mitverschulden prüfen", "Verjährung?", "OGH-Judikatur?", "Schadenshöhe?"].map(
                (suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setFollowUp(suggestion)}
                    disabled={isStreaming}
                    className="rounded-full border border-[var(--ds-border)] px-2.5 py-1 text-xs text-[var(--ds-text-muted)] transition-colors hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] disabled:opacity-40"
                  >
                    {suggestion}
                  </button>
                )
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
