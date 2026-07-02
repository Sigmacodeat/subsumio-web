"use client";

// Hero Q→A Card — the visual product proof in the hero's right column.
// Shows the core value prop (question → cited answer) as an animated
// floating card with typewriter answer and staggered source citations.
// Respects prefers-reduced-motion (static full answer, no float, no typewriter).

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, FileText } from "lucide-react";
import { SubsumioMark } from "@/components/brand/subsumio-logo";
import { EASE } from "./motion-system";

export interface HeroQAProps {
  question: string;
  answer: string;
  sources: { label: string; href: string }[];
  confidenceLabel: string;
  lang: "de" | "en" | "at" | "ch" | "it";
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

  const youLabel = lang === "en" ? "You" : "Du";
  const sourcesLabel = lang === "en" ? "Sources:" : "Quellen:";

  useEffect(() => {
    if (reduce) {
      setDisplayed(answer);
      setShowSources(true);
      setShowConfidence(true);
      return;
    }

    const startDelay = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setDisplayed(answer.slice(0, i));
        if (i >= answer.length) {
          clearInterval(interval);
          setTimeout(() => setShowSources(true), 300);
          setTimeout(() => setShowConfidence(true), 700);
        }
      }, 18);
    }, 1200);

    return () => {
      clearTimeout(startDelay);
    };
  }, [answer, reduce]);

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, rotate: -1 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.7, ease: EASE.dramatic, delay: 0.3 }}
      className="relative mx-auto w-full max-w-md"
    >
      {/* glow */}
      <div className="absolute -inset-4 rounded-3xl bg-[var(--brand-primary)]/15 blur-3xl" />

      {/* floating wrapper */}
      <motion.div
        animate={reduce ? undefined : { y: [0, -8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="relative rounded-2xl border [border-color:var(--mk-border-strong)] shadow-2xl shadow-black/40 [background:var(--mk-surface)]"
      >
        {/* window header */}
        <div className="flex items-center gap-2 border-b [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-bg)]">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
          </div>
          <div className="ml-3 flex items-center gap-1.5 font-mono text-xs [color:var(--mk-text-muted)]">
            <SubsumioMark size={14} />
            <span>subsumio</span>
          </div>
        </div>

        {/* question */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/15">
              <span className="brand-text text-xs font-semibold">{youLabel}</span>
            </div>
            <p className="flex-1 text-sm leading-relaxed [color:var(--mk-text)]">{question}</p>
          </div>
        </div>

        {/* answer */}
        <div className="px-5 pb-4">
          <div className="flex items-start gap-3">
            <SubsumioMark size={28} className="mt-0.5 shrink-0" />
            <div className="flex-1 text-sm leading-relaxed [color:var(--mk-text-muted)]">
              {displayed}
              {!reduce && displayed.length < answer.length && displayed.length > 0 && (
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[var(--brand-text)] align-text-bottom" />
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
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduce ? 0 : i * 0.12, duration: 0.3, ease: EASE.out }}
              >
                <Link
                  href={src.href}
                  className="brand-text brand-soft hover:brand-soft-strong inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-xs transition-colors"
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
              duration: 0.35,
              type: "spring",
              stiffness: 200,
            }}
            className="flex items-center gap-1.5 border-t [border-color:var(--mk-border)] px-5 py-2.5"
          >
            <CheckCircle2 size={14} className="text-[var(--signal-green)]" />
            <span className="text-xs font-medium [color:var(--mk-text-muted)]">
              {confidenceLabel}
            </span>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
