"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Briefcase } from "lucide-react";
import { UI_STRINGS } from "@/content/site";
import { H2_CTA_CLASS, Section } from "./primitives";
import { ICONS } from "./icons";
import ProductDemo, { type DemoScene } from "./product-demo";
import { EASE, VIEWPORT } from "./motion-system";

interface DocsWorkflow {
  id: string;
  icon: string;
  label: string;
  title: string;
  description: string;
  viewIndices: number[];
}

// Reel views map onto the scenes of the product replica.
const SCENE_BY_VIEW: DemoScene[] = ["akte", "fundstelle", "fundstelle", "frist"];

const WORKFLOWS: DocsWorkflow[] = [
  {
    id: "matters-assistant",
    icon: "Briefcase",
    label: "Akten & Assistent",
    title: "Akte öffnen, Assistent fragen, Antwort mit Fundstellen.",
    description:
      "Der gesamte Aktenkontext — Dokumente, Fristen, Beteiligte — ist einen Klick entfernt. Stellen Sie eine Frage in normaler Sprache und erhalten Sie eine belegte Antwort mit Quellenangaben.",
    viewIndices: [0, 1],
  },
  {
    id: "deadlines-control",
    icon: "CalendarClock",
    label: "Fristen & Kontrolle",
    title: "Fristen erkennen, bestätigen, im Fristenbuch führen.",
    description:
      "Subsumio prüft Dokumente automatisch auf Fristen und schlägt sie mit Rechtsgrundlage vor. Sie bestätigen — erst dann steht die Frist im Fristenbuch. Jede Aktion wird protokolliert.",
    viewIndices: [2, 3],
  },
];

const AUTO_ADVANCE_MS = 5200;
const REEL_STEP_MS = 3200;
const PAUSE_AFTER_CLICK_MS = 9000;

export default function DocsWorkflowShowcase() {
  const reduce = useReducedMotion();
  const workflows = WORKFLOWS;
  const [activeWorkflow, setActiveWorkflow] = useState(0);
  const [reelStep, setReelStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const workflow = workflows[activeWorkflow];
  const currentView = workflow.viewIndices[reelStep % workflow.viewIndices.length];

  // Auto-advance workflows
  useEffect(() => {
    if (reduce || paused) return;
    const t = setTimeout(() => {
      setActiveWorkflow((prev) => (prev + 1) % workflows.length);
      setReelStep(0);
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [activeWorkflow, reduce, paused, workflows.length]);

  // Cycle through views within a workflow
  useEffect(() => {
    if (reduce) return;
    const indices = workflow.viewIndices;
    if (indices.length <= 1) return;
    const t = setTimeout(() => {
      setReelStep((prev) => (prev + 1) % indices.length);
    }, REEL_STEP_MS);
    return () => clearTimeout(t);
  }, [reelStep, workflow, reduce]);

  const handleWorkflowClick = (idx: number) => {
    setActiveWorkflow(idx);
    setReelStep(0);
    setPaused(true);
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => setPaused(false), PAUSE_AFTER_CLICK_MS);
  };

  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, []);

  return (
    <Section tone="light" className="px-4 pb-24 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
        {/* Left: Interactive workflow selector */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- hover/focus only pauses the auto-advance so the reader can finish a step; the steps themselves are keyboard-reachable buttons below. */}
        <div
          className="order-2 lg:order-1"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => {
            if (!pauseTimerRef.current) setPaused(false);
          }}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget) && !pauseTimerRef.current) {
              setPaused(false);
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT.gentle}
            transition={{ duration: 0.5, ease: EASE.out }}
          >
            <p className="brand-text mb-3 text-sm font-semibold tracking-[0.16em] uppercase">
              {UI_STRINGS.dashboardNotDatasheet}
            </p>
            <AnimatePresence mode="wait">
              <motion.div
                key={`title-${workflow.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease: EASE.out }}
              >
                <h2 className={`${H2_CTA_CLASS} mb-4`}>{workflow.title}</h2>
                <p className="mb-6 max-w-xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)]">
                  {workflow.description}
                </p>
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {/* Workflow cards */}
          <div className="grid gap-3">
            {workflows.map((wf, i) => {
              const Icon = ICONS[wf.icon] ?? Briefcase;
              const active = i === activeWorkflow;
              return (
                <motion.button
                  key={wf.id}
                  onClick={() => handleWorkflowClick(i)}
                  animate={
                    active && !reduce
                      ? {
                          scale: [1, 1.025, 1],
                          borderColor: "color-mix(in srgb, var(--brand-primary) 46%, transparent)",
                        }
                      : { scale: 1 }
                  }
                  transition={
                    active
                      ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
                      : { duration: 0.2 }
                  }
                  whileHover={{ y: -2 }}
                  className={`w-full rounded-xl border p-4 text-left transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--ds-duration-normal)] motion-reduce:transition-none ${
                    active
                      ? "brand-border shadow-md [background:var(--mk-surface)]"
                      : "[border-color:var(--mk-border)] [background:var(--mk-surface-2)] hover:[border-color:var(--mk-border-strong)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-[background-color,border-color,color] motion-reduce:transition-none ${
                        active
                          ? "brand-soft brand-border brand-text"
                          : "[border-color:var(--mk-border)] [color:var(--mk-text-muted)]"
                      }`}
                    >
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold [color:var(--mk-text)]">
                        {wf.label}
                      </span>
                      <span className="block truncate text-sm [color:var(--mk-text-muted)]">
                        {wf.viewIndices.length} Ansichten
                      </span>
                    </div>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold transition-[background-color,border-color,color] motion-reduce:transition-none ${
                        active
                          ? "brand-text brand-soft"
                          : "[color:var(--mk-text-muted)] [background:var(--mk-surface-2)]"
                      }`}
                    >
                      0{i + 1}
                    </span>
                  </div>
                  {/* Progress bar for active workflow */}
                  {active && !reduce && (
                    <motion.div
                      className="brand-bg mt-3 h-0.5 rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ width: paused ? "100%" : ["0%", "100%"] }}
                      transition={
                        paused
                          ? { duration: 0.3 }
                          : { duration: AUTO_ADVANCE_MS / 1000, ease: "linear" }
                      }
                      key={`progress-${activeWorkflow}-${paused}`}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Right: Dashboard reel with controlled view */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={VIEWPORT.gentle}
          transition={{ duration: 0.45, ease: EASE.out }}
          className="relative order-1 lg:order-2"
        >
          <div className="brand-glow-bg absolute -inset-6 rounded-full opacity-30 blur-3xl" />
          {/* Screenreader alternative for the aria-hidden reel below */}
          <p aria-live="polite" className="sr-only">
            {workflow.title}
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={`reel-${activeWorkflow}-${currentView}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE.out }}
              className="relative"
              aria-hidden
            >
              <ProductDemo scene={SCENE_BY_VIEW[currentView] ?? "fundstelle"} />
            </motion.div>
          </AnimatePresence>

          {/* Workflow indicator dots — 24px Hit-Area (WCAG target-size),
              sichtbarer Punkt bleibt klein */}
          <div className="mt-4 flex items-center justify-center">
            {workflows.map((wf, i) => (
              <button
                key={wf.id}
                onClick={() => handleWorkflowClick(i)}
                aria-label={wf.label}
                className="group flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-transform duration-[var(--ds-duration-normal)] hover:scale-110 focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none"
              >
                <span
                  className={`h-1.5 rounded-full transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--ds-duration-normal)] ${
                    i === activeWorkflow
                      ? "brand-bg w-6"
                      : "w-1.5 [background:var(--mk-border)] group-hover:[background:var(--mk-border-strong)]"
                  }`}
                />
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </Section>
  );
}
