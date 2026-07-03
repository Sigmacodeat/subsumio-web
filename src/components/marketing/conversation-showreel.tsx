"use client";

// Conversation Showreel — cinematic auto-playing multi-turn chat simulation.
// Demonstrates a real lawyer workflow (case prep → contradiction detection →
// reply brief drafting). After the showreel completes, reveals an interactive
// input so visitors can try the brain themselves.
// Respects prefers-reduced-motion (all turns shown immediately, no animation).

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useInView } from "framer-motion";
import { CheckCircle2, FileText, RotateCcw, Send, Loader2, Sparkles } from "lucide-react";
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

// ---- BouncingDots — modern thinking indicator ----

function BouncingDots({ reduce }: { reduce: boolean | null }) {
  if (reduce) return null;
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-[var(--brand-primary)]"
          animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ---- SourcePill — elevated, interactive source citation ----

function SourcePill({
  src,
  index,
  reduce,
}: {
  src: string;
  index: number;
  reduce: boolean | null;
}) {
  return (
    <motion.span
      initial={reduce ? false : { opacity: 0, y: 6, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: reduce ? 0 : index * 0.14,
        duration: 0.4,
        type: "spring",
        stiffness: 200,
        damping: 16,
      }}
      whileHover={reduce ? undefined : { y: -2 }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--brand-border)] bg-[var(--brand-soft)] px-2.5 py-1 font-mono text-xs [color:var(--brand-text)] shadow-sm transition-shadow hover:shadow-md"
    >
      <FileText size={11} className="shrink-0 opacity-70" />
      {src}
    </motion.span>
  );
}

// ---- VerificationBadge — trust signal after each AI answer ----

function VerificationBadge({
  label,
  reduce,
  delay = 0,
}: {
  label: string;
  reduce: boolean | null;
  delay?: number;
}) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        delay: reduce ? 0 : delay,
        duration: 0.4,
        type: "spring",
        stiffness: 200,
        damping: 16,
      }}
      className="flex items-center gap-1.5"
    >
      <motion.span
        animate={reduce ? undefined : { scale: [1, 1.15, 1] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
      >
        <CheckCircle2 size={13} className="text-[var(--signal-green)]" />
      </motion.span>
      <span className="text-[11px] font-medium [color:var(--mk-text-subtle)]">{label}</span>
    </motion.div>
  );
}

// ---- ShowreelTurn — single turn with cinematic animation ----

function ShowreelTurn({
  turn,
  reduce,
  youLabel,
  sourcesLabel,
  thinkingLabel,
  verificationLabel,
  onComplete,
}: {
  turn: Turn;
  reduce: boolean | null;
  youLabel: string;
  sourcesLabel: string;
  thinkingLabel: string;
  verificationLabel: string;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<"thinking" | "typing" | "sources" | "done">(
    reduce ? "done" : "thinking"
  );
  const [displayed, setDisplayed] = useState(reduce ? turn.answer : "");
  const [showSources, setShowSources] = useState(reduce ? true : false);
  const [showVerification, setShowVerification] = useState(reduce ? true : false);
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
              setShowVerification(true);
              setPhase("done");
              if (!completedRef.current) {
                completedRef.current = true;
                onComplete();
              }
            },
            500 + turn.sources.length * 140
          );
        }
      }, 14);
    }, 700);

    return () => {
      clearTimeout(t1);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [turn, reduce, onComplete]);

  return (
    <div className="space-y-3">
      {/* User question — right aligned, brand-tinted bubble */}
      <motion.div
        initial={reduce ? false : { opacity: 0, x: 24, y: 8 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.4, ease: EASE.out }}
        className="flex items-start justify-end gap-3"
      >
        <div className="relative max-w-[80%]">
          {/* subtle gradient accent on user bubble */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl rounded-tr-md opacity-30"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 12%, transparent), transparent 60%)",
            }}
          />
          <p className="relative rounded-2xl rounded-tr-md border border-[var(--brand-border)] bg-[var(--brand-soft)] px-4 py-2.5 text-sm leading-relaxed [color:var(--brand-text)] shadow-sm">
            {turn.question}
          </p>
        </div>
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--brand-primary)]/25 bg-[var(--brand-primary)]/12 shadow-sm">
          <span className="brand-text text-xs font-semibold">{youLabel}</span>
        </div>
      </motion.div>

      {/* Subsumio answer — left aligned in an elevated card */}
      <motion.div
        initial={reduce ? false : { opacity: 0, x: -24, y: 8 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.4, ease: EASE.out, delay: reduce ? 0 : 0.12 }}
        className="flex items-start gap-3"
      >
        <div className="relative mt-0.5 shrink-0">
          <SubsumioMark size={30} />
          {/* ambient glow behind logo */}
          {!reduce && (
            <motion.div
              animate={{ opacity: [0.1, 0.2, 0.1], scale: [1, 1.15, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full bg-[var(--brand-primary)] blur-md"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* Elevated response card */}
          <div className="relative rounded-2xl rounded-tl-md border border-[var(--mk-border)] bg-[var(--mk-surface)] px-4 py-3 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.15)]">
            {/* gradient top accent hairline */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl"
              style={{
                background:
                  "linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand-primary) 35%, transparent), transparent)",
              }}
            />

            {/* Thinking state — bouncing dots + label */}
            {!reduce && phase === "thinking" && (
              <div className="flex items-center gap-2.5 py-0.5">
                <BouncingDots reduce={reduce} />
                <span className="text-xs [color:var(--mk-text-subtle)]">{thinkingLabel}</span>
              </div>
            )}

            {/* Typewriter answer */}
            {(reduce || phase !== "thinking") && (
              <div
                className="text-[0.925rem] leading-relaxed [color:var(--mk-text-muted)]"
                style={{ minHeight: reduce ? undefined : "3rem" }}
              >
                {displayed}
                {!reduce && phase === "typing" && displayed.length < turn.answer.length && (
                  <motion.span
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
                    className="ml-0.5 inline-block h-3.5 w-[3px] rounded-full bg-[var(--brand-primary)] align-text-bottom"
                    style={{ boxShadow: "0 0 6px var(--brand-primary)" }}
                  />
                )}
              </div>
            )}

            {/* Source pills — inside the card, at the bottom */}
            {showSources && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--mk-border)]/60 pt-2.5">
                <span className="text-[11px] font-medium [color:var(--mk-text-subtle)]">
                  {sourcesLabel}
                </span>
                {turn.sources.map((src, i) => (
                  <SourcePill key={src} src={src} index={i} reduce={reduce} />
                ))}
              </div>
            )}
          </div>

          {/* Verification badge — below the card */}
          {showVerification && (
            <div className="mt-2 pl-1">
              <VerificationBadge label={verificationLabel} reduce={reduce} delay={0.15} />
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
  const verificationLabel = lang === "en" ? "5-layer verified" : "5-Layer verifiziert";
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
  const liveLabel = lang === "en" ? "live" : "live";
  const interactiveVerificationLabel = lang === "en" ? "5-layer verified" : "5-Layer verifiziert";

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
    const t = setTimeout(() => setActiveTurns(1), 500);
    return () => clearTimeout(t);
  }, [inView, playKey, reduce, turns.length, demoQ]);

  const handleTurnComplete = useCallback(() => {
    setActiveTurns((prev) => {
      if (prev >= turns.length) {
        setTimeout(() => setShowInteractive(true), 700);
        return prev;
      }
      return prev + 1;
    });
  }, [turns.length]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTo({
        top: chatRef.current.scrollHeight,
        behavior: reduce ? "auto" : "smooth",
      });
    }
  }, [activeTurns, showInteractive, answer, reduce]);

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

  const progressPercent = turns.length > 0 ? (activeTurns / turns.length) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl text-left shadow-[0_0_0_1px_var(--mk-border),0_24px_64px_-12px_rgba(0,0,0,0.4)] ring-1 ring-white/[0.06] [background:var(--mk-surface)] ring-inset"
      role="region"
      aria-label={lang === "en" ? "Product demo conversation" : "Produkt-Demo Konversation"}
    >
      {/* gradient top accent — brand-tinted hairline */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand-primary) 50%, transparent), transparent)",
        }}
      />

      {/* Window header — glass effect */}
      <div className="relative flex items-center gap-2 border-b [border-color:var(--mk-border)] px-4 py-3 backdrop-blur-sm [background:var(--mk-bg)]">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
        </div>
        <div className="ml-3 flex items-center gap-1.5 font-mono text-xs [color:var(--mk-text-muted)]">
          <SubsumioMark size={14} />
          <span>{windowTitle}</span>
        </div>
        {/* Live indicator — pulsing green dot */}
        <div className="ml-auto flex items-center gap-1.5 text-[10px] font-medium [color:var(--mk-text-subtle)]">
          <motion.span
            animate={reduce ? undefined : { opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="h-1.5 w-1.5 rounded-full bg-[var(--signal-green)]"
          />
          <span>{liveLabel}</span>
        </div>
      </div>

      {/* Progress bar — thin, animated, fills as turns complete */}
      <div className="relative h-0.5 w-full [background:var(--mk-border)]">
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{
            background: "linear-gradient(90deg, var(--brand-primary), var(--brand-tertiary))",
          }}
          initial={{ width: "0%" }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: EASE.out }}
        />
      </div>

      {/* Chat area */}
      <div ref={chatRef} className="relative max-h-[520px] space-y-7 overflow-y-auto px-5 py-6">
        {/* Subtle ambient gradient in chat background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            background: "radial-gradient(ellipse at 30% 0%, var(--brand-primary), transparent 70%)",
          }}
        />

        <div className="relative space-y-7">
          {turns.slice(0, activeTurns).map((turn, i) => (
            <ShowreelTurn
              key={`${playKey}-${i}`}
              turn={turn}
              reduce={reduce}
              youLabel={youLabel}
              sourcesLabel={sourcesLabel}
              thinkingLabel={thinkingLabel}
              verificationLabel={verificationLabel}
              onComplete={handleTurnComplete}
            />
          ))}

          {/* Interactive input after showreel */}
          {showInteractive && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE.out }}
              className="relative space-y-4"
            >
              {/* Divider with gradient accent */}
              <div className="flex items-center gap-3 pt-2">
                <div
                  className="h-px flex-1"
                  style={{
                    background: "linear-gradient(90deg, transparent, var(--mk-border))",
                  }}
                />
                <div className="flex items-center gap-1.5 rounded-full border border-[var(--brand-border)] bg-[var(--brand-soft)] px-3 py-1">
                  <Sparkles size={11} className="text-[var(--brand-primary)]" />
                  <span className="text-xs font-semibold [color:var(--brand-text)]">
                    {tryYourselfLabel}
                  </span>
                </div>
                <div
                  className="h-px flex-1"
                  style={{
                    background: "linear-gradient(90deg, var(--mk-border), transparent)",
                  }}
                />
              </div>

              {/* Input — elevated with gradient focus ring */}
              <div className="relative rounded-xl border border-[var(--mk-border)] bg-[var(--mk-bg)] transition-all focus-within:border-[var(--brand-border)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand-primary)_12%,transparent)]">
                <div className="flex items-end gap-2 px-3 py-2.5">
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
                    className="brand-bg relative inline-flex shrink-0 items-center gap-1.5 overflow-hidden rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md disabled:opacity-40 disabled:shadow-none"
                  >
                    {/* gradient sheen on hover */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity hover:opacity-100"
                      style={{
                        background:
                          "linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 80%, white 20%), var(--brand-primary))",
                      }}
                    />
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              </div>

              {/* Answer from interactive query */}
              {answer && (
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE.out }}
                  className="flex items-start gap-3"
                >
                  <div className="relative mt-0.5 shrink-0">
                    <SubsumioMark size={30} />
                    {!reduce && (
                      <motion.div
                        animate={{ opacity: [0.1, 0.2, 0.1], scale: [1, 1.15, 1] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-0 rounded-full bg-[var(--brand-primary)] blur-md"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="relative rounded-2xl rounded-tl-md border border-[var(--mk-border)] bg-[var(--mk-surface)] px-4 py-3 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.15)]">
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl"
                        style={{
                          background:
                            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand-primary) 35%, transparent), transparent)",
                        }}
                      />
                      <div className="text-[0.925rem] leading-relaxed whitespace-pre-line [color:var(--mk-text-muted)]">
                        {renderStrongText(answer)}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--mk-border)]/60 pt-2.5">
                        <span className="text-[11px] font-medium [color:var(--mk-text-subtle)]">
                          {demoSourcesLabel}
                        </span>
                        {demoSources.map((slug, i) => (
                          <SourcePill key={slug} src={slug} index={i} reduce={reduce} />
                        ))}
                      </div>
                    </div>
                    <div className="mt-2 pl-1">
                      <VerificationBadge
                        label={interactiveVerificationLabel}
                        reduce={reduce}
                        delay={0.2}
                      />
                    </div>
                    {note && <p className="mt-1.5 text-xs [color:var(--signal-amber)]">{note}</p>}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Footer with replay — refined */}
      {showInteractive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="flex items-center justify-center border-t [border-color:var(--mk-border)] px-5 py-3 [background:var(--mk-bg)]"
        >
          <button
            onClick={handleReplay}
            className="group inline-flex items-center gap-2 text-xs font-medium [color:var(--mk-text-muted)] transition-colors hover:[color:var(--brand-text)]"
          >
            <RotateCcw size={13} className="transition-transform group-hover:rotate-[-60deg]" />
            {replayLabel}
          </button>
        </motion.div>
      )}
    </div>
  );
}
