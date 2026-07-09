"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useMotionValueEvent } from "framer-motion";
import {
  Brain,
  CheckCircle2,
  FileText,
  GitBranch,
  MessageSquare,
  Search,
  ShieldCheck,
} from "lucide-react";
import { type Lang, UI_STRINGS } from "@/content/site";
import { profileForIndustry } from "@/lib/industry-pack";
import { styleForIndustry } from "@/lib/industry-theme";
import { H2_CTA_CLASS } from "./chrome";

const copy = {
  en: {
    eyebrow: "Workflow view",
    title: "From scattered work to one cited answer.",
    sub: "Meetings, emails, PDFs and tasks flow into a permission-aware brain. {brand} links the context, keeps the source trail visible, and routes the next action to the right workspace.",
    query: "What changed since the last meeting?",
    answer:
      "3 material changes found. Two are low risk, one needs review before the next deadline.",
    sourceA: "Board notes",
    sourceB: "Email thread",
    sourceC: "Signed PDF",
    graph: "Context graph",
    risk: "Permission-aware",
    route: "Routed to workspace",
    steps: ["Capture", "Connect", "Answer"],
  },
  de: {
    eyebrow: "Workflow-Ansicht",
    title: "Aus verstreuter Arbeit wird eine belegte Antwort.",
    sub: "Meetings, E-Mails, PDFs und Aufgaben laufen in eine berechtigungsbewusste Wissensbasis. {brand} verbindet den Kontext, hält die Quellen sichtbar und routet den nächsten Schritt in den richtigen Workspace.",
    query: "Was hat sich seit dem letzten Termin geändert?",
    answer:
      "3 relevante Änderungen gefunden. Zwei sind unkritisch, eine sollte vor der nächsten Frist geprüft werden.",
    sourceA: "Meeting-Notiz",
    sourceB: "E-Mail-Verlauf",
    sourceC: "Signiertes PDF",
    graph: "Kontext-Graph",
    risk: "Rechtebewusst",
    route: "Im Workspace geroutet",
    steps: ["Erfassen", "Verbinden", "Antworten"],
  },
} as const;

function locale(lang: Lang) {
  return lang === "en" ? "en" : "de";
}

export default function ProductWorkflowShowcase({
  lang,
  industry,
}: {
  lang: Lang;
  industry?: string;
}) {
  const l = locale(lang);
  const c = copy[l];
  const profile = profileForIndustry(industry);
  const brand = profile?.brand ?? "Subsumio";
  const signature = profile?.signature.title[l] ?? c.title;
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 80%", "end 20%"],
  });

  // ── Scroll-driven step phases ──────────────────────────────────────
  // 0.00–0.15  Intro (text appears, step 0 active)
  // 0.15–0.45  Step 0 → Step 1 (Capture: first source highlights)
  // 0.45–0.75  Step 1 → Step 2 (Connect: all sources + graph links)
  // 0.75–1.00  Step 2 → Step 3 (Answer: answer card + pills appear)
  const [activeStep, setActiveStep] = useState(0);

  // Mobile auto-showreel: when reduced or small screen, auto-cycle steps
  const [autoStep, setAutoStep] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Auto-showreel for mobile / reduced motion
  useEffect(() => {
    if (!isMobile && !reduced) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cycle = (step: number) => {
      setAutoStep(step);
      if (step < 2) {
        timers.push(setTimeout(() => cycle(step + 1), 2200));
      }
    };
    cycle(0);
    return () => timers.forEach(clearTimeout);
  }, [isMobile, reduced]);

  const currentStep = isMobile || reduced ? autoStep : activeStep;

  // Scroll progress → active step (desktop only)
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (isMobile || reduced) return;
    if (v < 0.15) setActiveStep(0);
    else if (v < 0.45) setActiveStep(0);
    else if (v < 0.75) setActiveStep(1);
    else setActiveStep(2);
  });

  // Source card opacity per step
  const sourceOpacity = (idx: number) => {
    if (reduced) return 1;
    if (currentStep === 0) return idx === 0 ? 1 : 0.35;
    if (currentStep === 1) return 1;
    return 1;
  };
  const sourceScale = (idx: number) => {
    if (reduced) return 1;
    if (currentStep === 0) return idx === 0 ? 1.02 : 0.98;
    return 1;
  };

  // Graph + answer visibility driven by currentStep (works for both scroll + auto)
  const showGraph = currentStep >= 1 || reduced;
  const showAnswer = currentStep >= 2 || reduced;

  return (
    <section
      ref={sectionRef}
      data-tone="light"
      className="relative z-10 overflow-hidden px-4 py-24 sm:px-6 lg:px-8 lg:py-32"
      style={{ background: "var(--mk-bg)", ...(industry ? styleForIndustry(industry) : {}) }}
    >
      <div className="brand-glow-bg absolute inset-x-0 top-1/3 h-64 opacity-40 blur-3xl" />
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.12 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p className="brand-text mb-4 font-mono text-sm tracking-wider uppercase">{c.eyebrow}</p>
          <h2 className={`${H2_CTA_CLASS} mb-5`}>
            {brand}
            <br />
            <span className="gradient-text glow-text">{signature}</span>
          </h2>
          <p className="mb-8 text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
            {c.sub.replace("{brand}", brand)}
          </p>
          <div className="grid gap-3">
            {c.steps.map((step, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: -14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.35, delay: i * 0.08 }}
                className={`relative flex items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 transition-all duration-500 ${
                  currentStep === i
                    ? "brand-border brand-soft [border-color:var(--brand-primary)]"
                    : "[border-color:var(--mk-border)] [background:var(--mk-surface-2)]"
                }`}
              >
                {currentStep === i && (
                  <motion.div
                    layoutId="step-accent"
                    className="brand-bg absolute inset-y-0 left-0 w-1"
                    transition={{ duration: 0.4 }}
                  />
                )}
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border font-mono text-sm transition-colors duration-300 ${
                    currentStep === i
                      ? "brand-bg brand-border border-transparent text-white"
                      : "brand-soft brand-border brand-text"
                  }`}
                >
                  0{i + 1}
                </span>
                <span
                  className={`text-sm transition-all duration-300 ${
                    currentStep === i
                      ? "font-bold [color:var(--brand-text)]"
                      : "font-semibold [color:var(--mk-text)]"
                  }`}
                >
                  {step}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <div className="relative">
          <div
            data-tone="dashboard"
            className="relative overflow-hidden rounded-2xl border [border-color:var(--mk-border-strong)] shadow-2xl shadow-black/20 [background:var(--mk-bg)]"
          >
            <div className="flex items-center gap-3 border-b [border-color:var(--mk-border)] px-4 py-2.5 [background:var(--mk-surface)]">
              <div className="flex items-center gap-2">
                <div className="brand-bg flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
                  <Brain size={13} className="text-white" />
                </div>
                <span className="text-sm font-semibold [color:var(--mk-text)]">{brand}</span>
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-lg border [border-color:var(--mk-border)] px-2.5 py-1.5 [background:var(--mk-bg)]">
                <Search size={13} className="[color:var(--mk-text-subtle)]" />
                <span className="text-sm [color:var(--mk-text-subtle)]">{c.query}</span>
              </div>
            </div>

            <div className="grid min-h-[470px] md:grid-cols-[180px_1fr]">
              <div className="hidden border-r [border-color:var(--mk-border)] p-4 [background:var(--mk-bg)] md:block">
                <div className="mb-6 flex items-center gap-2">
                  <Brain size={17} className="brand-text" />
                  <span className="text-sm font-semibold [color:var(--mk-text)]">{brand}</span>
                </div>
                {[
                  UI_STRINGS[lang].navOverview,
                  UI_STRINGS[lang].navMatters,
                  UI_STRINGS[lang].navDeadlines,
                  UI_STRINGS[lang].navIntake,
                  UI_STRINGS[lang].navChat,
                ].map((item, i) => (
                  <div
                    key={item}
                    className={`mb-2 rounded-lg px-3 py-2 text-sm ${i === 1 ? "brand-soft brand-text" : "[color:var(--mk-text-muted)]"}`}
                  >
                    {item}
                  </div>
                ))}
              </div>

              <div className="relative p-4 md:p-6">
                <div className="mb-5 flex items-center gap-3 rounded-xl border [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-surface)]">
                  <Search size={16} className="brand-text" />
                  <span className="text-sm [color:var(--mk-text)]">{c.query}</span>
                  <CheckCircle2 size={16} className="ml-auto [color:var(--brand-secondary)]" />
                </div>

                <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
                  <div className="space-y-3">
                    {[
                      { icon: FileText, label: c.sourceA, tone: "brand-soft brand-border" },
                      {
                        icon: MessageSquare,
                        label: c.sourceB,
                        tone: "[background:color-mix(in_srgb,var(--brand-tertiary)_10%,transparent)] [border-color:color-mix(in_srgb,var(--brand-tertiary)_22%,transparent)]",
                      },
                      {
                        icon: ShieldCheck,
                        label: c.sourceC,
                        tone: "[background:color-mix(in_srgb,var(--brand-secondary)_10%,transparent)] [border-color:color-mix(in_srgb,var(--brand-secondary)_22%,transparent)]",
                      },
                    ].map((source, i) => {
                      const Icon = source.icon;
                      const isActive = currentStep === 0 ? i === 0 : true;
                      return (
                        <div
                          key={source.label}
                          style={{
                            opacity: sourceOpacity(i),
                            transform: `scale(${sourceScale(i)})`,
                          }}
                          className={`rounded-xl border ${source.tone} p-4 transition-all duration-500 ${
                            isActive ? "shadow-md" : ""
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon size={17} className="brand-text" />
                            <span className="text-sm font-medium [color:var(--mk-text)]">
                              {source.label}
                            </span>
                            <CheckCircle2
                              size={16}
                              className="ml-auto text-[var(--brand-secondary)]"
                            />
                          </div>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full [background:var(--mk-border)]">
                            <motion.div
                              initial={{ width: "0%" }}
                              animate={{
                                width: `${72 + i * 8}%`,
                              }}
                              transition={{
                                duration: 0.8,
                                delay: isMobile || reduced ? i * 0.3 : 0,
                                ease: "easeOut",
                              }}
                              className="brand-bg h-full"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="min-h-[250px] rounded-xl border [border-color:var(--mk-border)] p-4 [background:var(--mk-bg)]">
                    <div className="mb-4 flex items-center gap-2">
                      <GitBranch size={16} className="brand-text" />
                      <span className="text-sm font-semibold [color:var(--mk-text)]">
                        {c.graph}
                      </span>
                    </div>
                    <div className="relative h-44">
                      {[
                        ["left-4 top-8", UI_STRINGS[lang].workflowMatter],
                        ["left-28 top-2", "Person"],
                        ["right-8 top-16", UI_STRINGS[lang].workflowDoc],
                        ["left-20 bottom-4", UI_STRINGS[lang].workflowRisk],
                        ["right-16 bottom-8", UI_STRINGS[lang].workflowTask],
                      ].map(([pos, label], i) => (
                        <motion.div
                          key={label}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{
                            scale: 1,
                            opacity: showGraph ? 1 : 0.3,
                          }}
                          transition={{
                            duration: 0.4,
                            delay: reduced ? 0 : i * 0.08,
                            ease: "easeOut",
                          }}
                          className={`absolute ${pos} brand-border rounded-full border px-3 py-2 text-sm [color:var(--mk-text)] shadow-lg [background:var(--mk-surface)]`}
                        >
                          {label}
                        </motion.div>
                      ))}
                      <div className="absolute inset-6 rounded-full border border-dashed border-[var(--brand-primary)]/25" />
                      <svg className="absolute inset-0 h-full w-full" fill="none">
                        <motion.line
                          x1="20%"
                          y1="30%"
                          x2="50%"
                          y2="15%"
                          stroke="var(--brand-primary)"
                          strokeWidth="1.5"
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: showGraph ? 1 : 0, opacity: showGraph ? 0.6 : 0 }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        />
                        <motion.line
                          x1="50%"
                          y1="15%"
                          x2="80%"
                          y2="35%"
                          stroke="var(--brand-primary)"
                          strokeWidth="1.5"
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: showGraph ? 1 : 0, opacity: showGraph ? 0.6 : 0 }}
                          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
                        />
                        <motion.line
                          x1="20%"
                          y1="30%"
                          x2="45%"
                          y2="80%"
                          stroke="var(--brand-primary)"
                          strokeWidth="1.5"
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: showGraph ? 1 : 0, opacity: showGraph ? 0.6 : 0 }}
                          transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
                        />
                        <motion.line
                          x1="45%"
                          y1="80%"
                          x2="75%"
                          y2="70%"
                          stroke="var(--brand-primary)"
                          strokeWidth="1.5"
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: showGraph ? 1 : 0, opacity: showGraph ? 0.6 : 0 }}
                          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: showAnswer ? 1 : 0, y: showAnswer ? 0 : 20 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="brand-border mt-4 rounded-xl border p-4 [background:var(--mk-surface)]"
                >
                  <div className="flex items-start gap-3">
                    <Brain size={18} className="brand-text mt-0.5" />
                    <div>
                      <p className="mb-1 text-sm font-semibold [color:var(--mk-text)]">
                        {c.answer}
                      </p>
                      <div className="flex flex-wrap gap-2 text-sm">
                        <span className="brand-soft brand-text rounded-full px-2 py-1">
                          {c.risk}
                        </span>
                        <span className="rounded-full px-2 py-1 [color:var(--mk-text-muted)] [background:var(--mk-border)]">
                          {c.route}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
