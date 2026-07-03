"use client";

// Conversation Showreel — auto-playing multi-turn chat simulation
// that demonstrates a real lawyer workflow (case prep → contradiction
// detection → reply brief drafting). After the showreel completes,
// reveals an interactive input so visitors can try the brain themselves.
// Respects prefers-reduced-motion (all turns shown immediately).

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useInView } from "framer-motion";
import { FileText, RotateCcw, Send, Loader2 } from "lucide-react";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import type { Lang } from "@/content/site";
import { EASE } from "./motion-system";

interface Turn {
  question: string;
  answer: string;
  sources: string[];
}

export interface ConversationShowreelProps {
  lang: Lang;
  turns: Turn[];
  youLabel: string;
  sourcesLabel: string;
  windowTitle: string;
  demoQ: string;
  demoA: string;
  demoSourcesLabel: string;
  demoSources: readonly string[];
}

function renderStrongText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold [color:var(--mk-text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

// ---- ShowreelTurn — single turn with auto-playing animation ----

function ShowreelTurn({
  turn,
  reduce,
  youLabel,
  sourcesLabel,
  thinkingLabel,
  onComplete,
}: {
  turn: Turn;
  reduce: boolean | null;
  youLabel: string;
  sourcesLabel: string;
  thinkingLabel: string;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<"thinking" | "typing" | "sources" | "done">(
    reduce ? "done" : "thinking"
  );
  const [displayed, setDisplayed] = useState(reduce ? turn.answer : "");
  const [showSources, setShowSources] = useState(reduce ? true : false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (reduce) return;

    const t1 = setTimeout(() => {
      setPhase("typing");
      let i = 0;
      intervalRef.current = setInterval(() => {
        i++;
        setDisplayed(turn.answer.slice(0, i));
        if (i >= turn.answer.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          setPhase("sources");
          setShowSources(true);
          timeoutRef.current = setTimeout(
            () => {
              setPhase("done");
              if (!completedRef.current) {
                completedRef.current = true;
                onComplete();
              }
            },
            600 + turn.sources.length * 120
          );
        }
      }, 15);
    }, 800);

    return () => {
      clearTimeout(t1);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [turn, reduce, onComplete]);

  return (
    <div className="space-y-3">
      {/* User question — right aligned */}
      <motion.div
        initial={reduce ? false : { opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: EASE.out }}
        className="flex items-start justify-end gap-3"
      >
        <p className="max-w-[80%] rounded-2xl rounded-tr-sm border [border-color:var(--brand-border)] bg-[var(--brand-soft)] px-3.5 py-2.5 text-sm leading-relaxed [color:var(--brand-text)]">
          {turn.question}
        </p>
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--brand-primary)]/25 bg-[var(--brand-primary)]/12">
          <span className="brand-text text-xs font-semibold">{youLabel}</span>
        </div>
      </motion.div>

      {/* Subsumio answer — left aligned */}
      <motion.div
        initial={reduce ? false : { opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: EASE.out, delay: reduce ? 0 : 0.15 }}
        className="flex items-start gap-3"
      >
        <SubsumioMark size={28} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          {/* Thinking dots */}
          {!reduce && phase === "thinking" && (
            <span className="inline-flex items-center gap-1 text-xs [color:var(--mk-text-subtle)]">
              {thinkingLabel.split("").map((char, ci) => (
                <motion.span
                  key={ci}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: ci * 0.03,
                    ease: "easeInOut",
                  }}
                >
                  {char === " " ? "\u00A0" : char}
                </motion.span>
              ))}
            </span>
          )}

          {/* Typewriter answer */}
          {(reduce || phase !== "thinking") && (
            <div className="text-[0.925rem] leading-relaxed [color:var(--mk-text-muted)]">
              {displayed}
              {!reduce && phase === "typing" && displayed.length < turn.answer.length && (
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
                  className="ml-0.5 inline-block h-3.5 w-[3px] bg-[var(--brand-primary)] align-text-bottom"
                />
              )}
            </div>
          )}

          {/* Source pills */}
          {showSources && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs [color:var(--mk-text-muted)] opacity-60">
                {sourcesLabel}
              </span>
              {turn.sources.map((src, i) => (
                <motion.span
                  key={src}
                  initial={reduce ? false : { opacity: 0, y: 4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    delay: reduce ? 0 : i * 0.12,
                    duration: 0.3,
                    type: "spring",
                    stiffness: 180,
                    damping: 14,
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--brand-soft)] px-2 py-0.5 font-mono text-xs [color:var(--brand-text)]"
                >
                  <FileText size={10} />
                  {src}
                </motion.span>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ---- Main component ----

export default function ConversationShowreel({
  lang,
  turns,
  youLabel,
  sourcesLabel,
  windowTitle,
  demoQ,
  demoA,
  demoSourcesLabel,
  demoSources,
}: ConversationShowreelProps) {
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { once: true, margin: "-15%" });
  const [activeTurns, setActiveTurns] = useState(0);
  const [showInteractive, setShowInteractive] = useState(false);
  const [playKey, setPlayKey] = useState(0);

  // Interactive input state
  const [input, setInput] = useState(demoQ);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const thinkingLabel = lang === "en" ? "Searching knowledge graph…" : "Durchsuche Wissensgraph…";
  const tryYourselfLabel = lang === "en" ? "Try it yourself" : "Jetzt selbst fragen";
  const replayLabel = lang === "en" ? "Watch again" : "Nochmal ansehen";
  const scriptedLabel =
    lang === "en"
      ? "Example answer · live brain after deploy"
      : "Beispiel-Antwort · Live-Brain nach Deploy";
  const rateLabel =
    lang === "en"
      ? "Demo limit reached — try again later."
      : "Demo-Limit erreicht — später erneut.";
  const askLabel = lang === "en" ? "Ask" : "Fragen";
  const placeholderLabel = lang === "en" ? "Ask the demo brain…" : "Frag das Demo-Brain…";

  // Start showreel when in view
  useEffect(() => {
    if (!inView) return;
    if (reduce || turns.length === 0) {
      setActiveTurns(turns.length);
      setShowInteractive(true);
      return;
    }
    setActiveTurns(0);
    setShowInteractive(false);
    setAnswer(null);
    setNote(null);
    setInput(demoQ);
    const t = setTimeout(() => setActiveTurns(1), 400);
    return () => clearTimeout(t);
  }, [inView, playKey, reduce, turns.length, demoQ]);

  const handleTurnComplete = useCallback(() => {
    setActiveTurns((prev) => {
      if (prev >= turns.length) {
        setTimeout(() => setShowInteractive(true), 600);
        return prev;
      }
      return prev + 1;
    });
  }, [turns.length]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [activeTurns, showInteractive, answer]);

  const handleReplay = () => {
    setShowInteractive(false);
    setActiveTurns(0);
    setAnswer(null);
    setNote(null);
    setInput(demoQ);
    setPlayKey((k) => k + 1);
  };

  async function ask() {
    const query = input.trim();
    if (!query || loading) return;
    setLoading(true);
    setAnswer(null);
    setNote(null);
    try {
      const res = await fetch(`/api/demo?q=${encodeURIComponent(query)}`);
      if (res.status === 429) {
        setNote(rateLabel);
        return;
      }
      const data = await res.json();
      if (data?.configured && Array.isArray(data.results) && data.results.length > 0) {
        setAnswer(
          data.results
            .map(
              (r: {
                snippet?: string;
                chunk_text?: string;
                text?: string;
                evidence?: string;
                title?: string;
              }) => r.snippet || r.chunk_text || r.text || r.evidence || r.title
            )
            .join("\n\n")
        );
      } else {
        setAnswer(demoA);
        setNote(scriptedLabel);
      }
    } catch {
      setAnswer(demoA);
      setNote(scriptedLabel);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-2xl border [border-color:var(--mk-border)] text-left shadow-2xl shadow-black/20 [background:var(--mk-surface)]"
      role="region"
      aria-label={lang === "en" ? "Product demo conversation" : "Produkt-Demo Konversation"}
    >
      {/* Window header */}
      <div className="flex items-center gap-2 border-b [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-bg)]">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
        </div>
        <div className="ml-3 flex items-center gap-1.5 font-mono text-xs [color:var(--mk-text-muted)]">
          <SubsumioMark size={14} />
          <span>{windowTitle}</span>
        </div>
        {/* Progress dots */}
        <div className="ml-auto flex items-center gap-1.5">
          {turns.map((_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full transition-colors duration-300"
              style={{
                background: i < activeTurns ? "var(--brand-primary)" : "var(--mk-border)",
              }}
            />
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div ref={chatRef} className="max-h-[520px] space-y-6 overflow-y-auto px-5 py-5">
        {turns.slice(0, activeTurns).map((turn, i) => (
          <ShowreelTurn
            key={`${playKey}-${i}`}
            turn={turn}
            reduce={reduce}
            youLabel={youLabel}
            sourcesLabel={sourcesLabel}
            thinkingLabel={thinkingLabel}
            onComplete={handleTurnComplete}
          />
        ))}

        {/* Interactive input after showreel */}
        {showInteractive && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE.out }}
            className="space-y-3"
          >
            {/* Divider */}
            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1 [background:var(--mk-border)]" />
              <span className="text-xs font-medium [color:var(--mk-text-subtle)]">
                {tryYourselfLabel}
              </span>
              <div className="h-px flex-1 [background:var(--mk-border)]" />
            </div>

            {/* Input */}
            <div className="flex items-end gap-2 rounded-xl border [border-color:var(--mk-border)] px-3 py-2 transition-colors [background:var(--mk-bg)] focus-within:[border-color:var(--brand-border)]">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
                rows={2}
                placeholder={placeholderLabel}
                aria-label={placeholderLabel}
                className="flex-1 resize-none bg-transparent text-sm leading-relaxed [color:var(--mk-text)] placeholder:[color:var(--mk-text-subtle)] focus:outline-none"
              />
              <button
                onClick={ask}
                disabled={loading || !input.trim()}
                aria-label={askLabel}
                className="brand-bg inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-40"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>

            {/* Answer from interactive query */}
            {answer && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="flex items-start gap-3"
              >
                <SubsumioMark size={28} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[0.925rem] leading-relaxed whitespace-pre-line [color:var(--mk-text-muted)]">
                    {renderStrongText(answer)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs [color:var(--mk-text-muted)] opacity-60">
                      {demoSourcesLabel}
                    </span>
                    {demoSources.map((slug) => (
                      <span
                        key={slug}
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--brand-soft)] px-2 py-0.5 font-mono text-xs [color:var(--brand-text)]"
                      >
                        <FileText size={10} />
                        {slug}
                      </span>
                    ))}
                  </div>
                  {note && <p className="mt-1.5 text-xs [color:var(--signal-amber)]">{note}</p>}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>

      {/* Footer with replay */}
      {showInteractive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="flex items-center justify-center border-t [border-color:var(--mk-border)] px-5 py-3 [background:var(--mk-bg)]"
        >
          <button
            onClick={handleReplay}
            className="inline-flex items-center gap-1.5 text-xs font-medium [color:var(--mk-text-muted)] transition-colors hover:[color:var(--brand-text)]"
          >
            <RotateCcw size={12} />
            {replayLabel}
          </button>
        </motion.div>
      )}
    </div>
  );
}
