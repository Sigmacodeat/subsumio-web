"use client";

import { useState, useRef, useEffect } from "react";
import {
  Brain,
  Send,
  Trash2,
  Settings2,
  Copy,
  Check,
  AlertCircle,
  FileText,
  Lightbulb,
  ChevronDown,
  Scale,
  CalendarClock,
  BookOpen,
  Landmark,
  FileWarning,
  ShieldAlert,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";
import { useMe } from "@/lib/queries/auth";
import { AI_BADGE_LABEL } from "@/lib/ai-act";
import { assessGroundedness } from "@/lib/groundedness";
import { ModelSelector } from "@/components/dashboard/model-selector";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: { slug: string; title: string; quote: string }[];
  gaps?: string[];
  isStreaming?: boolean;
  createdAt: Date;
}

// Default examples + vertical-tuned sets. The signup industry (User.industry)
// picks the set — the same account drives web, PWA and the future store apps,
// so personalization follows the user to every device automatically.
const EXAMPLE_QUERIES = [
  "Was muss ich vor dem nächsten Meeting wissen?",
  "Welche offenen Punkte gibt es mit Kunde X?",
  "Zeige mir alle Entscheidungen aus dem letzten Quartal",
  "Wer arbeitet an Projekt Y und was ist der Status?",
  "Was sind die wichtigsten Risiken in meinem Brain?",
];

const INDUSTRY_QUERIES: Record<string, string[]> = {
  legal: [
    "Wo widersprechen sich die Aussagen der Gegenseite in dieser Akte?",
    "Welche Fristen stehen in den zuletzt hochgeladenen Schriftsätzen?",
    "Was wissen wir über den Sachverhalt im Mandat X — mit Fundstellen?",
    "Welche Zusagen haben wir dem Mandanten zuletzt gemacht?",
    "Was fehlt in dieser Akte noch für die Klageerwiderung?",
  ],
};

const MODE_LABELS = {
  conservative: { label: "Präzise", desc: "Weniger Tokens, höhere Präzision" },
  balanced: { label: "Balanced", desc: "Optimal für die meisten Queries" },
  tokenmax: { label: "Deep", desc: "Mehr Kontext, mehr Vollständigkeit" },
};

function CitationPill({ slug, title }: { slug: string; title: string }) {
  return (
    <a
      href={`/dashboard/brain/${encodeURIComponent(slug)}`}
      title={title}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-xs text-[color:var(--ds-text-muted)] hover:border-[color:var(--brand-primary)] hover:text-[color:var(--brand-primary)] hover:bg-[color:var(--ds-hover)] transition-all font-mono"
    >
      <FileText size={11} className="shrink-0" />
      {slug}
    </a>
  );
}

function AssistantMessage({ msg }: { msg: Message }) {
  const [copied, setCopied] = useState(false);
  const ground = assessGroundedness(msg.citations, msg.gaps);

  const copy = async () => {
    await navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-start gap-3 group msg-in">
      <div className="w-9 h-9 rounded-xl brand-bg flex items-center justify-center shrink-0 mt-0.5 relative shadow-sm">
        <Brain size={15} className="text-white" />
        {msg.isStreaming && (
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[color:var(--ds-bg)] animate-pulse" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold brand-text">Subsumio</span>
          {msg.isStreaming ? (
            <span className="text-xs text-[color:var(--ds-text-muted)] flex items-center gap-1">
              antwortet
              <span className="flex gap-0.5">
                <span className="typing-dot w-1 h-1 rounded-full bg-[color:var(--ds-text-muted)]" />
                <span className="typing-dot w-1 h-1 rounded-full bg-[color:var(--ds-text-muted)]" />
                <span className="typing-dot w-1 h-1 rounded-full bg-[color:var(--ds-text-muted)]" />
              </span>
            </span>
          ) : (
            // EU AI Act Art. 50: KI-synthetisierte Antwort sichtbar kennzeichnen.
            <>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 text-[10px] font-medium">
                {AI_BADGE_LABEL}
              </span>
              {/* Quellendeckung: Hallucinations-Vorsicht-Signal, keine Korrektheits-Garantie. */}
              <span
                title={ground.hint}
                aria-label={`Quellendeckung: ${ground.label}. ${ground.hint}`}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium cursor-help",
                  ground.cls
                )}
              >
                <Gauge size={10} aria-hidden="true" />
                {ground.label}
                {ground.citationCount > 0 && (
                  <span className="opacity-70">· {ground.citationCount}</span>
                )}
              </span>
            </>
          )}
        </div>

        <div className="text-sm text-[color:var(--ds-text)] leading-relaxed whitespace-pre-wrap bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-2xl rounded-tl-md p-4 card-shadow">
          {msg.content}
          {msg.isStreaming && (
            <span className="inline-block w-0.5 h-4 brand-bg animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>

        {/* Citations */}
        {msg.citations && msg.citations.length > 0 && (
          <div className="mt-3 p-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)]">
            <div className="flex items-center gap-1.5 mb-2">
              <FileText size={12} className="text-[color:var(--ds-text-muted)]" />
              <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">Quellen ({msg.citations.length})</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {msg.citations.map((c) => (
                <CitationPill key={c.slug} slug={c.slug} title={c.title} />
              ))}
            </div>
          </div>
        )}

        {/* Gaps — legal-specific categorization */}
        {msg.gaps && msg.gaps.length > 0 && (
          <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertCircle size={13} className="text-amber-600" />
              <span className="text-xs font-medium text-amber-600">Lücken im Brain</span>
            </div>
            <div className="space-y-2">
              {msg.gaps.map((gap, i) => {
                const lower = gap.toLowerCase();
                const cat = lower.includes("frist") || lower.includes("termin") || lower.includes("deadline")
                  ? { label: "Frist", icon: CalendarClock, color: "text-red-600", bg: "bg-red-500/5", border: "border-red-500/20" }
                  : lower.includes("gesetz") || lower.includes("norm") || lower.includes("§") || lower.includes("paragraph") || lower.includes("bgb") || lower.includes("zpo") || lower.includes("abgb") || lower.includes("avg")
                  ? { label: "Norm", icon: BookOpen, color: "text-blue-600", bg: "bg-blue-500/5", border: "border-blue-500/20" }
                  : lower.includes("urteil") || lower.includes("entscheidung") || lower.includes("rspr") || lower.includes("rechtsprechung")
                  ? { label: "Rechtsprechung", icon: Landmark, color: "brand-text", bg: "brand-soft/5", border: "brand-border" }
                  : lower.includes("beweis") || lower.includes("zeug") || lower.includes("gutachten")
                  ? { label: "Beweis", icon: FileWarning, color: "text-orange-600", bg: "bg-orange-500/5", border: "border-orange-500/20" }
                  : lower.includes("dokument") || lower.includes("schriftst") || lower.includes("vertrag")
                  ? { label: "Dokument", icon: FileText, color: "text-gray-400", bg: "bg-gray-500/5", border: "border-gray-500/20" }
                  : lower.includes("risiko") || lower.includes("haftung") || lower.includes("strafe") || lower.includes("versto")
                  ? { label: "Risiko", icon: ShieldAlert, color: "text-rose-600", bg: "bg-rose-500/5", border: "border-rose-500/20" }
                  : { label: "Allgemein", icon: Scale, color: "text-amber-600", bg: "bg-amber-500/5", border: "border-amber-500/20" };
                const Icon = cat.icon;
                return (
                  <div key={i} className={cn("flex items-start gap-2 rounded-lg border px-2.5 py-2", cat.bg, cat.border)}>
                    <Icon size={12} className={cn("shrink-0 mt-0.5", cat.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="default" className={cn("text-[10px] border", cat.bg, cat.color, cat.border)}>
                          {cat.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-[color:var(--ds-text-muted)] mt-0.5 leading-relaxed">{gap}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        {!msg.isStreaming && (
          <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
            <button
              onClick={copy}
              className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] hover:text-[color:var(--ds-text)] transition-colors"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? "Kopiert" : "Kopieren"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function QueryPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [examples, setExamples] = useState<string[]>(EXAMPLE_QUERIES);

  const meQuery = useMe();

  useEffect(() => {
    const industry: string | undefined = meQuery.data?.user?.industry;
    if (industry && INDUSTRY_QUERIES[industry]) setExamples(INDUSTRY_QUERIES[industry]);
  }, [meQuery.data]);

  useEffect(() => {
    // Deep-link prefill: vertical workspace pages link here with ?q=<prompt>.
    // window.location avoids a useSearchParams Suspense boundary.
    try {
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) setInput(q);
    } catch { /* noop */ }
  }, []);

  const [queryMode, setQueryMode] = useState<"conservative" | "balanced" | "tokenmax">("balanced");
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [modelOverride, setModelOverride] = useState<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      createdAt: new Date(),
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await csrfFetch("/api/think", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMsg.content, mode: queryMode, ...(modelOverride && modelOverride !== "auto" ? { model: modelOverride } : {}) }),
      });

      if (!res.ok || !res.body) {
        throw new Error("API nicht verfügbar — stelle sicher, dass die Subsumio Engine läuft.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                throw new Error(parsed.error as string);
              }
              if (parsed.chunk) {
                fullContent += parsed.chunk;
                setMessages((prev) =>
                  prev.map((m) => m.id === assistantId ? { ...m, content: fullContent } : m)
                );
              }
              if (parsed.citations || parsed.gaps) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, citations: parsed.citations, gaps: parsed.gaps }
                      : m
                  )
                );
              }
            } catch {}
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, isStreaming: false } : m)
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unbekannter Fehler";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `❌ Fehler: ${errMsg}\n\nStarte die Subsumio Engine mit: \`gbrain init && gbrain serve\``,
                isStreaming: false,
                gaps: ["Subsumio Engine nicht erreichbar (localhost:3001)"],
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 md:px-6 py-4 border-b border-[color:var(--ds-border)] shrink-0">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-[color:var(--ds-text)] tracking-tight">Brain Query</h1>
          <p className="text-xs text-[color:var(--ds-text-muted)] mt-1 leading-relaxed hidden sm:block">KI-Synthese mit Wissensgraph</p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Model selector (per-query override) */}
          <ModelSelector selectedModelId={modelOverride} onSelect={setModelOverride} />

          {/* Mode selector */}
          <div className="relative">
            <button
              onClick={() => setShowModeMenu(!showModeMenu)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-xs text-[color:var(--ds-text-muted)] hover:border-[color:var(--ds-border-strong)] hover:text-[color:var(--ds-text)] transition-all"
            >
              <Settings2 size={12} />
              {MODE_LABELS[queryMode].label}
              <ChevronDown size={11} />
            </button>
            {showModeMenu && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-xl card-shadow-elevated z-50 overflow-hidden">
                {(Object.entries(MODE_LABELS) as [typeof queryMode, typeof MODE_LABELS[typeof queryMode]][]).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => { setQueryMode(key); setShowModeMenu(false); }}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[color:var(--ds-hover)] transition-colors",
                      queryMode === key && "brand-soft"
                    )}
                  >
                    <div className="flex-1">
                      <p className={cn("text-sm font-medium", queryMode === key ? "brand-text" : "text-[color:var(--ds-text)]")}>
                        {val.label}
                      </p>
                      <p className="text-xs text-[color:var(--ds-text-muted)] mt-0.5">{val.desc}</p>
                    </div>
                    {queryMode === key && <Check size={14} className="brand-text shrink-0 mt-0.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMessages([])}
              title="Chat leeren"
            >
              <Trash2 size={14} className="text-[color:var(--ds-text-muted)]" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-2xl brand-soft border brand-border flex items-center justify-center mb-6">
              <Brain size={28} className="brand-text" />
            </div>
            <h2 className="text-xl font-bold text-[color:var(--ds-text)] mb-2 tracking-tight">Was möchtest du wissen?</h2>
            <p className="text-sm text-[color:var(--ds-text-muted)] mb-8 leading-relaxed">
              Stelle natürlichsprachliche Fragen. Subsumio synthesiert Antworten aus deinem Brain mit Quellen-Zitaten und zeigt dir, was es noch nicht weiß.
            </p>

            <div className="w-full space-y-2">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={13} className="text-amber-600" />
                <span className="text-[10px] text-[color:var(--ds-text-subtle)] font-semibold uppercase tracking-[0.08em]">Beispiel-Queries</span>
              </div>
              {examples.map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  className="w-full text-left px-4 py-3.5 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] text-sm text-[color:var(--ds-text-muted)] hover:border-[color:var(--brand-primary)] hover:text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)] transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="msg-in">
              {msg.role === "user" ? (
                <div className="flex items-start gap-3 justify-end">
                  <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-tr-md brand-soft border brand-border text-sm text-[color:var(--ds-text)]">
                    {msg.content}
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-[color:var(--ds-surface-2)] border border-[color:var(--ds-border)] flex items-center justify-center shrink-0 mt-0.5 text-xs text-[color:var(--ds-text-muted)] font-semibold">
                    Du
                  </div>
                </div>
              ) : (
                <AssistantMessage msg={msg} />
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 px-4 md:px-6 pb-4 md:pb-6 pt-4 border-t border-[color:var(--ds-border)]">
        <div className="relative flex items-end gap-3 bg-[color:var(--ds-surface)] border border-[color:var(--ds-border)] rounded-2xl p-3 focus-within:border-[color:var(--brand-primary)] transition-colors card-shadow">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Frage dein Brain…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] resize-none focus:outline-none leading-relaxed min-h-[24px] max-h-36"
            style={{ height: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 144) + "px";
            }}
          />
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
              <Badge variant="default" className="text-xs">
                {MODE_LABELS[queryMode].label}
              </Badge>
            </div>
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              variant="glow"
              size="icon"
              className="shrink-0"
              aria-label="Senden"
            >
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send size={14} />
              )}
            </Button>
          </div>
        </div>
        <p className="text-xs text-[color:var(--ds-text-subtle)] mt-2.5 text-center">
          Enter zum Senden · Shift+Enter für Zeilenumbruch
        </p>
      </div>
    </div>
  );
}
