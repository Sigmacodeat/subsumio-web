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
import { loadChatHistory, saveChatMessage, clearChatHistory, type ChatHistoryEntry } from "@/lib/offline-store";
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
  const [attachments, setAttachments] = useState<Array<{ name: string; slug: string; content: string }>>([]);
  const [assistantJurisdiction, setAssistantJurisdiction] = useState<"de" | "at" | "ch" | "eu">("de");
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
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
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

      const jurisdictionLabel = { de: "deutsches", at: "österreichisches", ch: "schweizerisches", eu: "EU-" }[assistantJurisdiction];
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
        const updated = { ...last, content: result.answer, citations: result.citations, grounding: g ?? undefined };
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
      const res = await api.upload.file(file, { title: file.name, source: "assistant", tags: ["assistant-upload"] });
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
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[color:var(--ds-border)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl brand-soft border brand-border flex items-center justify-center">
            <Bot size={17} className="brand-text" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[color:var(--ds-text)] tracking-tight">Legal Assistant</h1>
            <p className="text-xs text-[color:var(--ds-text-muted)] mt-0.5 leading-relaxed">KI-gestützter Rechtsassistent mit Dokumenten-Analyse</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <select
            value={assistantJurisdiction}
            onChange={(e) => setAssistantJurisdiction(e.target.value as "de" | "at" | "ch" | "eu")}
            className="bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-lg px-2.5 py-1.5 text-xs text-[color:var(--ds-text)] focus:outline-none focus:border-[color:var(--brand-primary)] transition-colors"
            title="Rechtsraum auswählen"
          >
            <option value="de">🇩🇪 DE</option>
            <option value="at">🇦🇹 AT</option>
            <option value="ch">🇨🇭 CH</option>
            <option value="eu">🇪🇺 EU</option>
          </select>
          <button onClick={clearChat} className="p-2 rounded-lg text-[color:var(--ds-text-muted)] hover:text-red-600 hover:bg-red-500/10 transition-all" title="Chat löschen">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-2xl brand-soft border brand-border flex items-center justify-center mb-6">
              <Bot size={28} className="brand-text" />
            </div>
            <h2 className="text-xl font-bold text-[color:var(--ds-text)] mb-2 tracking-tight">Wie kann ich dir heute helfen?</h2>
            <p className="text-sm text-[color:var(--ds-text-muted)] mb-8 leading-relaxed">
              Lade Dokumente hoch oder stelle rechtliche Fragen — mit Fundstellen und Rechtsraum-Bezug.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full">
              {[
                "Analysiere diesen Vertrag auf Haftungsrisiken.",
                "Welche Fristen laufen in meinen offenen Akten?",
                "Entwirf eine Klageschrift zu § 823 BGB.",
                "Prüfe den Sachverhalt auf Anspruchsgrundlagen.",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                  className="text-left text-xs px-4 py-3 rounded-xl bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:border-[color:var(--brand-primary)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 msg-in ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-9 h-9 rounded-xl brand-bg flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <Bot size={15} className="text-white" />
              </div>
            )}
            <div className={`max-w-[80%] space-y-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "rounded-tr-md brand-soft border brand-border text-[color:var(--ds-text)]"
                  : "rounded-tl-md bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] card-shadow"
              }`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-invert prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                ) : (
                  msg.content
                )}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[color:var(--ds-border)] space-y-1">
                    {msg.attachments.map((att) => (
                      <div key={att.slug} className="flex items-center gap-1 text-[10px] text-[color:var(--ds-text-muted)]">
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
                      className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--brand-primary)] hover:border-[color:var(--brand-primary)] transition-all"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {c.title}
                      <ExternalLink size={8} />
                    </a>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-[color:var(--ds-text-subtle)] flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <Clock size={8} />
                  {new Date(msg.timestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                </span>
                {msg.role === "assistant" && msg.content && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(msg.content);
                      setCopiedId(msg.id);
                      setTimeout(() => setCopiedId(null), 2000);
                    }}
                    className="flex items-center gap-1 hover:text-[color:var(--ds-text)] transition-colors"
                    title="Antwort kopieren"
                  >
                    {copiedId === msg.id ? <Check size={8} className="text-emerald-600" /> : <Copy size={8} />}
                    {copiedId === msg.id ? "Kopiert" : "Kopieren"}
                  </button>
                )}
              </div>
            </div>
            {msg.role === "user" && (
              <div className="w-9 h-9 rounded-xl bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] flex items-center justify-center shrink-0 mt-0.5">
                <User size={15} className="text-[color:var(--ds-text-muted)]" />
              </div>
            )}
          </div>
        ))}

        {loading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-3 msg-in">
            <div className="w-9 h-9 rounded-xl brand-bg flex items-center justify-center shrink-0 shadow-sm">
              <Bot size={15} className="text-white" />
            </div>
            <div className="text-sm text-[color:var(--ds-text-muted)] flex items-center gap-2 py-2">
              Denke nach
              <span className="flex gap-0.5">
                <span className="typing-dot w-1 h-1 rounded-full bg-[color:var(--ds-text-muted)]" />
                <span className="typing-dot w-1 h-1 rounded-full bg-[color:var(--ds-text-muted)]" />
                <span className="typing-dot w-1 h-1 rounded-full bg-[color:var(--ds-text-muted)]" />
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="px-6 pb-6 pt-4 border-t border-[color:var(--ds-border)] space-y-2.5 shrink-0">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((att) => (
              <div key={att.slug} className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg brand-soft border brand-border brand-text">
                <FileText size={10} /> {att.name}
                <button onClick={() => setAttachments((a) => a.filter((x) => x.slug !== att.slug))} className="brand-text hover:text-red-600 transition-colors"><X size={10} /></button>
              </div>
            ))}
          </div>
        )}
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex items-end gap-2">
          <label className="shrink-0 p-2.5 rounded-xl bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] text-[color:var(--ds-text-muted)] hover:text-[color:var(--brand-primary)] hover:border-[color:var(--brand-primary)] cursor-pointer transition-all" title="Dokument hochladen">
            <Upload size={16} />
            <input type="file" className="hidden" onChange={handleFileUpload} />
          </label>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            rows={1}
            placeholder="Frage stellen oder Dokument analysieren…"
            className="flex-1 bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-xl px-4 py-2.5 text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none focus:border-[color:var(--brand-primary)] resize-none min-h-[40px] max-h-[120px] transition-colors"
          />
          <Button onClick={sendMessage} disabled={loading || (!input.trim() && attachments.length === 0)} variant="glow" className="shrink-0 h-10 w-10 p-0">
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
