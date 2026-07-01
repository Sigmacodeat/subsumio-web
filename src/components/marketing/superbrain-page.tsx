"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Network,
  ShieldCheck,
  Sparkles,
  Layers,
  FileSearch,
  Lock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Target,
  TrendingUp,
  Database,
  Cpu,
  Globe,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { p, type Lang } from "@/content/site";
import {
  EASE,
  GlowCard,
  ClipReveal,
  AnimatedCounter,
  StaggerContainer,
  StaggerItem,
} from "./motion-system";
import { Section, accentTile } from "./chrome";
import { AnimatedFaqList } from "./animated-faq";
import { copy, getCopy, type SuperbrainCopyDe } from "./superbrain-content";


const viewport = { once: true, margin: "0px 0px 80px 0px", amount: 0.12 } as const;

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport,
  transition: { duration: 0.5, ease: EASE.out },
};

function HeroSection({ t, lang }: { t: SuperbrainCopyDe; lang: Lang }) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const yOrb = useTransform(scrollY, [0, 800], [0, reduce ? 0 : 200]);
  const opacityOrb = useTransform(scrollY, [0, 600], [1, 0]);

  return (
    <Section tone="slate" className="relative overflow-hidden px-6 pt-20 pb-28">
      <motion.div
        style={{ y: yOrb, opacity: opacityOrb }}
        className="brand-glow-bg absolute top-1/4 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
      />
      <div className="relative z-10 mx-auto max-w-5xl text-center">
        <motion.div
          initial={reduce ? false : { scale: 0.85, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 22 }}
          className="mb-8 inline-flex items-center gap-2 rounded-full border [border-color:var(--mk-border)] px-4 py-2 [background:var(--mk-surface-2)]"
        >
          <Brain size={16} className="brand-text" />
          <span className="font-mono text-xs tracking-wider [color:var(--mk-text-muted)] uppercase">
            {t.hero.eyebrow}
          </span>
        </motion.div>

        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, ease: EASE.dramatic, delay: 0.1 }}
          className="mb-6 [font-family:var(--font-display)] text-[clamp(2.5rem,7vw,4rem)] leading-[1.08] font-black [color:var(--mk-text)]"
        >
          {t.hero.title}
        </motion.h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.55, ease: EASE.out, delay: 0.25 }}
          className="mx-auto mb-10 max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
        >
          {t.hero.sub}
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.5, delay: 0.4 }}
          className="flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <Link href={p(lang, "/signup")}>
            <Button size="lg" className="gap-2">
              {t.hero.cta} <ArrowRight size={18} />
            </Button>
          </Link>
          <Link href={p(lang, "/features")}>
            <Button variant="outline" size="lg">
              {t.hero.ctaSecondary}
            </Button>
          </Link>
        </motion.div>
      </div>

      <BrainVisualization t={t} />
    </Section>
  );
}

function BrainVisualization({ t }: { t: SuperbrainCopyDe }) {
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
      initial={{ opacity: 0, scale: 0.92 }}
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
            />
            <motion.div
              animate={reduce ? undefined : { rotate: -360 }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
              className="absolute inset-4 rounded-full border border-dashed border-[var(--brand-primary)]/15"
            />
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
              const Icon = step.icon;
              const isActive = i === activePhase;
              return (
                <motion.div
                  key={step.phase}
                  animate={{
                    opacity: isActive ? 1 : 0.4,
                    scale: isActive ? 1.05 : 1,
                  }}
                  transition={{ duration: 0.3 }}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center transition-colors ${
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
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatsBand({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section tone="light" className="px-6 py-16">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 md:grid-cols-4">
        {t.stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ duration: 0.45, delay: i * 0.1 }}
            className="text-center"
          >
            <AnimatedCounter
              to={stat.value}
              suffix={stat.suffix}
              className="brand-text [font-family:var(--font-display)] text-4xl font-black md:text-5xl"
            />
            <p className="mt-2 text-sm font-semibold [color:var(--mk-text)]">{stat.label}</p>
            <p className="mt-0.5 text-xs [color:var(--mk-text-muted)]">{stat.sub}</p>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

// ── NARRATIVE SECTION 1: "Wie andere arbeiten" ──
function OthersSection({ t }: { t: SuperbrainCopyDe }) {
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
    <Section tone="light" className="px-6 py-24" aria-label="Wie andere KI arbeitet">
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ duration: 0.4 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border [border-color:var(--mk-border)] px-3 py-1.5 [background:var(--mk-surface-2)]"
          >
            <span className="font-mono text-xs tracking-wider text-rose-400 uppercase">
              {copy.de === t ? "Das Problem" : "The Problem"}
            </span>
          </motion.div>
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-2xl font-black [color:var(--mk-text)] md:text-3xl">
              {t.othersTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.othersSub}
          </motion.p>
        </div>

        {/* Visual flow: Prompt → Answer → Forget */}
        <div className="mb-12 flex flex-col items-center justify-center gap-4 md:flex-row md:gap-8">
          {t.othersSteps.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === activeStep;
            return (
              <div key={step.label} className="flex flex-col items-center gap-4 md:flex-row">
                <motion.div
                  animate={{
                    opacity: isActive ? 1 : 0.5,
                    scale: isActive ? 1.05 : 1,
                  }}
                  transition={{ duration: 0.4 }}
                  className={`flex w-48 flex-col items-center gap-3 rounded-2xl border p-6 text-center transition-colors ${
                    isActive
                      ? "border-rose-400/40 bg-rose-500/5"
                      : "[border-color:var(--mk-border)] [background:var(--mk-surface)]"
                  }`}
                >
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${isActive ? "bg-rose-500/10 text-rose-400" : "[color:var(--mk-text-muted)] [background:var(--mk-surface-2)]"}`}
                  >
                    <Icon size={22} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold [color:var(--mk-text)]">{step.label}</h3>
                    <p className="mt-1 text-xs leading-relaxed [color:var(--mk-text-muted)]">
                      {step.desc}
                    </p>
                  </div>
                </motion.div>
                {i < t.othersSteps.length - 1 && (
                  <motion.div
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.8 }}
                    className="text-rose-400/60"
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
              <span className="shrink-0 text-rose-400">✕</span>
              <span className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{pain}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ── NARRATIVE SECTION 2: "Wie unser Gehirn arbeitet" ──
function OursSection({ t }: { t: SuperbrainCopyDe }) {
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
    <Section tone="slate" className="px-6 py-24" aria-label="Wie das SuperBrain arbeitet">
      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ duration: 0.4 }}
            className="brand-border brand-soft mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
          >
            <span className="brand-text font-mono text-xs tracking-wider uppercase">
              {copy.de === t ? "Die Lösung" : "The Solution"}
            </span>
          </motion.div>
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-2xl font-black [color:var(--mk-text)] md:text-3xl">
              {t.oursTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.oursSub}
          </motion.p>
        </div>

        {/* Visual flow: Ingest → Process → Store → Answer */}
        <div className="mb-12 grid gap-4 md:grid-cols-4">
          {t.oursSteps.map((step, i) => {
            const Icon = step.icon;
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
                  className={`h-full rounded-2xl border p-5 transition-colors ${
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
                  <h3 className="mb-1 text-sm font-bold [color:var(--mk-text)]">{step.label}</h3>
                  <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">
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
            <div className="relative flex flex-col items-center gap-4 p-8 md:p-10">
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
                {copy.de === t
                  ? "Jede Nacht: 25 Phasen · 5 Ebenen · 1 Wissensgraph"
                  : "Every night: 25 phases · 5 layers · 1 knowledge graph"}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}

function ArchitectureSection({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section tone="light" className="px-6 py-24" aria-label="5-Ebenen-Architektur">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-2xl font-black [color:var(--mk-text)] md:text-3xl">
              {t.architectureTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.architectureSub}
          </motion.p>
        </div>

        <div className="space-y-4">
          {t.layers.map((layer, i) => {
            const Icon = layer.icon;
            return (
              <motion.div
                key={layer.title}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: i * 0.12, ease: EASE.out }}
              >
                <GlowCard className="rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)] md:p-8">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
                    <div
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border ${accentTile(layer.color, "light")}`}
                    >
                      <Icon size={24} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="brand-text font-mono text-xs tracking-wider uppercase">
                          {String(i).padStart(2, "0")}
                        </span>
                        <h3 className="text-lg font-bold [color:var(--mk-text)] md:text-xl">
                          {layer.title}
                        </h3>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed [color:var(--mk-text-muted)] md:text-base">
                        {layer.desc}
                      </p>
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border [border-color:var(--mk-border)] px-2.5 py-1 font-mono text-[11px] [color:var(--mk-text-muted)] [background:var(--mk-surface-2)]">
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

function DreamCycleSection({ t }: { t: SuperbrainCopyDe }) {
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
    <Section tone="slate" className="px-6 py-24" aria-label="Dream Cycle">
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-2xl font-black [color:var(--mk-text)] md:text-3xl">
              {t.cycleTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.cycleSub}
          </motion.p>
        </div>

        <div className="relative">
          <div className="absolute top-1/2 left-0 hidden h-px w-full -translate-y-1/2 [background:var(--mk-border)] lg:block" />
          <div className="grid gap-6 lg:grid-cols-4">
            {t.cycleSteps.map((step, i) => {
              const Icon = step.icon;
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
                    className={`h-full rounded-xl border p-5 transition-colors ${
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
                    <h3 className="mb-1 text-sm font-bold [color:var(--mk-text)]">{step.label}</h3>
                    <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">
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
          <span>
            {copy.de === t
              ? "Vollautomatisch · Nächtlich · Überwacht"
              : "Fully automatic · Nightly · Monitored"}
          </span>
        </motion.div>
      </div>
    </Section>
  );
}

function CompareSection({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section tone="light" className="px-6 py-24" aria-label="Vergleich">
      <div className="mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-2xl font-black [color:var(--mk-text)] md:text-3xl">
              {t.compareTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.compareSub}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.6, ease: EASE.out }}
          className="overflow-hidden rounded-2xl border [border-color:var(--mk-border-strong)] shadow-xl"
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b [border-color:var(--mk-border)] [background:var(--mk-surface-2)]">
                <th className="px-5 py-4 font-semibold [color:var(--mk-text)]">
                  {copy.de === t ? "Eigenschaft" : "Feature"}
                </th>
                <th className="px-5 py-4 font-semibold [color:var(--mk-text-muted)]">
                  {copy.de === t ? "Andere Kanzlei-KI" : "Other legal AI"}
                </th>
                <th className="brand-text px-5 py-4 font-semibold">Subsumio SuperBrain</th>
              </tr>
            </thead>
            <tbody>
              {t.compareRows.map((row, i) => (
                <motion.tr
                  key={row.feature}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.35, delay: i * 0.05 }}
                  className="border-b [border-color:var(--mk-border)] [background:var(--mk-surface)] last:border-0"
                >
                  <td className="px-5 py-4 font-medium [color:var(--mk-text)]">{row.feature}</td>
                  <td className="px-5 py-4 [color:var(--mk-text-muted)]">
                    <div className="flex items-center gap-2">
                      <span className="text-rose-400">✕</span>
                      {row.others}
                    </div>
                  </td>
                  <td className="px-5 py-4 font-medium [color:var(--mk-text)]">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={15} className="brand-text shrink-0" />
                      {row.subsumio}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </Section>
  );
}

// ── FINE-TUNING / LEGAL ENGINE ──
function FineTuneSection({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section tone="slate" className="px-6 py-24" aria-label="Subsumio Legal Engine">
      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewport}
            transition={{ duration: 0.4 }}
            className="brand-border brand-soft mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
          >
            <Cpu size={14} className="brand-text" />
            <span className="brand-text font-mono text-xs tracking-wider uppercase">
              {copy.de === t ? "Proprietärer Moat" : "Proprietary Moat"}
            </span>
          </motion.div>
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-2xl font-black [color:var(--mk-text)] md:text-3xl">
              {t.finetuneTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.finetuneSub}
          </motion.p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {t.finetunePoints.map((point, i) => (
            <motion.div
              key={point.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-mono text-xs tracking-wider [color:var(--mk-text-muted)] uppercase">
                    {point.label}
                  </span>
                  <span className="brand-text [font-family:var(--font-display)] text-xl font-black">
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
              <span className="brand-text font-mono text-xs tracking-wider uppercase">
                {copy.de === t ? "Prognose" : "Forecast"}
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

function PrivacySection({ t }: { t: SuperbrainCopyDe }) {
  return (
    <Section tone="light" className="px-6 py-24" aria-label="Privacy & DSGVO">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-2xl font-black [color:var(--mk-text)] md:text-3xl">
              {t.privacyTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.privacySub}
          </motion.p>
        </div>

        <StaggerContainer className="grid gap-6 md:grid-cols-2" stagger={0.1}>
          {t.privacyPoints.map((point) => {
            const Icon = point.icon;
            return (
              <StaggerItem key={point.title}>
                <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
                  <div className="brand-soft brand-border mb-4 flex h-12 w-12 items-center justify-center rounded-xl border">
                    <Icon size={22} className="brand-text" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold [color:var(--mk-text)]">{point.title}</h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {point.desc}
                  </p>
                </GlowCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </div>
    </Section>
  );
}

function UseCasesSection({ t, lang }: { t: SuperbrainCopyDe; lang: Lang }) {
  return (
    <Section
      tone="light"
      className="px-6 py-24"
      aria-label={lang === "en" ? "Use cases" : "Anwendungsfälle"}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-2xl font-black [color:var(--mk-text)] md:text-3xl">
              {t.useCasesTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.useCasesSub}
          </motion.p>
        </div>

        <StaggerContainer className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" stagger={0.08}>
          {t.useCases.map((uc) => {
            const Icon = uc.icon;
            return (
              <StaggerItem key={uc.title}>
                <GlowCard className="h-full rounded-2xl border [border-color:var(--mk-border)] p-6 [background:var(--mk-surface)]">
                  <div className="brand-soft brand-border mb-4 flex h-11 w-11 items-center justify-center rounded-xl border">
                    <Icon size={20} className="brand-text" />
                  </div>
                  <h3 className="mb-2 text-base font-bold [color:var(--mk-text)]">{uc.title}</h3>
                  <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">{uc.desc}</p>
                </GlowCard>
              </StaggerItem>
            );
          })}
        </StaggerContainer>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <Link
            href={p(lang, "/features")}
            className="brand-text inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            {lang === "en" ? "Explore all features" : "Alle Features ansehen"}
            <ArrowRight size={14} />
          </Link>
        </motion.div>
      </div>
    </Section>
  );
}

function TrustSection({ t, lang }: { t: SuperbrainCopyDe; lang: Lang }) {
  return (
    <Section
      tone="light"
      className="px-6 py-24"
      aria-label={lang === "en" ? "Compliance & integrations" : "Compliance & Integrationen"}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-2xl font-black [color:var(--mk-text)] md:text-3xl">
              {t.trustTitle}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-3xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {t.trustSub}
          </motion.p>
        </div>

        <div className="mb-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {t.trustBadges.map((badge, i) => (
            <motion.div
              key={badge.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-2xl border [border-color:var(--mk-border)] p-5 text-center [background:var(--mk-surface)]"
            >
              <div className="brand-text mb-2 [font-family:var(--font-display)] text-lg font-black">
                {badge.label}
              </div>
              <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">{badge.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="text-center">
          <h3 className="mb-6 [font-family:var(--font-display)] text-xl font-bold [color:var(--mk-text)]">
            {t.integrationsTitle}
          </h3>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {t.integrations.map((integration, i) => (
              <motion.div
                key={integration.name}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="flex items-center gap-2 rounded-full border [border-color:var(--mk-border)] px-4 py-2 [background:var(--mk-surface)]"
              >
                <span className="text-sm font-semibold [color:var(--mk-text)]">
                  {integration.name}
                </span>
                <span className="text-xs [color:var(--mk-text-subtle)]">{integration.desc}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <Link
            href={p(lang, "/security")}
            className="brand-text inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            {lang === "en" ? "Read security details" : "Security-Details ansehen"}
            <ArrowRight size={14} />
          </Link>
        </motion.div>
      </div>
    </Section>
  );
}

function FAQSection({ t, lang }: { t: SuperbrainCopyDe; lang: Lang }) {
  const faqItems = t.faq.map((item) => ({ q: item.q, a: item.a }));
  return (
    <Section tone="light" className="px-6 py-24" aria-label="FAQ">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <ClipReveal>
            <h2 className="mb-4 [font-family:var(--font-display)] text-2xl font-black [color:var(--mk-text)] md:text-3xl">
              {lang === "en" ? "Frequently asked questions" : "Häufig gestellte Fragen"}
            </h2>
          </ClipReveal>
          <motion.p
            {...reveal}
            className="mx-auto max-w-2xl text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
          >
            {lang === "en"
              ? "Everything you need to know about the SuperBrain, the Dream Cycle and the 5-layer architecture."
              : "Alles, was du über das SuperBrain, den Dream Cycle und die 5-Ebenen-Architektur wissen musst."}
          </motion.p>
        </div>

        <AnimatedFaqList items={faqItems} tone="light" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <Link
            href={p(lang, "/pricing")}
            className="brand-text inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            {lang === "en" ? "See pricing plans" : "Preise ansehen"}
            <ArrowRight size={14} />
          </Link>
        </motion.div>
      </div>
    </Section>
  );
}

function StickyCTA({ t, lang }: { t: SuperbrainCopyDe; lang: Lang }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 800);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (useReducedMotion()) return null;
  return (
    <motion.div
      initial={false}
      animate={{ y: visible ? 0 : 100, opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.3, ease: EASE.out }}
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 px-4"
      aria-hidden={!visible}
    >
      <Link href={p(lang, "/signup")}>
        <div className="brand-border-strong brand-soft-strong flex items-center gap-3 rounded-full border px-5 py-3 shadow-2xl backdrop-blur-md">
          <span className="text-sm font-bold [color:var(--mk-text)]">{t.stickyCtaText}</span>
          <span className="hidden text-xs [color:var(--mk-text-muted)] sm:inline">
            {t.stickyCtaHint}
          </span>
          <ArrowRight size={16} className="brand-text" />
        </div>
      </Link>
    </motion.div>
  );
}

function CTASection({ t, lang }: { t: SuperbrainCopyDe; lang: Lang }) {
  return (
    <Section tone="dark" className="px-6 py-24" aria-label="Call to action">
      <div className="brand-glow-bg absolute inset-x-0 top-1/2 h-72 -translate-y-1/2 opacity-30 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, ease: EASE.dramatic }}
          className="mb-8 flex justify-center"
        >
          <div className="brand-soft-strong brand-border-strong flex h-20 w-20 items-center justify-center rounded-2xl border">
            <Brain size={36} className="brand-text" />
          </div>
        </motion.div>
        <ClipReveal>
          <h2 className="mb-5 [font-family:var(--font-display)] text-2xl font-black [color:var(--mk-text)] md:text-3xl">
            {t.ctaTitle}
          </h2>
        </ClipReveal>
        <motion.p
          {...reveal}
          className="mb-10 text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg"
        >
          {t.ctaSub}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.45, delay: 0.2 }}
        >
          <Link href={p(lang, "/signup")}>
            <Button size="lg" className="gap-2">
              {t.ctaButton} <ArrowRight size={18} />
            </Button>
          </Link>
        </motion.div>
      </div>
    </Section>
  );
}

export default function SuperbrainPage({ lang }: { lang: Lang }) {
  const t = getCopy(lang);

  return (
    <div
      data-tone="light"
      className="min-h-screen overflow-x-hidden [background:var(--mk-bg)]"
      lang={lang}
    >
      <HeroSection t={t} lang={lang} />
      <StatsBand t={t} />
      <OthersSection t={t} />
      <OursSection t={t} />
      <ArchitectureSection t={t} />
      <DreamCycleSection t={t} />
      <CompareSection t={t} />
      <FineTuneSection t={t} />
      <UseCasesSection t={t} lang={lang} />
      <PrivacySection t={t} />
      <TrustSection t={t} lang={lang} />
      <FAQSection t={t} lang={lang} />
      <CTASection t={t} lang={lang} />
      <StickyCTA t={t} lang={lang} />
    </div>
  );
}