"use client";

// Interactive islands for the features page — everything that needs hooks
// (auto-cycling demo, tab state, inline motion elements). The page composer
// in ./features-page.tsx is a Server Component; these islands hydrate
// independently.

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { UI_STRINGS } from "@/content/site";
import { FEATURES_PAGE } from "@/content/features";
import { SectionHeading, Section } from "./primitives";
import { H2_CTA_CLASS } from "./typography";
import { ICONS } from "./icons";
import { IllusPipeline, ScrollDrawScene } from "./brand-illustrations";
import {
  GuidedCursor,
  GlowCard,
  Reveal,
  StaggerContainer,
  StaggerItem,
  VIEWPORT,
} from "./motion-system";

// --- Animated knowledge-graph hero visual --------------------------------

type GNode = { x: number; y: number; label?: string; r: number; pulse?: boolean };

const NODE_LABELS = ["Akte", "Mandant", "Gegner", "Frist", "Schriftsatz", "Urteil", "Honorar"];

function buildNodes(): GNode[] {
  const labels = NODE_LABELS;
  return [
    { x: 240, y: 56, label: labels[0], r: 7, pulse: true },
    { x: 110, y: 134, label: labels[1], r: 6 },
    { x: 372, y: 130, label: labels[2], r: 6 },
    { x: 70, y: 250, label: labels[3], r: 5 },
    { x: 240, y: 210, label: labels[4], r: 7, pulse: true },
    { x: 408, y: 248, label: labels[5], r: 6 },
    { x: 196, y: 320, label: labels[6], r: 5 },
  ];
}

const EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 4],
  [1, 4],
  [4, 3],
  [2, 5],
  [4, 6],
  [1, 3],
  [4, 5],
];

export function GraphHero() {
  const NODES = buildNodes();
  return (
    <div className="relative mx-auto aspect-[460/360] w-full max-w-[460px]">
      <svg viewBox="0 0 460 360" className="h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--brand-secondary)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity="0.7" />
          </radialGradient>
          <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity="0.72" />
            <stop offset="100%" stopColor="var(--brand-secondary)" stopOpacity="0.46" />
          </linearGradient>
        </defs>

        {/* edges draw in */}
        {EDGES.map(([a, b], i) => (
          <motion.line
            key={`e${i}`}
            x1={NODES[a].x}
            y1={NODES[a].y}
            x2={NODES[b].x}
            y2={NODES[b].y}
            stroke="url(#edgeGrad)"
            strokeWidth={1.8}
            initial={{ pathLength: 0.18, opacity: 0.28 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.2 + i * 0.08, ease: "easeOut" }}
          />
        ))}

        {/* nodes pop in, key ones keep a gentle pulse */}
        {NODES.map((n, i) => (
          <g key={`n${i}`}>
            <motion.circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill="url(#nodeGlow)"
              strokeWidth={1.4}
              initial={{ scale: 0.72, opacity: 0.42 }}
              animate={n.pulse ? { scale: [1, 1.18, 1], opacity: 1 } : { scale: 1, opacity: 1 }}
              transition={
                n.pulse
                  ? {
                      scale: {
                        duration: 2.4,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: 0.9 + i * 0.05,
                      },
                      opacity: { duration: 0.4, delay: 0.6 + i * 0.07 },
                    }
                  : { duration: 0.4, delay: 0.6 + i * 0.07, type: "spring", stiffness: 200 }
              }
              style={{
                stroke: "var(--brand-text)",
                transformBox: "fill-box",
                transformOrigin: "center",
              }}
            />
            {n.label && (
              <motion.text
                x={n.x}
                y={n.y - n.r - 7}
                textAnchor="middle"
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-jetbrains), monospace",
                  fill: "var(--mk-text-muted)",
                }}
                initial={{ opacity: 0.35 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.9 + i * 0.07 }}
              >
                {n.label}
              </motion.text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

// --- "How it works" pipeline (sequential reveal + animated connector) ----

const HOW = {
  title: "So funktioniert's — vom Dokument zur belegten Antwort",
  sub: "Vier Schritte. Sie müssen nichts verschlagworten — Subsumio ordnet die Unterlagen selbst.",
  steps: [
    {
      icon: "Database",
      title: "Einlesen",
      desc: "Akten, E-Mails, PDFs, Sprachnotizen, WhatsApp-Nachrichten — per Upload oder über den Assistenten. Die Texterkennung liest auch Scans.",
      tag: "Upload · Texterkennung · Assistent",
    },
    {
      icon: "Network",
      title: "Verstehen",
      desc: "Beim Speichern erkennt Subsumio Personen, Fristen und Zusammenhänge und verknüpft sie mit der Akte.",
      tag: "Beteiligte · Fristen · Zusammenhänge",
    },
    {
      icon: "Search",
      title: "Fragen",
      desc: "Fragen Sie in normaler Sprache. Subsumio sucht nach Sinn, nach exakten Begriffen und über Zusammenhänge — und findet die entscheidenden Stellen.",
      tag: "Sinnsuche · Stichwortsuche",
    },
    {
      icon: "Brain",
      title: "Belegte Antwort",
      desc: "Ausformulierte Antwort mit seitengenauen Fundstellen — plus Hinweis, was in der Akte noch fehlt.",
      tag: "Fundstellen · offene Lücken",
    },
  ],
} as const;

export function HowItWorks() {
  const h = HOW;
  return (
    <Section tone="light" className="px-4 pb-24 sm:px-6 lg:px-8">
      <Reveal variant="up" className="mb-6 text-center">
        <SectionHeading title={h.title} sub={h.sub} />
      </Reveal>

      {/* Signature scene — the pipeline draws itself with scroll */}
      <ScrollDrawScene className="mx-auto mb-10 max-w-xl">
        {(progress) => <IllusPipeline progress={progress} />}
      </ScrollDrawScene>

      <StaggerContainer
        className="relative grid gap-6 md:grid-cols-2 lg:grid-cols-4"
        stagger={0.18}
      >
        {/* animated connector line (lg+) */}
        <motion.div
          aria-hidden
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: "easeInOut", delay: 0.2 }}
          className="absolute top-7 right-[12.5%] left-[12.5%] hidden h-px origin-left lg:block"
          style={{
            background: "linear-gradient(90deg, transparent, var(--brand-primary), transparent)",
          }}
        />
        {h.steps.map((s, i) => {
          const Icon = ICONS[s.icon];
          return (
            <StaggerItem key={s.title} className="relative">
              <div className="brand-soft brand-border relative z-10 mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border shadow-lg shadow-black/40">
                {Icon && <Icon size={22} className="brand-text" />}
                <span className="brand-bg absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white shadow-md">
                  {i + 1}
                </span>
              </div>
              <div className="text-center">
                <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">{s.title}</h3>
                <p className="mb-3 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                  {s.desc}
                </p>
                <span className="brand-text brand-soft inline-block rounded-full px-2 py-1 font-mono text-sm">
                  {s.tag}
                </span>
              </div>
            </StaggerItem>
          );
        })}
      </StaggerContainer>
    </Section>
  );
}

export function FeatureCommandCenter() {
  const [step, setStep] = useState(0);
  const reduce = useReducedMotion();
  const panels = [
    {
      icon: "FolderOpen",
      label: "Akte",
      title: "Bauer ./. Hofer GmbH",
      sub: "7 Dokumente · 3 offene Punkte · Frist in 6 Tagen",
      tone: "amber",
    },
    {
      icon: "MessageSquare",
      label: "Assistent",
      title: "Was fehlt vor der Klagebeantwortung?",
      sub: "Antwort mit 4 Fundstellen und einer Lücke vorbereitet",
      tone: "blue",
    },
    {
      icon: "Shield",
      label: "Freigabe",
      title: "Freigabe durch Partner erforderlich",
      sub: "Schriftsatz-Entwurf wartet, jede Änderung ist protokolliert",
      tone: "green",
    },
  ];

  useEffect(() => {
    if (reduce) return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const id = setInterval(() => setStep((s) => (s + 1) % panels.length), isMobile ? 3500 : 2400);
    return () => clearInterval(id);
  }, [panels.length, reduce]);

  const toneClass: Record<string, string> = {
    amber:
      "[border-color:color-mix(in_srgb,var(--ds-warning-text)_22%,transparent)] [background:color-mix(in_srgb,var(--ds-warning-text)_10%,transparent)] [color:var(--ds-warning-text)]",
    blue: "[border-color:color-mix(in_srgb,var(--brand-text)_22%,transparent)] [background:color-mix(in_srgb,var(--brand-text)_10%,transparent)] [color:var(--brand-text)]",
    green:
      "[border-color:color-mix(in_srgb,var(--ds-success-text)_22%,transparent)] [background:color-mix(in_srgb,var(--ds-success-text)_10%,transparent)] [color:var(--ds-success-text)]",
  };
  const cursorTargets = [
    {
      x: "22%",
      y: "31%",
      label: UI_STRINGS.matterLabel,
    },
    {
      x: "24%",
      y: "48%",
      label: UI_STRINGS.copilotLabel,
    },
    {
      x: "24%",
      y: "64%",
      label: UI_STRINGS.reviewLabel,
    },
  ];

  return (
    <Section tone="light" className="px-4 pb-24 sm:px-6 lg:px-8">
      <div className="grid items-center gap-9 lg:grid-cols-[0.85fr_1.15fr]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT.tight}
          transition={{ duration: 0.4 }}
        >
          <p className="brand-text mb-3 text-sm font-semibold tracking-[0.16em] uppercase">
            {UI_STRINGS.inDashboard}
          </p>
          <SectionHeading
            title={UI_STRINGS.featuresWorkflowTitle}
            sub={UI_STRINGS.featuresWorkflowSub}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={VIEWPORT.tight}
          transition={{ duration: 0.45 }}
          className="relative overflow-hidden rounded-2xl border [border-color:var(--mk-border)] shadow-2xl shadow-black/15 [background:var(--mk-bg)]"
          data-tone="dashboard"
        >
          <GuidedCursor {...cursorTargets[step]} className="hidden md:flex" />
          <div className="flex items-center justify-between border-b [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-surface)]">
            <div>
              <p className="text-sm font-semibold [color:var(--mk-text)]">
                {UI_STRINGS.commandCenter}
              </p>
              <p className="text-sm [color:var(--mk-text-subtle)]">
                {UI_STRINGS.liveMatterContext}
              </p>
            </div>
            <span className="brand-text brand-soft rounded-full px-2 py-1 text-sm font-medium">
              {UI_STRINGS.verifiableLabel}
            </span>
          </div>
          <div className="grid gap-6 p-4 md:grid-cols-[1fr_1.15fr]">
            <div className="space-y-2">
              {panels.map((panel, i) => {
                const Icon = ICONS[panel.icon];
                const active = i === step;
                return (
                  <motion.button
                    key={panel.label}
                    onClick={() => setStep(i)}
                    animate={
                      active && !reduce
                        ? {
                            scale: [1, 1.025, 1],
                            borderColor:
                              "color-mix(in srgb, var(--brand-primary) 46%, transparent)",
                          }
                        : { scale: 1 }
                    }
                    transition={
                      active
                        ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
                        : { duration: 0.2 }
                    }
                    className={`w-full rounded-lg border p-3 text-left transition-[background-color,border-color,color,box-shadow,transform,opacity] motion-reduce:transition-none ${
                      active
                        ? "brand-border ring-2 ring-[color-mix(in_srgb,var(--brand-primary)_22%,transparent)] [background:var(--mk-surface)]"
                        : "[border-color:var(--mk-border)] [background:var(--mk-surface-2)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${toneClass[panel.tone]}`}
                      >
                        {Icon && <Icon size={16} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold [color:var(--mk-text)]">
                          {panel.label}
                        </span>
                        <span className="block truncate text-sm [color:var(--mk-text-muted)]">
                          {panel.title}
                        </span>
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
            <div className="relative overflow-hidden rounded-xl border [border-color:var(--mk-border)] p-4 [background:var(--mk-surface)]">
              {!reduce && (
                <motion.div
                  key={`focus-${step}`}
                  aria-hidden
                  className="pointer-events-none absolute inset-2 rounded-lg border border-[var(--brand-secondary)]/35"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: [0, 0.65, 0], scale: [0.94, 1.02, 1.06] }}
                  transition={{ duration: 1.8, ease: "easeOut" }}
                />
              )}
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                >
                  <p className="brand-text mb-2 text-sm font-semibold">{panels[step].label}</p>
                  <h3 className="mb-2 text-lg font-semibold [color:var(--mk-text)]">
                    {panels[step].title}
                  </h3>
                  <p className="mb-4 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                    {panels[step].sub}
                  </p>
                  <div className="space-y-2">
                    {[
                      UI_STRINGS.featuresChecklist1,
                      UI_STRINGS.featuresChecklist2,
                      UI_STRINGS.featuresChecklist3,
                    ].map((line, i) => (
                      <motion.div
                        key={line}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 [background:var(--mk-surface-2)]"
                      >
                        <CheckCircle2 size={14} className="brand-text" />
                        <span className="text-sm [color:var(--mk-text-muted)]">{line}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </Section>
  );
}

/** Category explorer + "everything at a glance" — share the same `active`
 *  tab state (glance cards jump back to the explorer), so they must live in
 *  one client component. */
export function CategoryExplorer() {
  const t = FEATURES_PAGE;
  const [active, setActive] = useState(t.categories[0].id);
  const cat = t.categories.find((c) => c.id === active) ?? t.categories[0];
  const CatIcon = ICONS[cat.icon];

  return (
    <>
      {/* Category explorer */}
      <Section tone="light" className="px-4 pb-24 sm:px-6 lg:px-8">
        <div
          role="tablist"
          aria-label="Funktionsbereiche"
          className="mb-12 flex flex-wrap justify-center gap-2"
        >
          {t.categories.map((c) => {
            const Icon = ICONS[c.icon];
            const isActive = c.id === active;
            return (
              <button
                key={c.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(c.id)}
                className={`relative flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-[background-color,border-color,color] motion-reduce:transition-none ${
                  isActive
                    ? "brand-text"
                    : "[color:var(--mk-text-muted)] hover:[color:var(--mk-text)]"
                } focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97]`}
              >
                {isActive && (
                  <motion.span
                    layoutId="feature-tab-pill"
                    className="brand-soft brand-border absolute inset-0 rounded-full border shadow-lg shadow-black/30"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  {Icon && <Icon size={14} />}
                  {c.label}
                </span>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={cat.id}
            role="tabpanel"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="grid items-start gap-8 lg:grid-cols-2"
          >
            {/* Left: explanation */}
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="brand-soft brand-border flex h-12 w-12 items-center justify-center rounded-xl border">
                  {CatIcon && <CatIcon size={22} className="brand-text" />}
                </div>
                <h2 className={H2_CTA_CLASS}>{cat.title}</h2>
              </div>
              <p className="mb-8 text-base leading-relaxed text-pretty [color:var(--mk-text-muted)]">
                {cat.intro}
              </p>
              <div className="space-y-4">
                {cat.items.map((item, i) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 * i, duration: 0.22 }}
                    className="hover:brand-border flex gap-3 rounded-xl border [border-color:var(--mk-border)] p-4 transition-[background-color,border-color,color] [background:var(--mk-surface)] hover:[background:var(--mk-hover)] motion-reduce:transition-none"
                  >
                    <CheckCircle2 size={16} className="brand-text mt-0.5 shrink-0" />
                    <div>
                      <h3 className="mb-1 text-sm font-semibold [color:var(--mk-text)]">
                        {item.title}
                      </h3>
                      <p className="text-sm leading-relaxed [color:var(--mk-text-muted)]">
                        {item.desc}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Right: demo window */}
            {cat.demo ? (
              <div className="lg:sticky lg:top-8">
                <div className="overflow-hidden rounded-2xl border [border-color:var(--mk-border)] shadow-2xl shadow-black/50 [background:var(--mk-bg)]">
                  <div className="flex items-center gap-2 border-b [border-color:var(--mk-border)] px-4 py-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
                    <div className="ml-4 flex-1 font-mono text-sm [color:var(--mk-text-subtle)]">
                      {cat.demo.windowTitle}
                    </div>
                  </div>
                  <div className="space-y-1.5 p-6 font-mono text-sm leading-relaxed">
                    {cat.demo.lines.map((line, i) => (
                      <motion.p
                        key={`${cat.id}-${i}`}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.12 * i, duration: 0.25 }}
                        className={
                          line.startsWith("Frage:")
                            ? "[color:var(--mk-text)]"
                            : line.includes("⚠")
                              ? "[color:var(--ds-warning-text)]"
                              : line.startsWith("→") || line.match(/^\d\d:\d\d/)
                                ? "brand-text"
                                : "[color:var(--mk-text-muted)]"
                        }
                      >
                        {line}
                      </motion.p>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="hidden h-full min-h-[300px] items-center justify-center rounded-2xl border border-dashed [border-color:var(--mk-border)] lg:flex">
                <div className="px-8 text-center">
                  {CatIcon && <CatIcon size={32} className="brand-text mx-auto mb-4" />}
                  <p className="max-w-xs text-sm [color:var(--mk-text-subtle)]">
                    {UI_STRINGS.featuresEmptyState}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </Section>

      {/* Everything at a glance */}
      <Section tone="light" className="px-4 pb-24 sm:px-6 lg:px-8">
        <h2 className={`mb-12 text-center ${H2_CTA_CLASS}`}>{UI_STRINGS.featuresGlanceTitle}</h2>
        <StaggerContainer className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" stagger={0.08}>
          {t.categories.map((c) => {
            const Icon = ICONS[c.icon];
            return (
              <StaggerItem key={c.id}>
                <button
                  onClick={() => {
                    setActive(c.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="group rounded-2xl text-left transition-[background-color,border-color,color,box-shadow,transform,opacity] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none"
                >
                  <GlowCard className="hover:brand-border h-full rounded-2xl border [border-color:var(--mk-border)] p-6 transition-[background-color,border-color,color,box-shadow,transform,opacity] [background:var(--mk-surface)] hover:-translate-y-1 hover:[background:var(--mk-hover)] motion-reduce:transition-none">
                    <div className="brand-soft brand-border mb-4 flex h-11 w-11 items-center justify-center rounded-xl border transition-transform group-hover:scale-110">
                      {Icon && <Icon size={20} className="brand-text" />}
                    </div>
                    <h3 className="mb-1.5 text-lg font-semibold [color:var(--mk-text)]">
                      {c.label}
                    </h3>
                    <p className="line-clamp-3 text-sm leading-relaxed [color:var(--mk-text-muted)]">
                      {c.glance}
                    </p>
                    <span className="brand-text mt-4 inline-flex items-center gap-1 text-sm opacity-0 transition-opacity group-hover:opacity-100">
                      {UI_STRINGS.exploreLabel} <ArrowRight size={12} />
                    </span>
                  </GlowCard>
                </button>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </Section>
    </>
  );
}
