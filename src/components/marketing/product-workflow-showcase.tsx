"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
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
import { GuidedCursor } from "./motion-system";

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
  return lang !== "en" ? "de" : "en";
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
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start end", "end start"] });
  const yPanel = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [34, -34]);
  const yGraph = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [-22, 26]);
  const yCards = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [18, -18]);

  return (
    <section
      ref={sectionRef}
      data-tone="light"
      className="relative z-10 overflow-hidden px-4 py-24 sm:px-6 lg:px-8"
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
          <p className="brand-text mb-4 font-mono text-xs tracking-wider uppercase">{c.eyebrow}</p>
          <h2 className="mb-5 [font-family:var(--font-display)] text-[1.75rem] leading-[1.12] font-black tracking-[-0.02em] [color:var(--mk-text)] md:text-4xl">
            {brand}
            <br />
            <span className="gradient-text glow-text">{signature}</span>
          </h2>
          <p className="mb-8 text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg">
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
                className="flex items-center gap-3 rounded-xl border [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-surface-2)]"
              >
                <span className="brand-soft brand-border brand-text flex h-7 w-7 items-center justify-center rounded-lg border font-mono text-xs">
                  0{i + 1}
                </span>
                <span className="text-sm font-semibold [color:var(--mk-text)]">{step}</span>
                <ArrowRight size={14} className="ml-auto [color:var(--mk-text-subtle)]" />
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div style={{ y: yPanel }} className="relative">
          <div className="brand-glow-bg absolute -inset-6 rounded-full blur-3xl" />
          <div
            data-tone="dashboard"
            className="relative overflow-hidden rounded-2xl border [border-color:var(--mk-border-strong)] shadow-2xl shadow-black/20 [background:var(--mk-bg)]"
          >
            <GuidedCursor
              x={["63%", "35%", "74%", "58%"]}
              y={["24%", "45%", "53%", "82%"]}
              label={UI_STRINGS[lang].followContext}
              className="hidden md:flex"
              duration={7.2}
            />
            <div className="flex items-center gap-3 border-b [border-color:var(--mk-border)] px-4 py-2.5 [background:var(--mk-surface)]">
              <div className="flex items-center gap-2">
                <div className="brand-bg flex h-6 w-6 shrink-0 items-center justify-center rounded-md">
                  <Brain size={13} className="text-white" />
                </div>
                <span className="text-xs font-semibold [color:var(--mk-text)]">{brand}</span>
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-lg border [border-color:var(--mk-border)] px-2.5 py-1.5 [background:var(--mk-bg)]">
                <Search size={13} className="[color:var(--mk-text-subtle)]" />
                <span className="text-xs [color:var(--mk-text-subtle)]">{c.query}</span>
              </div>
            </div>

            <div className="grid min-h-[470px] md:grid-cols-[180px_1fr]">
              <div className="hidden border-r [border-color:var(--mk-border)] p-4 [background:var(--mk-bg)] md:block">
                <div className="mb-6 flex items-center gap-2">
                  <Brain size={17} className="brand-text" />
                  <span className="text-sm font-semibold [color:var(--mk-text)]">{brand}</span>
                </div>
                {(lang !== "en"
                  ? ["Übersicht", "Akten", "Fristen", "Intake", "Chat"]
                  : ["Overview", "Matters", "Deadlines", "Intake", "Chat"]
                ).map((item, i) => (
                  <div
                    key={item}
                    className={`mb-2 rounded-lg px-3 py-2 text-xs ${i === 1 ? "brand-soft brand-text" : "[color:var(--mk-text-muted)]"}`}
                  >
                    {item}
                  </div>
                ))}
              </div>

              <div className="relative p-4 md:p-6">
                <motion.div
                  animate={reduced ? undefined : { scale: [1, 1.012, 1] }}
                  transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
                  className="mb-5 flex items-center gap-3 rounded-xl border [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-surface)]"
                >
                  <Search size={16} className="brand-text" />
                  <span className="text-sm [color:var(--mk-text)]">{c.query}</span>
                  <CheckCircle2 size={16} className="ml-auto [color:var(--brand-secondary)]" />
                </motion.div>

                <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                  <motion.div style={{ y: yCards }} className="space-y-3">
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
                      return (
                        <motion.div
                          key={source.label}
                          initial={{ opacity: 0, x: -14 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true, amount: 0.4 }}
                          transition={{ duration: 0.35, delay: i * 0.08 }}
                          className={`rounded-xl border ${source.tone} p-4`}
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
                              initial={{ width: "20%" }}
                              whileInView={{ width: `${72 + i * 8}%` }}
                              viewport={{ once: true }}
                              transition={{ duration: 0.8, delay: 0.2 + i * 0.1 }}
                              className="brand-bg h-full"
                            />
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>

                  <motion.div
                    style={{ y: yGraph }}
                    className="min-h-[250px] rounded-xl border [border-color:var(--mk-border)] p-4 [background:var(--mk-bg)]"
                  >
                    <div className="mb-4 flex items-center gap-2">
                      <GitBranch size={16} className="brand-text" />
                      <span className="text-sm font-semibold [color:var(--mk-text)]">
                        {c.graph}
                      </span>
                    </div>
                    <div className="relative h-44">
                      {[
                        ["left-4 top-8", lang !== "en" ? "Akte" : "Matter"],
                        ["left-28 top-2", "Person"],
                        ["right-8 top-16", lang !== "en" ? "Dok" : "Doc"],
                        ["left-20 bottom-4", lang !== "en" ? "Risiko" : "Risk"],
                        ["right-16 bottom-8", lang !== "en" ? "Aufgabe" : "Task"],
                      ].map(([pos, label], i) => (
                        <motion.div
                          key={label}
                          initial={{ scale: 0.8, opacity: 0 }}
                          whileInView={{ scale: 1, opacity: 1 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.35, delay: 0.12 * i }}
                          className={`absolute ${pos} brand-border rounded-full border px-3 py-2 text-xs [color:var(--mk-text)] shadow-lg [background:var(--mk-surface)]`}
                        >
                          {label}
                        </motion.div>
                      ))}
                      <div className="absolute inset-6 rounded-full border border-dashed border-[var(--brand-primary)]/25" />
                      <div className="brand-bg absolute inset-x-12 top-20 h-px opacity-50" />
                      <div className="brand-bg absolute top-12 left-24 h-24 w-px rotate-45 opacity-40" />
                    </div>
                  </motion.div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  animate={reduced ? undefined : { scale: [1, 1.014, 1] }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{
                    opacity: { duration: 0.45, delay: 0.25 },
                    y: { duration: 0.45, delay: 0.25 },
                    scale: { duration: 4.2, repeat: Infinity, ease: "easeInOut" },
                  }}
                  className="brand-border mt-4 rounded-xl border p-4 [background:var(--mk-surface)]"
                >
                  <div className="flex items-start gap-3">
                    <Brain size={18} className="brand-text mt-0.5" />
                    <div>
                      <p className="mb-1 text-sm font-semibold [color:var(--mk-text)]">
                        {c.answer}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs">
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
        </motion.div>
      </div>
    </section>
  );
}
