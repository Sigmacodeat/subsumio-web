"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Database,
  FileSearch,
  GitBranch,
  LockKeyhole,
  MessageSquare,
  Network,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { p, type Lang } from "@/content/site";
import { Button } from "@/components/ui/button";

const copy = {
  en: {
    eyebrow: "Sigma Superbrain",
    title: "Not another chatbot. The memory layer your firm can run on.",
    sub: "Most AI tools answer one prompt. Sigmabrain builds a durable, permission-aware brain over your own work: files, messages, meetings, entities, decisions and open loops.",
    center: "Your firm brain",
    proof: [
      { icon: Database, title: "Own data first", desc: "Answers come from your matters, clients, deals and documents, not generic web guesses." },
      { icon: GitBranch, title: "Graph memory", desc: "People, companies, files, deadlines and promises stay connected as reusable context." },
      { icon: FileSearch, title: "Cited answers", desc: "Every synthesis keeps source trails visible, with gaps called out instead of hidden." },
      { icon: ShieldCheck, title: "Deployment choice", desc: "Self-hosted on your keys and hardware, or managed EU cloud when you want speed." },
    ],
    comparisonTitle: "Where Sigmabrain wins",
    comparisons: [
      { label: "Chatbots", weak: "forget context after the conversation", strong: "compound your institutional memory" },
      { label: "DMS / Drive", weak: "store files and folders", strong: "answer across files, notes and relationships" },
      { label: "Enterprise AI suites", weak: "start expensive and closed", strong: "run on your infrastructure, branch-specific and ownable" },
    ],
    cta: "Compare honestly",
  },
  de: {
    eyebrow: "Sigma Superbrain",
    title: "Kein weiterer Chatbot. Die Gedächtnisschicht, auf der eure Firma laufen kann.",
    sub: "Die meisten KI-Tools beantworten einen Prompt. Sigmabrain baut ein dauerhaftes, rechtebewusstes Brain über eure eigene Arbeit: Dateien, Nachrichten, Termine, Entitäten, Entscheidungen und offene Punkte.",
    center: "Euer Firmen-Brain",
    proof: [
      { icon: Database, title: "Eigene Daten zuerst", desc: "Antworten kommen aus euren Akten, Mandanten, Deals und Dokumenten, nicht aus generischen Web-Vermutungen." },
      { icon: GitBranch, title: "Graph-Gedächtnis", desc: "Personen, Firmen, Dateien, Fristen und Zusagen bleiben als wiederverwendbarer Kontext verbunden." },
      { icon: FileSearch, title: "Belegte Antworten", desc: "Jede Synthese zeigt Quellen, und markiert Lücken, statt sie elegant zu verstecken." },
      { icon: ShieldCheck, title: "Deployment-Wahl", desc: "Self-hosted mit eigenen Keys und Hardware, oder gemanagte EU-Cloud wenn es schnell gehen soll." },
    ],
    comparisonTitle: "Wo Sigmabrain gewinnt",
    comparisons: [
      { label: "Chatbots", weak: "vergessen Kontext nach dem Gespräch", strong: "verzinsen euer Firmenwissen" },
      { label: "DMS / Drive", weak: "speichern Dateien und Ordner", strong: "antworten über Dateien, Notizen und Beziehungen" },
      { label: "Enterprise-KI-Suiten", weak: "starten teuer und geschlossen", strong: "laufen auf eurer Infrastruktur, branchenspezifisch und kontrollierbar" },
    ],
    cta: "Ehrlich vergleichen",
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
    <section className="relative z-10 py-28 px-6 [background:color-mix(in_srgb,var(--mk-surface)_50%,transparent)] border-y [border-color:var(--mk-border)] overflow-hidden">
      <div className="absolute inset-x-0 top-16 h-72 brand-glow-bg blur-3xl opacity-60" />
      <div className="max-w-7xl mx-auto grid lg:grid-cols-[1fr_1.05fr] gap-12 items-center">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p className="text-xs font-mono uppercase tracking-wider brand-text mb-4">{t.eyebrow}</p>
          <h2 className="text-3xl md:text-5xl font-black [color:var(--mk-text)] leading-tight mb-5">
            {t.title}
          </h2>
          <p className="text-base md:text-lg [color:var(--mk-text-muted)] leading-relaxed mb-8">{t.sub}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {t.proof.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.35, delay: i * 0.06 }}
                  className="rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] p-4"
                >
                  <Icon size={18} className="brand-text mb-3" />
                  <h3 className="text-sm font-semibold [color:var(--mk-text)] mb-1.5">{item.title}</h3>
                  <p className="text-xs [color:var(--mk-text-muted)] leading-relaxed">{item.desc}</p>
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
          <div className="relative min-h-[560px] rounded-2xl border [border-color:var(--mk-border-strong)] [background:var(--mk-bg)] overflow-hidden shadow-2xl shadow-black/50">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,var(--brand-glow),transparent_42%)]" />
            <div className="relative h-[300px]">
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true, amount: 0.45 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                className="absolute left-1/2 top-1/2 w-40 h-40 -translate-x-1/2 -translate-y-1/2 rounded-full brand-soft-strong border brand-border-strong flex flex-col items-center justify-center text-center"
              >
                <Brain size={34} className="brand-text mb-3" />
                <span className="text-sm font-bold [color:var(--mk-text)]">{t.center}</span>
                <span className="mt-1 text-[11px] [color:var(--mk-text-muted)]">queryable · cited · scoped</span>
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
                    className={`absolute ${node.className} rounded-xl border [border-color:var(--mk-border)] [background:color-mix(in_srgb,var(--mk-surface)_95%,transparent)] px-4 py-3 flex items-center gap-2`}
                  >
                    <Icon size={16} className="brand-text" />
                    <span className="text-xs font-medium [color:var(--mk-text)]">{node.label}</span>
                  </motion.div>
                );
              })}
              <div className="absolute left-[18%] right-[18%] top-1/2 h-px brand-bg opacity-30" />
              <div className="absolute left-1/2 top-[22%] bottom-[20%] w-px brand-bg opacity-30" />
            </div>

            <div className="relative border-t [border-color:var(--mk-border)] p-5 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles size={16} className="brand-text" />
                <h3 className="text-sm font-bold [color:var(--mk-text)]">{t.comparisonTitle}</h3>
              </div>
              <div className="space-y-3">
                {t.comparisons.map((row, i) => (
                  <motion.div
                    key={row.label}
                    initial={{ opacity: 0, x: 16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.35, delay: i * 0.08 }}
                    className="grid md:grid-cols-[120px_1fr_1fr] gap-3 rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] p-3 text-sm"
                  >
                    <span className="font-semibold [color:var(--mk-text)]">{row.label}</span>
                    <span className="[color:var(--mk-text-muted)]">{row.weak}</span>
                    <span className="inline-flex items-start gap-2 [color:var(--mk-text)]">
                      <CheckCircle2 size={16} className="brand-text shrink-0 mt-0.5" />
                      {row.strong}
                    </span>
                  </motion.div>
                ))}
              </div>
              <Link href={p(lang, "/compare")} className="inline-flex mt-5">
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
