"use client";

// Hero Q→A Card — the visual product proof in the hero's right column.
//
// Design intent (rewritten): the product's claim is not "an AI types fast" —
// every AI product has claimed that since 2023 — it is "every statement is
// backed by a source you can open". So the answer is legible IMMEDIATELY and
// the only thing that animates is the proof pass: each citation starts as
// "wird geprüft" and resolves to a verified hit in the corpus.
//
// Deliberately removed from the previous version:
//   - the typewriter (2.3s before the value prop could be read, and the single
//     most-copied AI cliché),
//   - the "thinking…" dots, the blinking block cursor, the breathing glow, the
//     6s float loop, the pulsing "live" dot, the pulsing confidence check —
//     six infinite loops that never let the hero settle,
//   - the macOS traffic-light dots, which said "screenshot of some app" rather
//     than anything about law.
// The card now finishes in ~1.5s and then holds completely still.

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Check, FileText } from "lucide-react";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { UI_STRINGS, type Lang } from "@/content/site";
import { EASE } from "./motion-system";

export interface HeroQAProps {
  question: string;
  answer: string;
  sources: { label: string; href: string }[];
  confidenceLabel: string;
  lang: Lang;
}

/** ms between one citation resolving and the next starting. */
const CITE_STEP_MS = 380;
/** ms before the first citation resolves — long enough to read the answer. */
const CITE_START_MS = 650;

export default function HeroQACard({
  question,
  answer,
  sources,
  confidenceLabel,
  lang,
}: HeroQAProps) {
  const reduce = useReducedMotion();
  // How many citations have been verified so far. Starts at 0, ends at
  // sources.length — and then nothing moves again.
  const [verifiedCount, setVerifiedCount] = useState(0);

  const ui = UI_STRINGS[lang];
  const allVerified = verifiedCount >= sources.length;

  useEffect(() => {
    if (reduce) {
      setVerifiedCount(sources.length);
      return;
    }
    const timers = sources.map((_, i) =>
      setTimeout(() => setVerifiedCount((n) => Math.max(n, i + 1)), CITE_START_MS + i * CITE_STEP_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [sources, reduce]);

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.45, ease: EASE.out, delay: 0.15 }}
      className="relative mx-auto w-full max-w-md"
      role="img"
      aria-label={`${question} — ${answer}`}
    >
      {/* Static brand wash. No breathing loop: a hero that never settles reads
          restless, not premium. */}
      <div
        aria-hidden
        className="absolute -inset-4 rounded-3xl bg-[var(--brand-primary)] opacity-[0.14] blur-3xl"
      />

      <div className="relative rounded-2xl bg-[var(--mk-surface)] shadow-[0_0_0_1px_var(--mk-border-strong),0_24px_64px_-12px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.06] ring-inset">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl"
          style={{
            background:
              "linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand-primary) 40%, transparent), transparent)",
          }}
        />

        {/* Header — the § carries the legal identity the traffic lights never did.
            Its right side narrates the proof pass instead of a fake "live" dot. */}
        <div className="flex items-center gap-2 border-b [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-bg)]">
          <div className="flex items-center gap-1.5 font-mono text-sm [color:var(--mk-text-muted)]">
            <SubsumioMark size={14} />
            <span>subsumio</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-sm font-medium">
            <span
              aria-hidden
              className={`font-serif text-base leading-none transition-colors duration-500 ${
                allVerified ? "text-[var(--signal-green)]" : "brand-text"
              }`}
            >
              §
            </span>
            <span className="[color:var(--mk-text-subtle)] tabular-nums">
              {allVerified
                ? `${sources.length} ${ui.verifiedLabel}`
                : `${ui.verifyingLabel}…`}
            </span>
          </div>
        </div>

        {/* Question */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--brand-primary)]/25 bg-[var(--brand-primary)]/12">
              <span className="brand-text text-sm font-semibold">{ui.youLabel}</span>
            </div>
            <p className="flex-1 text-sm leading-relaxed [color:var(--mk-text)]">{question}</p>
          </div>
        </div>

        {/* Answer — fully legible from the first frame. */}
        <div className="px-5 pb-4">
          <div className="flex items-start gap-3">
            <SubsumioMark size={28} className="mt-0.5 shrink-0" />
            <p className="flex-1 text-sm leading-relaxed [color:var(--mk-text-muted)]">{answer}</p>
          </div>
        </div>

        {/* The proof pass — the one thing worth animating. */}
        <div className="flex flex-wrap items-center gap-2 border-t [border-color:var(--mk-border)] px-5 py-3 [background:var(--mk-bg)]">
          <span className="text-sm [color:var(--mk-text-muted)] opacity-70">{ui.sourcesLabel}</span>
          {sources.map((src, i) => {
            const isVerified = i < verifiedCount;
            return (
              <Link
                key={src.label}
                href={src.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${src.label} — ${isVerified ? ui.verifiedLabel : ui.citePendingLabel}`}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-sm transition-all duration-300 ${
                  isVerified
                    ? "brand-text brand-soft hover:brand-soft-strong hover:-translate-y-0.5 hover:shadow-sm"
                    : "[color:var(--mk-text-subtle)] [background:var(--mk-surface-2)] opacity-60"
                }`}
              >
                {/* The icon swap IS the story: unchecked document → verified hit. */}
                {isVerified ? (
                  <motion.span
                    initial={reduce ? false : { scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.3, ease: EASE.out }}
                    className="flex items-center"
                  >
                    <Check size={11} className="text-[var(--signal-green)]" />
                  </motion.span>
                ) : (
                  <FileText size={10} />
                )}
                {src.label}
              </Link>
            );
          })}
        </div>

        {/* Verdict line — appears once, then stays put. */}
        <motion.div
          initial={false}
          animate={{ opacity: allVerified ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.35, ease: EASE.out }}
          className="flex items-center gap-1.5 border-t [border-color:var(--mk-border)] px-5 py-2.5"
        >
          <Check size={14} className="text-[var(--signal-green)]" />
          <span className="text-sm font-medium [color:var(--mk-text-muted)]">
            {confidenceLabel}
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}
