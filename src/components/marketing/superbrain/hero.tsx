"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useReducedMotion } from "@/lib/use-safe-reduced-motion";
import { ArrowRight, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { p } from "@/content/site";
import { EASE, SplitTextReveal, MagneticButton, GradientMesh } from "../motion-system";
import { Section, BadgePill, H1_CLASS } from "../primitives";
import { type SuperbrainCopyDe } from "./shared";
import { resolveIcon } from "../icons";

export function HeroSection({ t }: { t: SuperbrainCopyDe }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const yOrb = useTransform(scrollY, [0, 800], [0, reduce ? 0 : 200]);
  const opacityOrb = useTransform(scrollY, [0, 600], [1, 0]);

  return (
    <Section tone="slate" className="relative overflow-hidden px-4 pt-20 pb-28 sm:px-6 lg:px-8">
      <GradientMesh className="z-0" />
      <motion.div
        style={{ y: yOrb, opacity: opacityOrb }}
        className="brand-glow-bg absolute top-1/4 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
      />
      <div className="relative z-10 mx-auto max-w-5xl text-center">
        <BadgePill className="mb-8">{t.hero.eyebrow}</BadgePill>

        <SplitTextReveal
          as="h1"
          delay={0.1}
          stagger={0.14}
          useAnimate
          lcp
          className={`${H1_CLASS} mb-6`}
        >
          {t.hero.title}
        </SplitTextReveal>

        <motion.p
          initial={reduce ? false : { y: 16 }}
          animate={{ y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.55, ease: EASE.out, delay: 0.5 }}
          className="mx-auto mb-10 max-w-3xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
        >
          {t.hero.sub}
        </motion.p>

        <motion.div
          initial={reduce ? false : { y: 12 }}
          animate={{ y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.5, delay: 0.65 }}
          className="flex flex-col items-center justify-center gap-6 sm:flex-row"
        >
          <MagneticButton strength={0.35}>
            <Button size="lg" className="gap-2" asChild>
              <Link href={p("/signup")}>
                {t.hero.cta} <ArrowRight size={18} />
              </Link>
            </Button>
          </MagneticButton>
          <MagneticButton strength={0.2}>
            <Button variant="outline" size="lg" asChild>
              <Link href={p("/features")}>{t.hero.ctaSecondary}</Link>
            </Button>
          </MagneticButton>
        </motion.div>
      </div>

      <BrainVisualization t={t} />
    </Section>
  );
}

export function BrainVisualization({ t }: { t: SuperbrainCopyDe }) {
  const reduce = useReducedMotion();
  const [activePhase, setActivePhase] = useState(0);
  const phases = t.cycleSteps;

  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setActivePhase((prev) => (prev + 1) % phases.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [reduce, phases.length]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: EASE.out, delay: 0.5 }}
      className="relative mx-auto mt-16 max-w-3xl"
    >
      <div
        data-tone="dashboard"
        className="relative overflow-hidden rounded-2xl border [border-color:var(--mk-border-strong)] shadow-2xl shadow-black/30 [background:var(--mk-bg)]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,var(--brand-glow),transparent_50%)]" />
        <div className="relative flex flex-col items-center gap-6 p-8 md:p-12">
          <div className="relative flex h-48 w-48 items-center justify-center">
            <motion.div
              animate={reduce ? undefined : { rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-full border border-dashed border-[var(--brand-primary)]/20"
            >
              {!reduce && (
                <span className="brand-bg absolute top-0 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_10px_var(--brand-primary)]" />
              )}
            </motion.div>
            <motion.div
              animate={reduce ? undefined : { rotate: -360 }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
              className="absolute inset-4 rounded-full border border-dashed border-[var(--brand-primary)]/15"
            >
              {!reduce && (
                <span className="brand-bg absolute bottom-0 left-1/2 h-1.5 w-1.5 -translate-x-1/2 translate-y-1/2 rounded-full opacity-70 shadow-[0_0_8px_var(--brand-primary)]" />
              )}
            </motion.div>
            <motion.div
              animate={reduce ? undefined : { scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="brand-soft-strong brand-border-strong flex h-28 w-28 flex-col items-center justify-center rounded-full border"
            >
              <Brain size={32} className="brand-text mb-1" />
              <span className="text-[10px] font-semibold [color:var(--mk-text)]">SuperBrain</span>
            </motion.div>
          </div>

          <div className="grid w-full grid-cols-2 gap-2 md:grid-cols-4">
            {phases.map((step, i) => {
              const Icon = resolveIcon(step.icon);
              const isActive = i === activePhase;
              return (
                <motion.div
                  key={step.phase}
                  animate={{
                    // No opacity dimming on the whole card — container opacity
                    // <1 drops text contrast below WCAG AA. Scale only.
                    scale: isActive ? 1.05 : 1,
                  }}
                  transition={{ duration: 0.3 }}
                  className={`relative flex flex-col items-center gap-1.5 overflow-hidden rounded-lg border p-2.5 text-center transition-[background-color,border-color,color] motion-reduce:transition-none ${
                    isActive
                      ? "brand-border brand-soft"
                      : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
                  }`}
                >
                  <Icon
                    size={16}
                    className={isActive ? "brand-text" : "[color:var(--mk-text-muted)]"}
                  />
                  <span
                    className={`text-[10px] font-medium ${isActive ? "[color:var(--mk-text)]" : "[color:var(--mk-text-muted)]"}`}
                  >
                    {step.label}
                  </span>
                  {isActive && !reduce && (
                    <motion.span
                      key={activePhase}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 2.2, ease: "linear" }}
                      className="brand-bg absolute inset-x-0 bottom-0 h-0.5 origin-left"
                    />
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
