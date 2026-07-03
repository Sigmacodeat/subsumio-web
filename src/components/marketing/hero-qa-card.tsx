"use client";

// Hero Q→A Card — the visual product proof in the hero's right column.
// Shows the core value prop (question → cited answer) as an animated
// floating card with typewriter answer and staggered source citations.
// Respects prefers-reduced-motion (static full answer, no float, no typewriter).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, FileText } from "lucide-react";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import type { Lang } from "@/content/site";

export interface HeroQAProps {
  question: string;
  answer: string;
  sources: { label: string; href: string }[];
  confidenceLabel: string;
  lang: Lang;
}

export default function HeroQACard({
  question,
  answer,
  sources,
  confidenceLabel,
  lang,
}: HeroQAProps) {
  const reduce = useReducedMotion();
  const [displayed, setDisplayed] = useState("");
  const [showSources, setShowSources] = useState(false);
  const [showConfidence, setShowConfidence] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const youLabel = lang === "en" ? "You" : "Du";
  const sourcesLabel = lang === "en" ? "Sources:" : "Quellen:";
  const thinkingLabel = lang === "en" ? "Searching knowledge graph…" : "Durchsuche Wissensgraph…";

  useEffect(() => {
    if (reduce) {
      setDisplayed(answer);
      setShowSources(true);
      setShowConfidence(true);
      return;
    }

    const startDelay = setTimeout(() => {
      setIsTyping(true);
      let i = 0;
      intervalRef.current = setInterval(() => {
        i++;
        setDisplayed(answer.slice(0, i));
        if (i >= answer.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
          setIsTyping(false);
          timeoutRef.current = setTimeout(() => setShowSources(true), 300);
          setTimeout(() => setShowConfidence(true), 700);
        }
      }, 15);
    }, 800);

    return () => {
      clearTimeout(startDelay);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [answer, reduce]);

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, rotate: -1.5 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={
        reduce
          ? { duration: 0 }
          : { type: "spring", stiffness: 120, damping: 18, mass: 1.1, delay: 0.3 }
      }
      className="relative mx-auto w-full max-w-md"
      role="img"
      aria-label={`${question} — ${answer}`}
    >
      {/* animated glow — breathes softly */}
      <motion.div
        animate={reduce ? undefined : { opacity: [0.12, 0.22, 0.12], scale: [1, 1.04, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -inset-4 rounded-3xl bg-[var(--brand-primary)] blur-3xl"
      />

      {/* floating wrapper — layered shadow + gradient ring */}
      <motion.div
        animate={reduce ? undefined : { y: [0, -8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="relative rounded-2xl bg-[var(--mk-surface)] shadow-[0_0_0_1px_var(--mk-border-strong),0_24px_64px_-12px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.06] ring-inset"
      >
        {/* gradient top accent — subtle brand-tinted hairline */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl"
          style={{
            background:
              "linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand-primary) 40%, transparent), transparent)",
          }}
        />

        {/* window header */}
        <div className="flex items-center gap-2 border-b [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-bg)]">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
          </div>
          <div className="ml-3 flex items-center gap-1.5 font-mono text-xs [color:var(--mk-text-muted)]">
            <SubsumioMark size={14} />
            <span>subsumio</span>
          </div>
          {/* live indicator — subtle pulse */}
          <div className="ml-auto flex items-center gap-1 text-[10px] font-medium [color:var(--mk-text-subtle)]">
            <motion.span
              animate={reduce ? undefined : { opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="h-1.5 w-1.5 rounded-full bg-[var(--signal-green)]"
            />
            <span>live</span>
          </div>
        </div>

        {/* question */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--brand-primary)]/25 bg-[var(--brand-primary)]/12">
              <span className="brand-text text-xs font-semibold">{youLabel}</span>
            </div>
            <p className="flex-1 text-sm leading-relaxed [color:var(--mk-text)]">{question}</p>
          </div>
        </div>

        {/* answer — with thinking indicator before typewriter starts */}
        <div className="px-5 pb-4">
          <div className="flex items-start gap-3">
            <SubsumioMark size={28} className="mt-0.5 shrink-0" />
            <div
              className="flex-1 text-[0.925rem] leading-relaxed [color:var(--mk-text-muted)]"
              style={{ minHeight: reduce ? undefined : "5.5rem" }}
            >
              {/* thinking dots — shown before typewriter starts */}
              {!reduce && !isTyping && displayed.length === 0 && (
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
              {displayed}
              {/* block cursor — thicker, blinks in sync with typewriter rhythm */}
              {!reduce && isTyping && displayed.length < answer.length && (
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity, ease: "linear" }}
                  className="ml-0.5 inline-block h-3.5 w-[3px] bg-[var(--brand-primary)] align-text-bottom"
                />
              )}
            </div>
          </div>
        </div>

        {/* sources */}
        {showSources && (
          <div className="flex flex-wrap items-center gap-2 border-t [border-color:var(--mk-border)] px-5 py-3 [background:var(--mk-bg)]">
            <span className="text-xs [color:var(--mk-text-muted)] opacity-70">{sourcesLabel}</span>
            {sources.map((src, i) => (
              <motion.span
                key={src.label}
                initial={reduce ? false : { opacity: 0, y: 6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  delay: reduce ? 0 : i * 0.12,
                  duration: 0.35,
                  type: "spring",
                  stiffness: 180,
                  damping: 14,
                }}
              >
                <Link
                  href={src.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="brand-text brand-soft hover:brand-soft-strong inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs transition-all hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <FileText size={10} />
                  {src.label}
                </Link>
              </motion.span>
            ))}
          </div>
        )}

        {/* confidence badge */}
        {showConfidence && (
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: reduce ? 0 : 0.2,
              duration: 0.4,
              type: "spring",
              stiffness: 200,
              damping: 16,
            }}
            className="flex items-center gap-1.5 border-t [border-color:var(--mk-border)] px-5 py-2.5"
          >
            <motion.span
              animate={reduce ? undefined : { scale: [1, 1.15, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            >
              <CheckCircle2 size={14} className="text-[var(--signal-green)]" />
            </motion.span>
            <span className="text-xs font-medium [color:var(--mk-text-muted)]">
              {confidenceLabel}
            </span>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
