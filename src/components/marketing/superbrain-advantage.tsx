"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
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
import { p, type Lang } from "@/content/site";
import { Button } from "@/components/ui/button";
import { GradientMesh } from "./motion-system";

const copy = {
  en: {
    eyebrow: "The Subsumio engine",
    title: "Not another chatbot. The memory layer your firm runs on.",
    sub: "Most assistants answer one prompt and forget. Subsumio builds a durable, permission-aware knowledge base over your own work: files, messages, meetings, entities, deadlines and open risks — then answers with citations.",
    center: "Your firm knowledge base",
    proof: [
      {
        icon: Database,
        title: "Own data first",
        desc: "Answers come from your matters, clients and documents — not generic web guesses.",
      },
      {
        icon: GitBranch,
        title: "Graph memory",
        desc: "People, companies, files, deadlines and relationships stay connected as reusable context.",
      },
      {
        icon: FileSearch,
        title: "Cited answers",
        desc: "Every synthesis keeps source trails visible, with gaps called out instead of hidden.",
      },
      {
        icon: ShieldCheck,
        title: "Deployment choice",
        desc: "Self-hosted on your keys and hardware, or managed EU cloud when you want speed.",
      },
    ],
    capabilityTitle: "What your knowledge base does",
    capabilities: [
      {
        icon: Brain,
        title: "Compounds",
        desc: "Every matter, every email, every deadline feeds the knowledge base — it remembers what your firm has ever done.",
      },
      {
        icon: FileSearch,
        title: "Retrieves",
        desc: "Hybrid search across vector, keyword and graph finds the passage that wins the case — with page-level citations.",
      },
      {
        icon: ShieldCheck,
        title: "Protects",
        desc: "Per-matter scoping, fuzz-tested isolation, no training on your data. Confidentiality by architecture, not promise.",
      },
    ],
    cta: "Explore features",
  },
  de: {
    eyebrow: "Die Subsumio-Engine",
    title: "Kein weiterer Chatbot. Die Gedächtnisschicht, auf der deine Kanzlei läuft.",
    sub: "Die meisten Assistenten beantworten einen Prompt und vergessen. Subsumio baut eine dauerhafte, rechtebewusste Wissensbasis über deine eigene Arbeit: Dateien, Nachrichten, Termine, Entitäten, Fristen und offene Risiken — und antwortet mit Fundstellen.",
    center: "Deine Kanzlei-Wissensbasis",
    proof: [
      {
        icon: Database,
        title: "Eigene Daten zuerst",
        desc: "Antworten kommen aus deinen Akten, Mandanten und Dokumenten — nicht aus generischen Web-Vermutungen.",
      },
      {
        icon: GitBranch,
        title: "Graph-Gedächtnis",
        desc: "Personen, Firmen, Dateien, Fristen und Beziehungen bleiben als wiederverwendbarer Kontext verbunden.",
      },
      {
        icon: FileSearch,
        title: "Belegte Antworten",
        desc: "Jede Synthese zeigt Quellen und markiert Lücken, statt sie elegant zu verstecken.",
      },
      {
        icon: ShieldCheck,
        title: "Deployment-Wahl",
        desc: "Self-hosted mit eigenen Keys und Hardware, oder gemanagte EU-Cloud wenn es schnell gehen soll.",
      },
    ],
    capabilityTitle: "Was dein Brain kann",
    capabilities: [
      {
        icon: Brain,
        title: "Verzinst",
        desc: "Jede Akte, jede E-Mail, jede Frist speist das Brain — es erinnert sich an alles, was deine Kanzlei je getan hat.",
      },
      {
        icon: FileSearch,
        title: "Findet",
        desc: "Hybride Suche über Vektor, Keyword und Graph findet die Passage, die den Fall gewinnt — mit seitengenauen Zitaten.",
      },
      {
        icon: ShieldCheck,
        title: "Schützt",
        desc: "Scoping pro Mandat, fuzz-getestete Isolation, kein Training auf deinen Daten. Vertraulichkeit per Architektur, nicht per Versprechen.",
      },
    ],
    cta: "Features ansehen",
  },
} as const;

const orbitNodes = [
  { icon: MessageSquare, label: "Messages", className: "left-2 top-10" },
  { icon: FileSearch, label: "Files", className: "right-4 top-8" },
  { icon: Network, label: "Graph", className: "left-8 bottom-8" },
  { icon: LockKeyhole, label: "Access", className: "right-8 bottom-10" },
];

export default function SuperbrainAdvantage({ lang }: { lang: Lang }) {
  const t = copy[lang === "de" ? "de" : "en"];
  const reduced = useReducedMotion();

  return (
    <section
      data-tone="slate"
      className="relative z-10 overflow-hidden border-y [border-color:var(--mk-border)] px-4 py-28 [background:var(--mk-surface)] sm:px-6 lg:px-8"
    >
      <GradientMesh className="opacity-60" />
      <div className="brand-glow-bg absolute inset-x-0 top-16 h-72 opacity-50 blur-3xl" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p className="brand-text mb-4 font-mono text-xs tracking-wider uppercase">{t.eyebrow}</p>
          <h2 className="mb-5 text-3xl leading-tight font-black [color:var(--mk-text)] md:text-5xl">
            {t.title}
          </h2>
          <p className="mb-8 text-base leading-relaxed [color:var(--mk-text-muted)] md:text-lg">
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
          <motion.div
            animate={reduced ? undefined : { rotate: 360 }}
            transition={{ duration: 34, repeat: Infinity, ease: "linear" }}
            className="absolute inset-8 rounded-full border border-dashed border-[var(--brand-primary)]/20"
          />
          <div
            data-tone="slate"
            className="relative min-h-[560px] overflow-hidden rounded-2xl border [border-color:var(--mk-border-strong)] shadow-2xl shadow-black/20 [background:var(--mk-bg)]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,var(--brand-glow),transparent_42%)]" />
            <div className="relative h-[300px]">
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true, amount: 0.45 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                className="brand-soft-strong brand-border-strong absolute top-1/2 left-1/2 flex h-40 w-40 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border text-center"
              >
                <Brain size={34} className="brand-text mb-3" />
                <span className="text-sm font-bold [color:var(--mk-text)]">{t.center}</span>
                <span className="mt-1 text-xs [color:var(--mk-text-muted)]">
                  {lang === "de" ? "abfragbar · belegt · isoliert" : "queryable · cited · scoped"}
                </span>
              </motion.div>
              {orbitNodes.map((node, i) => {
                const Icon = node.icon;
                return (
                  <motion.div
                    key={node.label}
                    initial={{ opacity: 0, scale: 0.85 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.35, delay: 0.1 + i * 0.08 }}
                    className={`absolute ${node.className} flex items-center gap-2 rounded-xl border [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-surface)]`}
                  >
                    <Icon size={16} className="brand-text" />
                    <span className="text-xs font-medium [color:var(--mk-text)]">{node.label}</span>
                  </motion.div>
                );
              })}
              <div className="brand-bg absolute top-1/2 right-[18%] left-[18%] h-px opacity-30" />
              <div className="brand-bg absolute top-[22%] bottom-[20%] left-1/2 w-px opacity-30" />
            </div>

            <div className="relative border-t [border-color:var(--mk-border)] p-5 md:p-6">
              <div className="mb-4 flex items-center gap-2">
                <Database size={16} className="brand-text" />
                <h3 className="text-sm font-bold [color:var(--mk-text)]">{t.capabilityTitle}</h3>
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
