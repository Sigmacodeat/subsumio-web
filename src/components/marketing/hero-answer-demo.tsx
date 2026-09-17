"use client";

// Hero product demo — a real Subsumio answer, played once on mount:
// question → answer lines → citations → verified badge → deadline proposal.
// Reduced motion (and SSR) render the finished state, so the first frame
// always shows the product at rest.

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BookOpen, CalendarClock, Check, FileText, ShieldCheck, Sparkles } from "lucide-react";

import { HERO_DEMO } from "@/content/site";
import { EASE } from "./motion-system";

const STEP_MS = [0, 900, 1500, 2100, 2700, 3300, 3900] as const;

export default function HeroAnswerDemo({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  const d = HERO_DEMO;
  // step 0 = question typed, 1..3 answer lines, 4 citations, 5 verified, 6 deadline
  const [step, setStep] = useState(reduce ? 6 : -1);

  useEffect(() => {
    if (reduce) return;
    const timers = STEP_MS.map((ms, i) => window.setTimeout(() => setStep(i), 400 + ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [reduce]);

  const show = (n: number) => step >= n;
  const fade = (n: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 8 },
          animate: show(n) ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 },
          transition: { duration: 0.45, ease: EASE.out },
        };

  return (
    <div
      className={`relative mx-auto w-full max-w-3xl ${className}`}
      role="img"
      aria-label={`Beispielantwort: ${d.question} ${d.answerLines.join(" ")} Fundstellen: ${d.citations.map((c) => c.label).join(", ")}. Frist ${d.deadline.title} ${d.deadline.date}.`}
    >
      {/* Ambient glow under the card */}
      <div
        aria-hidden
        className="absolute inset-x-8 -bottom-6 h-24 rounded-full opacity-60 blur-2xl"
        style={{ background: "color-mix(in srgb, var(--brand-primary) 35%, transparent)" }}
      />
      <div
        className="relative overflow-hidden rounded-2xl border [border-color:var(--mk-border)] text-left [background:var(--mk-surface)]"
        style={{ boxShadow: "var(--ds-shadow-3)" }}
      >
        {/* Window bar */}
        <div className="flex items-center justify-between gap-3 border-b [border-color:var(--mk-border)] px-4 py-2.5 [background:var(--mk-surface-2)]">
          <div className="flex min-w-0 items-center gap-2 text-xs [color:var(--mk-text-muted)]">
            <Sparkles size={13} className="shrink-0 text-[var(--brand-secondary)]" />
            <span className="truncate">
              Assistent · Akte {d.matterNumber} · {d.matter}
            </span>
          </div>
          <span className="hidden shrink-0 rounded-full border [border-color:var(--mk-border)] px-2 py-0.5 text-[10px] font-medium tracking-wide [color:var(--mk-text-subtle)] uppercase sm:inline-flex">
            Beispiel
          </span>
        </div>

        <div className="grid gap-4 p-4 sm:p-5">
          {/* Question */}
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm text-white [background:var(--brand-primary)]">
              {reduce || step >= 0 ? (
                d.question
              ) : (
                <Typewriter text={d.question} active={step === -1} />
              )}
            </div>
          </div>

          {/* Answer */}
          <div className="grid gap-3">
            <div className="grid gap-1.5 text-sm leading-relaxed [color:var(--mk-text)]">
              {d.answerLines.map((line, i) => (
                <motion.p key={line} {...fade(i + 1)} className="m-0">
                  {i === 2 ? <GoldMark>{line}</GoldMark> : line}
                </motion.p>
              ))}
            </div>

            {/* Citations */}
            <motion.div {...fade(4)} className="flex flex-wrap gap-2">
              {d.citations.map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-1.5 rounded-lg border [border-color:var(--mk-border)] px-2.5 py-1 text-xs [color:var(--mk-text)] [background:var(--mk-surface-2)]"
                >
                  {c.kind === "gesetz" ? (
                    <BookOpen size={12} className="text-[var(--accent-premium)]" />
                  ) : (
                    <FileText size={12} className="text-[var(--brand-secondary)]" />
                  )}
                  <span className="font-medium">{c.label}</span>
                  <span className="hidden [color:var(--mk-text-subtle)] sm:inline">
                    · {c.source}
                  </span>
                </span>
              ))}
            </motion.div>

            {/* Verified */}
            <motion.div
              {...fade(5)}
              className="inline-flex items-center gap-1.5 text-xs font-medium [color:var(--mk-text-muted)]"
            >
              <ShieldCheck size={13} className="text-[var(--brand-secondary)]" />
              {d.verified} · anwaltlich zu prüfen
            </motion.div>
          </div>

          {/* Deadline proposal */}
          <motion.div
            {...fade(6)}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border [border-color:color-mix(in_srgb,var(--accent-premium)_35%,transparent)] px-3.5 py-3 [background:color-mix(in_srgb,var(--accent-premium)_10%,transparent)]"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg [background:color-mix(in_srgb,var(--accent-premium)_18%,transparent)]">
                <CalendarClock size={16} className="text-[var(--accent-premium)]" />
              </span>
              <div className="leading-tight">
                <div className="text-sm font-semibold [color:var(--mk-text)]">
                  Frist erkannt: {d.deadline.title} · {d.deadline.date}
                </div>
                <div className="text-xs [color:var(--mk-text-muted)]">{d.deadline.note}</div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white [background:var(--brand-primary)]">
              <Check size={12} /> Ins Fristenbuch
            </span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/** The leitmotif: a gold marker that sweeps under the decisive sentence. */
function GoldMark({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline">
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-0 h-[0.55em] rounded-sm"
        style={{ background: "color-mix(in srgb, var(--accent-premium) 32%, transparent)" }}
      />
      <span className="relative font-medium">{children}</span>
    </span>
  );
}

function Typewriter({ text, active }: { text: string; active: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) window.clearInterval(id);
    }, 22);
    return () => window.clearInterval(id);
  }, [active, text]);
  return (
    <span>
      {text.slice(0, n)}
      <span
        aria-hidden
        className="ml-0.5 inline-block h-[1em] w-px translate-y-[2px] animate-pulse bg-white/80"
      />
    </span>
  );
}
