"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Briefcase, CalendarClock, FileText } from "lucide-react";
import { type Lang, UI_STRINGS } from "@/content/site";
import { ICONS, H2_CTA_CLASS, Section } from "./chrome";
import DashboardReel from "./dashboard-reel";
import { EASE, VIEWPORT } from "./motion-system";

interface DocsWorkflow {
  id: string;
  icon: string;
  label: string;
  title: string;
  description: string;
  viewIndices: number[];
}

const WORKFLOWS_DE: DocsWorkflow[] = [
  {
    id: "matters-copilot",
    icon: "Briefcase",
    label: "Akten & Copilot",
    title: "Akte öffnen, Frage ans Brain, Antwort mit Fundstellen.",
    description:
      "Der gesamte Aktenkontext — Dokumente, Fristen, Beteiligte — ist einen Klick entfernt. Stelle eine Frage in normaler Sprache und bekomme eine belegte Antwort mit Quellenangaben.",
    viewIndices: [0, 1],
  },
  {
    id: "deadlines-control",
    icon: "CalendarClock",
    label: "Fristen & Kontrolle",
    title: "Fristen scannen, Kalender exportieren, Audit-Trail sichern.",
    description:
      "KI scannt automatisch alle Dokumente nach Fristen. Der Kalender zeigt alle Termine auf einen Blick — mit Aktenverknüpfung und Dringlichkeits-Code. Jede Aktion revisionssicher protokolliert.",
    viewIndices: [2, 3],
  },
  {
    id: "contract-review",
    icon: "FileText",
    label: "Vertrag & Review",
    title: "Vertrag hochladen, KI analysiert, Freigabe mit Audit-Trail.",
    description:
      "Verträge werden automatisch auf Risiken geprüft — mit Klausel-Checkliste und Schweregrad-Markierung. Freigaben laufen über strukturierte Approval-Ketten mit vollständiger Audit-Spur.",
    viewIndices: [4, 5],
  },
];

const WORKFLOWS_EN: DocsWorkflow[] = [
  {
    id: "matters-copilot",
    icon: "Briefcase",
    label: "Matters & Copilot",
    title: "Open a matter, ask the Brain, get a cited answer.",
    description:
      "The full matter context — documents, deadlines, parties — is one click away. Ask a question in plain language and get a sourced answer with citations.",
    viewIndices: [0, 1],
  },
  {
    id: "deadlines-control",
    icon: "CalendarClock",
    label: "Deadlines & Control",
    title: "Scan deadlines, export calendar, secure audit trail.",
    description:
      "AI automatically scans all documents for deadlines. The calendar shows all dates at a glance — with matter links and urgency codes. Every action is logged for compliance.",
    viewIndices: [2, 3],
  },
  {
    id: "contract-review",
    icon: "FileText",
    label: "Contract & Review",
    title: "Upload contract, AI analyzes, approval with audit trail.",
    description:
      "Contracts are automatically checked for risks — with clause checklist and severity markers. Approvals go through structured chains with full audit trail.",
    viewIndices: [4, 5],
  },
];

const AUTO_ADVANCE_MS = 5200;
const REEL_STEP_MS = 3200;
const PAUSE_AFTER_CLICK_MS = 9000;

export default function DocsWorkflowShowcase({ lang }: { lang: Lang }) {
  const reduce = useReducedMotion();
  const workflows = lang === "en" ? WORKFLOWS_EN : WORKFLOWS_DE;
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
        <div
          className="order-2 lg:order-1"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => {
            if (!pauseTimerRef.current) setPaused(false);
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT.gentle}
            transition={{ duration: 0.5, ease: EASE.out }}
          >
            <p className="brand-text mb-3 text-xs font-semibold tracking-[0.16em] uppercase">
              {UI_STRINGS[lang].dashboardNotDatasheet}
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
                  className={`w-full rounded-xl border p-4 text-left transition-all duration-200 ${
                    active
                      ? "brand-border shadow-md [background:var(--mk-surface)]"
                      : "[border-color:var(--mk-border)] [background:var(--mk-surface-2)] hover:[border-color:var(--mk-border-strong)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
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
                      <span className="block truncate text-xs [color:var(--mk-text-muted)]">
                        {wf.viewIndices.length} {lang === "en" ? "views" : "Ansichten"}
                      </span>
                    </div>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold transition-colors ${
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
              <DashboardReel lang={lang} controlledView={currentView} />
            </motion.div>
          </AnimatePresence>

          {/* Workflow indicator dots */}
          <div className="mt-4 flex items-center justify-center gap-2">
            {workflows.map((wf, i) => (
              <button
                key={wf.id}
                onClick={() => handleWorkflowClick(i)}
                aria-label={wf.label}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === activeWorkflow
                    ? "brand-bg w-8"
                    : "w-1.5 [background:var(--mk-border)] hover:[background:var(--mk-border-strong)]"
                }`}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </Section>
  );
}
