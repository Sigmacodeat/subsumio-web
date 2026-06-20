"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send,
  User,
  Bot,
  Upload,
  X,
  FileText,
  Trash2,
  Clock,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdown";
import { buildSafePrompt } from "@/lib/prompt-sanitizer";
import {
  loadChatHistory,
  saveChatMessage,
  clearChatHistory,
  type ChatHistoryEntry,
} from "@/lib/offline-store";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CitationBadgesInline } from "@/components/legal/CitationPanel";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ slug: string; title: string }>;
  timestamp: string;
  attachments?: Array<{ name: string; slug: string }>;
}

export default function AssistantPage() {
  const confirm = useConfirm();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<
    Array<{ name: string; slug: string; content: string }>
  >([]);
  const [assistantJurisdiction, setAssistantJurisdiction] = useState<"de" | "at" | "ch" | "eu">(
    "de"
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load chat history from IndexedDB on mount
  useEffect(() => {
    loadChatHistory().then((history) => {
      if (history.length > 0) {
        setMessages(history as ChatMessage[]);
      }
    });
  }, []);

  // Auto-scroll only if user is already near the bottom (within 150px)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || messages.length === 0) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() && attachments.length === 0) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
      attachments: attachments.map((a) => ({ name: a.name, slug: a.slug })),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);
    saveChatMessage(userMsg as ChatHistoryEntry);

    try {
      const contextParts: string[] = [];
      if (attachments.length > 0) {
        contextParts.push("--- ANGEHÄNGTE DOKUMENTE ---");
        for (const att of attachments) {
          contextParts.push(`\nDOKUMENT: ${att.name}\n${att.content.slice(0, 8000)}\n`);
        }
        contextParts.push("--- ENDE DOKUMENTE ---\n");
      }

      const jurisdictionLabel = {
        de: "deutsches",
        at: "österreichisches",
        ch: "schweizerisches",
        eu: "EU-",
      }[assistantJurisdiction];
      const systemPrompt = `Du bist ein intelligenter legaler Assistent für eine Kanzlei im ${jurisdictionLabel.toUpperCase()} Rechtsraum. Beantworte präzise unter Berücksichtigung des ${jurisdictionLabel} Rechts. Zitiere Gesetze mit § und Absatz, und gib am Ende an: "Diese Information ersetzt keine anwaltliche Prüfung."`;
      const userInput = `${contextParts.join("\n")}\nNUTZERFRAGE:\n${input}`;
      const prompt = buildSafePrompt(systemPrompt, userInput);

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
      };
      setMessages((m) => [...m, assistantMsg]);

      const result = await api.query.think(prompt, "balanced", (chunk) => {
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last.role !== "assistant") return m;
          return [...m.slice(0, -1), { ...last, content: last.content + chunk }];
        });
      });

      setMessages((m) => {
        const last = m[m.length - 1];
        if (last.role !== "assistant") return m;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = (result as any)._grounding || (result as any).grounding;
        const updated = {
          ...last,
          content: result.answer,
          citations: result.citations,
          grounding: g ?? undefined,
        };
        saveChatMessage(updated as ChatHistoryEntry);
        return [...m.slice(0, -1), updated];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anfrage fehlgeschlagen.");
    } finally {
      setLoading(false);
      setAttachments([]);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await api.upload.file(file, {
        title: file.name,
        source: "assistant",
        tags: ["assistant-upload"],
      });
      // Try to fetch page content for context
      let content = "";
      try {
        const page = await api.brain.getPage(res.slug);
        content = page.content || "";
      } catch {}
      setAttachments((a) => [...a, { name: file.name, slug: res.slug, content }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    }
  }

  async function clearChat() {
    const ok = await confirm({
      title: "Chat-Verlauf löschen",
      message: "Möchten Sie den gesamten Chat-Verlauf unwiderruflich löschen?",
      confirmLabel: "Löschen",
      variant: "danger",
    });
    if (!ok) return;
    setMessages([]);
    setAttachments([]);
    clearChatHistory();
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--ds-border)] px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="brand-soft brand-border flex h-9 w-9 items-center justify-center rounded-xl border">
            <Bot size={17} className="brand-text" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">
              Legal Assistant
            </h1>
            <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
              KI-gestützter Rechtsassistent mit Dokumenten-Analyse
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <select
            value={assistantJurisdiction}
            onChange={(e) => setAssistantJurisdiction(e.target.value as "de" | "at" | "ch" | "eu")}
            className="rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2.5 py-1.5 text-xs text-[color:var(--ds-text)] transition-colors focus:border-[color:var(--brand-primary)] focus:outline-none"
            title="Rechtsraum auswählen"
          >
            <option value="de">🇩🇪 DE</option>
            <option value="at">🇦🇹 AT</option>
            <option value="ch">🇨🇭 CH</option>
            <option value="eu">🇪🇺 EU</option>
          </select>
          <button
            onClick={clearChat}
            className="rounded-lg p-2 text-[color:var(--ds-text-muted)] transition-all hover:bg-red-500/10 hover:text-red-600"
            title="Chat löschen"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 space-y-6 overflow-y-auto px-6 py-8">
        {messages.length === 0 && (
          <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center">
            <div className="brand-soft brand-border mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border">
              <Bot size={28} className="brand-text" />
            </div>
            <h2 className="mb-2 text-xl font-bold tracking-tight text-[color:var(--ds-text)]">
              Wie kann ich dir heute helfen?
            </h2>
            <p className="mb-8 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
              Lade Dokumente hoch oder stelle rechtliche Fragen — mit Fundstellen und
              Rechtsraum-Bezug.
            </p>
            <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-2">
              {[
                "Analysiere diesen Vertrag auf Haftungsrisiken.",
                "Welche Fristen laufen in meinen offenen Akten?",
                "Entwirf eine Klageschrift zu § 823 BGB.",
                "Prüfe den Sachverhalt auf Anspruchsgrundlagen.",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3 text-left text-xs text-[color:var(--ds-text-muted)] transition-all hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`msg-in flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="brand-bg mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm">
                <Bot size={15} className="text-white" />
              </div>
            )}
            <div
              className={`max-w-[80%] space-y-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "brand-soft brand-border rounded-tr-md border text-[color:var(--ds-text)]"
                    : "card-shadow rounded-tl-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-[color:var(--ds-text-muted)]"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div
                    className="prose prose-invert prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                ) : (
                  msg.content
                )}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-[color:var(--ds-border)] pt-2">
                    {msg.attachments.map((att) => (
                      <div
                        key={att.slug}
                        className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]"
                      >
                        <FileText size={10} /> {att.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === "assistant" && msg.content && (
                <CitationBadgesInline
                  data={{
                    citations: msg.citations,
                    isStreaming: false,
                  }}
                />
              )}
              {msg.citations && msg.citations.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {msg.citations.map((c) => (
                    <a
                      key={c.slug}
                      href={`/dashboard/brain/${c.slug.split("/").map(encodeURIComponent).join("/")}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2 py-1 text-xs text-[color:var(--ds-text-muted)] transition-all hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-primary)]"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {c.title}
                      <ExternalLink size={8} />
                    </a>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-subtle)]">
                <span className="flex items-center gap-1">
                  <Clock size={8} />
                  {new Date(msg.timestamp).toLocaleTimeString("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {msg.role === "assistant" && msg.content && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(msg.content);
                      setCopiedId(msg.id);
                      setTimeout(() => setCopiedId(null), 2000);
                    }}
                    className="flex items-center gap-1 transition-colors hover:text-[color:var(--ds-text)]"
                    title="Antwort kopieren"
                  >
                    {copiedId === msg.id ? (
                      <Check size={8} className="text-emerald-600" />
                    ) : (
                      <Copy size={8} />
                    )}
                    {copiedId === msg.id ? "Kopiert" : "Kopieren"}
                  </button>
                )}
              </div>
            </div>
            {msg.role === "user" && (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
                <User size={15} className="text-[color:var(--ds-text-muted)]" />
              </div>
            )}
          </div>
        ))}

        {loading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="msg-in flex gap-3">
            <div className="brand-bg flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm">
              <Bot size={15} className="text-white" />
            </div>
            <div className="flex items-center gap-2 py-2 text-sm text-[color:var(--ds-text-muted)]">
              Denke nach
              <span className="flex gap-0.5">
                <span className="typing-dot h-1 w-1 rounded-full bg-[color:var(--ds-text-muted)]" />
                <span className="typing-dot h-1 w-1 rounded-full bg-[color:var(--ds-text-muted)]" />
                <span className="typing-dot h-1 w-1 rounded-full bg-[color:var(--ds-text-muted)]" />
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 space-y-2.5 border-t border-[color:var(--ds-border)] px-6 pt-4 pb-6">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((att) => (
              <div
                key={att.slug}
                className="brand-soft brand-border brand-text flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs"
              >
                <FileText size={10} /> {att.name}
                <button
                  onClick={() => setAttachments((a) => a.filter((x) => x.slug !== att.slug))}
                  className="brand-text transition-colors hover:text-red-600"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex items-end gap-2">
          <label
            className="shrink-0 cursor-pointer rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-2.5 text-[color:var(--ds-text-muted)] transition-all hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-primary)]"
            title="Dokument hochladen"
          >
            <Upload size={16} />
            <input type="file" className="hidden" onChange={handleFileUpload} />
          </label>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            rows={1}
            placeholder="Frage stellen oder Dokument analysieren…"
            className="max-h-[120px] min-h-[40px] flex-1 resize-none rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-2.5 text-sm text-[color:var(--ds-text)] transition-colors placeholder:text-[color:var(--ds-text-subtle)] focus:border-[color:var(--brand-primary)] focus:outline-none"
          />
          <Button
            onClick={sendMessage}
            disabled={loading || (!input.trim() && attachments.length === 0)}
            variant="glow"
            className="h-10 w-10 shrink-0 p-0"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
