"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Database,
  FileSearch,
  GitBranch,
  LockKeyhole,
  MessageSquare,
  Network,
  ShieldCheck,
} from "lucide-react";
import { p, UI_STRINGS, type Lang } from "@/content/site";
import { Button } from "@/components/ui/button";
import { H2_CTA_CLASS } from "./chrome";

const copy = {
  en: {
    eyebrow: "The Subsumio engine",
    title: "Not a chatbot. Your firm's memory.",
    sub: "Subsumio connects matters, deadlines and people into a knowledge graph — and answers with sources, not guesses.",
    center: "Your firm brain",
    proof: [
      {
        icon: Database,
        title: "Own data first",
        desc: "Answers from your matters — not generic web guesses.",
      },
      {
        icon: GitBranch,
        title: "Graph memory",
        desc: "People, companies, deadlines and relationships stay connected.",
      },
      {
        icon: FileSearch,
        title: "Cited answers",
        desc: "Every synthesis shows sources and calls out gaps.",
      },
      {
        icon: ShieldCheck,
        title: "Deployment choice",
        desc: "Self-hosted or managed EU cloud.",
      },
    ],
    capabilityTitle: "What your brain does",
    capabilities: [
      {
        icon: Brain,
        title: "Compounds",
        desc: "Every matter, every email feeds the brain — it remembers everything.",
      },
      {
        icon: FileSearch,
        title: "Retrieves",
        desc: "Hybrid search finds the passage that wins the case — with citations.",
      },
      {
        icon: ShieldCheck,
        title: "Protects",
        desc: "Per-matter scoping, no training on your data.",
      },
    ],
    cta: "Explore features",
  },
  de: {
    eyebrow: "Die Subsumio-Engine",
    title: "Kein Chatbot. Das Gedächtnis deiner Kanzlei.",
    sub: "Subsumio verbindet Akten, Fristen und Personen zu einem Wissensgraphen — und antwortet mit Quellen, nicht mit Vermutungen.",
    center: "Deine Kanzlei-Wissensbasis",
    proof: [
      {
        icon: Database,
        title: "Eigene Daten zuerst",
        desc: "Antworten aus deinen Akten — nicht aus generischen Web-Vermutungen.",
      },
      {
        icon: GitBranch,
        title: "Graph-Gedächtnis",
        desc: "Personen, Firmen, Fristen und Beziehungen bleiben verbunden.",
      },
      {
        icon: FileSearch,
        title: "Belegte Antworten",
        desc: "Jede Synthese zeigt Quellen und markiert Lücken.",
      },
      {
        icon: ShieldCheck,
        title: "Deployment-Wahl",
        desc: "Self-hosted oder gemanagte EU-Cloud.",
      },
    ],
    capabilityTitle: "Was dein Brain kann",
    capabilities: [
      {
        icon: Brain,
        title: "Wächst",
        desc: "Jede Akte, jede E-Mail speist das Brain — es erinnert sich an alles.",
      },
      {
        icon: FileSearch,
        title: "Findet",
        desc: "Hybride Suche findet die Passage, die den Fall gewinnt — mit Zitaten.",
      },
      {
        icon: ShieldCheck,
        title: "Schützt",
        desc: "Scoping pro Mandat, kein Training auf deinen Daten.",
      },
    ],
    cta: "Features ansehen",
  },
} as const;

const orbitNodes = [
  { icon: MessageSquare, labelEn: "Messages", labelDe: "Nachrichten", className: "left-2 top-10" },
  { icon: FileSearch, labelEn: "Files", labelDe: "Dateien", className: "right-4 top-8" },
  { icon: Network, labelEn: "Graph", labelDe: "Graph", className: "left-8 bottom-8" },
  { icon: LockKeyhole, labelEn: "Access", labelDe: "Zugriff", className: "right-8 bottom-10" },
];

export default function SuperbrainAdvantage({ lang }: { lang: Lang }) {
  const t = copy[lang === "en" ? "en" : "de"];

  return (
    <section
      data-tone="slate"
      aria-label={UI_STRINGS[lang].ariaSubsumioEngine}
      className="relative z-10 overflow-hidden px-4 py-24 sm:px-6 lg:px-8"
      style={{ background: "var(--mk-bg)" }}
    >
      {/* Premium top edge — hairline + subtle brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--mk-border-strong)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{
          background:
            "radial-gradient(ellipse 70% 100% at 50% 0%, color-mix(in srgb, var(--brand-primary) 7%, transparent), transparent)",
        }}
      />
      <div className="brand-glow-bg absolute inset-x-0 top-16 h-72 opacity-25 blur-3xl" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.12 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p className="brand-text mb-4 font-mono text-xs tracking-wider uppercase">{t.eyebrow}</p>
          <h2 className={`${H2_CTA_CLASS} mb-5`}>{t.title}</h2>
          <p className="mb-8 text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
            {t.sub}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {t.proof.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.35, delay: i * 0.06 }}
                  className="rounded-xl border [border-color:var(--mk-border)] p-4 [background:var(--mk-surface-2)]"
                >
                  <Icon size={18} className="brand-text mb-3" />
                  <h3 className="mb-1.5 text-sm font-semibold [color:var(--mk-text)]">
                    {item.title}
                  </h3>
                  <p className="text-xs leading-relaxed [color:var(--mk-text-muted)]">
                    {item.desc}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        <div className="relative">
          <div className="absolute inset-8 rounded-full border border-dashed border-[var(--brand-primary)]/15" />
          <div
            data-tone="dashboard"
            className="relative min-h-[560px] overflow-hidden rounded-2xl border [border-color:var(--mk-border-strong)] shadow-2xl shadow-black/20 [background:var(--mk-bg)]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,var(--brand-glow),transparent_50%)]" />
            <div className="relative h-[300px]">
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true, amount: 0.45 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                className="brand-soft-strong brand-border-strong absolute top-1/2 left-1/2 flex h-40 w-40 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border text-center"
              >
                <Brain size={34} className="brand-text mb-3" />
                <span className="text-sm font-semibold [color:var(--mk-text)]">{t.center}</span>
                <span className="mt-1 text-xs [color:var(--mk-text-muted)]">
                  {UI_STRINGS[lang].engineTraits}
                </span>
              </motion.div>
              {orbitNodes.map((node, i) => {
                const Icon = node.icon;
                const label = lang === "en" ? node.labelEn : node.labelDe;
                return (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, scale: 0.85 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.35, delay: 0.1 + i * 0.08 }}
                    className={`absolute ${node.className} flex items-center gap-2 rounded-xl border [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-surface)]`}
                  >
                    <Icon size={16} className="brand-text" />
                    <span className="text-xs font-medium [color:var(--mk-text)]">{label}</span>
                  </motion.div>
                );
              })}
              <div className="brand-bg absolute top-1/2 right-[18%] left-[18%] h-px opacity-30" />
              <div className="brand-bg absolute top-[22%] bottom-[20%] left-1/2 w-px opacity-30" />
            </div>

            <div className="relative border-t [border-color:var(--mk-border)] p-5 md:p-6">
              <div className="mb-4 flex items-center gap-2">
                <Database size={16} className="brand-text" />
                <h3 className="text-sm font-semibold [color:var(--mk-text)]">
                  {t.capabilityTitle}
                </h3>
              </div>
              <div className="space-y-3">
                {t.capabilities.map((row, i) => {
                  const Icon = row.icon;
                  return (
                    <motion.div
                      key={row.title}
                      initial={{ opacity: 0, x: 16 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, amount: 0.4 }}
                      transition={{ duration: 0.35, delay: i * 0.08 }}
                      className="flex items-start gap-3 rounded-xl border [border-color:var(--mk-border)] p-3 text-sm [background:var(--mk-surface)]"
                    >
                      <Icon size={16} className="brand-text mt-0.5 shrink-0" />
                      <div>
                        <span className="font-semibold [color:var(--mk-text)]">{row.title}</span>
                        <span className="mt-0.5 block text-xs [color:var(--mk-text-muted)]">
                          {row.desc}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              <Link href={p(lang, "/features")} className="mt-5 inline-flex">
                <Button variant="outline" size="sm">
                  {t.cta} <ArrowRight size={15} />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
