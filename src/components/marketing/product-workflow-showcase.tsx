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
  Sparkles,
} from "lucide-react";
import { type Lang } from "@/content/site";
import { profileForIndustry } from "@/lib/industry-pack";
import { styleForIndustry } from "@/lib/industry-theme";

const copy = {
  en: {
    eyebrow: "Workflow view",
    title: "From scattered work to one cited answer.",
    sub: "Meetings, emails, PDFs and tasks flow into a permission-aware brain. {brand} links the context, keeps the source trail visible, and routes the next action to the right workspace.",
    query: "What changed since the last meeting?",
    answer: "3 material changes found. Two are low risk, one needs review before the next deadline.",
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
    sub: "Meetings, E-Mails, PDFs und Aufgaben laufen in ein rechtebewusstes Brain. {brand} verbindet den Kontext, hält die Quellen sichtbar und routet den nächsten Schritt in den richtigen Workspace.",
    query: "Was hat sich seit dem letzten Termin geändert?",
    answer: "3 relevante Änderungen gefunden. Zwei sind unkritisch, eine sollte vor der nächsten Frist geprüft werden.",
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
  return lang === "de" ? "de" : "en";
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
      className="relative z-10 py-28 px-6 overflow-hidden border-y [border-color:var(--mk-border)]"
      style={industry ? styleForIndustry(industry) : undefined}
    >
      <div className="absolute inset-x-0 top-1/3 h-64 brand-glow-bg blur-3xl opacity-40" />
      <div className="max-w-7xl mx-auto grid lg:grid-cols-[0.8fr_1.2fr] gap-10 lg:gap-14 items-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p className="text-xs font-mono uppercase tracking-wider brand-text mb-4">{c.eyebrow}</p>
          <h2 className="text-3xl md:text-5xl font-black [color:var(--mk-text)] leading-tight mb-5">
            {brand}<br />
            <span className="gradient-text glow-text">{signature}</span>
          </h2>
          <p className="text-base md:text-lg [color:var(--mk-text-muted)] leading-relaxed mb-8">{c.sub.replace("{brand}", brand)}</p>
          <div className="grid gap-3">
            {c.steps.map((step, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, x: -14 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.35, delay: i * 0.08 }}
                className="flex items-center gap-3 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface-2)] px-4 py-3"
              >
                <span className="w-7 h-7 rounded-lg brand-soft border brand-border flex items-center justify-center text-xs font-mono brand-text">
                  0{i + 1}
                </span>
                <span className="text-sm font-semibold [color:var(--mk-text)]">{step}</span>
                <ArrowRight size={14} className="ml-auto [color:var(--mk-text-subtle)]" />
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div style={{ y: yPanel }} className="relative">
          <div className="absolute -inset-6 brand-glow-bg blur-3xl rounded-full" />
          <div data-tone="slate" className="relative overflow-hidden rounded-2xl border [border-color:var(--mk-border-strong)] [background:var(--mk-bg)] shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between border-b [border-color:var(--mk-border)] [background:var(--mk-surface)] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="text-xs font-mono [color:var(--mk-text-subtle)]">{brand} workspace</div>
            </div>

            <div className="grid md:grid-cols-[180px_1fr] min-h-[470px]">
              <div className="hidden md:block border-r [border-color:var(--mk-border)] [background:var(--mk-bg)] p-4">
                <div className="flex items-center gap-2 mb-6">
                  <Brain size={17} className="brand-text" />
                  <span className="text-sm font-bold [color:var(--mk-text)]">{brand}</span>
                </div>
                {["Inbox", "Graph", "Answers", "Audit"].map((item, i) => (
                  <div key={item} className={`mb-2 rounded-lg px-3 py-2 text-xs ${i === 1 ? "brand-soft brand-text" : "[color:var(--mk-text-muted)]"}`}>
                    {item}
                  </div>
                ))}
              </div>

              <div className="relative p-4 md:p-6">
                <div className="flex items-center gap-3 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] px-4 py-3 mb-5">
                  <Search size={16} className="brand-text" />
                  <span className="text-sm [color:var(--mk-text)]">{c.query}</span>
                  <Sparkles size={16} className="ml-auto [color:var(--brand-secondary)]" />
                </div>

                <div className="grid lg:grid-cols-[1fr_0.9fr] gap-4">
                  <motion.div style={{ y: yCards }} className="space-y-3">
                    {[
                      { icon: FileText, label: c.sourceA, tone: "brand-soft" },
                      { icon: MessageSquare, label: c.sourceB, tone: "bg-cyan-500/10 border-cyan-500/20" },
                      { icon: ShieldCheck, label: c.sourceC, tone: "bg-[var(--brand-secondary)]/10 border-[var(--brand-secondary)]/20" },
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
                            <span className="text-sm font-medium [color:var(--mk-text)]">{source.label}</span>
                            <CheckCircle2 size={16} className="ml-auto text-[var(--brand-secondary)]" />
                          </div>
                          <div className="mt-3 h-1.5 rounded-full [background:var(--mk-border)] overflow-hidden">
                            <motion.div
                              initial={{ width: "20%" }}
                              whileInView={{ width: `${72 + i * 8}%` }}
                              viewport={{ once: true }}
                              transition={{ duration: 0.8, delay: 0.2 + i * 0.1 }}
                              className="h-full brand-bg"
                            />
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>

                  <motion.div style={{ y: yGraph }} className="rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-bg)] p-4 min-h-[250px]">
                    <div className="flex items-center gap-2 mb-4">
                      <GitBranch size={16} className="brand-text" />
                      <span className="text-sm font-semibold [color:var(--mk-text)]">{c.graph}</span>
                    </div>
                    <div className="relative h-44">
                      {[
                        ["left-4 top-8", "Matter"],
                        ["left-28 top-2", "Person"],
                        ["right-8 top-16", "Doc"],
                        ["left-20 bottom-4", "Risk"],
                        ["right-16 bottom-8", "Task"],
                      ].map(([pos, label], i) => (
                        <motion.div
                          key={label}
                          initial={{ scale: 0.8, opacity: 0 }}
                          whileInView={{ scale: 1, opacity: 1 }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.35, delay: 0.12 * i }}
                          className={`absolute ${pos} rounded-full border brand-border [background:var(--mk-surface)] px-3 py-2 text-[11px] [color:var(--mk-text)] shadow-lg`}
                        >
                          {label}
                        </motion.div>
                      ))}
                      <div className="absolute inset-6 rounded-full border border-dashed border-[var(--brand-primary)]/25" />
                      <div className="absolute inset-x-12 top-20 h-px brand-bg opacity-50" />
                      <div className="absolute left-24 top-12 h-24 w-px brand-bg opacity-40 rotate-45" />
                    </div>
                  </motion.div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.35 }}
                  transition={{ duration: 0.45, delay: 0.25 }}
                  className="mt-4 rounded-xl border brand-border [background:var(--mk-surface)] p-4"
                >
                  <div className="flex items-start gap-3">
                    <Brain size={18} className="brand-text mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold [color:var(--mk-text)] mb-1">{c.answer}</p>
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-full brand-soft brand-text px-2 py-1">{c.risk}</span>
                        <span className="rounded-full [background:var(--mk-border)] [color:var(--mk-text-muted)] px-2 py-1">{c.route}</span>
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
