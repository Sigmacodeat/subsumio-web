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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf";
import { useMe } from "@/lib/queries/auth";
import { ModelSelector } from "@/components/dashboard/model-selector";
import { AIBadge, GroundingStatus } from "@/components/legal/CitationLink";
import { QUERY_MODE_LABELS, type QueryMode } from "@/lib/matter-context-types";

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
      className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] px-2.5 py-1 font-mono text-xs text-[color:var(--ds-text-muted)] transition-all hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--brand-primary)]"
    >
      <FileText size={11} className="shrink-0" />
      {slug}
    </a>
  );
}

function AssistantMessage({ msg }: { msg: Message }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group msg-in flex items-start gap-3">
      <div className="brand-bg relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm">
        <Brain size={15} className="text-white" />
        {msg.isStreaming && (
          <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-[color:var(--ds-bg)] bg-emerald-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2">
          <span className="brand-text text-xs font-semibold">Subsumio</span>
          {msg.isStreaming ? (
            <span className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
              antwortet
              <span className="flex gap-0.5">
                <span className="typing-dot h-1 w-1 rounded-full bg-[color:var(--ds-text-muted)]" />
                <span className="typing-dot h-1 w-1 rounded-full bg-[color:var(--ds-text-muted)]" />
                <span className="typing-dot h-1 w-1 rounded-full bg-[color:var(--ds-text-muted)]" />
              </span>
            </span>
          ) : (
            // EU AI Act Art. 50 + Grounding status — unified badge components
            <>
              <AIBadge />
              <GroundingStatus citations={msg.citations} gaps={msg.gaps} />
            </>
          )}
        </div>

        <div className="card-shadow rounded-2xl rounded-tl-md border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--ds-text)]">
          {msg.content}
          {msg.isStreaming && (
            <span className="brand-bg ml-0.5 inline-block h-4 w-0.5 animate-pulse align-text-bottom" />
          )}
        </div>

        {/* Citations */}
        {msg.citations && msg.citations.length > 0 && (
          <div className="mt-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <FileText size={12} className="text-[color:var(--ds-text-muted)]" />
              <span className="text-xs font-medium text-[color:var(--ds-text-muted)]">
                Quellen ({msg.citations.length})
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {msg.citations.map((c) => (
                <CitationPill key={c.slug} slug={c.slug} title={c.title} />
              ))}
            </div>
          </div>
        )}

        {/* Gaps — legal-specific categorization */}
        {msg.gaps && msg.gaps.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <AlertCircle size={13} className="text-amber-600" />
              <span className="text-xs font-medium text-amber-600">Lücken im Brain</span>
            </div>
            <div className="space-y-2">
              {msg.gaps.map((gap, i) => {
                const lower = gap.toLowerCase();
                const cat =
                  lower.includes("frist") || lower.includes("termin") || lower.includes("deadline")
                    ? {
                        label: "Frist",
                        icon: CalendarClock,
                        color: "text-red-600",
                        bg: "bg-red-500/5",
                        border: "border-red-500/20",
                      }
                    : lower.includes("gesetz") ||
                        lower.includes("norm") ||
                        lower.includes("§") ||
                        lower.includes("paragraph") ||
                        lower.includes("bgb") ||
                        lower.includes("zpo") ||
                        lower.includes("abgb") ||
                        lower.includes("avg")
                      ? {
                          label: "Norm",
                          icon: BookOpen,
                          color: "text-blue-600",
                          bg: "bg-blue-500/5",
                          border: "border-blue-500/20",
                        }
                      : lower.includes("urteil") ||
                          lower.includes("entscheidung") ||
                          lower.includes("rspr") ||
                          lower.includes("rechtsprechung")
                        ? {
                            label: "Rechtsprechung",
                            icon: Landmark,
                            color: "brand-text",
                            bg: "brand-soft/5",
                            border: "brand-border",
                          }
                        : lower.includes("beweis") ||
                            lower.includes("zeug") ||
                            lower.includes("gutachten")
                          ? {
                              label: "Beweis",
                              icon: FileWarning,
                              color: "text-orange-600",
                              bg: "bg-orange-500/5",
                              border: "border-orange-500/20",
                            }
                          : lower.includes("dokument") ||
                              lower.includes("schriftst") ||
                              lower.includes("vertrag")
                            ? {
                                label: "Dokument",
                                icon: FileText,
                                color: "text-gray-400",
                                bg: "bg-gray-500/5",
                                border: "border-gray-500/20",
                              }
                            : lower.includes("risiko") ||
                                lower.includes("haftung") ||
                                lower.includes("strafe") ||
                                lower.includes("versto")
                              ? {
                                  label: "Risiko",
                                  icon: ShieldAlert,
                                  color: "text-rose-600",
                                  bg: "bg-rose-500/5",
                                  border: "border-rose-500/20",
                                }
                              : {
                                  label: "Allgemein",
                                  icon: Scale,
                                  color: "text-amber-600",
                                  bg: "bg-amber-500/5",
                                  border: "border-amber-500/20",
                                };
                const Icon = cat.icon;
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-2 rounded-lg border px-2.5 py-2",
                      cat.bg,
                      cat.border
                    )}
                  >
                    <Icon size={12} className={cn("mt-0.5 shrink-0", cat.color)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="default"
                          className={cn("border text-xs", cat.bg, cat.color, cat.border)}
                        >
                          {cat.label}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                        {gap}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        {!msg.isStreaming && (
          <div className="mt-2 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={copy}
              className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-text)]"
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
    } catch {
      /* noop */
    }
  }, []);

  const [queryMode, setQueryMode] = useState<"conservative" | "balanced" | "tokenmax">("balanced");
  const [superbrainMode, setSuperbrainMode] = useState<QueryMode>("balanced");
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [showSuperbrainMenu, setShowSuperbrainMenu] = useState(false);
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
        body: JSON.stringify({
          query: userMsg.content,
          mode: queryMode,
          query_mode: superbrainMode,
          ...(modelOverride && modelOverride !== "auto" ? { model: modelOverride } : {}),
        }),
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
                  prev.map((m) => (m.id === assistantId ? { ...m, content: fullContent } : m))
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
        prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unbekannter Fehler";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `❌ Fehler: ${errMsg}\n\nStarte die Subsumio Engine mit: \`subsumio init && subsumio serve\``,
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--ds-border)] px-4 py-4 md:px-6">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight text-[color:var(--ds-text)]">
            Brain Query
          </h1>
          <p className="mt-1 hidden text-xs leading-relaxed text-[color:var(--ds-text-muted)] sm:block">
            KI-Synthese mit Wissensgraph
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {/* Model selector (per-query override) */}
          <ModelSelector selectedModelId={modelOverride} onSelect={setModelOverride} />

          {/* Mode selector */}
          <div className="relative">
            <button
              onClick={() => setShowModeMenu(!showModeMenu)}
              className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-all hover:border-[color:var(--ds-border-strong)] hover:text-[color:var(--ds-text)]"
            >
              <Settings2 size={12} />
              {MODE_LABELS[queryMode].label}
              <ChevronDown size={11} />
            </button>
            {showModeMenu && (
              <div className="card-shadow-elevated absolute top-full right-0 z-50 mt-1 w-52 overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
                {(
                  Object.entries(MODE_LABELS) as [
                    typeof queryMode,
                    (typeof MODE_LABELS)[typeof queryMode],
                  ][]
                ).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setQueryMode(key);
                      setShowModeMenu(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--ds-hover)]",
                      queryMode === key && "brand-soft"
                    )}
                  >
                    <div className="flex-1">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          queryMode === key ? "brand-text" : "text-[color:var(--ds-text)]"
                        )}
                      >
                        {val.label}
                      </p>
                      <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">{val.desc}</p>
                    </div>
                    {queryMode === key && (
                      <Check size={14} className="brand-text mt-0.5 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Superbrain Mode selector */}
          <div className="relative">
            <button
              onClick={() => setShowSuperbrainMenu(!showSuperbrainMenu)}
              className="flex items-center gap-2 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-3 py-1.5 text-xs text-[color:var(--ds-text-muted)] transition-all hover:border-[color:var(--ds-border-strong)] hover:text-[color:var(--ds-text)]"
            >
              <Brain size={12} />
              {QUERY_MODE_LABELS[superbrainMode].label}
              <ChevronDown size={11} />
            </button>
            {showSuperbrainMenu && (
              <div className="card-shadow-elevated absolute top-full right-0 z-50 mt-1 w-56 overflow-hidden rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)]">
                {(
                  Object.entries(QUERY_MODE_LABELS) as [
                    QueryMode,
                    (typeof QUERY_MODE_LABELS)[QueryMode],
                  ][]
                ).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setSuperbrainMode(key);
                      setShowSuperbrainMenu(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--ds-hover)]",
                      superbrainMode === key && "brand-soft"
                    )}
                  >
                    <div className="flex-1">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          superbrainMode === key ? "brand-text" : "text-[color:var(--ds-text)]"
                        )}
                      >
                        {val.label}
                      </p>
                      <p className="mt-0.5 text-xs text-[color:var(--ds-text-muted)]">
                        {val.description}
                      </p>
                    </div>
                    {superbrainMode === key && (
                      <Check size={14} className="brand-text mt-0.5 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {messages.length > 0 && (
            <Button variant="ghost" size="icon" onClick={() => setMessages([])} title="Chat leeren">
              <Trash2 size={14} className="text-[color:var(--ds-text-muted)]" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6 md:px-6 md:py-8">
        {isEmpty ? (
          <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center">
            <div className="brand-soft brand-border mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border">
              <Brain size={28} className="brand-text" />
            </div>
            <h2 className="mb-2 text-xl font-bold tracking-tight text-[color:var(--ds-text)]">
              Was möchtest du wissen?
            </h2>
            <p className="mb-8 text-sm leading-relaxed text-[color:var(--ds-text-muted)]">
              Stelle natürlichsprachliche Fragen. Subsumio synthesiert Antworten aus deinem Brain
              mit Quellen-Zitaten und zeigt dir, was es noch nicht weiß.
            </p>

            <div className="w-full space-y-2">
              <div className="mb-3 flex items-center gap-2">
                <Lightbulb size={13} className="text-amber-600" />
                <span className="text-xs font-semibold tracking-[0.08em] text-[color:var(--ds-text-subtle)] uppercase">
                  Beispiel-Queries
                </span>
              </div>
              {examples.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput(q);
                    inputRef.current?.focus();
                  }}
                  className="w-full rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-4 py-3.5 text-left text-sm text-[color:var(--ds-text-muted)] transition-all hover:border-[color:var(--brand-primary)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
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
                <div className="flex items-start justify-end gap-3">
                  <div className="brand-soft brand-border max-w-[80%] rounded-2xl rounded-tr-md border px-4 py-3 text-sm text-[color:var(--ds-text)]">
                    {msg.content}
                  </div>
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] text-xs font-semibold text-[color:var(--ds-text-muted)]">
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
      <div className="shrink-0 border-t border-[color:var(--ds-border)] px-4 pt-4 pb-4 md:px-6 md:pb-6">
        <div className="card-shadow relative flex items-end gap-3 rounded-2xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3 transition-colors focus-within:border-[color:var(--brand-primary)]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Frage dein Brain…"
            rows={1}
            className="max-h-36 min-h-[24px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-[color:var(--ds-text)] placeholder:text-[color:var(--ds-text-subtle)] focus:outline-none"
            style={{ height: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 144) + "px";
            }}
          />
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-[color:var(--ds-text-muted)]">
              <Badge variant="default" className="text-xs">
                {MODE_LABELS[queryMode].label}
              </Badge>
              <Badge variant="default" className="brand-soft brand-text brand-border text-xs">
                {QUERY_MODE_LABELS[superbrainMode].label}
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
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Send size={14} />
              )}
            </Button>
          </div>
        </div>
        <p className="mt-2.5 text-center text-xs text-[color:var(--ds-text-subtle)]">
          Enter zum Senden · Shift+Enter für Zeilenumbruch
        </p>
      </div>
    </div>
  );
}
