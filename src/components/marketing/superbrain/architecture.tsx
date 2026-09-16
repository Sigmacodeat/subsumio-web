"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Cpu, RefreshCw, TrendingUp } from "lucide-react";
import { EASE, ClipReveal, GlowCard, VIEWPORT } from "../motion-system";
import { Section, H2_CTA_CLASS } from "../primitives";
import { accentTile } from "../icons";
import { reveal, type SuperbrainCopyDe } from "./shared";
import { resolveIcon } from "../icons";

export function ArchitectureSection({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section tone="light" className="px-4 py-24 sm:px-6 lg:px-8" aria-label="5-Ebenen-Architektur">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{t.architectureTitle}</h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.architectureSub}
          </motion.p>
        </div>

        <div className="space-y-4">
          {t.layers.map((layer, i) => {
            const Icon = resolveIcon(layer.icon);
            return (
              <motion.div
                key={layer.title}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: i * 0.12, ease: EASE.out }}
              >
                <GlowCard className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)] md:p-8">
                  <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-6">
                    <div
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border ${accentTile(layer.color, "light")}`}
                    >
                      <Icon size={24} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="brand-text font-mono text-sm tracking-wider uppercase">
                          {String(i).padStart(2, "0")}
                        </span>
                        <h3 className="text-lg font-bold [color:var(--mk-text)] md:text-xl">
                          {layer.title}
                        </h3>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed [color:var(--mk-text-muted)] md:text-base">
                        {layer.desc}
                      </p>
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border [border-color:var(--mk-border)] px-2.5 py-1 font-mono text-sm [color:var(--mk-text-muted)] [background:var(--mk-surface-2)]">
                        <Cpu size={11} className="brand-text" />
                        {layer.detail}
                      </div>
                    </div>
                  </div>
                </GlowCard>
              </motion.div>
            );
          })}
        </div>

        {/* Architecture summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8 flex items-center justify-center"
        >
          <div className="brand-border brand-soft rounded-xl border px-6 py-4 text-center">
            <p className="brand-text font-mono text-sm font-semibold">{t.costNote}</p>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}

export function DreamCycleSection({ t }: { t: SuperbrainCopyDe }) {
  const reduce = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % t.cycleSteps.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [reduce, t.cycleSteps.length]);

  return (
    <Section tone="slate" className="px-4 py-24 sm:px-6 lg:px-8" aria-label="Dream Cycle">
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{t.cycleTitle}</h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.cycleSub}
          </motion.p>
        </div>

        <div className="relative">
          <div className="absolute top-1/2 left-0 hidden h-px w-full -translate-y-1/2 [background:var(--mk-border)] lg:block" />
          <div className="grid gap-6 lg:grid-cols-4">
            {t.cycleSteps.map((step, i) => {
              const Icon = resolveIcon(step.icon);
              const isActive = i === activeStep;
              return (
                <motion.div
                  key={step.phase}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="relative"
                >
                  <GlowCard
                    className={`h-full rounded-xl border p-6 transition-[background-color,border-color,color] motion-reduce:transition-none ${
                      isActive
                        ? "brand-border brand-soft"
                        : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-lg ${accentTile("violet", "slate")}`}
                      >
                        <Icon size={18} />
                      </div>
                      <span className="font-mono text-[10px] tracking-wider [color:var(--mk-text-muted)]">
                        {String(i + 1).padStart(2, "0")} /{" "}
                        {String(t.cycleSteps.length).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="mb-1 text-lg font-bold [color:var(--mk-text)]">{step.label}</h3>
                    <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                      {step.desc}
                    </p>
                    {isActive && (
                      <motion.div
                        layoutId="cycle-active"
                        className="brand-bg absolute -top-1 right-5 left-5 h-0.5 rounded-full"
                        transition={{ duration: 0.3 }}
                      />
                    )}
                  </GlowCard>
                </motion.div>
              );
            })}
          </div>
        </div>

        <motion.div
          {...reveal}
          className="mt-12 flex items-center justify-center gap-3 text-sm [color:var(--mk-text-muted)]"
        >
          <RefreshCw size={16} className="brand-text" />
          <span>{"Vollautomatisch · Nächtlich · Überwacht"}</span>
        </motion.div>
      </div>
    </Section>
  );
}

export function FineTuneSection({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section tone="slate" className="px-4 py-24 sm:px-6 lg:px-8" aria-label="Subsumio Legal Engine">
      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT.gentle}
            transition={{ duration: 0.4 }}
            className="brand-border brand-soft mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
          >
            <Cpu size={14} className="brand-text" />
            <span className="brand-text font-mono text-sm tracking-wider uppercase">
              {"Proprietärer Moat"}
            </span>
          </motion.div>
          <ClipReveal>
            <h2 className={`mb-4 ${H2_CTA_CLASS}`}>{t.finetuneTitle}</h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.finetuneSub}
          </motion.p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {t.finetunePoints.map((point, i) => (
            <motion.div
              key={point.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
                <div className="flex items-baseline justify-between gap-6">
                  <span className="font-mono text-sm tracking-wider [color:var(--mk-text-muted)] uppercase">
                    {point.label}
                  </span>
                  <span className="brand-text [font-family:var(--font-display)] text-xl font-bold">
                    {point.value}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                  {point.desc}
                </p>
              </GlowCard>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8"
        >
          <div className="brand-border brand-soft rounded-2xl border p-6 text-center">
            <div className="mb-2 flex items-center justify-center gap-2">
              <TrendingUp size={18} className="brand-text" />
              <span className="brand-text font-mono text-sm tracking-wider uppercase">
                {"Prognose"}
              </span>
            </div>
            <p className="text-sm leading-relaxed [color:var(--mk-text)] md:text-base">
              {t.finetuneResult}
            </p>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}
