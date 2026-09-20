"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/lib/use-safe-reduced-motion";
import { ArrowRight, Brain } from "lucide-react";
import { EASE, ClipReveal, GlowCard, AnimatedCounter, VIEWPORT } from "../motion-system";
import { Section, H2_CTA_CLASS, EYEBROW_CLASS } from "../primitives";
import { reveal, type SuperbrainCopyDe } from "./shared";
import { resolveIcon } from "../icons";

export function StatsBand({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section tone="light" className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-10 sm:grid-cols-2">
        {t.stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT.gentle}
            transition={{ duration: 0.45, delay: i * 0.1 }}
            className="text-center"
          >
            <AnimatedCounter
              to={stat.value}
              decimals={
                Number.isInteger(stat.value)
                  ? 0
                  : (stat.value.toString().split(".")[1]?.length ?? 1)
              }
              suffix={stat.suffix}
              className="brand-text [font-family:var(--font-display)] text-4xl font-bold md:text-5xl"
            />
            <p className="mt-2 text-sm font-semibold [color:var(--mk-text)]">{stat.label}</p>
            <p className="mt-0.5 text-sm [color:var(--mk-text-muted)]">{stat.sub}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

// ── NARRATIVE SECTION 1: "Wie andere arbeiten" ──
export function OthersSection({ t }: { t: SuperbrainCopyDe }) {
  const reduce = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % t.othersSteps.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [reduce, t.othersSteps.length]);

  return (
    <Section
      tone="light"
      className="px-4 py-24 sm:px-6 lg:px-8"
      aria-label="Wie allgemeine KI-Werkzeuge arbeiten"
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT.gentle}
            transition={{ duration: 0.4 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border [border-color:var(--mk-border)] px-3 py-1.5 [background:var(--mk-surface-2)]"
          >
            <span className="font-mono text-sm tracking-wider text-[color:var(--ds-category-rose-text)] uppercase">
              {"Das Problem"}
            </span>
          </motion.div>
          <ClipReveal>
            <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{t.othersTitle}</h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.othersSub}
          </motion.p>
        </div>

        {/* Visual flow: Prompt → Answer → Forget */}
        <div className="mb-12 flex flex-col items-center justify-center gap-6 md:flex-row md:gap-8">
          {t.othersSteps.map((step, i) => {
            const Icon = resolveIcon(step.icon);
            const isActive = i === activeStep;
            return (
              <div key={step.label} className="flex flex-col items-center gap-6 md:flex-row">
                <motion.div
                  animate={{
                    // No opacity dimming — it halves text contrast below AA.
                    // Inactive state is expressed via border/bg tokens instead.
                    scale: isActive ? 1.05 : 1,
                  }}
                  transition={{ duration: 0.4 }}
                  className={`flex w-48 flex-col items-center gap-3 rounded-2xl border p-6 text-center transition-[background-color,border-color,color] motion-reduce:transition-none ${
                    isActive
                      ? "border-[color:var(--ds-category-rose-border)] bg-[color:var(--ds-category-rose-bg)]"
                      : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
                  }`}
                >
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${isActive ? "bg-[color:var(--ds-category-rose-bg)] text-[color:var(--ds-category-rose-text)]" : "[color:var(--mk-text-muted)] [background:var(--mk-surface-2)]"}`}
                  >
                    <Icon size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold [color:var(--mk-text)]">{step.label}</h3>
                    <p className="mt-1 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                      {step.desc}
                    </p>
                  </div>
                </motion.div>
                {i < t.othersSteps.length - 1 && (
                  <motion.div
                    animate={{
                      opacity: activeStep === i ? 1 : 0.25,
                      scale: activeStep === i ? 1.15 : 1,
                    }}
                    transition={{ duration: 0.4, ease: EASE.out }}
                    className="text-[color:var(--ds-category-rose-text)]"
                  >
                    <ArrowRight size={20} className="rotate-90 md:rotate-0" />
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pain points */}
        <div className="mx-auto max-w-3xl space-y-3">
          {t.othersPain.map((pain, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.35, delay: i * 0.08 }}
              className="flex items-center gap-3 rounded-lg border [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-surface)]"
            >
              <span className="shrink-0 text-[color:var(--ds-category-rose-text)]">✕</span>
              <span className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{pain}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ── NARRATIVE SECTION 2: "Wie unser Gehirn arbeitet" ──
export function OursSection({ t }: { t: SuperbrainCopyDe }) {
  const reduce = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % t.oursSteps.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [reduce, t.oursSteps.length]);

  return (
    <Section
      tone="slate"
      className="px-4 py-24 sm:px-6 lg:px-8"
      aria-label="Wie das SuperBrain arbeitet"
    >
      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT.gentle}
            transition={{ duration: 0.4 }}
            className="mb-4 inline-flex"
          >
            <span className={EYEBROW_CLASS}>{"Die Lösung"}</span>
          </motion.div>
          <ClipReveal>
            <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{t.oursTitle}</h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.oursSub}
          </motion.p>
        </div>

        {/* Visual flow: Ingest → Process → Store → Answer */}
        <div className="mb-12 grid gap-6 md:grid-cols-4">
          {t.oursSteps.map((step, i) => {
            const Icon = resolveIcon(step.icon);
            const isActive = i === activeStep;
            return (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="relative"
              >
                <GlowCard
                  className={`h-full rounded-2xl border p-6 transition-[background-color,border-color,color] motion-reduce:transition-none ${
                    isActive
                      ? "brand-border brand-soft"
                      : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${isActive ? "brand-soft brand-border" : "[background:var(--mk-surface-2)]"}`}
                    >
                      <Icon
                        size={18}
                        className={isActive ? "brand-text" : "[color:var(--mk-text-muted)]"}
                      />
                    </div>
                    <span className="brand-text font-mono text-[10px] tracking-wider">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mb-1 text-lg font-bold [color:var(--mk-text)]">{step.label}</h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {step.desc}
                  </p>
                  {isActive && (
                    <motion.div
                      layoutId="ours-active"
                      className="brand-bg absolute -top-1 right-5 left-5 h-0.5 rounded-full"
                      transition={{ duration: 0.3 }}
                    />
                  )}
                </GlowCard>
                {i < t.oursSteps.length - 1 && (
                  <div className="absolute top-1/2 -right-2 z-10 hidden -translate-y-1/2 md:block">
                    <ArrowRight size={16} className="brand-text opacity-40" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Central brain visualization */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: EASE.out }}
          className="relative mx-auto max-w-2xl"
        >
          <div
            data-tone="dashboard"
            className="relative overflow-hidden rounded-2xl border [border-color:var(--mk-border-strong)] shadow-xl [background:var(--mk-bg)]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,var(--brand-glow),transparent_60%)]" />
            <div className="relative flex flex-col items-center gap-6 p-8 md:p-10">
              <div className="relative flex h-40 w-40 items-center justify-center">
                <motion.div
                  animate={reduce ? undefined : { rotate: 360 }}
                  transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 rounded-full border border-dashed border-[var(--brand-primary)]/20"
                />
                <motion.div
                  animate={reduce ? undefined : { rotate: -360 }}
                  transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-4 rounded-full border border-dashed border-[var(--brand-primary)]/15"
                />
                <motion.div
                  animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="brand-soft-strong brand-border-strong flex h-24 w-24 items-center justify-center rounded-full border"
                >
                  <Brain size={28} className="brand-text" />
                </motion.div>
              </div>
              <p className="text-center text-sm leading-relaxed [color:var(--mk-text-muted)]">
                {t.oursNote}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}
